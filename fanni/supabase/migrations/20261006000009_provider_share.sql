-- =====================================================================
-- Provider share card: a short public code per provider -> /p/<code>
-- Assigned automatically, never editable by the provider.
-- Idempotent: safe to run more than once.
-- =====================================================================

create sequence if not exists public.provider_public_code_seq start with 101;

alter table public.providers
  add column if not exists public_code integer;

-- existing providers, oldest first
with base as (select coalesce(max(public_code), 100) as m from public.providers),
     o as (select id, row_number() over (order by created_at, id) as rn
           from public.providers where public_code is null)
update public.providers p
set public_code = base.m + o.rn
from o, base
where p.id = o.id;
select setval('public.provider_public_code_seq',
              greatest((select coalesce(max(public_code), 100) from public.providers), 100));

-- filled by the BEFORE INSERT trigger below (NOT NULL is checked after it runs)
alter table public.providers alter column public_code set not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'providers_public_code_key') then
    alter table public.providers add constraint providers_public_code_key unique (public_code);
  end if;
end $$;

create or replace function public.keep_provider_public_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.public_code := nextval('public.provider_public_code_seq');
  elsif new.public_code is distinct from old.public_code
        and not (public.is_admin() or coalesce(current_setting('fanni.system', true), '') = 'on') then
    new.public_code := old.public_code;
  end if;
  return new;
end $$;

drop trigger if exists providers_keep_public_code on public.providers;
create trigger providers_keep_public_code
  before insert or update on public.providers
  for each row execute function public.keep_provider_public_code();

revoke execute on function public.keep_provider_public_code() from public, anon, authenticated;
