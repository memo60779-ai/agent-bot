-- =====================================================================
-- Stale request alarm + "where am I short of providers?"
--   * Every minute (pg_cron): a request still waiting for a provider after
--     10 minutes alerts every admin once (push + Telegram), so the founder
--     can call a provider or reassure the customer by hand.
--   * admin_demand_stats(): requests, acceptance rate and time-to-accept
--     per service and area, next to how many verified providers serve it.
-- Idempotent: safe to run more than once.
-- =====================================================================

alter table public.service_requests
  add column if not exists stale_alerted_at timestamptz;

create or replace function private.alert_stale_requests(p_minutes int default 10) returns int
language plpgsql security definer set search_path = public, private as $$
declare
  r record;
  a record;
  v_url text := coalesce(private.setting('app_url'), '');
  v_count int := 0;
  v_text text;
begin
  for r in
    select sr.id, sr.area, sr.city, sr.problem_type, sr.address_details, s.name_ar,
           ceil(extract(epoch from (now() - sr.created_at)) / 60)::int as waited,
           (select count(*) from public.provider_requests o where o.request_id = sr.id) as offers,
           (select count(*) from public.provider_requests o where o.request_id = sr.id and o.status = 'declined') as declined,
           u.full_name, u.phone
    from public.service_requests sr
    join public.services s on s.id = sr.service_id
    join public.users u on u.id = sr.customer_id
    where sr.status in ('NEW', 'MATCHING')
      and sr.created_at < now() - make_interval(mins => p_minutes)
      and sr.created_at > now() - interval '1 day'      -- don't wake up for ancient leftovers
      and sr.stale_alerted_at is null
      and not sr.is_demo
    for update of sr skip locked
  loop
    v_text := '⚠️ طلب ينتظر فني من ' || r.waited || ' دقيقة' || chr(10) || chr(10) ||
              '🔧 ' || r.name_ar || ' — ' || r.problem_type || chr(10) ||
              '📍 ' || r.area || '، ' || r.city || chr(10) ||
              '👤 ' || coalesce(r.full_name, '—') || ' · ' || coalesce(r.phone, '—') || chr(10) ||
              case when r.offers = 0 then '🚫 الزبون ما دز الطلب لأي فني بعد'
                   else '📨 انرسل لـ ' || r.offers || ' فني' ||
                        case when r.declined > 0 then ' (' || r.declined || ' اعتذروا)' else '' end end ||
              chr(10) || chr(10) || 'اتصل بفني قريب، أو طمّن الزبون.';
    for a in
      select u.id, nc.telegram_chat_id
      from public.users u left join public.notification_channels nc on nc.user_id = u.id
      where u.role = 'admin' and u.is_active
    loop
      perform private.push_send(a.id, '⚠️ طلب ينتظر من ' || r.waited || ' دقيقة',
        r.name_ar || ' · ' || r.area || ' · ' || case when r.offers = 0 then 'ما انرسل لأي فني' else 'انرسل لـ ' || r.offers || ' فني' end,
        '/requests/' || r.id, 'stale-' || r.id);
      if a.telegram_chat_id is not null then
        perform private.telegram_send(a.telegram_chat_id, v_text,
          case when v_url <> '' then v_url || '/requests/' || r.id end);
      end if;
    end loop;
    update public.service_requests set stale_alerted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function private.alert_stale_requests(int) from public, anon, authenticated;

-- Run it every minute. Needs the pg_cron extension (Supabase: Database ->
-- Extensions -> pg_cron, or the line below). Without it nothing breaks; the
-- alarm just doesn't fire.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('fanni-stale-requests', '* * * * *', 'select private.alert_stale_requests()');
exception when others then
  raise notice 'pg_cron not available, enable it and run this block again: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------
-- Demand vs supply, per service and area
-- ---------------------------------------------------------------------
create or replace function public.admin_demand_stats(p_days int default 30)
returns table (
  service text, area text, requests int, accepted int, unanswered int,
  avg_accept_minutes numeric, providers int
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return query
  with req as (
    select sr.service_id, sr.area, sr.accepted_at, sr.created_at, sr.status, sr.provider_id
    from public.service_requests sr
    where not sr.is_demo and sr.created_at > now() - make_interval(days => greatest(p_days, 1))
  )
  select s.name_ar, req.area,
         count(*)::int,
         count(*) filter (where req.accepted_at is not null)::int,
         -- never got a provider: still waiting > 10 min, or cancelled while waiting
         count(*) filter (where req.accepted_at is null and (
           (req.status in ('NEW', 'MATCHING') and req.created_at < now() - interval '10 minutes')
           or req.status = 'CANCELLED'))::int,
         round(avg(extract(epoch from (req.accepted_at - req.created_at)) / 60)
               filter (where req.accepted_at is not null), 1),
         (select count(*)::int from public.providers p join public.users u on u.id = p.id
          where p.service_id = req.service_id and p.area = req.area
            and p.verification_status = 'verified' and u.is_active and not p.is_demo)
  from req join public.services s on s.id = req.service_id
  group by s.name_ar, req.area, req.service_id
  order by 5 desc, 3 desc;
end $$;

revoke execute on function public.admin_demand_stats(int) from public, anon, authenticated;
grant execute on function public.admin_demand_stats(int) to authenticated;
