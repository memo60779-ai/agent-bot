-- =====================================================================
-- فني: تفعيل إشعارات تليكرام
-- 1) بالسطر اللي تحت، بدّل  PASTE_BOT_TOKEN_HERE  بالتوكن اللي عطاك BotFather
-- 2) الصق الملف كامل بـ Supabase → SQL Editor واضغط Run
-- 3) بالنتيجة يطلعلك رابط (set_webhook_link): انسخه وافتحه بالمتصفح
-- =====================================================================
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
  v_token text := encode(gen_random_bytes(16), 'hex');
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

-- ---------- الإعدادات ----------
insert into private.settings (key, value) values
  ('telegram_bot_token', 'PASTE_BOT_TOKEN_HERE'),
  ('telegram_webhook_secret', encode(gen_random_bytes(24), 'hex')),
  ('app_url', 'https://agent-bot-sepia.vercel.app')
on conflict (key) do update set value = excluded.value
  where private.settings.key <> 'telegram_webhook_secret';

-- افتح هذا الرابط بالمتصفح مرة وحدة حتى يربط تليكرام بالسيرفر
select 'https://api.telegram.org/bot' || private.setting('telegram_bot_token')
    || '/setWebhook?url=https://taldbggqtkukiuzpjydg.supabase.co/functions/v1/telegram-webhook'
    || '&secret_token=' || private.setting('telegram_webhook_secret')
    || '&allowed_updates=["message"]' as set_webhook_link;
