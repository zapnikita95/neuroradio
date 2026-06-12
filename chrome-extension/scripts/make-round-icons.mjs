/** Round extension icons from website logo. Run: node chrome-extension/scripts/make-round-icons.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../');
const src = path.join(root, 'website/assets/logo-icon.png');
const outDir = path.join(root, 'chrome-extension/icons');

if (!fs.existsSync(src)) {
  console.error('Missing', src);
  process.exit(1);
}

const sizes = [16, 48, 128];

for (const size of sizes) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`,
  );
  const out = path.join(outDir, `icon-${size}.png`);
  await sharp(src)
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .png()
    .composite([{ input: mask, blend: 'dest-in' }])
    .toFile(out);
  console.log('wrote', out);
}
