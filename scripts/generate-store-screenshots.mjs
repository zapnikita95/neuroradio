/**
 * Маркетинговые скрины для Google Play и App Store.
 * node scripts/generate-store-screenshots.mjs
 * node scripts/generate-store-screenshots.mjs --from-play   # пересборка из *-play.jpg
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FROM_PLAY = process.argv.includes('--from-play');

const DESKTOP = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop')
  : path.join(process.env.HOME || '', 'Desktop');

const SLIDES = [
  {
    file: 'скрин1.jpg',
    play: {
      headline: 'Нейроведущий',
      headlineAccent: 'в вашем плеере',
      subtitle: 'Яндекс Музыка, Spotify — без смены приложения',
    },
    ios: {
      headline: 'Нейроведущий',
      headlineAccent: 'рядом с музыкой',
      subtitle: 'Apple Music, Spotify — история под трек',
    },
  },
  {
    file: 'скрин2.jpg',
    play: {
      headline: 'Живые истории',
      headlineAccent: 'о каждом треке',
      subtitle: 'Факты и эмоции — голосом, пока играет песня',
    },
    ios: {
      headline: 'Истории',
      headlineAccent: 'в эфире',
      subtitle: 'Короткий рассказ между треками',
    },
  },
  {
    file: 'скрин3.jpg',
    play: {
      headline: 'Архив',
      headlineAccent: 'рассказов',
      subtitle: 'Читайте прошлые эфиры и ставьте 👍 или 👎',
    },
    ios: {
      headline: 'Архив',
      headlineAccent: 'рассказов',
      subtitle: 'Все истории сохраняются',
    },
  },
  {
    file: 'скрин3.1.jpg',
    play: {
      headline: 'Всё,',
      headlineAccent: 'что слушали',
      subtitle: 'Дневник прослушиваний — видно, где была история',
    },
    ios: {
      headline: 'Дневник',
      headlineAccent: 'прослушиваний',
      subtitle: 'Каждый трек с отметкой «была история»',
    },
  },
  {
    file: 'скрин4.jpg',
    play: {
      headline: '6 амплуа',
      headlineAccent: 'рассказчика',
      subtitle: 'Радиоведущий, диджей, эксперт, фанат — под настроение',
    },
    ios: {
      headline: '6 амплуа',
      headlineAccent: 'рассказчика',
      subtitle: 'От ночного диджея до фаната',
    },
  },
  {
    file: 'скрин5.jpg',
    play: {
      headline: 'Голос',
      headlineAccent: 'на ваш вкус',
      subtitle: 'Десятки голосов или авто по жанру и эпохе',
    },
    ios: {
      headline: 'Свой голос',
      headlineAccent: 'ведущего',
      subtitle: 'Мужские и женские — или авто',
    },
  },
];

const BG = '#06050c';
const ACCENT = '#8b3dff';
const PINK = '#ff4d9a';
const TEXT = '#ffffff';
const MUTED = '#c8bddf';

/** Вырезает экран телефона из уже собранного *-play.jpg (нижняя часть кадра). */
async function extractScreenFromPlayComposite(compositePath) {
  const meta = await sharp(compositePath).metadata();
  const w = meta.width ?? 1080;
  const h = meta.height ?? 1920;
  const cropW = Math.round(w * 0.72);
  const cropH = Math.round(h * 0.78);
  const left = Math.round((w - cropW) / 2);
  const top = h - cropH - Math.round(h * 0.02);
  return sharp(compositePath)
    .extract({ left, top, width: cropW, height: cropH })
    .png()
    .toBuffer();
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function centeredHeadlineSvg(copy, fontSize, width) {
  const lineHeight = Math.round(fontSize * 1.08);
  const lines = [
    { text: copy.headline, fill: TEXT },
    { text: copy.headlineAccent, fill: 'url(#hg)' },
  ].filter((l) => l.text?.trim());

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
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000" flood-opacity="0.45"/>
        </filter>
      </defs>
      <text x="50%" y="0" font-family="Segoe UI, Arial Black, Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}" fill="${TEXT}" filter="url(#shadow)">${tspans}</text>
    </svg>`),
    height: h,
  };
}

function centeredSubtitleSvg(text, fontSize, width) {
  const words = text.split(' ');
  const maxChars = width < 900 ? 22 : 28;
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
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
      <text x="50%" y="0" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="600" font-size="${fontSize}" fill="${MUTED}">${tspans}</text>
    </svg>`),
    height: h,
  };
}

