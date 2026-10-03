-- فني: كل إعداد قاعدة البيانات بملف واحد (migrations + demo seed)
-- الصق هذا الملف كامل بـ Supabase → SQL Editor واضغط Run


-- ===================== migrations/20261003000001_schema.sql =====================
-- =====================================================================
-- فني (Fanni) — MVP schema
-- Tables: users, providers, services, service_requests, provider_requests,
--         reviews, provider_portfolio, verification_requests, complaints
-- Every table that can hold demo rows has an `is_demo` flag so demo data
-- can be found and removed before launch (see supabase/cleanup_demo.sql).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type public.user_role as enum ('customer', 'provider', 'admin');

create type public.request_status as enum (
  'NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RATED'
);

create type public.verification_status as enum (
  'unverified',   -- never applied
  'pending',      -- waiting for admin
  'needs_info',   -- admin asked for more information
  'verified',
  'rejected'
);

create type public.offer_status as enum (
  'offered',      -- customer sent the request to this provider
  'accepted',
  'declined',
  'cancelled',    -- customer cancelled, or another provider accepted first
  'withdrawn'     -- provider accepted then backed out before starting
);

create type public.time_slot as enum ('now', 'today', 'tomorrow', 'scheduled');

create type public.complaint_status as enum ('open', 'in_review', 'resolved', 'rejected');

