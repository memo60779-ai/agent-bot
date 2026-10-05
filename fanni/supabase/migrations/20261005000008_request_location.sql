-- =====================================================================
-- Exact customer location (map pin) for a request
--   * The client still inserts lat/lng on service_requests. A BEFORE INSERT
--     trigger moves the exact point into private-by-default
--     request_locations and keeps only a ~1 km rounded point on the request
--     (enough for matching distance; offered providers can read it).
--   * The exact point is returned by get_request_contacts() only to the
--     customer, to the assigned provider after acceptance, and to admins.
--   * On acceptance the provider gets the pin on Telegram (sendLocation),
--     which opens straight into navigation.
-- Idempotent: safe to run more than once.
-- =====================================================================

create table if not exists public.request_locations (
  request_id uuid primary key
    references public.service_requests (id) on delete cascade
    deferrable initially deferred,          -- row is written before its request (BEFORE INSERT trigger)
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  created_at timestamptz not null default now()
);
alter table public.request_locations enable row level security;
-- no policies and no grants: only SECURITY DEFINER functions read it
revoke all on public.request_locations from public, anon, authenticated;

-- move existing exact points before the trigger exists
insert into public.request_locations (request_id, lat, lng)
select id, lat, lng from public.service_requests
where lat is not null and lng is not null
on conflict (request_id) do nothing;
update public.service_requests
set lat = round(lat::numeric, 2)::float8, lng = round(lng::numeric, 2)::float8
where lat is not null and lng is not null
  and (lat <> round(lat::numeric, 2)::float8 or lng <> round(lng::numeric, 2)::float8);

create or replace function public.stash_request_location() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lat is not null and new.lng is not null then
    insert into public.request_locations (request_id, lat, lng)
    values (new.id, new.lat, new.lng)
    on conflict (request_id) do update set lat = excluded.lat, lng = excluded.lng;
    new.lat := round(new.lat::numeric, 2)::float8;
    new.lng := round(new.lng::numeric, 2)::float8;
  end if;
  return new;
end $$;

drop trigger if exists service_requests_stash_location on public.service_requests;
create trigger service_requests_stash_location
  before insert on public.service_requests
  for each row execute function public.stash_request_location();

revoke execute on function public.stash_request_location() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- get_request_contacts(): + exact lat/lng (return type changes -> drop)
-- ---------------------------------------------------------------------
drop function if exists public.get_request_contacts(uuid);
create function public.get_request_contacts(p_request_id uuid)
returns table (
  customer_name text, customer_phone text,
  provider_name text, provider_phone text,
  address_details text,
  lat double precision, lng double precision
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.service_requests;
  v_shared boolean;
  v_own boolean;
begin
  select * into r from public.service_requests where id = p_request_id;
  if r.id is null or not (
    r.customer_id = auth.uid() or public.is_offered_request(r.id) or public.is_admin()
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  v_shared := public.is_admin() or (
    r.provider_id is not null and r.status in ('ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'RATED')
    and (r.customer_id = auth.uid() or r.provider_id = auth.uid())
  );
  v_own := r.customer_id = auth.uid();

  return query
  select
    case when v_shared then cu.full_name
         else split_part(coalesce(nullif(cu.full_name, ''), 'زبون'), ' ', 1) end,
    case when v_shared then cu.phone end,
    p.display_name,
    case when v_shared then pu.phone end,
    r.address_details,
    case when v_shared or v_own then loc.lat end,
    case when v_shared or v_own then loc.lng end
  from public.users cu
  left join public.providers p on p.id = r.provider_id
  left join public.users pu on pu.id = r.provider_id
  left join public.request_locations loc on loc.request_id = r.id
  where cu.id = r.customer_id;
end $$;

revoke execute on function public.get_request_contacts(uuid) from public, anon, authenticated;
grant execute on function public.get_request_contacts(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Telegram: pin + landmark to the provider when the request is accepted
-- ---------------------------------------------------------------------
create or replace function private.telegram_send_location(p_chat_id bigint, p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_token text := private.setting('telegram_bot_token');
begin
  if v_token is null or p_chat_id is null or p_lat is null or p_lng is null then
    return;
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendLocation',
    body := jsonb_build_object('chat_id', p_chat_id, 'latitude', p_lat, 'longitude', p_lng),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'telegram_send_location failed: %', sqlerrm;
end $$;

create or replace function public.notify_request_accepted() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_chat bigint;
  v_url text := coalesce(private.setting('app_url'), '');
  loc public.request_locations;
begin
  if new.status <> 'ACCEPTED' or old.status = 'ACCEPTED' or new.provider_id is null then
    return new;
  end if;
  select telegram_chat_id into v_chat from public.notification_channels where user_id = new.provider_id;
  if v_chat is null then
    return new;
  end if;
  select * into loc from public.request_locations where request_id = new.id;

  perform private.telegram_send(
    v_chat,
    '✅ الطلب صار إلك' || chr(10) || chr(10) ||
    '📍 ' || new.area || '، ' || new.city ||
    case when new.address_details is not null then chr(10) || '🏠 ' || left(new.address_details, 200) else '' end ||
    chr(10) || chr(10) ||
    case when loc.request_id is not null
      then 'موقع البيت تحت 👇 اضغط عليه حتى تفتح الاتجاهات.'
      else 'الزبون ما حدد موقعه على الخريطة، اتصل بيه من التطبيق.' end,
    case when v_url <> '' then v_url || '/requests/' || new.id end
  );
  if loc.request_id is not null then
    perform private.telegram_send_location(v_chat, loc.lat, loc.lng);
  end if;
  return new;
exception when others then
  raise warning 'notify_request_accepted failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists service_requests_notify_accepted on public.service_requests;
create trigger service_requests_notify_accepted
  after update of status on public.service_requests
  for each row execute function public.notify_request_accepted();

revoke execute on function public.notify_request_accepted() from public, anon, authenticated;
revoke execute on function private.telegram_send_location(bigint, double precision, double precision) from public, anon, authenticated;
