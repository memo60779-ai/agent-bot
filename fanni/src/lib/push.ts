import { supabase } from './supabase';

/**
 * Web Push on this device.
 *  - 'unsupported': old browser (or in-app browser like Instagram's)
 *  - 'needs-install': iPhone/iPad — Apple allows push only after "Add to Home Screen"
 *  - 'denied': the user blocked notifications in the browser settings
 *  - 'off' / 'on'
 */
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  // ready never resolves without a service worker (e.g. dev server) -> time out
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
}

async function currentSubscription() {
  // getRegistration() answers at once (undefined without a service worker)
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function getPushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'off';
  const sub = await currentSubscription();
  if (!sub) return 'off';
  const { data } = await supabase.rpc('push_status');
  return data ? 'on' : 'off';
}

let cachedKey: string | null = null;
async function publicKey(): Promise<string> {
  if (cachedKey) return cachedKey;
  const { data } = await supabase.rpc('push_public_key');
  if (data) return (cachedKey = data as string);
  // first use ever: the Edge Function creates the key pair
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: 'init' }),
  });
  const json = await res.json().catch(() => null);
  if (!json?.public_key) throw new Error('push_not_ready');
  return (cachedKey = json.public_key as string);
}

function base64UrlToBytes(s: string) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON();
  const { error } = await supabase.rpc('push_subscribe', {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  });
  if (error) throw error;
}

/** Asks for permission (must run from a tap) and registers this device. */
export async function enablePush(): Promise<PushState> {
  // only synchronous checks before requestPermission: Safari drops the tap
  // "user gesture" if we await anything first
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  if (!reg) throw new Error('push_not_ready');
  const key = base64UrlToBytes(await publicKey());
  let sub = await reg.pushManager.getSubscription();
  // a subscription made with another key can't receive our messages
  if (sub && sub.options.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey as ArrayBuffer);
    if (old.length !== key.length || old.some((b, i) => b !== key[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await save(sub);
  return 'on';
}

/** After sign-in: if this device already allowed notifications, link it to the new account. */
export async function syncPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await save(sub);
  } catch { /* best effort */ }
}

/** Before sign-out: stop sending this account's notifications to this device. */
export async function unlinkPush() {
  try {
    if (!supported() || Notification.permission !== 'granted') return;
    const sub = await currentSubscription();
    if (sub) await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint });
  } catch { /* best effort */ }
}
