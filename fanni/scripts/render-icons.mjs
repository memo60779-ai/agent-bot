// Builds the PWA / favicon icons from the brand mark (src/assets/fanni-mark*.svg):
// navy tile + mark. Small favicon uses the petals-only mark (details vanish at 16-32px).
// Usage: CHROMIUM_PATH=... node scripts/render-icons.mjs
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const NAVY = '#203048';
const inner = (file) => {
  const s = readFileSync(file, 'utf8').replace(/<\?xml[^>]*>\s*/, '');
  const vb = s.match(/viewBox="([^"]+)"/)[1];
  const body = s.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { vb, body };
};
const tile = (mark, { rounded = true, scale = 0.78 } = {}) => {
  const size = 512 * scale;
  const off = (512 - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${NAVY}"/>
<svg x="${off}" y="${off}" width="${size}" height="${size}" viewBox="${mark.vb}">${mark.body}</svg>
</svg>`;
};

const full = inner('src/assets/fanni-mark.svg');
const simple = inner('src/assets/fanni-mark-simple.svg');
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon.svg', tile(full));
writeFileSync('public/icons/icon-maskable.svg', tile(full, { rounded: false, scale: 0.62 }));
writeFileSync('public/icons/favicon.svg', tile(simple, { scale: 0.82 }));

const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
for (const [src, out, size] of [
  ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512], ['icon-maskable.svg', 'icon-512-maskable.png', 512],
]) {
  const svg = readFileSync(`public/icons/${src}`, 'utf8').replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: `public/icons/${out}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
// Android notification badge: white silhouette on transparent (the OS tints it).
{
  const size = 96;
  const body = simple.body
    .replace(/fill:\s*#(fff|f70)\b/gi, 'fill: #fff')
    .replace(/fill:\s*#203048/gi, 'fill: none');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${simple.vb}">${body}</svg>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: 'public/icons/badge-96.png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
console.log('icons rendered');
