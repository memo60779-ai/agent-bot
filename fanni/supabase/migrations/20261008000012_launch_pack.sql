-- =====================================================================
-- Launch pack (needed for real users + Google Play)
--   * delete_my_account(): self-service account deletion
--     (Google Play requires it for apps with sign-up).
--   * Forgot password without SMS: request_password_reset() queues a
--     request (rate limited, never reveals whether a number exists) and
--     alerts the admins; the admin confirms on WhatsApp and sets a new
--     password with admin_resolve_password_reset().
--   * Owners may delete files in their own folder of the private buckets
--     too (so account deletion can remove their uploads).
-- Idempotent: safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if public.is_admin() then
    raise exception 'admin_cannot_delete_self';
  end if;
  -- don't strand a job that is under way: finish or cancel it first
  if exists (
    select 1 from public.service_requests
    where (customer_id = v_uid or provider_id = v_uid)
      and status in ('ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS')
  ) then
    raise exception 'active_requests';
  end if;
  -- open requests of a customer: cancel so offered providers are released
  update public.provider_requests set status = 'cancelled', responded_at = now()
    where status = 'offered'
      and request_id in (select id from public.service_requests where customer_id = v_uid);
  -- public.users, providers, requests, reviews, complaints, push/telegram
  -- links all cascade from auth.users
  delete from auth.users where id = v_uid;
end $$;

-- ---------------------------------------------------------------------
-- Forgot password
-- ---------------------------------------------------------------------
create table if not exists public.password_reset_requests (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  user_id     uuid references public.users (id) on delete cascade,
  note        text,
  status      text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  resolved_by uuid references public.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists password_reset_requests_open_idx
  on public.password_reset_requests (created_at desc) where status = 'open';
alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from anon, authenticated;
-- No policies: admins read it through admin_password_resets().

create or replace function public.request_password_reset(p_phone text, p_note text default null)
returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_phone text := public.normalize_iq_phone(p_phone);
  v_user uuid;
  a record;
begin
  if v_phone is null then
    raise exception 'invalid_phone';
  end if;
  -- rate limits: one per number per hour, 30 per hour overall
  if exists (select 1 from public.password_reset_requests
             where phone = v_phone and created_at > now() - interval '1 hour')
     or (select count(*) from public.password_reset_requests
         where created_at > now() - interval '1 hour') >= 30 then
    return;  -- silently: never tell a caller anything about a number
  end if;
  select id into v_user from public.users where phone = v_phone;
  insert into public.password_reset_requests (phone, user_id, note)
  values (v_phone, v_user, left(nullif(trim(p_note), ''), 300));
  if v_user is null then
    return;  -- unknown number: kept for the admin, nobody is alerted
  end if;
  for a in
    select u.id, nc.telegram_chat_id
    from public.users u left join public.notification_channels nc on nc.user_id = u.id
    where u.role = 'admin' and u.is_active
  loop
    perform private.push_send(a.id, '🔑 طلب استعادة رمز', v_phone || ' نسى الرمز السري',
      '/admin/users', 'pw-reset');
    if a.telegram_chat_id is not null then
      perform private.telegram_send(a.telegram_chat_id,
        '🔑 طلب استعادة رمز' || chr(10) || chr(10) || '📱 ' || v_phone ||
        coalesce(chr(10) || '💬 ' || left(nullif(trim(p_note), ''), 200), '') || chr(10) || chr(10) ||
        'تأكد منه بالواتساب، وبعدين عيّن رمز جديد من لوحة الإدارة.',
        case when coalesce(private.setting('app_url'), '') <> '' then private.setting('app_url') || '/admin/users' end);
    end if;
  end loop;
end $$;

create or replace function public.admin_password_resets()
returns table (id uuid, phone text, user_id uuid, full_name text, role public.user_role, note text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  select r.id, r.phone, r.user_id, u.full_name, u.role, r.note, r.created_at
  from public.password_reset_requests r
  join public.users u on u.id = r.user_id
  where r.status = 'open'
  order by r.created_at desc;
end $$;

create or replace function public.admin_resolve_password_reset(p_id uuid, p_password text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.password_reset_requests;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.password_reset_requests where id = p_id for update;
  if r.id is null then
    raise exception 'not_found';
  end if;
  if p_password is not null then
    perform public.admin_reset_password(r.user_id, p_password);
  end if;
  update public.password_reset_requests
    set status = case when p_password is null then 'dismissed' else 'done' end,
        resolved_by = auth.uid(), resolved_at = now()
    where id = r.id;
end $$;

-- ---------------------------------------------------------------------
-- Storage: owners can delete in their own folder of every bucket
-- ---------------------------------------------------------------------
drop policy if exists "own folder delete (private buckets)" on storage.objects;
create policy "own folder delete (private buckets)" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('request-photos', 'verification-docs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.delete_my_account(), public.request_password_reset(text, text),
  public.admin_password_resets(), public.admin_resolve_password_reset(uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_my_account(), public.admin_password_resets(),
  public.admin_resolve_password_reset(uuid, text) to authenticated;
grant execute on function public.request_password_reset(text, text) to anon, authenticated;
