// Generates the app icon SVG and the demo portfolio placeholders (public/demo/portfolio).
// Usage: node scripts/gen-assets.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

function iconNode(name) {
  const src = readFileSync(`node_modules/lucide-react/dist/esm/icons/${name}.mjs`, 'utf8');
  const nodes = [...src.matchAll(/\[\s*"(\w+)",\s*\{([\s\S]*?)\}\s*\]/g)].map(([, tag, attrs]) => {
    const a = [...attrs.matchAll(/(\w+):\s*"([^"]*)"/g)].filter(([, k]) => k !== 'key')
      .map(([, k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${a}/>`;
  });
  return nodes.join('');
}

const SERVICES = {
  plumbing: 'droplets', electrical: 'zap', ac: 'snowflake', appliances: 'washing-machine',
  carpentry: 'hammer', painting: 'paint-roller', aluminum: 'door-closed', cleaning: 'sparkles',
};
const BG = [['#203048', '#34507a'], ['#2a3d5c', '#FF7700'], ['#18243A', '#4b6a96']];
const CAPTIONS = ['شغل بأحد البيوت', 'قبل وبعد التصليح', 'تأسيس جديد'];

mkdirSync('public/demo/portfolio', { recursive: true });
for (const [slug, icon] of Object.entries(SERVICES)) {
  const paths = iconNode(icon);
  BG.forEach(([c1, c2], i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
<rect width="600" height="600" fill="url(#g)"/>
<g opacity=".08" fill="none" stroke="#fff" stroke-width="2">${[...Array(6)].map((_, k) => `<circle cx="${100 + k * 90}" cy="${120 + (k % 3) * 160}" r="${40 + k * 12}"/>`).join('')}</g>
<g transform="translate(180 150) scale(10)" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
<rect x="150" y="470" width="300" height="56" rx="28" fill="#000" fill-opacity=".25"/>
<text x="300" y="507" text-anchor="middle" font-family="Tahoma, Arial, sans-serif" font-size="26" fill="#fff" direction="rtl">صورة تجريبية · ${CAPTIONS[i]}</text>
</svg>`;
    writeFileSync(`public/demo/portfolio/${slug}-${i + 1}.svg`, svg);
  });
}

console.log('assets generated (app icons: scripts/render-icons.mjs)');