-- ---------- users (profile for every auth user) ----------
create table public.users (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'customer',
  full_name   text not null default '',
  phone       text,
  email       text,
  avatar_url  text,
  province    text not null default 'كربلاء',
  city        text,
  area        text,
  is_active   boolean not null default true,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- services ----------
create table public.services (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name_ar        text not null,
  icon           text not null default 'wrench',       -- lucide icon name used by the UI
  description_ar text,
  problem_types  text[] not null default '{}',          -- "نوع المشكلة" options
  sort_order     int not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------- providers (1:1 with users where role = provider) ----------
create table public.providers (
  id                  uuid primary key references public.users (id) on delete cascade,
  display_name        text not null,
  avatar_url          text,
  service_id          uuid not null references public.services (id),
  years_experience    int not null default 0 check (years_experience between 0 and 60),
  bio                 text not null default '',
  province            text not null default 'كربلاء',
  city                text not null,
  area                text not null,
  lat                 double precision,
  lng                 double precision,
  verification_status public.verification_status not null default 'unverified',
  verified_at         timestamptz,
  is_available        boolean not null default false,
  rating_avg          numeric(3, 2) not null default 0,
  rating_count        int not null default 0,
  completed_jobs      int not null default 0,
  is_demo             boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index providers_match_idx on public.providers (service_id, province, city, area)
  where verification_status = 'verified';

-- ---------- provider_portfolio ----------
create table public.provider_portfolio (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.providers (id) on delete cascade,
  image_url   text not null,          -- public URL (portfolio bucket) or /demo/... placeholder
  caption     text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index provider_portfolio_provider_idx on public.provider_portfolio (provider_id);

-- ---------- verification_requests ----------
create table public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.providers (id) on delete cascade,
  document_path text not null,        -- path inside PRIVATE bucket `verification-docs`
  provider_note text,
  status        public.verification_status not null default 'pending'
                check (status in ('pending', 'needs_info', 'verified', 'rejected')),
  admin_notes   text,
  reviewed_by   uuid references public.users (id) on delete set null,
  reviewed_at   timestamptz,
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);
create index verification_requests_provider_idx on public.verification_requests (provider_id);
create index verification_requests_status_idx on public.verification_requests (status);

-- ---------- service_requests ----------
create table public.service_requests (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.users (id) on delete cascade,
  service_id      uuid not null references public.services (id),
  problem_type    text not null,
  description     text not null default '',
  photo_path      text,                -- path inside PRIVATE bucket `request-photos`
  province        text not null default 'كربلاء',
  city            text not null,
  area            text not null,
  address_details text,                -- nearest landmark (أقرب نقطة دالة)
  lat             double precision,
  lng             double precision,
  time_slot       public.time_slot not null default 'now',
  scheduled_at    timestamptz,
  status          public.request_status not null default 'NEW',
  provider_id     uuid references public.providers (id) on delete set null,
  cancel_reason   text,
  accepted_at     timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint scheduled_needs_time check (time_slot <> 'scheduled' or scheduled_at is not null)
);
create index service_requests_customer_idx on public.service_requests (customer_id, created_at desc);
create index service_requests_provider_idx on public.service_requests (provider_id, created_at desc);
create index service_requests_status_idx on public.service_requests (status);

-- ---------- provider_requests (offers sent to providers) ----------
create table public.provider_requests (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.service_requests (id) on delete cascade,
  provider_id  uuid not null references public.providers (id) on delete cascade,
  status       public.offer_status not null default 'offered',
  responded_at timestamptz,
  is_demo      boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (request_id, provider_id)
);
create index provider_requests_provider_idx on public.provider_requests (provider_id, status);

-- ---------- reviews ----------
create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  request_id         uuid not null unique references public.service_requests (id) on delete cascade,
  provider_id        uuid not null references public.providers (id) on delete cascade,
  customer_id        uuid not null references public.users (id) on delete cascade,
  customer_name      text not null default '',   -- display snapshot (first name only)
  rating             int not null check (rating between 1 and 5),
  rating_punctuality int check (rating_punctuality between 1 and 5),  -- الالتزام بالوقت
  rating_quality     int check (rating_quality between 1 and 5),      -- جودة العمل
  rating_behavior    int check (rating_behavior between 1 and 5),     -- التعامل
  rating_price       int check (rating_price between 1 and 5),        -- السعر
  comment            text,
  is_hidden          boolean not null default false,                  -- admin moderation
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now()
);
create index reviews_provider_idx on public.reviews (provider_id, created_at desc);

-- ---------- complaints ----------
create table public.complaints (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.service_requests (id) on delete cascade,
  customer_id uuid not null references public.users (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete set null,
  subject     text not null,
  details     text not null default '',
  status      public.complaint_status not null default 'open',
  admin_notes text,
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index complaints_status_idx on public.complaints (status);

-- ---------- updated_at trigger ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger users_touch before update on public.users
  for each row execute function public.touch_updated_at();
create trigger providers_touch before update on public.providers
  for each row execute function public.touch_updated_at();
create trigger service_requests_touch before update on public.service_requests
  for each row execute function public.touch_updated_at();
create trigger complaints_touch before update on public.complaints
  for each row execute function public.touch_updated_at();

-- ===================== migrations/20261003000002_functions.sql =====================
-- =====================================================================
-- Business logic. All state changes go through SECURITY DEFINER functions
-- that check the caller, so the client can never jump statuses, assign
-- itself to a request, edit reviews, or self-verify.
-- =====================================================================

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.owns_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.service_requests where id = p_request_id and customer_id = auth.uid());
$$;

-- provider was offered this request (any offer status) or is assigned to it
create or replace function public.is_offered_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.provider_requests where request_id = p_request_id and provider_id = auth.uid())
      or exists (select 1 from public.service_requests where id = p_request_id and provider_id = auth.uid());
$$;

create or replace function public.can_view_request_photo(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_requests r
    where r.photo_path = p_path
      and (r.customer_id = auth.uid() or public.is_offered_request(r.id) or public.is_admin())
  );
$$;

-- ---------- new auth user -> public.users ----------
-- role comes from sign-up metadata but can only be customer or provider.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role := 'customer';
begin
  if new.raw_user_meta_data ->> 'role' = 'provider' then
    v_role := 'provider';
  end if;
  insert into public.users (id, role, full_name, phone, email, is_demo)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.email,
    coalesce((new.raw_user_meta_data ->> 'is_demo')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- provider rows: protect system fields ----------
-- Providers may edit their profile, but never verification/rating/job counters.
create or replace function public.protect_provider_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or current_setting('fanni.system', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verification_status := 'unverified';
    new.verified_at := null;
    new.rating_avg := 0;
    new.rating_count := 0;
    new.completed_jobs := 0;
    new.is_demo := false;
    new.is_available := false;
  else
    new.verification_status := old.verification_status;
    new.verified_at := old.verified_at;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    new.completed_jobs := old.completed_jobs;
    new.is_demo := old.is_demo;
    new.id := old.id;
  end if;
  return new;
end $$;

create trigger providers_protect before insert or update on public.providers
  for each row execute function public.protect_provider_fields();

-- Users may edit their profile, but never role / active flag / demo flag.
create or replace function public.protect_user_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() or current_setting('fanni.system', true) = 'on' then
    return new;
  end if;
  new.role := old.role;
  new.is_active := old.is_active;
  new.is_demo := old.is_demo;
  new.email := old.email;
  new.id := old.id;
  return new;
end $$;

create trigger users_protect before update on public.users
  for each row execute function public.protect_user_fields();

-- Lets trusted functions write protected provider fields (ratings, counters,
-- verification). Returns the previous value so callers can restore it.
create or replace function public.enter_system_mode() returns text
language plpgsql as $$
declare v_prev text := coalesce(current_setting('fanni.system', true), 'off');
begin
  perform set_config('fanni.system', 'on', true);
  return v_prev;
end $$;

-- ---------- rating aggregates ----------
create or replace function public.refresh_provider_rating(p_provider_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_prev text := public.enter_system_mode();
begin
  update public.providers p set
    rating_avg   = coalesce((select round(avg(rating)::numeric, 2) from public.reviews
                             where provider_id = p_provider_id and not is_hidden), 0),
    rating_count = (select count(*) from public.reviews where provider_id = p_provider_id and not is_hidden)
  where p.id = p_provider_id;
  perform set_config('fanni.system', v_prev, true);
end $$;

create or replace function public.reviews_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_provider_rating(coalesce(new.provider_id, old.provider_id));
  return null;
end $$;

create trigger reviews_rating_sync after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_change();

-- =====================================================================
-- Matching
-- Ranks verified, active providers of the request's service in the same
-- province: available now > same area > same city > distance (if both
-- sides have coordinates) > rating > completed jobs.
-- =====================================================================
create or replace function public.match_providers(p_request_id uuid)
returns table (
  provider_id      uuid,
  display_name     text,
  avatar_url       text,
  city             text,
  area             text,
  years_experience int,
  is_available     boolean,
  rating_avg       numeric,
  rating_count     int,
  completed_jobs   int,
  is_demo          boolean,
  same_area        boolean,
  same_city        boolean,
  distance_km      double precision,
  offer_status     public.offer_status
)
language plpgsql security definer set search_path = public as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where id = p_request_id;
  if r.id is null or (r.customer_id <> auth.uid() and not public.is_admin()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if r.status = 'NEW' then
    update public.service_requests set status = 'MATCHING' where id = r.id;
  end if;

  return query
  select
    p.id, p.display_name, p.avatar_url, p.city, p.area, p.years_experience, p.is_available,
    p.rating_avg, p.rating_count, p.completed_jobs, p.is_demo,
    (p.area = r.area and p.city = r.city) as same_area,
    (p.city = r.city) as same_city,
    case when p.lat is not null and p.lng is not null and r.lat is not null and r.lng is not null then
      6371 * 2 * asin(sqrt(
        power(sin(radians(p.lat - r.lat) / 2), 2) +
        cos(radians(r.lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - r.lng) / 2), 2)))
    end as distance_km,
    pr.status as offer_status
  from public.providers p
  join public.users u on u.id = p.id and u.is_active
  left join public.provider_requests pr on pr.request_id = r.id and pr.provider_id = p.id
  where p.service_id = r.service_id
    and p.verification_status = 'verified'
    and p.province = r.province
    and p.id <> r.customer_id
  order by
    p.is_available desc,
    (p.area = r.area and p.city = r.city) desc,
    (p.city = r.city) desc,
    distance_km asc nulls last,
    p.rating_avg desc,
    p.completed_jobs desc
  limit 20;
end $$;

-- ---------- customer sends the request to a provider ("طلب فني") ----------
create or replace function public.send_offer(p_request_id uuid, p_provider_id uuid)
returns public.provider_requests
language plpgsql security definer set search_path = public as $$
declare
  r public.service_requests;
  v_offer public.provider_requests;
  v_open int;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null or r.customer_id <> auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status not in ('NEW', 'MATCHING') then
    raise exception 'request_not_open';
  end if;
  if not exists (
    select 1 from public.providers p join public.users u on u.id = p.id
    where p.id = p_provider_id and p.verification_status = 'verified' and u.is_active
      and p.service_id = r.service_id
  ) then
    raise exception 'provider_not_eligible';
  end if;

  select count(*) into v_open from public.provider_requests
  where request_id = r.id and status = 'offered';
  if v_open >= 5 then
    raise exception 'too_many_offers';
  end if;

  insert into public.provider_requests (request_id, provider_id, status, is_demo)
  values (r.id, p_provider_id, 'offered', r.is_demo)
  on conflict (request_id, provider_id) do update
    set status = 'offered', responded_at = null, created_at = now()
    where provider_requests.status in ('cancelled')
  returning * into v_offer;

  if v_offer.id is null then
    raise exception 'already_offered';
  end if;

  update public.service_requests set status = 'MATCHING' where id = r.id and status = 'NEW';
  return v_offer;
end $$;

-- ---------- provider accepts / declines an offer ----------
create or replace function public.respond_offer(p_offer_id uuid, p_accept boolean)
returns public.service_requests
language plpgsql security definer set search_path = public as $$
declare
  o public.provider_requests;
  r public.service_requests;
begin
  select * into o from public.provider_requests where id = p_offer_id for update;
  if o.id is null or o.provider_id <> auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if o.status <> 'offered' then
    raise exception 'offer_not_open';
  end if;

  select * into r from public.service_requests where id = o.request_id for update;

  if not p_accept then
    update public.provider_requests set status = 'declined', responded_at = now() where id = o.id;
    return r;
  end if;

  if not exists (select 1 from public.providers where id = auth.uid() and verification_status = 'verified') then
    raise exception 'provider_not_verified';
  end if;
  if r.status not in ('NEW', 'MATCHING') or r.provider_id is not null then
    update public.provider_requests set status = 'cancelled', responded_at = now() where id = o.id;
    raise exception 'request_already_taken';
  end if;

  update public.provider_requests set status = 'accepted', responded_at = now() where id = o.id;
  update public.provider_requests set status = 'cancelled', responded_at = now()
    where request_id = r.id and id <> o.id and status = 'offered';
  update public.service_requests
    set status = 'ACCEPTED', provider_id = o.provider_id, accepted_at = now()
    where id = r.id
    returning * into r;
  return r;
end $$;

-- ---------- status progression ----------
-- provider: ACCEPTED -> ON_THE_WAY -> IN_PROGRESS -> COMPLETED
-- provider withdraw: ACCEPTED/ON_THE_WAY -> back to MATCHING
-- customer cancel:   NEW/MATCHING/ACCEPTED/ON_THE_WAY -> CANCELLED
-- admin:             any -> CANCELLED
create or replace function public.update_request_status(
  p_request_id uuid, p_status public.request_status, p_reason text default null
) returns public.service_requests
language plpgsql security definer set search_path = public as $$
declare
  r public.service_requests;
  v_uid uuid := auth.uid();
  v_prev text;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'not_found';
  end if;

  -- assigned provider
  if r.provider_id = v_uid and p_status in ('ON_THE_WAY', 'IN_PROGRESS', 'COMPLETED') then
    if not (
      (r.status = 'ACCEPTED'   and p_status in ('ON_THE_WAY', 'IN_PROGRESS')) or
      (r.status = 'ON_THE_WAY' and p_status = 'IN_PROGRESS') or
      (r.status = 'IN_PROGRESS' and p_status = 'COMPLETED')
    ) then
      raise exception 'invalid_transition';
    end if;
    update public.service_requests set
      status = p_status,
      completed_at = case when p_status = 'COMPLETED' then now() else completed_at end
    where id = r.id returning * into r;
    if p_status = 'COMPLETED' then
      v_prev := public.enter_system_mode();
      update public.providers set completed_jobs = completed_jobs + 1 where id = v_uid;
      perform set_config('fanni.system', v_prev, true);
    end if;
    return r;
  end if;

  -- assigned provider backs out before starting
  if r.provider_id = v_uid and p_status = 'MATCHING' then
    if r.status not in ('ACCEPTED', 'ON_THE_WAY') then
      raise exception 'invalid_transition';
    end if;
    update public.provider_requests set status = 'withdrawn', responded_at = now()
      where request_id = r.id and provider_id = v_uid;
    update public.service_requests
      set status = 'MATCHING', provider_id = null, accepted_at = null
      where id = r.id returning * into r;
    return r;
  end if;

  -- cancellation
  if p_status = 'CANCELLED' and (r.customer_id = v_uid or public.is_admin()) then
    if r.status in ('COMPLETED', 'RATED', 'CANCELLED') then
      raise exception 'invalid_transition';
    end if;
    if r.customer_id = v_uid and not public.is_admin() and r.status = 'IN_PROGRESS' then
      raise exception 'cannot_cancel_in_progress';
    end if;
    update public.provider_requests set status = 'cancelled', responded_at = now()
      where request_id = r.id and status = 'offered';
    update public.service_requests
      set status = 'CANCELLED', cancelled_at = now(), cancel_reason = p_reason
      where id = r.id returning * into r;
    return r;
  end if;

  raise exception 'not_allowed' using errcode = '42501';
end $$;

-- ---------- reviews (only after a real completed request) ----------
create or replace function public.submit_review(
  p_request_id uuid,
  p_rating int,
  p_punctuality int default null,
  p_quality int default null,
  p_behavior int default null,
  p_price int default null,
  p_comment text default null
) returns public.reviews
language plpgsql security definer set search_path = public as $$
declare
  r public.service_requests;
  v_review public.reviews;
  v_name text;
begin
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null or r.customer_id <> auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status <> 'COMPLETED' or r.provider_id is null then
    raise exception 'request_not_completed';
  end if;
  if exists (select 1 from public.reviews where request_id = r.id) then
    raise exception 'already_reviewed';
  end if;

  select split_part(coalesce(nullif(full_name, ''), 'زبون'), ' ', 1) into v_name
  from public.users where id = r.customer_id;

  insert into public.reviews (
    request_id, provider_id, customer_id, customer_name, rating,
    rating_punctuality, rating_quality, rating_behavior, rating_price, comment, is_demo
  ) values (
    r.id, r.provider_id, r.customer_id, v_name, p_rating,
    p_punctuality, p_quality, p_behavior, p_price, nullif(trim(p_comment), ''), r.is_demo
  ) returning * into v_review;

  update public.service_requests set status = 'RATED' where id = r.id;
  return v_review;
end $$;

-- ---------- phone numbers: only shared between the two parties after acceptance ----------
create or replace function public.get_request_contacts(p_request_id uuid)
returns table (
  customer_name text, customer_phone text,
  provider_name text, provider_phone text,
  address_details text
)
language plpgsql stable security definer set search_path = public as $$
declare
  r public.service_requests;
  v_shared boolean;
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

  return query
  select
    case when v_shared then cu.full_name
         else split_part(coalesce(nullif(cu.full_name, ''), 'زبون'), ' ', 1) end,
    case when v_shared then cu.phone end,
    p.display_name,
    case when v_shared then pu.phone end,
    r.address_details
  from public.users cu
  left join public.providers p on p.id = r.provider_id
  left join public.users pu on pu.id = r.provider_id
  where cu.id = r.customer_id;
end $$;

-- ---------- verification ----------
create or replace function public.submit_verification(p_document_path text, p_note text default null)
returns public.verification_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.verification_requests;
  v_status public.verification_status;
  v_prev text;
begin
  select verification_status into v_status from public.providers where id = auth.uid();
  if v_status is null then
    raise exception 'provider_profile_missing';
  end if;
  if v_status in ('pending', 'verified') then
    raise exception 'verification_already_%', v_status;
  end if;
  if p_document_path is null or split_part(p_document_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid_document_path';
  end if;

  insert into public.verification_requests (provider_id, document_path, provider_note)
  values (auth.uid(), p_document_path, p_note)
  returning * into v_row;

  v_prev := public.enter_system_mode();
  update public.providers set verification_status = 'pending' where id = auth.uid();
  perform set_config('fanni.system', v_prev, true);
  return v_row;
end $$;

create or replace function public.review_verification(
  p_verification_id uuid, p_decision public.verification_status, p_notes text default null
) returns public.verification_requests
language plpgsql security definer set search_path = public as $$
declare
  v_row public.verification_requests;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_decision not in ('verified', 'rejected', 'needs_info') then
    raise exception 'invalid_decision';
  end if;

  update public.verification_requests
    set status = p_decision, admin_notes = p_notes, reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_verification_id
    returning * into v_row;
  if v_row.id is null then
    raise exception 'not_found';
  end if;

  update public.providers set
    verification_status = p_decision,
    verified_at = case when p_decision = 'verified' then now() else null end,
    is_available = case when p_decision = 'verified' then is_available else false end
  where id = v_row.provider_id;
  return v_row;
end $$;

-- ---------- admin ----------
create or replace function public.admin_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'customers',           (select count(*) from public.users where role = 'customer'),
    'providers',           (select count(*) from public.providers),
    'verified_providers',  (select count(*) from public.providers where verification_status = 'verified'),
    'pending_verifications', (select count(*) from public.verification_requests where status = 'pending'),
    'requests',            (select count(*) from public.service_requests),
    'completed_requests',  (select count(*) from public.service_requests where status in ('COMPLETED', 'RATED')),
    'cancelled_requests',  (select count(*) from public.service_requests where status = 'CANCELLED'),
    'active_requests',     (select count(*) from public.service_requests
                            where status in ('NEW', 'MATCHING', 'ACCEPTED', 'ON_THE_WAY', 'IN_PROGRESS')),
    'avg_rating',          (select coalesce(round(avg(rating)::numeric, 2), 0) from public.reviews where not is_hidden),
    'reviews',             (select count(*) from public.reviews),
    'open_complaints',     (select count(*) from public.complaints where status in ('open', 'in_review')),
    'demo_rows',           (select count(*) from public.users where is_demo)
  );
end $$;

create or replace function public.admin_set_user(
  p_user_id uuid, p_role public.user_role default null, p_is_active boolean default null
) returns public.users
language plpgsql security definer set search_path = public as $$
declare
  v_row public.users;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() and (p_is_active = false or p_role is distinct from null and p_role <> 'admin') then
    raise exception 'cannot_change_self';
  end if;
  update public.users set
    role = coalesce(p_role, role),
    is_active = coalesce(p_is_active, is_active)
  where id = p_user_id
  returning * into v_row;
  if p_is_active = false then
    update public.providers set is_available = false where id = p_user_id;
  end if;
  return v_row;
end $$;

-- ---------- execute permissions ----------
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_admin(), public.owns_request(uuid), public.is_offered_request(uuid),
  public.can_view_request_photo(text)
  to anon, authenticated;
grant execute on function
  public.match_providers(uuid), public.send_offer(uuid, uuid), public.respond_offer(uuid, boolean),
  public.update_request_status(uuid, public.request_status, text),
  public.submit_review(uuid, int, int, int, int, int, text),
  public.get_request_contacts(uuid), public.submit_verification(text, text),
  public.review_verification(uuid, public.verification_status, text),
  public.admin_stats(), public.admin_set_user(uuid, public.user_role, boolean)
  to authenticated;

-- ===================== migrations/20261003000003_rls.sql =====================
-- =====================================================================
-- Row Level Security
--   * Customer: only their own requests / complaints / profile.
--   * Provider: only requests offered or assigned to them.
--   * Reviews: inserted only via submit_review(); nobody but admin can
--     update (hide) them; providers can never modify reviews.
--   * Verification: only admin can approve (review_verification()).
--   * Status changes on requests only via RPCs (no client UPDATE policy).
-- =====================================================================

alter table public.users                 enable row level security;
alter table public.services              enable row level security;
alter table public.providers             enable row level security;
alter table public.provider_portfolio    enable row level security;
alter table public.verification_requests enable row level security;
alter table public.service_requests      enable row level security;
alter table public.provider_requests     enable row level security;
alter table public.reviews               enable row level security;
alter table public.complaints            enable row level security;

-- Start from zero and grant only what the app needs.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.services, public.providers, public.provider_portfolio, public.reviews to anon;

grant select, update                  on public.users                 to authenticated;
grant select, insert, update, delete  on public.services              to authenticated;
grant select, insert, update          on public.providers             to authenticated;
grant select, insert, delete          on public.provider_portfolio    to authenticated;
grant select                          on public.verification_requests to authenticated;
grant select, insert, update          on public.service_requests      to authenticated;
grant select                          on public.provider_requests     to authenticated;
grant select, update                  on public.reviews               to authenticated;
grant select, insert, update          on public.complaints            to authenticated;

-- users RLS hides other users' rows, so policies on other tables use this
create or replace function public.is_user_active(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_active from public.users where id = p_user_id), false);
$$;
grant execute on function public.is_user_active(uuid) to anon, authenticated;

-- ---------- users ----------
create policy users_select_self_or_admin on public.users
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- role / is_active / is_demo are protected by trigger protect_user_fields()
create policy users_update_self_or_admin on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- services ----------
create policy services_public_read on public.services
  for select to anon, authenticated
  using (is_active or public.is_admin());

create policy services_admin_insert on public.services
  for insert to authenticated with check (public.is_admin());
create policy services_admin_update on public.services
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy services_admin_delete on public.services
  for delete to authenticated using (public.is_admin());

-- ---------- providers ----------
-- Public sees only verified providers whose account is active.
create policy providers_public_read on public.providers
  for select to anon, authenticated
  using (
    (verification_status = 'verified' and public.is_user_active(id))
    or id = auth.uid()
    or public.is_admin()
  );

create policy providers_insert_self on public.providers
  for insert to authenticated
  with check (
    id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'provider')
  );

-- verification / rating / counters are protected by trigger protect_provider_fields()
create policy providers_update_self_or_admin on public.providers
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ---------- provider_portfolio ----------
create policy portfolio_public_read on public.provider_portfolio
  for select to anon, authenticated
  using (
    exists (select 1 from public.providers p where p.id = provider_portfolio.provider_id)
  ); -- inherits providers visibility through RLS on providers

create policy portfolio_insert_own on public.provider_portfolio
  for insert to authenticated
  with check (provider_id = auth.uid() and is_demo = false);

create policy portfolio_delete_own_or_admin on public.provider_portfolio
  for delete to authenticated
  using (provider_id = auth.uid() or public.is_admin());

-- ---------- verification_requests (never public) ----------
create policy verification_select_own_or_admin on public.verification_requests
  for select to authenticated
  using (provider_id = auth.uid() or public.is_admin());
-- inserts: submit_verification(); decisions: review_verification() (admin only)

-- ---------- service_requests ----------
create policy requests_select_parties on public.service_requests
  for select to authenticated
  using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or public.is_offered_request(id)
    or public.is_admin()
  );

create policy requests_insert_customer on public.service_requests
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'NEW'
    and provider_id is null
    and is_demo = false
    and exists (select 1 from public.users u where u.id = auth.uid() and u.is_active)
  );

-- Only admin can UPDATE directly. Everybody else uses update_request_status() etc.
create policy requests_update_admin on public.service_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- provider_requests (offers) ----------
create policy offers_select_parties on public.provider_requests
  for select to authenticated
  using (
    provider_id = auth.uid()
    or public.owns_request(request_id)
    or public.is_admin()
  );
-- inserts: send_offer(); updates: respond_offer()

-- ---------- reviews ----------
create policy reviews_public_read on public.reviews
  for select to anon, authenticated
  using (not is_hidden or customer_id = auth.uid() or public.is_admin());

-- Only admin can update (hide/unhide). No insert policy: submit_review() only.
create policy reviews_update_admin on public.reviews
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- complaints ----------
create policy complaints_select_own_or_admin on public.complaints
  for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create policy complaints_insert_after_completion on public.complaints
  for insert to authenticated
  with check (
    customer_id = auth.uid()
    and status = 'open'
    and admin_notes is null
    and is_demo = false
    and exists (
      select 1 from public.service_requests r
      where r.id = complaints.request_id
        and r.customer_id = auth.uid()
        and r.status in ('COMPLETED', 'RATED')
        and (complaints.provider_id is null or complaints.provider_id = r.provider_id)
    )
  );

create policy complaints_update_admin on public.complaints
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ===================== migrations/20261003000004_storage_realtime.sql =====================
-- =====================================================================
-- Storage buckets
--   avatars            public   {uid}/file
--   portfolio          public   {uid}/file
--   request-photos     PRIVATE  {uid}/file — owner, offered/assigned provider, admin
--   verification-docs  PRIVATE  {uid}/file — owner + admin ONLY (never public)
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars',           'avatars',           true,  5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('portfolio',         'portfolio',         true,  8388608,  array['image/jpeg', 'image/png', 'image/webp']),
  ('request-photos',    'request-photos',    false, 8388608,  array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-docs', 'verification-docs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = excluded.public;

-- Public buckets: anyone reads; users write only inside their own folder.
create policy "public buckets read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('avatars', 'portfolio'));

create policy "own folder insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'portfolio', 'request-photos', 'verification-docs')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "own folder delete (public buckets)" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'portfolio')
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "request photos read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'request-photos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.can_view_request_photo(name)
      or public.is_admin()
    )
  );

