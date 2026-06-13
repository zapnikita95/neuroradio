/**
 * Build popular-tracks-catalog.json (target ~10 000 tracks, RU + global).
 * Sources: Last.fm (charts/geo/tops) + Deezer + iTunes + cover-classics.
 * Run: npm run build:catalog
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'MusicStoryBFF/1.0 (popular-tracks catalog)';
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../src/data/popular-tracks-catalog.json');
const KNOWN_ARTISTS = join(__dir, '../src/data/known-artists.json');
const COVER_CLASSICS = join(__dir, '../src/data/cover-classics.json');

const args = process.argv.slice(2);
const TARGET = parseInt(args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? '60000', 10);
const TRACKS_PER_ARTIST = 15;
const DEEZER_RPS = 10;
const LASTFM_RPS = 4;
const PLAYLIST_TRACK_LIMIT = 200;
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';
const LASTFM_GEOS = [
  'Russia', 'United States', 'United Kingdom', 'Germany', 'Ukraine', 'France',
  'Japan', 'Brazil', 'Poland', 'Italy', 'Spain', 'Canada', 'Australia', 'Mexico',
];
const LASTFM_TAGS = ['rock', 'pop', 'hip-hop', 'electronic', 'indie', 'metal', 'punk', 'jazz', 'classical', 'soul'];
const mergeExisting = !args.includes('--fresh');

const RU_SEED_TRACKS = [
  ['Кино', 'Группа крови'], ['Кино', 'Звезда по имени Солнце'], ['Кино', 'Пачка сигарет'],
  ['Виктор Цой', 'Кукушка'], ['Любэ', 'Конь'], ['Любэ', 'Ты неси меня, река'],
  ['Би-2', 'Полковнику никто не пишет'], ['Би-2', 'Мой рок-н-ролл'], ['Земфира', 'Искала'],
  ['Земфира', 'Хочешь?'], ['Сплин', 'Выхода нет'], ['ДДТ', 'Что такое осень'],
  ['Oxxxymiron', 'Город под подошвой'], ['Баста', 'Моя игра'], ['Моргенштерн', 'Cadillac'],
  ['Скриптонит', 'Витамин'], ['Элджей', 'Розовое вино'], ['Король и Шут', 'Лесник'],
  ['t.A.T.u.', 'Нас не догонят'], ['Rammstein', 'Du Hast'], ['Макс Корж', 'Малый повзрослел'],
  ['Ленинград', 'Экспонат'], ['Мумий Тролль', 'Владивосток 2000'], ['Звери', 'Районы-кварталы'],
  ['Чайф', 'Осень'], ['Ария', 'Штиль'], ['Агата Кристи', 'Как на войне'], ['Кипелов', 'Я свободен'],
  ['Иванушки International', 'Тополиный пух'], ['Руки Вверх', '18 мне уже'], ['Градусы', 'Режиссёр'],
  ['Ласковый май', 'Белые розы'], ['Валерий Меладзе', 'Салют, Вера'], ['Филипп Киркоров', 'Цвет настроения синий'],
  ['Мот', 'Капкан'], ['Jony', 'Комета'], ['МакSим', 'Знаешь ли ты'], ['Ногу Свело!', 'Хару мамбуру'],
  ['Король и Шут', 'Прыгну со скалы'], ['Кино', 'Кукушка'], ['Виктор Цой', 'Перемен'],
];

const GLOBAL_SEED_TRACKS = [
  ['Queen', 'Bohemian Rhapsody'], ['Nirvana', 'Smells Like Teen Spirit'], ['The Beatles', 'Yesterday'],
  ['Michael Jackson', 'Billie Jean'], ['Eminem', 'Lose Yourself'], ['Drake', "God's Plan"],
  ['Taylor Swift', 'Shake It Off'], ['The Weeknd', 'Blinding Lights'], ['The Rasmus', 'In The Shadows'],
  ['Green Day', 'Basket Case'], ['Metallica', 'Nothing Else Matters'], ['Coldplay', 'Yellow'],
  ['Radiohead', 'Creep'], ['Linkin Park', 'In The End'], ['Rihanna', 'Umbrella'],
  ['Beyoncé', 'Halo'], ['Ed Sheeran', 'Shape of You'], ['Billie Eilish', 'bad guy'],
  ['Red Hot Chili Peppers', 'Californication'], ['Foo Fighters', 'Everlong'], ['Oasis', 'Wonderwall'],
  ['Arctic Monkeys', 'Do I Wanna Know?'], ['Muse', 'Supermassive Black Hole'], ['a-ha', 'Take On Me'],
  ['ABBA', 'Dancing Queen'], ['Madonna', 'Like a Prayer'], ['Prince', 'Purple Rain'],
  ['David Bowie', 'Heroes'], ['Pink Floyd', 'Comfortably Numb'], ['Led Zeppelin', 'Stairway to Heaven'],
  ['AC/DC', 'Back In Black'], ['Guns N\' Roses', 'Sweet Child O\' Mine'], ['U2', 'With Or Without You'],
  ['The Killers', 'Mr. Brightside'], ['Imagine Dragons', 'Radioactive'], ['Post Malone', 'Circles'],
  ['Kanye West', 'Stronger'], ['Jay-Z', '99 Problems'],
  ['Kesha', 'TiK ToK'], ['Shakira', 'Waka Waka (This Time for Africa)'],
  ['Lady Gaga', 'Bad Romance'], ['Bruno Mars', 'Uptown Funk'],
  ['Adele', 'Rolling in the Deep'], ['Justin Bieber', 'Baby'],
  ['PSY', 'Gangnam Style'], ['Daft Punk', 'Get Lucky'],
];

/** Deezer genre chart ids (each returns up to 300 tracks). */
const DEEZER_CHARTS = [0, 116, 113, 129, 152, 165, 106, 466, 85, 197];