async function bgGradient(w, h) {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
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

async function phoneFrame(screenshotPath, phoneW, maxPhoneH) {
  const meta = await sharp(screenshotPath).metadata();
  let phoneH = Math.round(phoneW * ((meta.height ?? 1) / (meta.width ?? 1)));
  if (maxPhoneH && phoneH > maxPhoneH) {
    phoneH = maxPhoneH;
    phoneW = Math.round(phoneH * ((meta.width ?? 1) / (meta.height ?? 1)));
  }
  const radius = Math.round(phoneW * 0.085);
  const border = Math.max(4, Math.round(phoneW * 0.014));

  const screen = await sharp(screenshotPath)
    .resize(phoneW, phoneH, { fit: 'cover' })
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${phoneW}" height="${phoneH}"><rect x="0" y="0" width="${phoneW}" height="${phoneH}" rx="${radius}" ry="${radius}" fill="white"/></svg>`,
  );
  const rounded = await sharp(screen)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: 'dest-in' }])
    .png()
    .toBuffer();

  const frameW = phoneW + border * 2;
  const frameH = phoneH + border * 2;
  const frameSvg = `<svg width="${frameW}" height="${frameH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#4a4068"/>
        <stop offset="100%" stop-color="#151020"/>
      </linearGradient>
      <filter id="ps" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${frameW}" height="${frameH}" rx="${radius + border}" fill="url(#fg)" filter="url(#ps)"/>
  </svg>`;
  const frame = await sharp(Buffer.from(frameSvg)).png().toBuffer();

  return sharp(frame)
    .composite([{ input: rounded, left: border, top: border }])
    .png()
    .toBuffer();
}

async function composeSlide(screenshotPath, copy, spec) {
  const { w, h, padX, textZoneH, headlineSize, subtitleSize, phoneW, phoneTop } = spec;
  const textW = w - padX * 2;

  const bg = await bgGradient(w, h);
  const phone = await phoneFrame(screenshotPath, phoneW, h - phoneTop - 52);
  const phoneMeta = await sharp(phone).metadata();

  const head = centeredHeadlineSvg(copy, headlineSize, textW);
  const headPng = await sharp(head.svg).png().toBuffer();
  const sub = centeredSubtitleSvg(copy.subtitle, subtitleSize, textW);
  const subPng = await sharp(sub.svg).png().toBuffer();

  const blockH = head.height + 24 + sub.height;
  const textStartY = Math.round((textZoneH - blockH) / 2);

  const layers = [{ input: bg, left: 0, top: 0 }];
  layers.push({ input: headPng, left: padX, top: textStartY });
  layers.push({ input: subPng, left: padX, top: textStartY + head.height + 24 });

  const phoneLeft = Math.round((w - (phoneMeta.width ?? phoneW)) / 2);
  layers.push({ input: phone, left: phoneLeft, top: phoneTop });

  return sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite(layers)
    .jpeg({ quality: 93, mozjpeg: true })
    .toBuffer();
}

const PLAY_SPEC = {
  w: 1080,
  h: 1920,
  padX: 40,
  textZoneH: 500,
  headlineSize: 100,
  subtitleSize: 40,
  phoneW: 680,
  phoneTop: 548,
};

const IOS_SPEC = {
  w: 1290,
  h: 2796,
  padX: 48,
  textZoneH: 680,
  headlineSize: 96,
  subtitleSize: 40,
  phoneW: 820,
  phoneTop: 820,
};

async function resolveSource(slide, index, playOut) {
  const desktop = path.join(DESKTOP, slide.file);
  if (fs.existsSync(desktop)) return desktop;

  if (FROM_PLAY) {
    const num = String(index + 1).padStart(2, '0');
    const playPath = path.join(
      playOut,
      `${num}-${slide.file.replace(/\.jpg$/i, '')}-play.jpg`,
    );
    if (fs.existsSync(playPath)) {
      const tmp = path.join(playOut, `.raw-${num}.png`);
      const buf = await extractScreenFromPlayComposite(playPath);
      fs.writeFileSync(tmp, buf);
      return tmp;
    }
  }

  return null;
}

async function main() {
  const playOut = path.join(ROOT, 'play-store', 'screenshots');
  const iosOut = path.join(ROOT, 'app-store', 'screenshots');
  fs.mkdirSync(playOut, { recursive: true });
  fs.mkdirSync(iosOut, { recursive: true });

  let n = 0;
  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    const src = await resolveSource(slide, i, playOut);
    if (!src) {
      console.warn('Пропуск — нет файла:', slide.file);
      continue;
    }
    n++;
    const num = String(i + 1).padStart(2, '0');

    const playBuf = await composeSlide(src, slide.play, PLAY_SPEC);
    const playPath = path.join(playOut, `${num}-${slide.file.replace(/\.jpg$/i, '')}-play.jpg`);
    fs.writeFileSync(playPath, playBuf);
    console.log('Play →', path.relative(ROOT, playPath));

    const iosBuf = await composeSlide(src, slide.ios, IOS_SPEC);
    const iosPath = path.join(iosOut, `${num}-${slide.file.replace(/\.jpg$/i, '')}-ios.jpg`);
    fs.writeFileSync(iosPath, iosBuf);
    console.log('iOS  →', path.relative(ROOT, iosPath));
  }

  for (const f of fs.readdirSync(playOut)) {
    if (f.startsWith('.raw-')) fs.unlinkSync(path.join(playOut, f));
  }

  if (n === 0) {
    console.error('Нет исходников. Положи скрин1.jpg… на рабочий стол или запусти с --from-play');
    process.exit(1);
  }
  console.log(`\nГотово: ${n} слайдов × 2 платформы (phoneTop фиксирован — без скачков)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
