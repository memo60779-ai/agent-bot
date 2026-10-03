// Receives Telegram bot updates and forwards them to the database.
// All logic (secret check, account linking, replies) lives in the SQL function
// public.telegram_handle_update(). Deploy with JWT verification OFF
// (Telegram can't send a Supabase JWT); the webhook secret protects it.
import { createClient } from 'npm:@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
const supabase = createClient(url, key, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok');
  const update = await req.json().catch(() => null);
  if (!update) return new Response('bad request', { status: 400 });

  const { data, error } = await supabase.rpc('telegram_handle_update', {
    p_secret: req.headers.get('x-telegram-bot-api-secret-token') ?? '',
    p_update: update,
  });
  if (error) {
    console.error(error.message);
    return new Response('forbidden', { status: 403 });
  }
  console.log('telegram update:', data);
  return new Response('ok');
});
