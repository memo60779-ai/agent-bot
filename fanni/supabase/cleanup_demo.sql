-- =====================================================================
-- Remove ALL demo data before going live.
-- Deletes every auth user whose profile is flagged is_demo (cascades to
-- users, providers, portfolio, verification requests, requests, offers,
-- reviews, complaints), then any remaining is_demo rows.
-- Services are kept (they are the real catalog).
--
-- ⚠️ This also deletes the demo ADMIN (admin@fanni.test). Before running,
-- create your real admin account and promote it:
--   update public.users set role = 'admin' where email = 'you@yourdomain.com';
-- =====================================================================
begin;

select set_config('fanni.system', 'on', true);

delete from public.reviews               where is_demo;
delete from public.complaints            where is_demo;
delete from public.provider_requests     where is_demo;
delete from public.service_requests      where is_demo;
delete from public.provider_portfolio    where is_demo;
delete from public.verification_requests where is_demo;
delete from auth.users where id in (select id from public.users where is_demo);
delete from public.users where is_demo;

-- Recompute rating aggregates for the providers that remain.
select public.refresh_provider_rating(id) from public.providers;

select
  (select count(*) from public.users where is_demo)    as demo_users_left,
  (select count(*) from public.providers)              as providers_left,
  (select count(*) from public.service_requests)       as requests_left;

commit;
