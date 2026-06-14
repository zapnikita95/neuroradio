/**
 * Generate logo assets from source PNG.
 * Run: node scripts/process-logo.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const SOURCE = process.env.LOGO_SOURCE
  ?? path.join(process.env.USERPROFILE ?? '', 'Downloads', 'ChatGPT Image 7 июн. 2026 г., 10_58_40.png');

if (!fs.existsSync(SOURCE)) {
  console.error('Logo source not found:', SOURCE);
  process.exit(1);
}

const { width, height } = await sharp(SOURCE).metadata();
const size = width ?? 1254;

/** Symbol + ЭФИР AI — без нижнего слогана. */
const compactBottom = Math.round(size * 0.815);
/** Только знак с волнами (верхняя часть). */
const iconBottom = Math.round(size * 0.46);

async function cropExtract(name, top, bottom, outW, outPath) {
  const h = bottom - top;
  await sharp(SOURCE)
    .extract({ left: 0, top, width: size, height: h })
    .resize(outW, outW, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

async function resizeSquare(input, outW, outPath, bg = '#000000') {
  await sharp(input)
    .resize(outW, outW, { fit: 'contain', background: bg })
    .png()
    .toFile(outPath);
  console.log('wrote', outPath);
}

const webAssets = path.join(ROOT, 'website', 'assets');
const androidRes = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
fs.mkdirSync(webAssets, { recursive: true });

const tmpDir = path.join(ROOT, 'scripts', '.logo-tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const iconTmp = path.join(tmpDir, 'icon.png');
const compactTmp = path.join(tmpDir, 'compact.png');
const fullTmp = path.join(tmpDir, 'full.png');

await cropExtract('icon', 0, iconBottom, 1024, iconTmp);
await cropExtract('compact', 0, compactBottom, 1024, compactTmp);
await sharp(SOURCE).resize(1024, 1024, { fit: 'contain', background: '#000000' }).png().toFile(fullTmp);

// Website
await sharp(fullTmp).toFile(path.join(webAssets, 'logo-full.png'));
await sharp(compactTmp).toFile(path.join(webAssets, 'logo-compact.png'));
await sharp(iconTmp).toFile(path.join(webAssets, 'logo-icon.png'));

for (const [w, name] of [[512, 'icon-512.png'], [32, 'favicon-32.png'], [180, 'apple-touch-icon.png']]) {
  await resizeSquare(iconTmp, w, path.join(webAssets, name));
}

// Android mipmaps — foreground (icon on transparent for adaptive)
const densities = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

for (const [folder, px] of Object.entries(densities)) {
  const dir = path.join(androidRes, folder);
  fs.mkdirSync(dir, { recursive: true });
  await resizeSquare(iconTmp, px, path.join(dir, 'ic_launcher_foreground.png'), { r: 0, g: 0, b: 0, alpha: 0 });
  await resizeSquare(compactTmp, px, path.join(dir, 'ic_launcher.png'), '#000000');
  await resizeSquare(compactTmp, px, path.join(dir, 'ic_launcher_round.png'), '#000000');
}

// In-app logo drawable (compact wordmark)
const drawableDir = path.join(androidRes, 'drawable-nodpi');
fs.mkdirSync(drawableDir, { recursive: true });
await sharp(iconTmp).toFile(path.join(drawableDir, 'logo_efir_ai.png'));

console.log('done');
