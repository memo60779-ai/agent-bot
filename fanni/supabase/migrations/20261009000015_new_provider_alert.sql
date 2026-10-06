-- =====================================================================
-- Alert the admins as soon as a provider creates their profile, not only
-- when they upload an ID. Many sign up and stop before the document step;
-- the founder can call them and verify in person.
-- Idempotent: safe to run more than once.
-- =====================================================================

create or replace function public.notify_new_provider() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  v_url text := coalesce(private.setting('app_url'), '');
  v_service text;
  v_phone text;
  a record;
begin
  if new.is_demo then
    return new;
  end if;
  select name_ar into v_service from public.services where id = new.service_id;
  select phone into v_phone from public.users where id = new.id;
  for a in
    select u.id, nc.telegram_chat_id
    from public.users u left join public.notification_channels nc on nc.user_id = u.id
    where u.role = 'admin' and u.is_active
  loop
    perform private.push_send(a.id, '👷 فني جديد سجّل',
      new.display_name || ' · ' || coalesce(v_service, '—') || ' · ' || new.area,
      '/admin/providers', 'new-provider-' || new.id);
    if a.telegram_chat_id is not null then
      perform private.telegram_send(a.telegram_chat_id,
        '👷 فني جديد سجّل' || chr(10) || chr(10) ||
        '🙍 ' || new.display_name || chr(10) ||
        '🔧 ' || coalesce(v_service, '—') || chr(10) ||
        '📍 ' || new.area || '، ' || new.city || chr(10) ||
        '📱 ' || coalesce(v_phone, '—') || chr(10) || chr(10) ||
        'بعده ما رفع الهوية. اتصل بيه، أو وثّقه شخصياً من «الفنيين».',
        case when v_url <> '' then v_url || '/admin/providers' end);
    end if;
  end loop;
  return new;
exception when others then
  raise warning 'notify_new_provider failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists providers_notify_new on public.providers;
create trigger providers_notify_new
  after insert on public.providers
  for each row execute function public.notify_new_provider();

revoke execute on function public.notify_new_provider() from public, anon, authenticated;