create policy "verification docs read: owner or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- =====================================================================
-- Realtime: live status updates on the request page / provider inbox.
-- RLS still applies to realtime payloads.
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.service_requests, public.provider_requests;
  end if;
end $$;

-- ===================== migrations/20261004000005_telegram.sql =====================
-- =====================================================================
-- Telegram notifications for providers
--   * Provider taps "فعّل إشعارات تليكرام" -> telegram_link_start() returns a
--     one-time token -> app opens t.me/<bot>?start=<token>.
--   * Telegram sends the /start update to the Edge Function `telegram-webhook`,
--     which forwards it to telegram_handle_update() (checks a shared secret)
--     -> chat id is saved.
--   * New offer for a provider -> trigger sends a Telegram message via pg_net.
-- The bot token and webhook secret live in private.settings (not exposed by
-- the API), never in the frontend.
-- =====================================================================

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available: %', sqlerrm;
end $$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);
-- keys used: telegram_bot_token, telegram_webhook_secret, app_url

create table if not exists public.notification_channels (
  user_id          uuid primary key references public.users (id) on delete cascade,
  telegram_chat_id bigint,
  link_token       text unique,
  linked_at        timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.notification_channels enable row level security;
revoke all on public.notification_channels from anon, authenticated;
-- No policies: only the SECURITY DEFINER functions below touch this table.

-- ---------- helpers ----------
create or replace function private.setting(p_key text) returns text
language sql stable security definer set search_path = private as $$
  select value from private.settings where key = p_key;
$$;

-- Fire-and-forget Telegram message. Never raises: a Telegram problem must not
-- break the request flow.
create or replace function private.telegram_send(p_chat_id bigint, p_text text, p_button_url text default null)
returns void
language plpgsql security definer set search_path = public, private as $$
declare
  v_token text := private.setting('telegram_bot_token');
  v_body jsonb;
begin
  if v_token is null or p_chat_id is null then
    return;
  end if;
  v_body := jsonb_build_object('chat_id', p_chat_id, 'text', p_text, 'disable_web_page_preview', true);
  if p_button_url is not null then
    v_body := v_body || jsonb_build_object('reply_markup', jsonb_build_object(
      'inline_keyboard', jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', 'افتح الطلب', 'url', p_button_url)))));
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    body := v_body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then
  raise warning 'telegram_send failed: %', sqlerrm;
end $$;

-- ---------- provider-facing RPCs ----------
create or replace function public.telegram_link_start() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');  -- core function, no pgcrypto needed
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.notification_channels (user_id, link_token)
  values (auth.uid(), v_token)
  on conflict (user_id) do update set link_token = excluded.link_token;
  return v_token;
end $$;

create or replace function public.telegram_status() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select telegram_chat_id is not null from public.notification_channels
                   where user_id = auth.uid()), false);
$$;

create or replace function public.telegram_unlink() returns void
language sql security definer set search_path = public as $$
  update public.notification_channels set telegram_chat_id = null, linked_at = null, link_token = null
  where user_id = auth.uid();
$$;

-- ---------- webhook (called by the Edge Function) ----------
create or replace function public.telegram_handle_update(p_secret text, p_update jsonb) returns text
language plpgsql security definer set search_path = public, private as $$
declare
  v_expected text := private.setting('telegram_webhook_secret');
  v_chat bigint := (p_update -> 'message' -> 'chat' ->> 'id')::bigint;
  v_text text := coalesce(p_update -> 'message' ->> 'text', '');
  v_token text;
  v_user uuid;
  v_name text;
begin
  if v_expected is null or p_secret is distinct from v_expected then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v_chat is null then
    return 'ignored';
  end if;

  if v_text like '/start %' then
    v_token := trim(substr(v_text, 8));
    update public.notification_channels
      set telegram_chat_id = v_chat, linked_at = now(), link_token = null
      where link_token = v_token
      returning user_id into v_user;
    if v_user is not null then
      select coalesce(p.display_name, u.full_name) into v_name
      from public.users u left join public.providers p on p.id = u.id where u.id = v_user;
      perform private.telegram_send(v_chat,
        'هلا ' || coalesce(v_name, '') || ' 👋' || chr(10) ||
        'تم ربط حسابك بـ "فني" ✅' || chr(10) ||
        'من هسه أي طلب جديد يوصلك راح تجيك رسالة هنا فوراً.');
      return 'linked';
    end if;
    perform private.telegram_send(v_chat, 'الرابط منتهي ❌ ارجع للتطبيق واضغط "فعّل إشعارات تليكرام" مرة ثانية.');
    return 'bad_token';
  end if;

  perform private.telegram_send(v_chat,
    'هذا بوت إشعارات "فني" 🔧' || chr(10) ||
    'حتى تستلم الطلبات هنا: افتح التطبيق ← صفحة الطلبات ← "فعّل إشعارات تليكرام".');
  return 'help';
end $$;

-- ---------- notify provider about a new offer ----------
create or replace function public.notify_new_offer() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_chat bigint;
  r record;
  v_url text := coalesce(private.setting('app_url'), '');
begin
  if new.status <> 'offered' or (tg_op = 'UPDATE' and old.status = 'offered') then
    return new;
  end if;
  select telegram_chat_id into v_chat from public.notification_channels where user_id = new.provider_id;
  if v_chat is null then
    return new;
  end if;

  select s.name_ar, sr.problem_type, sr.area, sr.city, sr.time_slot, sr.description into r
  from public.service_requests sr join public.services s on s.id = sr.service_id
  where sr.id = new.request_id;

  perform private.telegram_send(
    v_chat,
    '🔔 طلب جديد إلك' || chr(10) || chr(10) ||
    '🔧 ' || r.name_ar || ' — ' || r.problem_type || chr(10) ||
    '📍 ' || r.area || '، ' || r.city || chr(10) ||
    '⏰ ' || case r.time_slot when 'now' then 'هسه (مستعجل)' when 'today' then 'اليوم'
                              when 'tomorrow' then 'باچر' else 'موعد محدد' end || chr(10) || chr(10) ||
    left(r.description, 200) || chr(10) || chr(10) ||
    'أول فني يقبل ياخذ الطلب 👇',
    case when v_url <> '' then v_url || '/requests/' || new.request_id end
  );
  return new;
end $$;

drop trigger if exists provider_requests_notify on public.provider_requests;
create trigger provider_requests_notify
  after insert or update of status on public.provider_requests
  for each row execute function public.notify_new_offer();

-- ---------- permissions ----------
revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.notify_new_offer() from public, anon, authenticated;
revoke execute on function public.telegram_link_start(), public.telegram_status(), public.telegram_unlink(),
  public.telegram_handle_update(text, jsonb) from public, anon, authenticated;
grant execute on function public.telegram_link_start(), public.telegram_status(), public.telegram_unlink()
  to authenticated;
-- Protected by the shared webhook secret, so the Edge Function can call it with any API key.
grant execute on function public.telegram_handle_update(text, jsonb) to anon, authenticated, service_role;

-- ===================== seed.sql =====================
-- =====================================================================
-- فني — DEMO DATA  (⚠️ NOT REAL PEOPLE)
--
-- Every demo row has is_demo = true and every demo account uses an
-- @fanni.test / @demo.fanni.test email. Remove everything before launch
-- with supabase/cleanup_demo.sql.
--
-- Password for ALL demo accounts:  Fanni@2026
-- =====================================================================

set search_path = public, extensions;
-- lets the seed write protected fields (verification, ratings, roles)
select set_config('fanni.system', 'on', false);

-- ---------------------------------------------------------------------
-- Services (8). The first 5 are the "main" categories that get demo providers.
-- ---------------------------------------------------------------------
insert into public.services (slug, name_ar, icon, description_ar, sort_order, problem_types) values
 ('plumbing',    'سباكة',              'droplets',        'تسريبات، مجاري، حنفيات وسخانات',
   1, array['تسريب مي', 'انسداد مجاري', 'تبديل حنفية أو خلاط', 'مشكلة بالسخان', 'تأسيس صحيات', 'شي ثاني']),
 ('electrical',  'كهرباء',             'zap',             'انقطاع، بلكات، إنارة وتأسيس',
   2, array['انقطاع بجزء من البيت', 'تبديل بلكات وسويچات', 'تركيب إنارة', 'مشكلة بالطبلة أو الجوزة', 'ربط مولدة أو أمبيرات', 'تأسيس كهرباء', 'شي ثاني']),
 ('ac',          'تكييف وتبريد',        'snowflake',       'سبلت، غاز، تنظيف ونصب',
   3, array['السبلت ما يبرد', 'تعبئة غاز', 'تنظيف وصيانة سبلت', 'نصب أو فتح سبلت', 'تصليح مبردة هواء', 'شي ثاني']),
 ('appliances',  'صيانة أجهزة منزلية',  'washing-machine', 'غسالات، ثلاجات، طباخات',
   4, array['غسالة', 'ثلاجة أو مجمدة', 'طباخ أو فرن', 'سخان مي', 'ميكرويف', 'شي ثاني']),
 ('carpentry',   'نجارة',              'hammer',          'أبواب، كبتات، مطابخ وأثاث',
   5, array['تصليح باب', 'تفصيل مطبخ أو كاونتر', 'تصليح كبتات وأثاث', 'تركيب أقفال ومقابض', 'شي ثاني']),
 ('painting',    'صبغ وديكور',          'paint-roller',    'صبغ، جبس بورد، ورق جدران',
   6, array['صبغ غرفة', 'صبغ بيت كامل', 'جبس بورد وديكور', 'ورق جدران', 'معالجة رطوبة', 'شي ثاني']),
 ('aluminum',    'ألمنيوم وحدادة',      'door-closed',     'شبابيك، أبواب حديد، حمايات ولحام',
   7, array['شبابيك ألمنيوم', 'أبواب حديد', 'حماية شبابيك', 'تصليح باب كراج أو سحاب', 'لحام', 'شي ثاني']),
 ('cleaning',    'تنظيف',              'sparkles',        'تنظيف بيوت، سجاد وخزانات',
   8, array['تنظيف بيت كامل', 'تنظيف بعد البناء أو الصبغ', 'غسل سجاد وموكيت', 'تنظيف خزانات مي', 'شي ثاني']);

-- ---------------------------------------------------------------------
-- Helper: create a confirmed email/password auth user (+ identity).
-- The on_auth_user_created trigger creates the public.users row.
-- ---------------------------------------------------------------------
create or replace function pg_temp.demo_user(
  p_id uuid, p_email text, p_name text, p_phone text, p_role text
) returns uuid language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    crypt('Fanni@2026', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_name, 'phone', p_phone, 'role', p_role, 'is_demo', true),
    now() - interval '120 days', now(), '', '', '', ''
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  return p_id;
end $$;

-- ---------------------------------------------------------------------
-- Test accounts
-- ---------------------------------------------------------------------
select pg_temp.demo_user('00000000-0000-4000-a000-000000000001', 'admin@fanni.test',            'مدير المنصة',   '07700000001', 'customer');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000002', 'customer@fanni.test',         'زهراء محمد',    '07700000002', 'customer');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000003', 'provider@fanni.test',         'حيدر كاظم',     '07700000003', 'provider');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000004', 'provider.pending@fanni.test', 'سيف علي',       '07700000004', 'provider');

