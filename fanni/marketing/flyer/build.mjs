// A5 recruitment flyer for providers -> flyer.pdf (print) + flyer.png (300dpi preview)
import { readFileSync, writeFileSync } from 'node:fs';
import QRCode from 'qrcode';
import { chromium } from 'playwright';

const APP = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const URL = process.env.SIGNUP_URL || 'https://agent-bot-sepia.vercel.app/register?role=provider';
const SHOW_URL = process.env.SHOW_URL || URL.replace(/^https:\/\//, '');

const font = (w) => readFileSync(`node_modules/@fontsource/tajawal/files/tajawal-arabic-${w}-normal.woff2`).toString('base64');
const latin = (w) => readFileSync(`node_modules/@fontsource/tajawal/files/tajawal-latin-${w}-normal.woff2`).toString('base64');
const fontFaces = [400, 500, 700, 800, 900].map((w) => `
@font-face{font-family:T;font-weight:${w};src:url(data:font/woff2;base64,${font(w)}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E;}
@font-face{font-family:T;font-weight:${w};src:url(data:font/woff2;base64,${latin(w)}) format('woff2');}`).join('');

const mark = readFileSync(`${APP}/src/assets/fanni-mark.svg`, 'utf8').replace(/<\?xml[^>]*>/, '');
const markBody = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const markSvg = (size, extra = '') => `<svg viewBox="0 0 643.34 640.43" width="${size}" height="${size}" ${extra}>${markBody}</svg>`;

// lucide icon nodes
const icon = (name) => {
  const src = readFileSync(`${APP}/node_modules/lucide-react/dist/esm/icons/${name}.mjs`, 'utf8');
  return [...src.matchAll(/\[\s*"(\w+)",\s*\{([\s\S]*?)\}\s*\]/g)].map(([, tag, attrs]) =>
    `<${tag} ${[...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)].filter(([, k]) => k !== 'key').map(([, k, v]) => `${k}="${v}"`).join(' ')}/>`).join('');
};
const PETAL = 'M382.51,315.6h174.32c44.44,0,77.2-41.97,65.92-84.95-27.67-105.48-100.24-189.99-192.87-226.03-44.35-17.25-92.12,16.05-92.12,63.64v202.59c0,24.72,20.04,44.75,44.75,44.75Z';
const badge = (ic, color, size, iconColor = '#fff') => `<svg viewBox="336 0 290 317" width="${size}" height="${size * 317 / 290}">
  <path d="${PETAL}" fill="${color}"/>
  <svg x="377" y="76" width="180" height="180" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">${icon(ic)}</svg></svg>`;

const services = [
  ['droplets', 'سباكة', '#FF7700'], ['zap', 'كهرباء', '#FFFFFF'], ['snowflake', 'تبريد', '#FF7700'], ['washing-machine', 'أجهزة', '#FFFFFF'],
  ['hammer', 'نجارة', '#FF7700'], ['paint-roller', 'صبغ', '#FFFFFF'], ['door-closed', 'ألمنيوم', '#FF7700'], ['sparkles', 'تنظيف', '#FFFFFF'],
];

const qr = await QRCode.toString(URL, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#203048', light: '#ffffff' } });

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
${fontFaces}
@page{size:148mm 210mm;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:148mm;height:210mm;overflow:hidden}
body{font-family:T,sans-serif;background:#203048;color:#fff;overflow:hidden;position:relative;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.decowrap{position:absolute;inset:0;overflow:hidden;pointer-events:none}.deco{position:absolute;opacity:.03}
.page{position:relative;height:100%;padding:11mm 10mm 0;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:3mm}
.brand b{font-size:11mm;font-weight:900;line-height:1}
.pill{border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:1.4mm 3.6mm;font-size:3.4mm;font-weight:700;color:rgba(255,255,255,.85)}
h1{margin-top:9mm;font-size:17mm;font-weight:900;line-height:1.05;letter-spacing:-.3mm}
h2{font-size:12.5mm;font-weight:900;color:#FF7700;line-height:1.15;margin-top:1mm}
.lead{margin-top:4mm;font-size:4.3mm;line-height:1.55;color:rgba(255,255,255,.82);font-weight:500;max-width:118mm}
.svc{margin-top:6mm;display:grid;grid-template-columns:repeat(8,1fr);gap:1mm;text-align:center}
.svc span{display:block;font-size:2.7mm;font-weight:700;margin-top:1.2mm;color:rgba(255,255,255,.9)}
.svc svg{display:block;margin:0 auto}
.benefits{margin-top:6.5mm;display:grid;gap:3.4mm}
.b{display:flex;gap:3.2mm;align-items:center}
.b .n{flex:none;width:9mm;height:9mm;border-radius:3mm;background:#FF7700;color:#fff;font-weight:900;font-size:4.6mm;display:flex;align-items:center;justify-content:center}
.b strong{display:block;font-size:4.7mm;font-weight:800}
.b small{display:block;font-size:3.4mm;color:rgba(255,255,255,.72);font-weight:500;margin-top:.4mm}
.cta{margin-top:auto;margin-bottom:0;background:#fff;color:#203048;border-radius:7mm 7mm 0 0;padding:6mm 6mm 5mm;display:flex;gap:5mm;align-items:center}
.qr{flex:none;width:33mm;height:33mm;padding:2mm;border:1.2mm solid #FF7700;border-radius:4mm}
.qr svg{width:100%;height:100%;display:block}
.cta h3{font-size:6.6mm;font-weight:900;line-height:1.15}
.cta ol{list-style:none;margin-top:2.6mm;display:grid;gap:1.3mm}
.cta li{font-size:3.6mm;font-weight:700;display:flex;gap:2mm;align-items:center}
.cta li i{font-style:normal;flex:none;width:5mm;height:5mm;border-radius:99px;background:#203048;color:#fff;font-size:2.8mm;display:flex;align-items:center;justify-content:center}
.url{margin-top:2.6mm;font-size:3mm;font-weight:700;color:#FF7700;direction:ltr;text-align:right}
.foot{background:#FF7700;color:#fff;text-align:center;font-weight:800;font-size:4mm;padding:3mm 0 3.4mm;margin:0 -10mm}
</style></head><body>
<div class="decowrap">${markSvg('120mm', 'class="deco" style="left:-52mm;bottom:38mm;transform:rotate(-12deg)"')}</div>
<div class="page">
  <div class="top">
    <div class="brand">${markSvg('13mm')}<b>فني</b></div>
    <div class="pill">كربلاء</div>
  </div>

  <h1>إنت فني؟</h1>
  <h2>خلّي الشغل يجيك.</h2>
  <p class="lead">ناس من كربلاء يدوّرون على سبّاك، كهربائي، فني تبريد ونجار كل يوم. سجّل بـ<b style="color:#fff">فني</b> وطلباتهم توصل لموبايلك مباشرة.</p>

  <div class="svc">${services.map(([ic, label, c]) => `<div>${badge(ic, c, 44, c === '#FFFFFF' ? '#203048' : '#fff')}<span>${label}</span></div>`).join('')}</div>

  <div class="benefits">
    <div class="b"><div class="n">١</div><div><strong>طلبات من منطقتك</strong><small>نطلّعك للزبائن القريبين منك أول</small></div></div>
    <div class="b"><div class="n">٢</div><div><strong>إشعار فوري على موبايلك</strong><small>أول ما يوصلك طلب، تجيك رسالة</small></div></div>
    <div class="b"><div class="n">٣</div><div><strong>مجاني وبدون عمولة</strong><small>السعر بينك وبين الزبون، والفلوس بإيدك</small></div></div>
  </div>

  <div class="cta">
    <div class="qr">${qr}</div>
    <div>
      <h3>سجّل خلال دقيقة</h3>
      <ol>
        <li><i>١</i>صوّر الكود بكاميرة موبايلك</li>
        <li><i>٢</i>اكتب اسمك ورقمك</li>
        <li><i>٣</i>ضيف صور شغلك وانتظر التوثيق ✓</li>
      </ol>
      <div class="url">${SHOW_URL}</div>
    </div>
  </div>
  <div class="foot">التسجيل مجاني بالكامل • فنيين موثقين بكربلاء</div>
</div>
</body></html>`;
writeFileSync('flyer.html', html);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 559, height: 794 }, deviceScaleFactor: 3.13 });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: 'flyer.png' });
await page.pdf({ path: 'flyer.pdf', width: '148mm', height: '210mm', printBackground: true, pageRanges: '1' });
await browser.close();
console.log('ok', URL);
