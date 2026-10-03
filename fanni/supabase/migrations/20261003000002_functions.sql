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
