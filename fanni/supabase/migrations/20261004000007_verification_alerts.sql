-- =====================================================================
-- Fast verification loop over Telegram
--   * New verification request  -> message every admin who linked Telegram,
--     with a button to the admin verification page.
--   * Admin decision            -> message the provider (approved / needs
--     info / rejected + the admin's note).
-- Uses private.telegram_send() and private.settings('app_url') from the
-- Telegram migration. Never blocks the underlying insert/update.
-- =====================================================================

create or replace function public.notify_verification_submitted() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_url text := coalesce(private.setting('app_url'), '');
  v_name text;
  v_service text;
  v_area text;
  a record;
begin
  -- an admin verifying in person doesn't need to alert the admins
  if public.is_admin() then
    return new;
  end if;
  select p.display_name, s.name_ar, p.area || '، ' || p.city
    into v_name, v_service, v_area
  from public.providers p join public.services s on s.id = p.service_id
  where p.id = new.provider_id;

  for a in
    select nc.telegram_chat_id
    from public.users u join public.notification_channels nc on nc.user_id = u.id
    where u.role = 'admin' and u.is_active and nc.telegram_chat_id is not null
  loop
    perform private.telegram_send(
      a.telegram_chat_id,
      '🆕 طلب توثيق جديد' || chr(10) || chr(10) ||
      '👷 ' || coalesce(v_name, '—') || chr(10) ||
      '🔧 ' || coalesce(v_service, '—') || chr(10) ||
      '📍 ' || coalesce(v_area, '—') ||
      case when new.provider_note is not null then chr(10) || '💬 ' || left(new.provider_note, 200) else '' end,
      case when v_url <> '' then v_url || '/admin/verifications' end
    );
  end loop;
  return new;
exception when others then
  raise warning 'notify_verification_submitted failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists verification_requests_notify_admins on public.verification_requests;
create trigger verification_requests_notify_admins
  after insert on public.verification_requests
  for each row execute function public.notify_verification_submitted();

create or replace function public.notify_verification_decided() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_chat bigint;
  v_url text := coalesce(private.setting('app_url'), '');
  v_text text;
begin
  if new.status = old.status or new.status not in ('verified', 'needs_info', 'rejected') then
    return new;
  end if;
  select telegram_chat_id into v_chat from public.notification_channels where user_id = new.provider_id;
  if v_chat is null then
    return new;
  end if;

  v_text := case new.status
    when 'verified' then
      '🎉 مبروك! تم توثيق حسابك بـ«فني» ✅' || chr(10) || chr(10) ||
      'هسه افتح التطبيق وشغّل «متاح الآن» حتى تبدي توصلك الطلبات.'
    when 'needs_info' then
      'ℹ️ الإدارة تحتاج معلومات إضافية حتى نوثّق حسابك:' || chr(10) ||
      coalesce(new.admin_notes, '—') || chr(10) || chr(10) ||
      'افتح التطبيق ← ملفي ← التوثيق، وارفع المطلوب.'
    else
      '❌ ما انقبل طلب التوثيق.' || chr(10) ||
      'السبب: ' || coalesce(new.admin_notes, '—') || chr(10) || chr(10) ||
      'تگدر تقدّم مرة ثانية من التطبيق ← ملفي ← التوثيق.'
  end;

  perform private.telegram_send(v_chat, v_text,
    case when v_url <> '' then v_url || case when new.status = 'verified' then '/provider' else '/provider/profile' end end);
  return new;
exception when others then
  raise warning 'notify_verification_decided failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists verification_requests_notify_provider on public.verification_requests;
create trigger verification_requests_notify_provider
  after update of status on public.verification_requests
  for each row execute function public.notify_verification_decided();

revoke execute on function public.notify_verification_submitted(), public.notify_verification_decided()
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- In-person verification: the admin met the provider and checked the ID,
-- so no uploaded document is needed. Goes through review_verification()
-- so the provider still gets the Telegram message.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_verification(
  p_provider_id uuid, p_decision public.verification_status, p_notes text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.providers where id = p_provider_id) then
    raise exception 'not_found';
  end if;

  select id into v_id from public.verification_requests
  where provider_id = p_provider_id and status in ('pending', 'needs_info')
  order by created_at desc limit 1;

  if v_id is null then
    insert into public.verification_requests (provider_id, document_path, provider_note, status)
    values (p_provider_id, 'in-person', 'توثيق شخصي من الإدارة', 'pending')
    returning id into v_id;
  end if;

  perform public.review_verification(v_id, p_decision, p_notes);
end $$;

revoke execute on function public.admin_set_verification(uuid, public.verification_status, text) from public, anon, authenticated;
grant execute on function public.admin_set_verification(uuid, public.verification_status, text) to authenticated;