update public.users set role = 'admin' where id = '00000000-0000-4000-a000-000000000001';
update public.users set city = 'كربلاء', area = 'حي الحسين' where id = '00000000-0000-4000-a000-000000000002';

-- Demo customers (they "wrote" the demo requests & reviews)
select pg_temp.demo_user(('00000000-0000-4000-c000-00000000000' || n)::uuid,
                         'customer' || n || '@demo.fanni.test', name, '0780000000' || n, 'customer')
from (values (1, 'نور الهدى عباس'), (2, 'أحمد جاسم'), (3, 'فاطمة حسين'), (4, 'محمد عبد الرضا'), (5, 'مريم كريم'))
  as t(n, name);

update public.users u set city = 'كربلاء', area = a.area
from (values ('00000000-0000-4000-c000-000000000001'::uuid, 'حي العباس'),
             ('00000000-0000-4000-c000-000000000002'::uuid, 'حي البلدية'),
             ('00000000-0000-4000-c000-000000000003'::uuid, 'حي الموظفين'),
             ('00000000-0000-4000-c000-000000000004'::uuid, 'حي النقيب'),
             ('00000000-0000-4000-c000-000000000005'::uuid, 'حي رمضان')) as a(id, area)
where u.id = a.id;

-- ---------------------------------------------------------------------
-- Providers: 2 test providers + 20 demo providers over the 5 main services
-- ---------------------------------------------------------------------
create temp table demo_providers (
  n int, name text, display_name text, service text, years int, area text, city text,
  status public.verification_status, available boolean, bio text, lat float8, lng float8
);
insert into demo_providers values
 ( 1, 'علي عبد الأمير',  'علي عبد الأمير للسباكة',   'plumbing',   12, 'حي العباس',     'كربلاء', 'verified', true,  'سباك من 12 سنة، أشتغل تسريبات ومجاري وتأسيس صحيات كامل. أجي بالوقت وأنظف بعد الشغل.', 32.6205, 44.0312),
 ( 2, 'مصطفى جبار',      'مصطفى جبار',               'plumbing',    6, 'حي البلدية',    'كربلاء', 'verified', true,  'متخصص بالسخانات والخلاطات وكشف التسريب بدون تكسير قدر الإمكان.', 32.6089, 44.0201),
 ( 3, 'كرار حسن',        'كرار حسن - صحيات',          'plumbing',    9, 'حي الموظفين',   'كربلاء', 'verified', false, 'تأسيس وصيانة صحيات للبيوت والمحلات. شغل نظيف ومضمون.', 32.6301, 44.0155),
 ( 4, 'منتظر هادي',      'منتظر هادي',               'plumbing',    3, 'الهندية',       'الهندية (طويريج)', 'pending', false, 'سباك شاب، أشتغل بالهندية والمناطق القريبة.', 32.5440, 44.2210),
 ( 5, 'أحمد سلمان',      'أحمد سلمان للكهرباء',       'electrical', 15, 'حي الحسين',     'كربلاء', 'verified', true,  'كهربائي بيوت من 15 سنة. تأسيس، طبلات، ربط أمبيرات ومولدات.', 32.6150, 44.0405),
 ( 6, 'عباس فاضل',       'عباس فاضل',                'electrical',  8, 'حي العباس',     'كربلاء', 'verified', true,  'أصلح الانقطاعات وأكشف الأعطال بسرعة. تركيب إنارة وثريات.', 32.6221, 44.0298),
 ( 7, 'زيد خالد',        'زيد خالد - كهرباء',         'electrical',  5, 'حي النقيب',     'كربلاء', 'verified', true,  'كهربائي، أشتغل صيانة يومية وتأسيس شقق.', 32.5998, 44.0102),
 ( 8, 'مرتضى نعمة',      'مرتضى نعمة',               'electrical', 11, 'الحر',          'الحر',   'needs_info', false, 'كهربائي وفني منظومات طاقة شمسية.', 32.6501, 43.9750),
 ( 9, 'محمد رضا',        'محمد رضا للتبريد',          'ac',         10, 'حي الموظفين',   'كربلاء', 'verified', true,  'فني سبلتات، تعبئة غاز وتنظيف ونصب. أشتغل كل الماركات.', 32.6290, 44.0170),
 (10, 'سجاد عدنان',      'سجاد عدنان',               'ac',          7, 'حي رمضان',      'كربلاء', 'verified', true,  'تبريد وتكييف، صيانة سبلت ومبردات هواء. أجيك بنفس اليوم.', 32.6050, 44.0480),
 (11, 'حسنين ماجد',      'حسنين ماجد - تكييف',        'ac',          4, 'حي البلدية',    'كربلاء', 'verified', false, 'نصب وفتح سبلتات وتنظيف كامل.', 32.6101, 44.0222),
 (12, 'أمير عبد الحسين', 'أمير عبد الحسين',          'ac',         13, 'حي الحسين',     'كربلاء', 'verified', true,  'خبرة 13 سنة بالتبريد والتكييف المركزي والسبلت.', 32.6140, 44.0390),
 (13, 'علي جواد',        'علي جواد للأجهزة',          'appliances',  9, 'حي العامل',     'كربلاء', 'verified', true,  'تصليح غسالات وثلاجات ومجمدات بالبيت. قطع أصلية.', 32.5960, 44.0300),
 (14, 'حسن مهدي',        'حسن مهدي',                 'appliances',  6, 'حي الحسين',     'كربلاء', 'verified', true,  'صيانة طباخات وأفران وسخانات كهربائية وغازية.', 32.6160, 44.0420),
 (15, 'يوسف قاسم',       'يوسف قاسم - صيانة',         'appliances',  2, 'حي الغدير',     'كربلاء', 'unverified', false, 'فني صيانة أجهزة منزلية.', 32.6350, 44.0050),
 (16, 'باقر عزيز',       'باقر عزيز',                'appliances', 14, 'حي العباس',     'كربلاء', 'verified', false, 'متخصص غسالات أوتوماتيك وثلاجات نوفروست.', 32.6230, 44.0320),
 (17, 'ضياء ناصر',       'ضياء ناصر للنجارة',         'carpentry',  18, 'حي النقيب',     'كربلاء', 'verified', true,  'نجار من 18 سنة. مطابخ، أبواب، كبتات وتصليح أثاث.', 32.6010, 44.0090),
 (18, 'مهدي صالح',       'مهدي صالح',                'carpentry',   7, 'حي الموظفين',   'كربلاء', 'verified', true,  'تصليح أبواب وأقفال وتفصيل كاونترات.', 32.6280, 44.0160),
 (19, 'عمار ستار',       'عمار ستار - نجارة',         'carpentry',  10, 'حي رمضان',      'كربلاء', 'pending', false, 'نجارة خشب وMDF، تفصيل غرف نوم ومطابخ.', 32.6060, 44.0470),
 (20, 'حسين علي',        'حسين علي',                 'carpentry',   5, 'حي البلدية',    'كربلاء', 'verified', false, 'نجار تصليحات سريعة بالبيوت.', 32.6095, 44.0210);

