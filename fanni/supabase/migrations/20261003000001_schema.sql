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