const PLAYLIST_QUERIES = [
  'top hits', 'best songs', 'rock classics', 'hip hop hits', 'pop hits',
  'russian hits', 'русские хиты', 'rap hits', 'electronic dance', 'indie rock',
  '80s hits', '90s hits', '2000s hits', 'metal essentials', 'rnb soul',
  'latin hits', 'k-pop hits', 'country hits', 'jazz classics', 'reggae hits',
  'uk hits', 'german hits', 'french hits', 'party hits', 'workout hits',
];

const ITUNES_CHART_FEEDS = [
  'ru', 'us', 'gb', 'de', 'fr', 'ua', 'br', 'mx', 'jp', 'it', 'es', 'pl',
];

const JUNK_ARTIST =
  /^(album|music|chart|ifpi|grammy|billboard|template|category|help|commons|editpage|special editpage|lists of |history of |music |record |digital |compact |extended |double |surprise |bootleg|hidden track|guest appearance|guitar |blast beat|death growl|headbanging|parental |subscription |nationality$|billing$|nationality$)/i;

function normalizeTitle(title) {
  return title
    .replace(/\s*\(feat\.[^)]+\)/gi, '')
    .replace(/\s*\(ft\.[^)]+\)/gi, '')
    .replace(/\s*\(featuring[^)]+\)/gi, '')
    .replace(/\s*\(with[^)]+\)/gi, '')
    .replace(/\s*\(Single\)/gi, '')
    .replace(/\s*\([^)]*(?:remaster|radio edit|explicit|version|mix|live|mono|stereo|deluxe|bonus)[^)]*\)/gi, '')
    .replace(/\s*\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function trackKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${normalizeTitle(title).toLowerCase()}`;
}

function addTrack(catalog, artist, title, source) {
  const a = artist?.trim();
  const t = normalizeTitle(title?.trim() ?? '');
  if (!a || !t || t.length < 2) return false;
  const key = trackKey(a, t);
  if (catalog.has(key)) return false;
  catalog.set(key, { artist: a, title: t, source });
  return true;
}

async function fetchJson(url, timeout = 20000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) return null;
  return res.json();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function poolMap(items, concurrency, fn) {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function probeLastFm() {
  if (!LASTFM_KEY) return false;
  const data = await fetchJson(
    `https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&limit=1&api_key=${LASTFM_KEY}&format=json`,
  );
  return !data?.error && Boolean(data?.tracks?.track?.length);
}

async function fetchLastFmMethod(params) {
  if (!LASTFM_KEY) return null;
  const q = new URLSearchParams({ ...params, api_key: LASTFM_KEY, format: 'json' });
  return fetchJson(`https://ws.audioscrobbler.com/2.0/?${q}`);
}

async function fetchLastfmChartTop(limit = 1000) {
  const data = await fetchLastFmMethod({ method: 'chart.gettoptracks', limit: String(limit) });
  return (data?.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: 'lastfm-global-chart',
  }));
}

async function fetchLastfmGeoTop(country, limit = 1000) {
  const data = await fetchLastFmMethod({
    method: 'geo.gettoptracks',
    country,
    limit: String(limit),
  });
  return (data?.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: `lastfm-geo-${country.toLowerCase().replace(/\s+/g, '-')}`,
  }));
}

async function fetchLastfmTagTop(tag, limit = 400) {
  const data = await fetchLastFmMethod({
    method: 'tag.gettoptracks',
    tag,
    limit: String(limit),
  });
  return (data?.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: `lastfm-tag-${tag}`,
  }));
}