select pg_temp.demo_user(('00000000-0000-4000-b000-0000000000' || lpad(n::text, 2, '0'))::uuid,
                         'provider' || lpad(n::text, 2, '0') || '@demo.fanni.test', name,
                         '0781000' || lpad(n::text, 4, '0'), 'provider')
from demo_providers;

update public.users u set city = d.city, area = d.area
from demo_providers d
where u.id = ('00000000-0000-4000-b000-0000000000' || lpad(d.n::text, 2, '0'))::uuid;

insert into public.providers (
  id, display_name, service_id, years_experience, bio, province, city, area, lat, lng,
  verification_status, verified_at, is_available, is_demo, created_at
)
select ('00000000-0000-4000-b000-0000000000' || lpad(d.n::text, 2, '0'))::uuid,
       d.display_name, s.id, d.years, d.bio, 'كربلاء', d.city, d.area, d.lat, d.lng,
       d.status, case when d.status = 'verified' then now() - interval '90 days' end,
       d.available, true, now() - (d.n || ' days')::interval - interval '100 days'
from demo_providers d join public.services s on s.slug = d.service;

-- Test providers: one verified plumber in Hay Al-Hussein, one waiting for approval
insert into public.providers (id, display_name, service_id, years_experience, bio, province, city, area, lat, lng,
                              verification_status, verified_at, is_available, is_demo)
