// End-to-end smoke test of the three journeys on a phone-sized viewport.
// Needs: the app running (npm run dev) against a SEEDED Supabase project.
//   APP_URL=http://localhost:5173 node e2e/full-flow.mjs
// Optional: CHROMIUM_PATH=/path/to/chrome, SHOTS=./e2e/screenshots
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const SHOTS = process.env.SHOTS ?? 'e2e/screenshots';
const PASSWORD = 'Fanni@2026';
const run = Date.now().toString(36);
const uniq = String(Date.now()).slice(-7);
const CUST_PHONE = `0771${uniq}`;
const PROV_PHONE = `0773${uniq}`;
const toArabicDigits = (v) => v.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-IQ' };

// a tiny PNG used for photo / portfolio / ID uploads
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
writeFileSync(`${SHOTS}/upload.png`, png);

let step = 0;
async function shot(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/${String(++step).padStart(2, '0')}-${name}.png`, fullPage: false });
}
function ok(msg) { console.log(`  ✓ ${msg}`); }

async function newUser(opts = {}) {
  const ctx = await browser.newContext({ ...device, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  return page;
}

async function login(page, identifier) {
  await page.goto(`${APP}/login`);
  await page.locator('form input').nth(0).fill(identifier);
  await page.fill('input[type=password]', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

async function register(page, { role, name, phone }) {
  await page.goto(`${APP}/register${role === 'provider' ? '?role=provider' : ''}`);
  await page.locator('form input').nth(0).fill(name);
  await page.locator('form input').nth(1).fill(phone);
  await page.locator('form input').nth(2).fill(PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/register'));
}

try {
  // ------------------------------------------------------------ public
  console.log('Public browsing');
  const guest = await newUser();
  await guest.goto(APP);
  await guest.getByText('شنو تحتاج اليوم؟').waitFor();
  await guest.getByText('سباكة').first().waitFor();
  await shot(guest, 'home-guest');
  await guest.fill('input[placeholder^="دوّر"]', 'سبلت');
  await guest.getByRole('link', { name: 'تكييف وتبريد', exact: true }).waitFor();
  if (await guest.getByRole('link', { name: 'نجارة', exact: true }).count()) throw new Error('search did not filter');
  ok('home + search');
  await guest.goto(`${APP}/services/plumbing`);
  await guest.getByText('اطلب سباكة هسه').waitFor();
  await shot(guest, 'service-plumbing');
  await guest.locator('a[href^="/providers/"]').first().click();
  await guest.getByText('معرض الأعمال').waitFor();
  await guest.getByText('تقييمات الزبائن').waitFor();
  await shot(guest, 'provider-profile');
  ok('service page + provider profile');

  // ------------------------------------------------------------ customer request
  console.log('Customer journey');
  // GPS near the shrine; the customer pins the house in the wizard
  const cust = await newUser({ geolocation: { latitude: 32.6161234, longitude: 44.0249876 }, permissions: ['geolocation'] });
  // typed with Arabic digits + spaces, like many Iraqi keyboards do
  await register(cust, { role: 'customer', name: `سارة اختبار ${run}`, phone: toArabicDigits(`${CUST_PHONE.slice(0, 4)} ${CUST_PHONE.slice(4)}`) });
  ok('registered customer with phone number (Arabic digits)');
  await cust.goto(`${APP}/account`);
  await cust.getByRole('button', { name: /تسجيل خروج/ }).click();
  await login(cust, CUST_PHONE);
  ok('logged back in with phone number');
  await cust.goto(`${APP}/request/new?service=plumbing`);
  await cust.getByText('شنو نوع المشكلة؟').waitFor();
  await shot(cust, 'wizard-problem');
  await cust.getByRole('button', { name: 'تسريب مي' }).click();
  await cust.fill('textarea', 'اكو تسريب تحت المغسلة من يومين');
  await cust.setInputFiles('input[type=file]', `${SHOTS}/upload.png`);
  await shot(cust, 'wizard-description');
  await cust.getByRole('button', { name: 'التالي' }).click();
  await cust.locator('select').nth(2).selectOption('حي الحسين');
  await cust.getByRole('button', { name: /حدد البيت على الخريطة/ }).click();
  await cust.getByText('حرّك الخريطة لحد ما يصير الدبوس فوق بيتك بالضبط.').waitFor();
  await cust.locator('.leaflet-container').waitFor();
  await shot(cust, 'wizard-location-map');
  await cust.getByRole('button', { name: 'التالي' }).click();
  await cust.getByRole('button', { name: 'هسه (مستعجل)' }).click();
  await cust.getByRole('button', { name: 'التالي' }).click();
  await cust.getByText('راجع طلبك').waitFor();
  await cust.getByText('📍 محدد').waitFor();
  await shot(cust, 'wizard-review');
  await cust.getByRole('button', { name: 'أرسل الطلب' }).click();
  await cust.getByText('تم إرسال طلبك').waitFor();
  await cust.getByText('الفنيين المناسبين لطلبك').waitFor();
  await cust.getByRole('button', { name: 'طلب فني' }).first().waitFor();
  await shot(cust, 'matching');
  const requestUrl = cust.url().split('?')[0];
  ok('request created + matching list shown');

  // send to the test provider (حيدر كاظم) – he is in the same area so ranked first
  const haider = cust.locator('div.rounded-3xl', { hasText: 'حيدر كاظم للسباكة' }).last();
  await haider.getByRole('button', { name: 'طلب فني' }).click();
  await haider.getByText('بانتظار رد الفني').waitFor();
  ok('offer sent to provider@fanni.test');

  // ------------------------------------------------------------ provider accepts
  console.log('Provider journey (existing verified provider)');
  const prov = await newUser();
  await login(prov, 'provider@fanni.test');
  await prov.getByText('متاح الآن').first().waitFor();
  await shot(prov, 'provider-dashboard');
  // share card: story image + personal link that opens the public profile
  await prov.getByText('بطاقتك جاهزة').click();
  await prov.locator('img[alt="بطاقة الفني"]').waitFor({ timeout: 20000 });
  const cardLink = (await prov.locator('span[dir=ltr]').first().textContent()).trim();
  const story = await prov.locator('img[alt="بطاقة الفني"]').evaluate(async (img) => {
    const b = await (await fetch(img.src)).blob();
    const bmp = await createImageBitmap(b);
    const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(b); });
    return { w: bmp.width, h: bmp.height, data };
  });
  if (story.w !== 1080 || story.h !== 1920) throw new Error(`story size ${story.w}x${story.h}`);
  writeFileSync(`${SHOTS}/story-card.png`, Buffer.from(story.data, 'base64'));
  await shot(prov, 'provider-share-card');
  await guest.goto(`http://${cardLink}`.replace(/^http:\/\/[^/]+/, APP));
  await guest.getByText('حيدر كاظم للسباكة').first().waitFor();
  await guest.getByRole('link', { name: /طلب الخدمة من/ }).waitFor();
  ok(`share card 1080x1920 + link ${cardLink.replace(/^[^/]+/, '')} opens the profile`);
  await prov.goto(requestUrl);
  await prov.getByText('طلب جديد إلك').waitFor();
  await prov.getByText('الزبون حدد بيته على الخريطة، يظهرلك بعد ما تقبل').waitFor();
  if (await prov.getByText('موقع بيت الزبون').count()) throw new Error('exact location visible before accepting');
  await shot(prov, 'provider-offer');
  await prov.getByRole('button', { name: 'قبول الطلب' }).click();
  await prov.getByText(CUST_PHONE).waitFor();
  await prov.getByText('موقع بيت الزبون').waitFor();
  const dir = await prov.getByRole('link', { name: /الاتجاهات/ }).getAttribute('href');
  if (!dir?.includes('destination=32.616123,44.024988')) throw new Error(`bad directions link: ${dir}`);
  await prov.getByText('موقع بيت الزبون').scrollIntoViewIfNeeded();
  await shot(prov, 'provider-location');
  ok('accepted; customer phone + exact map pin revealed');
  await prov.getByRole('button', { name: /طالع بالطريق/ }).click();
  await prov.getByRole('button', { name: /وصلت وبديت الشغل/ }).click();
  await prov.getByRole('button', { name: /خلصت الشغل/ }).click();
  await prov.locator('span', { hasText: 'اكتمل' }).first().waitFor();
  await shot(prov, 'provider-completed');
  ok('ON_THE_WAY -> IN_PROGRESS -> COMPLETED');

  // ------------------------------------------------------------ customer rates + complains
  console.log('Customer rating + complaint');
  await cust.goto(requestUrl);
  await cust.getByText('شلون كان الفني؟').waitFor();
  await cust.getByText('07700000003').waitFor();
  await cust.getByRole('button', { name: '5 نجوم' }).first().click();
  await cust.fill('textarea', 'شغل نظيف وسريع، شكراً');
  await shot(cust, 'rate');
  await cust.getByRole('button', { name: 'أرسل التقييم' }).click();
  await cust.locator('span', { hasText: 'تم التقييم' }).first().waitFor();
  ok('rated -> RATED');
  await cust.getByRole('button', { name: /قدّم شكوى/ }).click();
  await cust.locator('input').last().fill('السعر');
  await cust.locator('textarea').last().fill(`اختبار شكوى ${run}`);
  await cust.getByRole('button', { name: 'إرسال الشكوى' }).click();
  await cust.locator('span', { hasText: 'مفتوحة' }).first().waitFor();
  await shot(cust, 'complaint');
  ok('complaint filed');

  // ------------------------------------------------------------ new provider onboarding
  console.log('New provider onboarding');
  const np = await newUser();
  await register(np, { role: 'provider', name: `كاظم اختبار ${run}`, phone: PROV_PHONE });
  await np.waitForURL(/provider\/onboarding/);
  await np.locator('select').nth(0).selectOption({ label: 'كهرباء' });
  await np.locator('input[type=number]').fill('7');
  await np.fill('textarea', 'كهربائي بيوت، تأسيس وصيانة وتركيب إنارة');
  await shot(np, 'onboarding-profile');
  await np.getByRole('button', { name: 'التالي' }).click();
  await np.getByText('صور من شغلك').waitFor();
  await np.setInputFiles('input[type=file][multiple]', `${SHOTS}/upload.png`);
  await np.locator('img[src*="/storage/v1/object/public/portfolio/"], img[src*="/portfolio/"]').first().waitFor();
  await np.getByRole('button', { name: 'التالي' }).click();
  await np.getByText('وثّق حسابك').waitFor();
  await np.setInputFiles('input[type=file]', `${SHOTS}/upload.png`);
  await np.getByRole('button', { name: 'أرسل طلب التوثيق' }).click();
  await np.waitForURL(/\/provider$/);
  await np.getByText('طلب التوثيق قيد المراجعة').waitFor();
  await shot(np, 'provider-pending');
  ok('profile + portfolio + verification submitted (pending)');

  // ------------------------------------------------------------ admin
  console.log('Admin');
  const admin = await newUser();
  await login(admin, 'admin@fanni.test');
  await admin.goto(`${APP}/admin`);
  await admin.getByText('فنيين موثقين').waitFor();
  await shot(admin, 'admin-overview');
  await admin.goto(`${APP}/admin/verifications`);
  const card = admin.locator('div.rounded-3xl', { hasText: `كاظم اختبار ${run}` }).last();
  await card.waitFor();
  await shot(admin, 'admin-verifications');
  // private document opens through a short-lived signed URL
  await card.getByRole('button', { name: /عرض المستند/ }).click();
  await card.locator('img[alt="مستند التوثيق"][src*="token="]').waitFor();
  await card.getByRole('button', { name: 'قبول' }).click();
  await card.waitFor({ state: 'detached' });
  ok('verification approved (doc viewed via signed URL)');
  await admin.goto(`${APP}/admin/complaints`);
  const comp = admin.locator('div.rounded-3xl', { hasText: `اختبار شكوى ${run}` }).last();
  await comp.locator('select').selectOption('resolved');
  await comp.locator('textarea').fill('تواصلنا ويا الفني وانحلت');
  await comp.getByRole('button', { name: 'حفظ' }).click();
  await admin.getByText(`اختبار شكوى ${run}`).waitFor({ state: 'detached' });
  ok('complaint resolved with notes');
  await admin.goto(`${APP}/admin/users`);
  await admin.getByText(`سارة اختبار ${run}`).waitFor();
  await shot(admin, 'admin-users');
  await admin.goto(`${APP}/admin/services`);
  await admin.getByText('تنظيف').waitFor();
  ok('users + services pages');

  // ------------------------------------------------------------ verified provider goes available
  await np.reload();
  await np.getByText('شغّلها حتى توصلك طلبات أكثر').waitFor(); // toggle unlocked after verification
  await np.getByRole('button', { name: /غير متاح/ }).click();
  await np.getByText('تطلع للزبائن بأول القائمة').waitFor();
  await shot(np, 'provider-available');
  ok('new provider verified -> Available Now');

  // customer sees the admin's reply
  await cust.goto(requestUrl);
  await cust.getByText('رد الإدارة: تواصلنا ويا الفني وانحلت').waitFor();
  ok('customer sees complaint resolution');

  // privacy: other customer cannot open this request
  const other = await newUser();
  await login(other, 'customer1@demo.fanni.test');
  await other.goto(requestUrl);
  await other.getByText('ما عندك صلاحية تشوفه').waitFor();
  ok('another customer cannot see the request');

  console.log('\nALL E2E FLOWS PASSED');
} catch (e) {
  console.error('\nE2E FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
