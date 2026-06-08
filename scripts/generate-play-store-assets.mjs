/**
 * Графика для Google Play Console из logo-icon.png
 * node scripts/generate-play-store-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ICON = path.join(ROOT, 'website', 'assets', 'logo-icon.png');
const OUT = path.join(ROOT, 'play-store', 'graphics');

if (!fs.existsSync(ICON)) {
  console.error('Нет logo-icon.png:', ICON);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

const BG = { r: 8, g: 7, b: 15 };
const LOGO_RADIUS = 30;

async function roundLogoPng(inputBuffer, size, radius = LOGO_RADIUS) {
  const resized = await sharp(inputBuffer)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="white"/>` +
    `</svg>`,
  );
  return sharp(resized)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function icon512() {
  const pad = 64;
  const inner = 512 - pad * 2;
  const icon = await roundLogoPng(await sharp(ICON).png().toBuffer(), inner);
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT, 'icon-512.png'));
  console.log('icon-512.png');
}

async function featureGraphic() {
  const w = 1024;
  const h = 500;
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#7b2fff;stop-opacity:0.35"/>
        <stop offset="50%" style="stop-color:#ff3d8b;stop-opacity:0.2"/>
        <stop offset="100%" style="stop-color:#08070f;stop-opacity:1"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="#08070f"/>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;
  const bg = await sharp(Buffer.from(svg)).png().toBuffer();
  const logo = await roundLogoPng(await sharp(ICON).png().toBuffer(), 220);
  const titleSvg = Buffer.from(`<svg width="700" height="120" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="52" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="48" fill="#f3eefb">Эфир</text>
    <text x="130" y="52" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="48" fill="#ff5da2">AI</text>
    <text x="0" y="100" font-family="Arial, Helvetica, sans-serif" font-weight="500" font-size="28" fill="#a99fc4">Нейро-радиоведущий о вашей музыке</text>
  </svg>`);
  const title = await sharp(titleSvg).png().toBuffer();
  await sharp(bg)
    .composite([
      { input: logo, left: 80, top: Math.round((h - 220) / 2) },
      { input: title, left: 340, top: Math.round((h - 120) / 2) },
    ])
    .png()
    .toFile(path.join(OUT, 'feature-graphic-1024x500.png'));
  console.log('feature-graphic-1024x500.png');
}

async function promoPhone() {
  const w = 1080;
  const h = 1920;
  const icon = await roundLogoPng(await sharp(ICON).png().toBuffer(), 360);
  await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: icon, gravity: 'centre' }])
    .png()
    .toFile(path.join(OUT, 'promo-phone-placeholder-1080x1920.png'));
  console.log('promo-phone-placeholder-1080x1920.png (замени реальными скринами)');
}

await icon512();
await featureGraphic();
await promoPhone();
console.log('Готово → play-store/graphics/');
