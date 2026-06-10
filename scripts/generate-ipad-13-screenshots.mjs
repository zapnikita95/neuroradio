/**
 * App Store: iPad Pro 13-inch (2064×2752).
 * node scripts/generate-ipad-13-screenshots.mjs
 * node scripts/generate-ipad-13-screenshots.mjs --src /path/to/raw.png
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'app-store', 'screenshots-ipad-13');

const W = 2064;
const H = 2752;

const BG = '#06050c';
const ACCENT = '#8b3dff';
const PINK = '#ff4d9a';
const TEXT = '#ffffff';
const MUTED = '#c8bddf';

const SLIDES = [
  {
    file: 'скрин1.jpg',
    headline: 'Нейроведущий',
    headlineAccent: 'на iPad',
    subtitle: 'Apple Music, Spotify — история под трек',
  },
  {
    file: 'скрин2.jpg',
    headline: 'Истории',
    headlineAccent: 'в эфире',
    subtitle: 'Короткий рассказ между треками',
  },
  {
    file: 'скрин3.jpg',
    headline: 'Оценка',
    headlineAccent: 'факта',
    subtitle: '👍 или 👎 после прослушивания',
  },
];

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function headlineSvg(copy, fontSize, width) {
  const lineHeight = Math.round(fontSize * 1.08);
  const lines = [
    { text: copy.headline, fill: TEXT },
    { text: copy.headlineAccent, fill: 'url(#hg)' },
  ];
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? fontSize : lineHeight;
      return `<tspan x="50%" dy="${dy}" text-anchor="middle" fill="${line.fill}">${escapeXml(line.text)}</tspan>`;
    })
    .join('');
  const h = lines.length * lineHeight + 16;
  return {
    svg: Buffer.from(`<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${PINK}"/>
          <stop offset="100%" stop-color="${ACCENT}"/>
        </linearGradient>
      </defs>
      <text x="50%" y="0" font-family="Helvetica Neue, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="${TEXT}">${tspans}</text>
    </svg>`),
    height: h,
  };
}

function subtitleSvg(text, fontSize, width) {
  const words = text.split(' ');
  const maxChars = 32;
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  const lineHeight = Math.round(fontSize * 1.32);
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? fontSize : lineHeight;
      return `<tspan x="50%" dy="${dy}" text-anchor="middle">${escapeXml(line)}</tspan>`;
    })
    .join('');
  const h = lines.length * lineHeight + 8;
  return {
    svg: Buffer.from(`<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <text x="50%" y="0" font-family="Helvetica Neue, Arial, sans-serif" font-weight="600" font-size="${fontSize}" fill="${MUTED}">${tspans}</text>
    </svg>`),
    height: h,
  };
}

async function bgGradient() {
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="r1" cx="50%" cy="88%" r="65%">
        <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.42"/>
        <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="r2" cx="15%" cy="8%" r="50%">
        <stop offset="0%" stop-color="${PINK}" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${BG}"/>
    <rect width="100%" height="100%" fill="url(#r2)"/>
    <rect width="100%" height="100%" fill="url(#r1)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function deviceFrame(screenshotPath, frameW, maxH) {
  const meta = await sharp(screenshotPath).metadata();
  let h = Math.round(frameW * ((meta.height ?? 1) / (meta.width ?? 1)));
  let w = frameW;
  if (maxH && h > maxH) {
    h = maxH;
    w = Math.round(h * ((meta.width ?? 1) / (meta.height ?? 1)));
  }
  const radius = Math.round(w * 0.04);
  const border = Math.max(5, Math.round(w * 0.012));
  const screen = await sharp(screenshotPath).resize(w, h, { fit: 'cover' }).png().toBuffer();
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" fill="white"/></svg>`,
  );
  const rounded = await sharp(screen)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
  const frameSvg = `<svg width="${w + border * 2}" height="${h + border * 2}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w + border * 2}" height="${h + border * 2}" rx="${radius + border}" fill="#151020"/>
  </svg>`;
  const frame = await sharp(Buffer.from(frameSvg)).png().toBuffer();
  return sharp(frame).composite([{ input: rounded, left: border, top: border }]).png().toBuffer();
}

async function compose(slide, src) {
  const padX = 72;
  const textZoneH = 560;
  const deviceTop = 640;
  const deviceW = 1180;
  const textW = W - padX * 2;

  const bg = await bgGradient();
  const device = await deviceFrame(src, deviceW, H - deviceTop - 80);
  const dm = await sharp(device).metadata();

  const head = headlineSvg(slide, 108, textW);
  const headPng = await sharp(head.svg).png().toBuffer();
  const sub = subtitleSvg(slide.subtitle, 44, textW);
  const subPng = await sharp(sub.svg).png().toBuffer();
  const blockH = head.height + 28 + sub.height;
  const textY = Math.round((textZoneH - blockH) / 2);

  return sharp({ create: { width: W, height: H, channels: 4, background: BG } })
    .composite([
      { input: bg, left: 0, top: 0 },
      { input: headPng, left: padX, top: textY },
      { input: subPng, left: padX, top: textY + head.height + 28 },
      { input: device, left: Math.round((W - (dm.width ?? deviceW)) / 2), top: deviceTop },
    ])
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
}

function findSource(slide, explicit) {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const desktop = path.join(process.env.HOME || '', 'Desktop', slide.file);
  if (fs.existsSync(desktop)) return desktop;
  const iphoneDir = path.join(ROOT, 'app-store', 'screenshots');
  if (fs.existsSync(iphoneDir)) {
    const base = slide.file.replace(/\.jpg$/i, '');
    const hit = fs.readdirSync(iphoneDir).find((f) => f.includes(base) && f.endsWith('.jpg'));
    if (hit) return path.join(iphoneDir, hit);
  }
  const assets = path.join(ROOT, '..', '..', '.cursor', 'projects', 'Users-nikitazaporohzets-Desktop-movie-planner-bot', 'assets');
  if (fs.existsSync(assets)) {
    const png = fs.readdirSync(assets).find((f) => f.endsWith('.png'));
    if (png) return path.join(assets, png);
  }
  return null;
}

async function main() {
  const srcArg = process.argv.find((a) => a.startsWith('--src='))?.split('=')[1]
    ?? (process.argv.includes('--src') ? process.argv[process.argv.indexOf('--src') + 1] : null);

  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    const src = findSource(slide, i === 0 ? srcArg : null);
    if (!src) {
      console.warn('Пропуск — нет исходника для', slide.file);
      continue;
    }
    const buf = await compose(slide, src);
    const outPath = path.join(OUT, `${String(i + 1).padStart(2, '0')}-ipad-13.jpg`);
    fs.writeFileSync(outPath, buf);
    const meta = await sharp(outPath).metadata();
    console.log('→', outPath, `${meta.width}×${meta.height}`);
    n++;
  }
  if (n === 0) {
    console.error('Нет исходников. Положи скрин1.jpg на Desktop или: --src /path/to/app.png');
    process.exit(1);
  }
  console.log(`\nГотово: ${n} файлов в app-store/screenshots-ipad-13/ (${W}×${H})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
