-- إصلاح: زر "فعّل إشعارات تليكرام"
create or replace function public.telegram_link_start() returns text
language plpgsql security definer set search_path = public as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  if auth.uid() is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.notification_channels (user_id, link_token)
  values (auth.uid(), v_token)
  on conflict (user_id) do update set link_token = excluded.link_token;
  return v_token;
end $$;