async function fetchLastfmArtistTop(artist, limit = TRACKS_PER_ARTIST) {
  const data = await fetchLastFmMethod({
    method: 'artist.gettoptracks',
    artist,
    limit: String(limit),
    autocorrect: '1',
  });
  return (data?.toptracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? artist,
    title: t.name ?? '',
    source: 'lastfm-artist-top',
  }));
}

async function fetchDeezerChart(chartId) {
  const data = await fetchJson(`https://api.deezer.com/chart/${chartId}/tracks?limit=300`);
  return (data?.data ?? []).map((t) => ({
    artist: t.artist?.name ?? '',
    title: t.title ?? '',
    source: `deezer-chart-${chartId}`,
  }));
}

async function fetchDeezerArtistTop(artist, limit = TRACKS_PER_ARTIST) {
  const search = await fetchJson(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=3`,
  );
  const hit = (search?.data ?? []).find(
    (a) => a.name?.toLowerCase() === artist.toLowerCase(),
  ) ?? search?.data?.[0];
  if (!hit?.id) return [];
  const top = await fetchJson(`https://api.deezer.com/artist/${hit.id}/top?limit=${limit}`);
  return (top?.data ?? []).map((t) => ({
    artist: t.artist?.name ?? artist,
    title: t.title ?? '',
    source: 'deezer-artist-top',
  }));
}

async function fetchDeezerPlaylistTracks(query) {
  const search = await fetchJson(
    `https://api.deezer.com/search/playlist?q=${encodeURIComponent(query)}&limit=40`,
  );
  const out = [];
  for (const pl of search?.data ?? []) {
    if (out.length >= 800) break;
    const tracks = await fetchJson(
      `https://api.deezer.com/playlist/${pl.id}/tracks?limit=${PLAYLIST_TRACK_LIMIT}`,
    );
    for (const t of tracks?.data ?? []) {
      out.push({
        artist: t.artist?.name ?? '',
        title: t.title ?? '',
        source: `deezer-playlist:${pl.title?.slice(0, 40) ?? query}`,
      });
    }
    await sleep(80);
  }
  return out;
}

async function fetchItunesChartTracks(country) {
  const data = await fetchJson(
    `https://rss.applemarketingtools.com/api/v2/${country}/music/most-played/100/songs.json`,
  );
  return (data?.feed?.results ?? []).map((t) => ({
    artist: t.artistName ?? '',
    title: t.name ?? '',
    source: `itunes-chart-${country}`,
  }));
}

async function fetchItunesArtistTop(artist, limit = TRACKS_PER_ARTIST) {
  const data = await fetchJson(
    `https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&entity=song&limit=${limit + 4}`,
  );
  const artistLc = artist.toLowerCase();
  return (data?.results ?? [])
    .filter((t) => t.artistName?.toLowerCase().includes(artistLc) || artistLc.includes(t.artistName?.toLowerCase() ?? ''))
    .slice(0, limit)
    .map((t) => ({
      artist: t.artistName ?? artist,
      title: t.trackName ?? '',
      source: 'itunes-artist-top',
    }));
}

function isUsefulArtist(name) {
  if (!name || name.length < 2 || name.length > 80) return false;
  if (JUNK_ARTIST.test(name)) return false;
  if (/heavy metal|music award|wikipedia|journal|newspaper|broadcasting corporation|entertainment law|music chart$/i.test(name)) {
    return false;
  }
  return true;
}

async function main() {
  const catalog = new Map();
  const lastfmOk = await probeLastFm();
  console.log(lastfmOk ? 'lastfm: OK' : 'lastfm: unavailable (no key or proxy)');

  if (mergeExisting && existsSync(OUT)) {
    const existing = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const t of existing.tracks ?? []) {
      addTrack(catalog, t.artist, t.title, t.source ?? 'existing');
    }
    console.log(`loaded existing: ${catalog.size}`);
  }

  for (const [artist, title] of RU_SEED_TRACKS) addTrack(catalog, artist, title, 'seed-ru');
  for (const [artist, title] of GLOBAL_SEED_TRACKS) addTrack(catalog, artist, title, 'seed-global');
  console.log(`seed: ${catalog.size}`);

  try {
    const classics = JSON.parse(readFileSync(COVER_CLASSICS, 'utf8'));
    for (const row of classics) {
      if (row.scope === 'track' || !row.scope) {
        addTrack(catalog, row.artist, row.title, 'cover-classics');
      }
    }
    console.log(`+ cover-classics: ${catalog.size}`);
  } catch (e) {
    console.warn('cover-classics:', e.message);
  }

  if (lastfmOk) {
    try {
      for (const t of await fetchLastfmChartTop(1000)) {
        if (catalog.size >= TARGET) break;
        addTrack(catalog, t.artist, t.title, t.source);
      }
      console.log(`+ lastfm global chart: ${catalog.size}`);
      await sleep(300);

      for (const geo of LASTFM_GEOS) {
        if (catalog.size >= TARGET) break;
        for (const t of await fetchLastfmGeoTop(geo, 1000)) {
          if (catalog.size >= TARGET) break;
          addTrack(catalog, t.artist, t.title, t.source);
        }
        console.log(`+ lastfm geo ${geo}: ${catalog.size}`);
        await sleep(300);
      }
    } catch (e) {
      console.warn('lastfm charts:', e.message);
    }

    try {
      for (const tag of LASTFM_TAGS) {
        if (catalog.size >= TARGET) break;
        for (const t of await fetchLastfmTagTop(tag, 400)) {
          if (catalog.size >= TARGET) break;
          addTrack(catalog, t.artist, t.title, t.source);
        }
        console.log(`+ lastfm tag ${tag}: ${catalog.size}`);
        await sleep(300);
      }
    } catch (e) {
      console.warn('lastfm tags:', e.message);
    }
  }

  for (const chartId of DEEZER_CHARTS) {
    if (catalog.size >= TARGET) break;
    try {
      for (const t of await fetchDeezerChart(chartId)) {
        if (catalog.size >= TARGET) break;
        addTrack(catalog, t.artist, t.title, t.source);
      }
      console.log(`+ deezer chart ${chartId}: ${catalog.size}`);
      await sleep(200);
    } catch (e) {
      console.warn(`deezer chart ${chartId}:`, e.message);
    }
  }

  for (const country of ITUNES_CHART_FEEDS) {
    if (catalog.size >= TARGET) break;
    try {
      for (const t of await fetchItunesChartTracks(country)) {
        if (catalog.size >= TARGET) break;
        addTrack(catalog, t.artist, t.title, t.source);
      }
      console.log(`+ itunes chart ${country}: ${catalog.size}`);
      await sleep(150);
    } catch (e) {
      console.warn(`itunes chart ${country}:`, e.message);
    }
  }

  for (const query of PLAYLIST_QUERIES) {
    if (catalog.size >= TARGET) break;
    try {
      for (const t of await fetchDeezerPlaylistTracks(query)) {
        if (catalog.size >= TARGET) break;
        addTrack(catalog, t.artist, t.title, t.source);
      }
      console.log(`+ playlists "${query}": ${catalog.size}`);
    } catch (e) {
      console.warn(`playlists "${query}":`, e.message);
    }
  }

  const known = JSON.parse(readFileSync(KNOWN_ARTISTS, 'utf8'));
  const fromKnown = (known.artists ?? []).filter(isUsefulArtist);
  const coverArtists = new Set(
    JSON.parse(readFileSync(COVER_CLASSICS, 'utf8')).map((r) => r.artist?.toLowerCase()).filter(Boolean),
  );
  const catalogArtists = [...catalog.values()].map((t) => t.artist);
  const artists = [
    ...new Set([
      ...RU_SEED_TRACKS.map(([a]) => a),
      ...GLOBAL_SEED_TRACKS.map(([a]) => a),
      ...fromKnown.filter((a) => /[\u0400-\u04FF]/.test(a) || coverArtists.has(a.toLowerCase())),
      ...fromKnown,
      ...catalogArtists,
    ]),
  ];
  console.log(`artists pool: ${artists.length}`);

  if (catalog.size < TARGET) {
    let done = 0;
    let added = 0;
    const interval = 1000 / (lastfmOk ? LASTFM_RPS : DEEZER_RPS);
    const pool = lastfmOk ? LASTFM_RPS : DEEZER_RPS;
    await poolMap(artists, pool, async (artist) => {
      if (catalog.size >= TARGET) return;
      const before = catalog.size;
      try {
        let tracks = [];
        if (lastfmOk) {
          tracks = await fetchLastfmArtistTop(artist, TRACKS_PER_ARTIST);
        }
        if (tracks.length < 2) {
          tracks = await fetchDeezerArtistTop(artist, TRACKS_PER_ARTIST);
        }
        if (tracks.length < 2) {
          tracks = await fetchItunesArtistTop(artist, TRACKS_PER_ARTIST);
        }
        for (const t of tracks) {
          if (catalog.size >= TARGET) break;
          addTrack(catalog, t.artist, t.title, t.source);
        }
      } catch {
        // skip
      }
      done += 1;
      added += catalog.size - before;
      if (done % 250 === 0) {
        console.log(`+ artists ${done}/${artists.length}: catalog=${catalog.size} (+${added} this block)`);
        added = 0;
      }
      await sleep(interval);
    });
    console.log(`+ artist tops done: ${catalog.size}`);
  }

  const tracks = [...catalog.values()].slice(0, TARGET);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: tracks.length, tracks }, null, 0),
  );
  console.log(`Wrote ${tracks.length} tracks → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
