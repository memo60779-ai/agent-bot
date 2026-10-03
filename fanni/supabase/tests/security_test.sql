-- =====================================================================
-- Security / business-rule tests. Run against a freshly seeded database:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security_test.sql
-- Everything runs inside a transaction that is rolled back at the end.
-- Each test impersonates a user the same way PostgREST does
-- (role = authenticated/anon + request.jwt.claims).
-- =====================================================================
begin;
create schema fanni_test;

create or replace function fanni_test.login(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create or replace function fanni_test.logout() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

create or replace function fanni_test.check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'FAIL: %', p_name;
  end if;
  raise notice 'ok  - %', p_name;
end $$;

-- expects the statement to fail
create or replace function fanni_test.check_fails(p_sql text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok  - % (blocked: %)', p_name, sqlerrm;
    return;
  end;
  raise exception 'FAIL: % (statement succeeded)', p_name;
end $$;

-- ids from seed
\set admin    '''00000000-0000-4000-a000-000000000001'''
\set customer '''00000000-0000-4000-a000-000000000002'''
\set provider '''00000000-0000-4000-a000-000000000003'''
\set pending  '''00000000-0000-4000-a000-000000000004'''
\set other_customer '''00000000-0000-4000-c000-000000000001'''
\set other_provider '''00000000-0000-4000-b000-000000000002'''

select id as pending_vid from public.verification_requests where provider_id = :pending \gset

grant usage on schema fanni_test to authenticated, anon;
grant execute on all functions in schema fanni_test to authenticated, anon;

-- ---------------------------------------------------------------- anon
select set_config('role', 'anon', true);
select fanni_test.check((select count(*) from public.services) = 8, 'anon sees 8 services');
select fanni_test.check((select count(*) from public.providers where verification_status <> 'verified') = 0,
                     'anon sees only verified providers');
select fanni_test.check((select count(*) from public.providers) = 17, 'anon sees 17 verified providers');
select fanni_test.check_fails('select * from public.users', 'anon cannot read users');
select fanni_test.check_fails('select * from public.service_requests', 'anon cannot read requests');
select fanni_test.check_fails('select * from public.verification_requests', 'anon cannot read verification docs');
select fanni_test.check_fails('select public.admin_stats()', 'anon cannot call admin_stats');
select fanni_test.logout();

-- ---------------------------------------------------------------- customer
select fanni_test.login(:customer);
select fanni_test.check((select count(*) from public.users) = 1, 'customer sees only own user row');
select fanni_test.check((select bool_and(customer_id = :customer) from public.service_requests),
                     'customer sees only own requests');
select fanni_test.check((select count(*) from public.service_requests) = 4, 'customer has 4 seeded requests');
select fanni_test.check((select count(*) from public.verification_requests) = 0, 'customer sees no verification requests');
select fanni_test.check((select count(*) from public.complaints) = 0, 'customer sees no foreign complaints');
select fanni_test.check_fails('select public.admin_stats()', 'customer cannot call admin_stats');

-- cannot escalate role
update public.users set role = 'admin', is_active = true where id = :customer;
select fanni_test.check((select role from public.users where id = :customer) = 'customer', 'customer cannot make self admin');

-- cannot insert a request for someone else / with a status
select fanni_test.check_fails(format($q$insert into public.service_requests (customer_id, service_id, problem_type, city, area)
  select %L, id, 'x', 'كربلاء', 'حي الحسين' from public.services limit 1$q$, :other_customer),
  'customer cannot create request for another user');
select fanni_test.check_fails($q$insert into public.service_requests (customer_id, service_id, problem_type, city, area, status)
  select auth.uid(), id, 'x', 'كربلاء', 'حي الحسين', 'COMPLETED' from public.services limit 1$q$,
  'customer cannot create request already COMPLETED');

-- direct status update is not allowed (no UPDATE policy) -> 0 rows changed
update public.service_requests set status = 'COMPLETED' where customer_id = :customer and status = 'MATCHING';
select fanni_test.check((select count(*) from public.service_requests where customer_id = :customer and status = 'MATCHING') = 1,
                     'customer cannot update request status directly');

-- full flow: create -> match -> offer
create temp table t_ids (k text primary key, v uuid);
grant all on t_ids to authenticated;
with x as (
  insert into public.service_requests (customer_id, service_id, problem_type, description, city, area, time_slot)
  select auth.uid(), id, 'تسريب مي', 'اختبار', 'كربلاء', 'حي الحسين', 'now' from public.services where slug = 'plumbing'
  returning id
)
insert into t_ids select 'req', id from x;
select fanni_test.check((select count(*) from public.match_providers((select v from t_ids where k = 'req'))) = 4,
                     'matching returns 4 verified plumbers');
select fanni_test.check((select provider_id from public.match_providers((select v from t_ids where k = 'req')) limit 1) = :provider,
                     'same-area available provider ranks first');
select fanni_test.check((select status from public.service_requests where id = (select v from t_ids where k = 'req')) = 'MATCHING',
                     'request moves to MATCHING');
select fanni_test.check_fails(format('select public.send_offer(%L, %L)', (select v from t_ids where k = 'req'),
                     '00000000-0000-4000-b000-000000000004'), 'cannot send offer to unverified provider');
select fanni_test.check_fails(format('select public.send_offer(%L, %L)', (select v from t_ids where k = 'req'),
                     '00000000-0000-4000-b000-000000000005'), 'cannot send offer to provider of other service');
insert into t_ids select 'offer', (public.send_offer((select v from t_ids where k = 'req'), :provider)).id;
insert into t_ids select 'offer2', (public.send_offer((select v from t_ids where k = 'req'), :other_provider)).id;
select fanni_test.check_fails(format('select public.submit_review(%L, 5)', (select v from t_ids where k = 'req')),
                     'cannot review a request that is not completed');
select fanni_test.check_fails($q$insert into public.reviews (request_id, provider_id, customer_id, rating)
  select id, provider_id, customer_id, 5 from public.service_requests where provider_id is not null limit 1$q$,
  'customer cannot insert reviews directly');
-- customer cannot read other customer's contacts
select fanni_test.check((select customer_phone from public.get_request_contacts((select v from t_ids where k = 'req'))) is null,
                     'phones hidden before acceptance');

-- ---------------------------------------------------------------- provider
select fanni_test.login(:provider);
select fanni_test.check((select bool_and(provider_id = :provider or public.is_offered_request(id)) from public.service_requests),
                     'provider sees only offered/assigned requests');
select fanni_test.check((select count(*) from public.service_requests where id = (select v from t_ids where k = 'req')) = 1,
                     'provider sees the new offered request');
select fanni_test.check((select bool_and(provider_id = :provider) from public.provider_requests),
                     'provider sees only own offers');
select fanni_test.check((select count(*) from public.users) = 1, 'provider cannot read customer profiles');

-- cannot self-verify / fake ratings
update public.providers set verification_status = 'verified', rating_avg = 5, completed_jobs = 999 where id = :provider;
select fanni_test.check((select completed_jobs from public.providers where id = :provider) < 999,
                     'provider cannot change counters/rating');
-- cannot touch reviews
update public.reviews set rating = 5, comment = 'hacked', is_hidden = true where provider_id = :provider;
select fanni_test.check((select count(*) from public.reviews where comment = 'hacked') = 0, 'provider cannot modify reviews');
select fanni_test.check_fails($q$delete from public.reviews where provider_id = auth.uid()$q$, 'provider cannot delete reviews');
select fanni_test.check_fails(format($q$select public.review_verification(%L, 'verified')$q$, :'pending_vid'),
                     'provider cannot approve verification');

-- accept the offer -> ACCEPTED, the other offer is cancelled
select public.respond_offer((select v from t_ids where k = 'offer'), true);
select fanni_test.check((select status from public.service_requests where id = (select v from t_ids where k = 'req')) = 'ACCEPTED',
                     'provider accepts -> ACCEPTED');
select fanni_test.check((select customer_phone from public.get_request_contacts((select v from t_ids where k = 'req'))) = '07700000002',
                     'provider sees customer phone after accepting');
select fanni_test.check_fails(format($q$select public.update_request_status(%L, 'COMPLETED')$q$, (select v from t_ids where k = 'req')),
                     'provider cannot skip to COMPLETED');
select public.update_request_status((select v from t_ids where k = 'req'), 'ON_THE_WAY');
select public.update_request_status((select v from t_ids where k = 'req'), 'IN_PROGRESS');

-- the second provider can no longer accept
select fanni_test.login(:other_provider);
select fanni_test.check((select status from public.provider_requests where id = (select v from t_ids where k = 'offer2')) = 'cancelled',
                     'other offer was cancelled');
select fanni_test.check_fails(format('select public.respond_offer(%L, true)', (select v from t_ids where k = 'offer2')),
                     'second provider cannot accept a taken request');
select fanni_test.check_fails(format($q$select public.update_request_status(%L, 'COMPLETED')$q$, (select v from t_ids where k = 'req')),
                     'unassigned provider cannot change status');

-- customer cannot cancel IN_PROGRESS
select fanni_test.login(:customer);
select fanni_test.check_fails(format($q$select public.update_request_status(%L, 'CANCELLED')$q$, (select v from t_ids where k = 'req')),
                     'customer cannot cancel in-progress job');
select fanni_test.check((select provider_phone from public.get_request_contacts((select v from t_ids where k = 'req'))) = '07700000003',
                     'customer sees provider phone after acceptance');

select fanni_test.login(:provider);
create temp table t_before as select completed_jobs from public.providers where id = :provider;
grant all on t_before to authenticated;
select public.update_request_status((select v from t_ids where k = 'req'), 'COMPLETED');
select fanni_test.check((select completed_jobs from public.providers where id = :provider) = (select completed_jobs + 1 from t_before),
                     'completed_jobs incremented');

-- ---------------------------------------------------------------- review + complaint
select fanni_test.login(:customer);
select public.submit_review((select v from t_ids where k = 'req'), 4, 5, 4, 5, 3, 'تمام');
select fanni_test.check((select status from public.service_requests where id = (select v from t_ids where k = 'req')) = 'RATED',
                     'review -> RATED');
select fanni_test.check_fails(format('select public.submit_review(%L, 5)', (select v from t_ids where k = 'req')),
                     'cannot review twice');
insert into public.complaints (request_id, customer_id, provider_id, subject, details)
values ((select v from t_ids where k = 'req'), :customer, :provider, 'تأخير', 'اختبار');
select fanni_test.check((select count(*) from public.complaints) = 1, 'customer filed complaint on completed request');
select fanni_test.check_fails(format($q$insert into public.complaints (request_id, customer_id, subject)
  select id, %L, 'x' from public.service_requests where customer_id = auth.uid() and status = 'CANCELLED' limit 1$q$, :customer),
  'cannot complain about a request that was not completed');
update public.complaints set status = 'resolved' where customer_id = :customer;
select fanni_test.check((select bool_and(status = 'open') from public.complaints), 'customer cannot change complaint status');

-- ---------------------------------------------------------------- pending provider & verification
select fanni_test.login(:pending);
select fanni_test.check((select verification_status from public.providers where id = :pending) = 'pending', 'pending provider sees own row');
select fanni_test.check((select count(*) from public.verification_requests) = 1, 'provider sees own verification request only');
update public.providers set is_available = true where id = :pending;

select fanni_test.login(:admin);
select fanni_test.check((select (public.admin_stats() ->> 'providers')::int) = 22, 'admin_stats works for admin');
select fanni_test.check((select count(*) from public.users) = 29, 'admin sees all users');
select public.review_verification(id, 'verified', 'تمام') from public.verification_requests where provider_id = :pending;
select fanni_test.check((select verification_status from public.providers where id = :pending) = 'verified', 'admin approves verification');
update public.complaints set status = 'resolved', admin_notes = 'تم الحل' where customer_id = :customer;
select fanni_test.check((select count(*) from public.complaints where status = 'resolved' and customer_id = :customer) = 1,
                     'admin updates complaint');
update public.reviews set is_hidden = true where request_id = (select v from t_ids where k = 'req');
select fanni_test.check((select rating_count from public.providers where id = :provider) =
                     (select count(*) from public.reviews where provider_id = :provider and not is_hidden),
                     'hidden review removed from rating aggregate');
select fanni_test.check_fails(format($q$select public.admin_set_user(%L, null, false)$q$, :admin), 'admin cannot deactivate self');
select public.admin_set_user(:other_provider, null, false);
select fanni_test.logout();

select set_config('role', 'anon', true);
select fanni_test.check((select count(*) from public.providers where id = :other_provider) = 0,
                     'deactivated provider disappears from public list');
select fanni_test.check((select count(*) from public.reviews where is_hidden) = 0, 'anon cannot see hidden reviews');

-- ---------------------------------------------------------------- storage policies
select fanni_test.logout();
insert into storage.objects (bucket_id, name) values
  ('verification-docs', :pending || '/id.png'),
  ('request-photos', :other_customer || '/leak.jpg');
select set_config('role', 'anon', true);
select fanni_test.check((select count(*) from storage.objects where bucket_id = 'verification-docs') = 0,
                     'anon cannot list verification docs');
select fanni_test.login(:customer);
select fanni_test.check((select count(*) from storage.objects where bucket_id = 'verification-docs') = 0,
                     'customer cannot see verification docs');
select fanni_test.check((select count(*) from storage.objects where bucket_id = 'request-photos') = 0,
                     'customer cannot see other customers photos');
select fanni_test.check_fails($q$insert into storage.objects (bucket_id, name) values ('portfolio', '00000000-0000-4000-c000-000000000001/x.jpg')$q$,
                     'cannot upload into another users folder');
select fanni_test.login(:pending);
select fanni_test.check((select count(*) from storage.objects where bucket_id = 'verification-docs') = 1, 'owner sees own doc');
select fanni_test.login(:admin);
select fanni_test.check((select count(*) from storage.objects where bucket_id = 'verification-docs') = 1, 'admin sees doc');
select fanni_test.logout();

\echo 'ALL SECURITY TESTS PASSED'
rollback;