select '00000000-0000-4000-a000-000000000003', 'حيدر كاظم للسباكة', s.id, 8,
       'حساب تجريبي للفني. سباكة عامة، تسريبات وسخانات.', 'كربلاء', 'كربلاء', 'حي الحسين', 32.6155, 44.0400,
       'verified', now() - interval '60 days', true, true
from public.services s where s.slug = 'plumbing';

insert into public.providers (id, display_name, service_id, years_experience, bio, province, city, area,
                              verification_status, is_available, is_demo)
select '00000000-0000-4000-a000-000000000004', 'سيف علي للكهرباء', s.id, 4,
       'حساب تجريبي لفني ينتظر التوثيق.', 'كربلاء', 'كربلاء', 'حي العامل', 'pending', false, true
from public.services s where s.slug = 'electrical';

update public.users u set city = p.city, area = p.area from public.providers p
where u.id = p.id and u.id in ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000004');

-- Verification requests (documents are placeholders; real ones live in the private bucket)
insert into public.verification_requests (provider_id, document_path, provider_note, status, admin_notes, reviewed_by, reviewed_at, is_demo, created_at)
select p.id, p.id || '/demo-id-card.png', 'هوية الأحوال المدنية',
       case p.verification_status when 'unverified' then 'pending' else p.verification_status end,
       case p.verification_status
         when 'verified'   then 'تم التحقق من الهوية'
         when 'needs_info' then 'الصورة مو واضحة، ارفع صورة أوضح للهوية من الوجهين'
       end,
       case when p.verification_status in ('verified', 'needs_info') then '00000000-0000-4000-a000-000000000001'::uuid end,
       case when p.verification_status in ('verified', 'needs_info') then now() - interval '80 days' end,
       true, now() - interval '95 days'
