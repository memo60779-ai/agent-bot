// Push notifications check. Needs a PRODUCTION-LIKE build (the service worker
// only exists there) pointed at a seeded local Supabase:
//   npx vite build --mode staging --outDir /tmp/dist-test && npx vite preview --outDir /tmp/dist-test --port 4173
//   APP_URL=http://127.0.0.1:4173 node e2e/push-flow.mjs
// Headless Chromium has no push service, so PushManager.subscribe is stubbed;
// the real parts are: permission flow, saving the subscription, the service
// worker showing a delivered push (via DevTools), and unlinking on sign-out.
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const SHOTS = process.env.SHOTS ?? 'e2e/screenshots';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-IQ',
  permissions: ['notifications'],
});
await ctx.addInitScript(() => {
  // a "browser subscription" that survives page loads, like a real one
  const K = 'e2e-push-sub';
  const fake = ({ endpoint, key }) => ({
    endpoint,
    options: { applicationServerKey: new Uint8Array(key).buffer },
    toJSON() { return { keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } }; },
    unsubscribe: async () => { localStorage.removeItem(K); return true; },
  });
  PushManager.prototype.getSubscription = async function () {
    const v = localStorage.getItem(K);
    return v ? fake(JSON.parse(v)) : null;
  };
  PushManager.prototype.subscribe = async function (o) {
    const v = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + Math.random().toString(36).slice(2),
                key: [...new Uint8Array(o.applicationServerKey)] };
    localStorage.setItem(K, JSON.stringify(v));
    return fake(v);
  };
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
const ok = (m) => console.log(`  ✓ ${m}`);

try {
  await page.goto(`${APP}/login`);
  await page.locator('form input').nth(0).fill('provider@fanni.test');
  await page.fill('input[type=password]', 'Fanni@2026');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload(); // let the service worker control the page
  ok('service worker active');

  await page.getByText('خلّي الطلبات توصلك كإشعار').waitFor();
  await page.screenshot({ path: `${SHOTS}/push-card.png` });
  await page.getByRole('button', { name: /فعّل الإشعارات/ }).click();
  await page.getByText('الإشعارات شغّالة على هذا الموبايل').waitFor();
  await page.screenshot({ path: `${SHOTS}/push-on.png` });
  ok('permission granted + device registered');

  // deliver a push to the service worker and check it shows a notification
  const cdp = await ctx.newCDPSession(page);
  const regId = await new Promise((resolve) => {
    cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
      const r = registrations.find((x) => x.scopeURL.startsWith(APP));
      if (r) resolve(r.registrationId);
    });
    cdp.send('ServiceWorker.enable');
  });
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: new URL(APP).origin,
    registrationId: regId,
    data: JSON.stringify({ title: '🔔 طلب جديد إلك: سباكة', body: 'تسريب مي · حي الحسين', url: '/requests/x', tag: 'offer-x' }),
  });
  const shown = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    for (let i = 0; i < 20; i++) {
      const list = await reg.getNotifications();
      if (list.length) return list.map((n) => ({ title: n.title, body: n.body, url: n.data?.url, dir: n.dir }));
      await new Promise((r) => setTimeout(r, 200));
    }
    return [];
  });
  if (shown[0]?.title !== '🔔 طلب جديد إلك: سباكة' || shown[0]?.url !== '/requests/x') {
    throw new Error(`notification not shown: ${JSON.stringify(shown)}`);
  }
  ok(`service worker showed: ${shown[0].title} (${shown[0].dir})`);

  await page.goto(`${APP}/account`);
  await page.getByText('الإشعارات شغّالة على هذا الموبايل').waitFor();
  await page.getByRole('button', { name: /تسجيل خروج/ }).click();
  await page.waitForTimeout(1500);
  ok('signed out (device unlinked)');
  console.log('\nPUSH FLOW PASSED');
} catch (e) {
  console.error('\nPUSH FLOW FAILED:', e.message);
  await page.screenshot({ path: `${SHOTS}/push-failure.png` });
  process.exitCode = 1;
} finally {
  await browser.close();
}
