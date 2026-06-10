#!/usr/bin/env node
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'website/assets/logo-icon.png');
const OUT = path.join(ROOT, 'ios/MusicStory/Assets.xcassets/AppIcon.appiconset');
const CONTENT_SCALE = 0.92;

const SIZES = {
  'AppIcon-40.png': 40,
  'AppIcon-60.png': 60,
  'AppIcon-58.png': 58,
  'AppIcon-87.png': 87,
  'AppIcon-80.png': 80,
  'AppIcon-120.png': 120,
  'AppIcon-180.png': 180,
  'AppIcon-ipad-20.png': 20,
  'AppIcon-ipad-29.png': 29,
  'AppIcon-ipad-40.png': 40,
  'AppIcon-ipad-76.png': 76,
  'AppIcon-ipad-152.png': 152,
  'AppIcon-ipad-167.png': 167,
  'AppIcon-1024.png': 1024,
};

async function renderIcon(size) {
  const logoMax = Math.max(1, Math.round(size * CONTENT_SCALE));
  const logo = await sharp(SOURCE)
    .resize(logoMax, logoMax, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function main() {
  for (const [name, size] of Object.entries(SIZES)) {
    const buf = await renderIcon(size);
    await sharp(buf).toFile(path.join(OUT, name));
    console.log(`ok ${name} (${size}px)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
