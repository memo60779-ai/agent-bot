// Web Push sender for «فني».
//   POST {action:'init'}                -> returns the VAPID public key
//                                          (generates + stores the pair on first use)
//   POST {action:'send', ...} + header x-push-secret
//                                       -> called by the database (private.push_send)
// Deploy with JWT verification OFF: the database can't send a JWT; the shared
// secret (private.settings.push_secret) protects 'send', and 'init' is harmless.
// The VAPID private key stays in the database; it is never returned to callers.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface Config { public_key: string | null; private_key: string | null; secret: string | null; app_url: string | null }
interface Sub { endpoint: string; p256dh: string; auth: string }

async function config(): Promise<Config> {
  const { data, error } = await supabase.rpc('push_service_config');
  if (error) throw new Error(`config: ${error.message}`);
  let cfg = data as Config;
  if (!cfg.public_key || !cfg.private_key) {
    const keys = webpush.generateVAPIDKeys();
    const { error: e } = await supabase.rpc('push_service_init', { p_public: keys.publicKey, p_private: keys.privateKey });
    if (e) throw new Error(`init: ${e.message}`);
    cfg = (await supabase.rpc('push_service_config')).data as Config; // another call may have won the race
  }
  return cfg;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: true });

  let cfg: Config;
  try {
    cfg = await config();
  } catch (e) {
    console.error(e);
    return json({ error: 'config' }, 500);
  }

  const body = await req.json().catch(() => ({}));
  if (body.action !== 'send') return json({ public_key: cfg.public_key });

  if (!cfg.secret || req.headers.get('x-push-secret') !== cfg.secret) return json({ error: 'forbidden' }, 403);

  const subject = cfg.app_url?.startsWith('https://') ? cfg.app_url : 'mailto:support@fanni.app';
  webpush.setVapidDetails(subject, cfg.public_key!, cfg.private_key!);

  const payload = JSON.stringify({
    title: String(body.title ?? 'فني').slice(0, 120),
    body: String(body.body ?? '').slice(0, 300),
    url: typeof body.url === 'string' && body.url.startsWith('/') ? body.url : '/',
    tag: body.tag ?? undefined,
  });
  const subs: Sub[] = Array.isArray(body.subscriptions) ? body.subscriptions.slice(0, 20) : [];

  const gone: string[] = [];
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 6, urgency: 'high' },
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) gone.push(s.endpoint); // uninstalled / permission revoked
      else console.error('push failed', code, (e as Error).message);
    }
  }));

  if (gone.length) await supabase.from('push_subscriptions').delete().in('endpoint', gone);
  return json({ sent, gone: gone.length });
});