from public.providers p
where p.verification_status <> 'unverified';

-- Portfolio placeholders (static SVGs shipped with the web app under /demo/portfolio)
insert into public.provider_portfolio (provider_id, image_url, caption, is_demo)
select p.id, '/demo/portfolio/' || s.slug || '-' || i || '.svg',
       (array['شغل بأحد البيوت بكربلاء', 'قبل وبعد التصليح', 'تأسيس جديد'])[i], true
from public.providers p
join public.services s on s.id = p.service_id
cross join generate_series(1, 3) i
where p.is_demo;

-- ---------------------------------------------------------------------
-- Demo request history: finished + rated jobs for every verified provider
-- ---------------------------------------------------------------------
create temp table review_pool (i int, rating int, comment text);
insert into review_pool values
 (1, 5, 'خوش فني، إجا بالوقت وخلص الشغل بسرعة. أنصح بيه'),
 (2, 5, 'شغله نظيف ومرتب وتعامله راقي. الله يوفقه'),
 (3, 4, 'الشغل زين بس تأخر شوية عن الموعد'),
 (4, 5, 'سعره مناسب وما غشنا بالقطع. شكراً'),
 (5, 4, 'شغل ممتاز، بس لو يجيب عدته كاملة من أول مرة'),
 (6, 5, 'أفضل فني تعاملت وياه، صادق ويفهم بشغله'),
 (7, 3, 'الشغل مقبول بس السعر شوية عالي'),
 (8, 5, 'حل المشكلة اللي محد گدر يحلها. تسلم إيده'),
 (9, 4, 'محترم ومرتب، أكيد راح أرجعله');

do $$
declare
  p record;
  v_req uuid;
  v_n int;
  v_k int := 0;
  v_customer uuid;
  v_rev record;
  v_date timestamptz;
