import QRCode from 'qrcode';
import markSvg from '../assets/fanni-mark.svg?raw';

/** Everything printed on a provider's story card. */
export interface CardInfo {
  name: string;
  service: string;
  area: string;
  avatarUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  years: number;
  jobs: number;
  link: string;
}

const W = 1080;
const H = 1920;
const NAVY = '#203048';
const NAVY_2 = '#2A3D5C';
const ORANGE = '#FF7700';
const FONT = 'Tajawal, sans-serif';

function loadImage(src: string, crossOrigin = false): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// The designer's SVG has only a viewBox; canvases need an intrinsic size.
function markImage() {
  const svg = markSvg.replace('<svg ', '<svg width="643" height="640" ');
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Largest font size (<= max) at which `text` fits in `width`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, max: number, width: number) {
  let size = max;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= width) break;
    size -= 4;
  } while (size > 28);
  return size;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, font: string, color: string) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

async function draw(info: CardInfo, withAvatar: boolean): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load(`800 84px ${FONT}`),
    document.fonts.load(`700 44px ${FONT}`),
    document.fonts.load(`500 36px ${FONT}`),
  ]).catch(() => null);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // background + oversized brand mark as texture
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, NAVY_2);
  bg.addColorStop(1, NAVY);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const mark = await markImage();
  if (mark) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.translate(W - 120, 420);
    ctx.rotate(-0.35);
    ctx.drawImage(mark, -450, -450, 900, 896);
    ctx.restore();
  }

  // logo row: [mark][فني] (mark on the right, RTL)
  ctx.font = `800 96px ${FONT}`;
  const wordW = ctx.measureText('فني').width;
  const markSize = 112;
  const rowW = markSize + 28 + wordW;
  const rowX = (W - rowW) / 2;
  if (mark) ctx.drawImage(mark, rowX + wordW + 28, 92, markSize, markSize * 0.995);
  ctx.textAlign = 'left';
  text(ctx, 'فني', rowX, 182, `800 96px ${FONT}`, '#fff');
  ctx.textAlign = 'center';
  text(ctx, 'فنيين موثّقين بكربلاء', W / 2, 290, `500 40px ${FONT}`, 'rgba(255,255,255,.7)');

  // avatar
  const cx = W / 2;
  const cy = 560;
  const r = 190;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 16, 0, Math.PI * 2);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const avatar = withAvatar && info.avatarUrl ? await loadImage(info.avatarUrl, true) : null;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    const s = Math.min(avatar.width, avatar.height);
    ctx.drawImage(avatar, (avatar.width - s) / 2, (avatar.height - s) / 2, s, s, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = NAVY_2;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.textBaseline = 'middle';
    text(ctx, info.name.trim()[0] ?? '؟', cx, cy + 10, `800 170px ${FONT}`, '#fff');
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  // verified pill
  ctx.font = `800 38px ${FONT}`;
  const pill = '✓ فني موثّق';
  const pw = ctx.measureText(pill).width + 64;
  roundRect(ctx, cx - pw / 2, 728, pw, 72, 36);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  text(ctx, pill, cx, 777, `800 38px ${FONT}`, '#fff');

  // name + service
  const nameSize = fitFont(ctx, info.name, 800, 84, 940);
  text(ctx, info.name, cx, 905, `800 ${nameSize}px ${FONT}`, '#fff');
  const sub = `${info.service} · ${info.area}`;
  const subSize = fitFont(ctx, sub, 700, 46, 940);
  text(ctx, sub, cx, 980, `700 ${subSize}px ${FONT}`, '#FFB470');

  // stats (right to left: rating, years, jobs)
  const stats: [string, string][] = [
    info.ratingCount ? [`★ ${info.ratingAvg.toFixed(1)}`, `${info.ratingCount} تقييم`] : ['جديد', 'على فني'],
    [String(info.years), 'سنة خبرة'],
    info.jobs > 0 ? [String(info.jobs), 'شغلة مكتملة'] : ['✓', 'موثّق بالهوية'],
  ];
  const colW = 300;
  stats.forEach(([v, l], i) => {
    const x = W / 2 + colW - i * colW;
    text(ctx, v, x, 1110, `800 64px ${FONT}`, '#fff');
    text(ctx, l, x, 1162, `500 34px ${FONT}`, 'rgba(255,255,255,.65)');
    if (i > 0) {
      ctx.fillStyle = 'rgba(255,255,255,.15)';
      ctx.fillRect(x + colW / 2 - 1, 1060, 2, 110);
    }
  });

  // QR card
  roundRect(ctx, 110, 1235, W - 220, 565, 56);
  ctx.fillStyle = '#fff';
  ctx.fill();
  const qr = document.createElement('canvas');
  await QRCode.toCanvas(qr, info.link, {
    width: 400, margin: 1, errorCorrectionLevel: 'M', color: { dark: NAVY, light: '#ffffff' },
  });
  ctx.drawImage(qr, cx - 200, 1270, 400, 400);
  text(ctx, 'امسح الكود واطلبني مباشرة', cx, 1725, `800 44px ${FONT}`, NAVY);
  ctx.direction = 'ltr';
  const linkText = info.link.replace(/^https?:\/\//, '');
  text(ctx, linkText, cx, 1773, `500 ${fitFont(ctx, linkText, 500, 32, 800)}px ${FONT}`, '#6B7280');
  ctx.direction = 'rtl';

  text(ctx, 'لأن بيتك أمانة 🤍', cx, 1872, `700 40px ${FONT}`, 'rgba(255,255,255,.8)');
  return c;
}

function toBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png');
    } catch (e) {
      reject(e); // tainted canvas (avatar served without CORS)
    }
  });
}

/** 1080×1920 PNG for WhatsApp/Instagram stories. */
export async function renderStoryCard(info: CardInfo): Promise<Blob> {
  try {
    return await toBlob(await draw(info, true));
  } catch {
    return toBlob(await draw(info, false));
  }
}
