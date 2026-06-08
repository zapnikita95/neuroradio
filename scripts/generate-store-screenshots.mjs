/**
 * Маркетинговые скрины для Google Play и App Store.
 * node scripts/generate-store-screenshots.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DESKTOP = process.env.USERPROFILE
  ? path.join(process.env.USERPROFILE, 'OneDrive', 'Desktop')
  : path.join(process.env.HOME || '', 'Desktop');

const SLIDES = [
  {
    file: 'скрин1.jpg',
    play: {
      headline: 'Нейроведущий\nв вашем плеере',
      subtitle: 'Подключается к Яндекс Музыке, Spotify и другим — без смены приложения',
    },
    ios: {
      headline: 'Нейроведущий\nрядом с музыкой',
      subtitle: 'Apple Music, Spotify, Shazam — узнаёт трек и рассказывает историю',
    },
  },
  {
    file: 'скрин2.jpg',
    play: {
      headline: 'Живые истории\nо каждом треке',
      subtitle: 'Факты, контекст и эмоции — голосом, пока играет песня',
    },
    ios: {
      headline: 'Истории\nв эфире',
      subtitle: 'Короткий рассказ между треками — как умное радио',
    },
  },
  {
    file: 'скрин3.jpg',
    play: {
      headline: 'История рассказов\nи оценки',
      subtitle: 'Читайте прошлые эфиры и ставьте 👍 или 👎 — ведущий учится',
    },
    ios: {
      headline: 'Архив рассказов',
      subtitle: 'Все истории сохраняются — оценивайте, что зашло',
    },
  },
  {
    file: 'скрин3.1.jpg',
    play: {
      headline: 'Всё,\nчто вы слушали',
      subtitle: 'Трекинг прослушиваний — видно, где уже была история',
    },
    ios: {
      headline: 'Дневник\nпрослушиваний',
      subtitle: 'Каждый трек в истории — с отметкой «была история»',
    },
  },
  {
    file: 'скрин4.jpg',
    play: {
      headline: '6 амплуа\nрассказчика',
      subtitle: 'Радиоведущий, диджей, эксперт, фанат — стиль под настроение',
    },
    ios: {
      headline: 'Выберите амплуа',
      subtitle: 'От ночного диджея до фаната-коллекционера',
    },
  },
  {
    file: 'скрин5.jpg',
    play: {
      headline: 'Голос\nна ваш вкус',
      subtitle: 'Yandex SpeechKit — десятки голосов или авто по жанру',
    },
    ios: {
      headline: 'Свой голос\nведущего',
      subtitle: 'Мужские и женские голоса — или авто по эпохе трека',
    },
  },
];

const BG = '#08070f';
const ACCENT = '#7b2fff';
const PINK = '#ff5da2';
const TEXT = '#f3eefb';
const MUTED = '#a99fc4';

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function headlineSvg(lines, fontSize, width, yStart) {
  const lineHeight = Math.round(fontSize * 1.12);
  const tspans = lines
    .flatMap((line) => line.split('\n'))
    .map((line, i) =>
      `<tspan x="0" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const h = lines.flatMap((l) => l.split('\n')).length * lineHeight + 8;
  return {
    svg: Buffer.from(`<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hg" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${TEXT}"/>
          <stop offset="100%" stop-color="${PINK}"/>
        </linearGradient>
      </defs>
      <text x="0" y="${fontSize}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="700" font-size="${fontSize}" fill="url(#hg)">${tspans}</text>
    </svg>`),
    height: h,
  };
}

function subtitleSvg(text, fontSize, width) {
  const words = text.split(' ');
  const maxChars = width < 900 ? 28 : 36;
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
  const lineHeight = Math.round(fontSize * 1.35);
  const tspans = lines
    .map((line, i) =>
      `<tspan x="0" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const h = lines.length * lineHeight + 4;
  return {
    svg: Buffer.from(`<svg width="${width}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="${fontSize}" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-weight="500" font-size="${fontSize}" fill="${MUTED}">${tspans}</text>
    </svg>`),
    height: h,
  };
}

async function bgGradient(w, h) {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="r1" cx="20%" cy="15%" r="55%">
        <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="r2" cx="85%" cy="25%" r="45%">
        <stop offset="0%" stop-color="${PINK}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="${BG}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="${BG}"/>
    <rect width="100%" height="100%" fill="url(#r1)"/>
    <rect width="100%" height="100%" fill="url(#r2)"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function phoneFrame(screenshotPath, phoneW) {
  const meta = await sharp(screenshotPath).metadata();
  const phoneH = Math.round(phoneW * (meta.height / meta.width));
  const radius = Math.round(phoneW * 0.08);
  const border = Math.max(3, Math.round(phoneW * 0.012));

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
        <stop offset="0%" stop-color="#3d3555"/>
        <stop offset="100%" stop-color="#1a1528"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${frameW}" height="${frameH}" rx="${radius + border}" fill="url(#fg)"/>
  </svg>`;
  const frame = await sharp(Buffer.from(frameSvg)).png().toBuffer();

  return sharp(frame)
    .composite([{ input: rounded, left: border, top: border }])
    .png()
    .toBuffer();
}

async function composeSlide(screenshotPath, copy, spec) {
  const { w, h, padX, padTop, headlineSize, subtitleSize, phoneW } = spec;
  const textW = w - padX * 2;

  const bg = await bgGradient(w, h);
  const phone = await phoneFrame(screenshotPath, phoneW);
  const phoneMeta = await sharp(phone).metadata();

  const head = headlineSvg([copy.headline], headlineSize, textW);
  const headPng = await sharp(head.svg).png().toBuffer();
  const sub = subtitleSvg(copy.subtitle, subtitleSize, textW);
  const subPng = await sharp(sub.svg).png().toBuffer();

  const accentW = Math.round(textW * 0.18);
  const accentSvg = Buffer.from(
    `<svg width="${accentW}" height="6" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="3" fill="${PINK}"/>
    </svg>`,
  );
  const accent = await sharp(accentSvg).png().toBuffer();

  let y = padTop;
  const layers = [{ input: bg, left: 0, top: 0 }];

  layers.push({ input: headPng, left: padX, top: y });
  y += head.height + 14;
  layers.push({ input: accent, left: padX, top: y });
  y += 20;
  layers.push({ input: subPng, left: padX, top: y });

  const phoneTop = Math.max(y + sub.height + 36, h - phoneMeta.height - 48);
  const phoneLeft = Math.round((w - phoneMeta.width) / 2);
  layers.push({ input: phone, left: phoneLeft, top: phoneTop });

  return sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite(layers)
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

const PLAY_SPEC = {
  w: 1080,
  h: 1920,
  padX: 56,
  padTop: 72,
  headlineSize: 58,
  subtitleSize: 30,
  phoneW: 780,
};

const IOS_SPEC = {
  w: 1290,
  h: 2796,
  padX: 72,
  padTop: 96,
  headlineSize: 52,
  subtitleSize: 28,
  phoneW: 920,
};

async function main() {
  const playOut = path.join(ROOT, 'play-store', 'screenshots');
  const iosOut = path.join(ROOT, 'app-store', 'screenshots');
  fs.mkdirSync(playOut, { recursive: true });
  fs.mkdirSync(iosOut, { recursive: true });

  let n = 0;
  for (let i = 0; i < SLIDES.length; i++) {
    const slide = SLIDES[i];
    const src = path.join(DESKTOP, slide.file);
    if (!fs.existsSync(src)) {
      console.warn('Пропуск — нет файла:', src);
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

  if (n === 0) {
    console.error('Не найдено скринов на рабочем столе:', DESKTOP);
    process.exit(1);
  }
  console.log(`\nГотово: ${n} слайдов × 2 платформы`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