begin
  perform setseed(0.42);
  for p in
    select pr.id, pr.service_id, pr.city, pr.area, s.problem_types
    from public.providers pr join public.services s on s.id = pr.service_id
    where pr.is_demo and pr.verification_status = 'verified'
    order by pr.id
  loop
    v_n := 2 + floor(random() * 4)::int;   -- 2..5 finished jobs each
    for j in 1..v_n loop
      v_k := v_k + 1;
      v_customer := ('00000000-0000-4000-c000-00000000000' || (1 + (v_k % 5)))::uuid;
      v_date := now() - ((5 + floor(random() * 80)) || ' days')::interval;
      select * into v_rev from review_pool where i = 1 + (v_k % 9);

      insert into public.service_requests (
        customer_id, service_id, problem_type, description, province, city, area,
        time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at
      ) values (
        v_customer, p.service_id, p.problem_types[1 + (v_k % (array_length(p.problem_types, 1) - 1))],
        'طلب تجريبي منتهي', 'كربلاء', p.city, p.area,
        'today', 'RATED', p.id, v_date + interval '20 minutes', v_date + interval '3 hours', true, v_date
      ) returning id into v_req;

      insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo, created_at)
      values (v_req, p.id, 'accepted', v_date + interval '20 minutes', true, v_date);

      insert into public.reviews (
        request_id, provider_id, customer_id, customer_name, rating,
        rating_punctuality, rating_quality, rating_behavior, rating_price, comment, is_demo, created_at
      )
      select v_req, p.id, v_customer, split_part(u.full_name, ' ', 1), v_rev.rating,
             greatest(1, v_rev.rating - (v_k % 2)), v_rev.rating, 5, greatest(1, v_rev.rating - (v_k % 3 = 0)::int),
             v_rev.comment, true, v_date + interval '5 hours'
      from public.users u where u.id = v_customer;

      update public.providers set completed_jobs = completed_jobs + 1 where id = p.id;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Live demo requests for the test accounts (one per interesting status)
-- ---------------------------------------------------------------------
do $$
declare
  c_test   uuid := '00000000-0000-4000-a000-000000000002';  -- customer@fanni.test
  p_test   uuid := '00000000-0000-4000-a000-000000000003';  -- provider@fanni.test (plumber)
  s_plumb  uuid := (select id from public.services where slug = 'plumbing');
  s_elec   uuid := (select id from public.services where slug = 'electrical');
  s_ac     uuid := (select id from public.services where slug = 'ac');
  s_carp   uuid := (select id from public.services where slug = 'carpentry');
  v_req    uuid;
begin
  -- 1) MATCHING: test customer sent a plumbing request to test provider + 1 other (provider inbox has an offer)
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    address_details, time_slot, status, is_demo, created_at)
  values (c_test, s_plumb, 'تسريب مي', 'اكو تسريب مي جوة المغسلة بالحمام والمي دا ينزل عالكاشي',
    'كربلاء', 'كربلاء', 'حي الحسين', 'قرب جامع الحسين، الفرع الثاني', 'today', 'MATCHING', true, now() - interval '25 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, is_demo, created_at) values
    (v_req, p_test, 'offered', true, now() - interval '20 minutes'),
    (v_req, '00000000-0000-4000-b000-000000000002', 'offered', true, now() - interval '20 minutes');

  -- 2) IN_PROGRESS: electrician working at test customer's house
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, is_demo, created_at)
  values (c_test, s_elec, 'انقطاع بجزء من البيت', 'الكهرباء طافية بغرفتين والصالة شغالة',
    'كربلاء', 'كربلاء', 'حي الحسين', 'now', 'IN_PROGRESS', '00000000-0000-4000-b000-000000000005',
    now() - interval '2 hours', true, now() - interval '150 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, '00000000-0000-4000-b000-000000000005', 'accepted', now() - interval '2 hours', true);

  -- 3) COMPLETED (not rated yet): test customer can rate it / file a complaint
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at)
  values (c_test, s_ac, 'تعبئة غاز', 'السبلت يشتغل بس ما يبرد زين',
    'كربلاء', 'كربلاء', 'حي الحسين', 'tomorrow', 'COMPLETED', '00000000-0000-4000-b000-000000000009',
    now() - interval '2 days', now() - interval '1 day', true, now() - interval '3 days')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, '00000000-0000-4000-b000-000000000009', 'accepted', now() - interval '2 days', true);
  update public.providers set completed_jobs = completed_jobs + 1 where id = '00000000-0000-4000-b000-000000000009';

  -- 4) CANCELLED
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, cancel_reason, cancelled_at, is_demo, created_at)
  values (c_test, s_carp, 'تصليح باب', 'باب غرفة النوم ما يتسكر', 'كربلاء', 'كربلاء', 'حي الحسين',
    'today', 'CANCELLED', 'انحلت المشكلة', now() - interval '6 days', true, now() - interval '6 days');

  -- 5) ACCEPTED job for the test provider (from another demo customer) — provider can move it forward
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    address_details, time_slot, status, provider_id, accepted_at, is_demo, created_at)
  values ('00000000-0000-4000-c000-000000000001', s_plumb, 'انسداد مجاري', 'مجرى المطبخ مسدود والمي راجعة',
    'كربلاء', 'كربلاء', 'حي العباس', 'قرب مدرسة العباس الابتدائية', 'now', 'ACCEPTED', p_test,
    now() - interval '10 minutes', true, now() - interval '40 minutes')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, p_test, 'accepted', now() - interval '10 minutes', true);

  -- 6) A rated job in the test provider's history (shows on their public profile)
  insert into public.service_requests (customer_id, service_id, problem_type, description, province, city, area,
    time_slot, status, provider_id, accepted_at, completed_at, is_demo, created_at)
  values ('00000000-0000-4000-c000-000000000003', s_plumb, 'مشكلة بالسخان', 'السخان ما يسخن',
    'كربلاء', 'كربلاء', 'حي الموظفين', 'today', 'RATED', p_test,
    now() - interval '9 days', now() - interval '9 days', true, now() - interval '10 days')
  returning id into v_req;
  insert into public.provider_requests (request_id, provider_id, status, responded_at, is_demo)
  values (v_req, p_test, 'accepted', now() - interval '9 days', true);
  insert into public.reviews (request_id, provider_id, customer_id, customer_name, rating,
    rating_punctuality, rating_quality, rating_behavior, rating_price, comment, is_demo)
  values (v_req, p_test, '00000000-0000-4000-c000-000000000003', 'فاطمة', 5, 5, 5, 5, 4,
    'بدل المقاومة وصار السخان يشتغل. شغل نظيف', true);
  update public.providers set completed_jobs = completed_jobs + 1 where id = p_test;
end $$;

-- ---------------------------------------------------------------------
-- Complaints
-- ---------------------------------------------------------------------
insert into public.complaints (request_id, customer_id, provider_id, subject, details, status, admin_notes, is_demo, created_at)
select r.id, r.customer_id, r.provider_id, 'الفني تأخر ساعتين',
       'اتفقنا الساعة 10 وإجا الساعة 12 بدون ما يتصل', 'in_review', 'تواصلنا ويا الفني وبانتظار رده', true, r.completed_at + interval '1 day'
from public.service_requests r where r.is_demo and r.status = 'RATED' order by r.created_at limit 1;

insert into public.complaints (request_id, customer_id, provider_id, subject, details, status, is_demo, created_at)
select r.id, r.customer_id, r.provider_id, 'السعر أعلى من المتفق عليه',
       'گال 25 ألف وبعدين طلب 40', 'open', true, r.completed_at + interval '2 hours'
from public.service_requests r where r.is_demo and r.status = 'RATED' order by r.created_at desc limit 1 offset 3;

select set_config('fanni.system', 'off', false);

-- Quick summary
select
  (select count(*) from public.providers where is_demo) as demo_providers,
  (select count(*) from public.providers where verification_status = 'verified') as verified,
  (select count(*) from public.service_requests) as requests,
  (select count(*) from public.reviews) as reviews,
  (select count(*) from public.provider_portfolio) as portfolio,
  (select count(*) from public.complaints) as complaints;
