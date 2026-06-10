/**
 * Build popular-tracks-catalog.json (~1500–2500 tracks, RU + global).
 * Run: npm run build && node scripts/build-popular-tracks-catalog.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'MusicStoryBFF/1.0 (popular-tracks catalog)';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/popular-tracks-catalog.json');
const KNOWN_ARTISTS = join(dirname(fileURLToPath(import.meta.url)), '../src/data/known-artists.json');
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

const RU_SEED_TRACKS = [
  ['Кино', 'Группа крови'], ['Кино', 'Звезда по имени Солнце'], ['Кино', 'Пачка сигарет'],
  ['Виктор Цой', 'Кукушка'], ['Любэ', 'Конь'], ['Любэ', 'Ты неси меня, река'],
  ['Би-2', 'Полковнику никто не пишет'], ['Би-2', 'Мой рок-н-ролл'], ['Земфира', 'Искала'],
  ['Земфира', 'Хочешь?'], ['Сплин', 'Выхода нет'], ['ДДТ', 'Что такое осень'],
  ['Машина времени', 'Поворот'], ['Аквариум', 'Город золотой'], ['Алиса', 'Небо слайд'],
  ['Oxxxymiron', 'Город под подошвой'], ['Oxxxymiron', 'Кент Калли'], ['Баста', 'Моя игра'],
  ['Моргенштерн', 'Cadillac'], ['Miyagi & Andy Panda', 'Kosandra'], ['Скриптонит', 'Витамин'],
  ['Элджей', 'Розовое вино'], ['Макс Корж', 'Малый повзрослел'], ['Noize MC', 'Вселенная бесконечна'],
  ['Каста', 'Мы берём это на улицу'], ['Гуф', 'Батарейка'], ['ЛСП', 'Номера'],
  ['Feduk', 'Розовый Mercedеs'], ['Pharaoh', 'Black Siemens'], ['Хаски', 'Поезда'],
  ['IC3PEAK', 'Смерти больше нет'], ['Король и Шут', 'Лесник'], ['Пикник', 'Египтянин'],
  ['Ария', 'Штиль'], ['Кипелов', 'Я свободен'], ['t.A.T.u.', 'Нас не догонят'],
  ['ВИА Гра', 'Попытка номер 5'], ['Мот', 'Капкан'], ['Jony', 'Комета'],
  ['Монеточка', 'Каждый раз'], ['Зиверт', 'Life'], ['Artik & Asti', 'Грустный дэнс'],
  ['Rammstein', 'Du Hast'], ['Queen', 'Bohemian Rhapsody'], ['Nirvana', 'Smells Like Teen Spirit'],
  ['The Beatles', 'Yesterday'], ['Michael Jackson', 'Billie Jean'], ['Eminem', 'Lose Yourself'],
  ['Drake', 'God\'s Plan'], ['Taylor Swift', 'Shake It Off'], ['Beyoncé', 'Halo'],
  ['Ed Sheeran', 'Shape of You'], ['The Weeknd', 'Blinding Lights'], ['Billie Eilish', 'bad guy'],
];

const RU_WIKI_CATEGORIES = [
  'Категория:Российские_хип-хоп-исполнители',
  'Категория:Российские_рок-группы',
  'Категория:Российские_певцы',
  'Категория:Российские_певицы',
  'Категория:Рэперы_России',
];

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchRuCategoryArtists(category) {
  const artists = [];
  let cmcontinue;
  do {
    const url =
      `https://ru.wikipedia.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent(category)}&cmlimit=200&format=json&origin=*` +
      (cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : '');
    const data = await fetchJson(url);
    if (!data) break;
    for (const m of data.query?.categorymembers ?? []) {
      const title = m.title?.trim();
      if (title && title.length >= 2 && title.length <= 60) artists.push(title);
    }
    cmcontinue = data.continue?.cmcontinue;
    if (artists.length >= 200) break;
  } while (cmcontinue);
  return artists;
}

async function fetchLastFmTopRussia(limit = 200) {
  if (!LASTFM_KEY) return [];
  const data = await fetchJson(
    `https://ws.audioscrobbler.com/2.0/?method=geo.gettoptracks&country=Russia&limit=${limit}&api_key=${LASTFM_KEY}&format=json`,
  );
  return (data?.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: 'lastfm-ru-chart',
  })).filter((t) => t.artist && t.title);
}

async function fetchMusicBrainzTopRecordings(artist, limit = 3) {
  const search = await fetchJson(
    `https://musicbrainz.org/ws/2/recording?query=artist:"${encodeURIComponent(artist)}"&fmt=json&limit=${limit}`,
  );
  return (search?.recordings ?? []).map((r) => ({
    artist,
    title: r.title ?? '',
    source: 'musicbrainz',
  })).filter((t) => t.title.length >= 2);
}

async function main() {
  const catalog = new Map();

  for (const [artist, title] of RU_SEED_TRACKS) {
    catalog.set(trackKey(artist, title), { artist, title, source: 'seed-ru' });
  }

  try {
    const known = JSON.parse(readFileSync(KNOWN_ARTISTS, 'utf8'));
    const artists = known.artists ?? [];
    const ruArtists = artists.filter((a) => /[\u0400-\u04FF]/.test(a)).slice(0, 120);
    const globalArtists = artists.filter((a) => !/[\u0400-\u04FF]/.test(a)).slice(0, 180);

    for (const artist of [...ruArtists, ...globalArtists]) {
      const recordings = await fetchMusicBrainzTopRecordings(artist, 2);
      for (const rec of recordings) {
        catalog.set(trackKey(rec.artist, rec.title), rec);
      }
      await new Promise((r) => setTimeout(r, 1100));
    }
    console.log(`+ musicbrainz: ${catalog.size}`);
  } catch (e) {
    console.warn('musicbrainz skip:', e.message);
  }

  for (const cat of RU_WIKI_CATEGORIES) {
    try {
      const artists = await fetchRuCategoryArtists(cat);
      for (const artist of artists.slice(0, 40)) {
        const recs = await fetchMusicBrainzTopRecordings(artist, 1);
        for (const rec of recs) {
          catalog.set(trackKey(rec.artist, rec.title), { ...rec, source: 'ru-wiki-cat' });
        }
        await new Promise((r) => setTimeout(r, 1100));
      }
      console.log(`+ ${cat}: ${catalog.size}`);
    } catch (e) {
      console.warn(`skip ${cat}:`, e.message);
    }
  }

  try {
    const ruChart = await fetchLastFmTopRussia(250);
    for (const t of ruChart) {
      catalog.set(trackKey(t.artist, t.title), t);
    }
    console.log(`+ lastfm ru chart: ${catalog.size}`);
  } catch (e) {
    console.warn('lastfm skip:', e.message);
  }

  const tracks = [...catalog.values()].slice(0, 2500);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), count: tracks.length, tracks },
      null,
      2,
    ),
  );
  console.log(`Wrote ${tracks.length} tracks → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
