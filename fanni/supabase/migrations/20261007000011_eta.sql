-- =====================================================================
-- Arrival time (ETA)
--   * Provider taps "طالع بالطريق" and picks 10/20/30/45/60 min ->
--     start_trip() stores eta_at and moves the request to ON_THE_WAY.
--   * Running late -> extend_eta() (+N min) and the customer is told.
--   * on_the_way_at / arrived_at are stamped automatically, so every
--     provider gets a public punctuality record ("وصل بالوقت 9 من 10").
-- Idempotent: safe to run more than once.
-- =====================================================================

alter table public.service_requests
  add column if not exists eta_at        timestamptz,
  add column if not exists on_the_way_at timestamptz,
  add column if not exists arrived_at    timestamptz;

create or replace function public.stamp_request_times() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'ON_THE_WAY' then
      new.on_the_way_at := now();
    elsif new.status = 'IN_PROGRESS' and new.arrived_at is null then
      new.arrived_at := now();
    elsif new.status = 'MATCHING' then           -- provider backed out: the trip is void
      new.eta_at := null;
      new.on_the_way_at := null;
      new.arrived_at := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists service_requests_stamp_times on public.service_requests;
create trigger service_requests_stamp_times
  before update of status on public.service_requests
  for each row execute function public.stamp_request_times();

-- ---------------------------------------------------------------------
-- Provider RPCs
-- ---------------------------------------------------------------------
create or replace function public.start_trip(p_request_id uuid, p_minutes int)
returns public.service_requests
language plpgsql security definer set search_path = public as $$
declare r public.service_requests;
begin
  if p_minutes is null or p_minutes not between 5 and 180 then
    raise exception 'invalid_eta';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null or r.provider_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status <> 'ACCEPTED' then
    raise exception 'invalid_transition';
  end if;
  update public.service_requests set eta_at = now() + make_interval(mins => p_minutes) where id = r.id;
  return public.update_request_status(r.id, 'ON_THE_WAY');
end $$;

create or replace function public.extend_eta(p_request_id uuid, p_minutes int)
returns public.service_requests
language plpgsql security definer set search_path = public, private as $$
declare r public.service_requests;
begin
  if p_minutes is null or p_minutes not between 5 and 60 then
    raise exception 'invalid_eta';
  end if;
  select * into r from public.service_requests where id = p_request_id for update;
  if r.id is null or r.provider_id is distinct from auth.uid() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if r.status <> 'ON_THE_WAY' then
    raise exception 'invalid_transition';
  end if;
  update public.service_requests
    set eta_at = greatest(coalesce(eta_at, now()), now()) + make_interval(mins => p_minutes)
    where id = r.id returning * into r;
  perform private.push_send(r.customer_id, '⏱️ الفني تأخر شوية',
    'يوصل تقريباً خلال ' || ceil(extract(epoch from (r.eta_at - now())) / 60)::int || ' دقيقة. نعتذر عن التأخير.',
    '/requests/' || r.id, 'req-' || r.id);
  return r;
end $$;

-- ---------------------------------------------------------------------
-- Public punctuality record (trips with an ETA that reached IN_PROGRESS)
-- 5 minutes of grace: Karbala traffic is Karbala traffic.
-- ---------------------------------------------------------------------
create or replace function public.provider_punctuality(p_provider_id uuid)
returns table (trips int, on_time int)
language sql stable security definer set search_path = public as $$
  select count(*)::int,
         count(*) filter (where arrived_at <= eta_at + interval '5 minutes')::int
  from public.service_requests
  where provider_id = p_provider_id and eta_at is not null and arrived_at is not null and not is_demo;
$$;

-- ---------------------------------------------------------------------
-- Push: "on the way" now carries the ETA (replaces the earlier version)
-- ---------------------------------------------------------------------
create or replace function public.push_request_status() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_name text;
  v_url text := '/requests/' || new.id;
  v_tag text := 'req-' || new.id;
  v_mins int;
begin
  if new.status = old.status then
    return new;
  end if;
  select split_part(display_name, ' ', 1) into v_name from public.providers where id = new.provider_id;
  v_name := coalesce(v_name, 'الفني');

  case new.status
    when 'ACCEPTED' then
      perform private.push_send(new.customer_id, '✅ ' || v_name || ' قبل طلبك',
        'هسه تگدر تتصل بيه، وراح نبلغك من يطلع بالطريق.', v_url, v_tag);
    when 'ON_THE_WAY' then
      v_mins := case when new.eta_at is not null
                     then greatest(1, ceil(extract(epoch from (new.eta_at - now())) / 60))::int end;
      perform private.push_send(new.customer_id, '🚗 ' || v_name || ' طالع بالطريق',
        case when v_mins is not null then 'يوصل لبيتك خلال ' || v_mins || ' دقيقة تقريباً.'
             else 'الفني جاي لبيتك هسه.' end, v_url, v_tag);
    when 'IN_PROGRESS' then
      perform private.push_send(new.customer_id, '🔧 ' || v_name || ' بدأ الشغل',
        'نبلغك من يخلص.', v_url, v_tag);
    when 'COMPLETED' then
      perform private.push_send(new.customer_id, '🎉 خلص الشغل',
        'قيّم ' || v_name || ' بدقيقة، تقييمك يساعد غيرك يختار صح.', v_url, v_tag);
    when 'CANCELLED' then
      if old.provider_id is not null then
        perform private.push_send(old.provider_id, '❌ الطلب انلغى',
          'الزبون ألغى الطلب' || coalesce(': ' || left(new.cancel_reason, 120), '.'), v_url, v_tag);
      end if;
    else
      null;
  end case;
  return new;
exception when others then
  raise warning 'push_request_status failed: %', sqlerrm;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------
revoke execute on function public.stamp_request_times(), public.push_request_status() from public, anon, authenticated;
revoke execute on function public.start_trip(uuid, int), public.extend_eta(uuid, int),
  public.provider_punctuality(uuid) from public, anon, authenticated;
grant execute on function public.start_trip(uuid, int), public.extend_eta(uuid, int) to authenticated;
grant execute on function public.provider_punctuality(uuid) to anon, authenticated;
