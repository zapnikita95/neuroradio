/**
 * Expand popular-tracks-catalog.json with high-notability genre × year tracks.
 * Sources: Deezer playlists ("rock 1975", "jazz hits 1960") + Last.fm year/decade tags.
 *
 * Run: npm run build:catalog:genre-year
 * Merge (default): keeps existing catalog, adds new keys with source genre-year:{genre}:{year}
 */
import './setup-hidemy-proxy.mjs';
import '../dist/load-env.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'MusicStoryBFF/1.0 (genre-year catalog)';
const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, '../src/data/popular-tracks-catalog.json');
const LASTFM_KEY = process.env.LASTFM_API_KEY?.trim() ?? '';

const args = process.argv.slice(2);
const YEAR_FROM = parseInt(args.find((a) => a.startsWith('--year-from='))?.split('=')[1] ?? '1950', 10);
const YEAR_TO = parseInt(args.find((a) => a.startsWith('--year-to='))?.split('=')[1] ?? String(new Date().getFullYear()), 10);
const TRACKS_PER_CELL = parseInt(
  args.find((a) => a.startsWith('--tracks-per-cell='))?.split('=')[1] ?? '12',
  10,
);
const CONCURRENCY = parseInt(args.find((a) => a.startsWith('--concurrency='))?.split('=')[1] ?? '4', 10);
const mergeExisting = !args.includes('--fresh');
const skipDeezer = args.includes('--lastfm-only');

/** Broad genre list — Last.fm tags + regional styles. */
const GENRES = [
  'rock', 'pop', 'hip-hop', 'rap', 'r&b', 'soul', 'funk', 'disco', 'jazz', 'blues', 'country', 'folk',
  'metal', 'punk', 'grunge', 'alternative', 'indie', 'electronic', 'house', 'techno', 'trance', 'ambient',
  'drum and bass', 'garage', 'dubstep', 'classical', 'opera', 'soundtrack', 'world', 'reggae', 'latin',
  'salsa', 'bachata', 'reggaeton', 'bossa nova', 'afrobeat', 'afrobeats', 'k-pop', 'j-pop', 'cantopop',
  'schlager', 'chanson', 'german pop', 'italian pop', 'russian rock', 'rusrock', 'russian pop', 'soviet',
  'progressive rock', 'prog rock', 'new wave', 'synthpop', 'shoegaze', 'post-punk', 'emo', 'hardcore',
  'death metal', 'black metal', 'thrash metal', 'nu metal', 'britpop', 'trip hop', 'motown', 'doo-wop',
  'swing', 'gospel', 'ska', 'grime', 'trap', 'lo-fi', 'industrial', 'goth', 'celtic', 'bluegrass',
  'flamenco', 'fado', 'tango', 'cumbia', 'merengue', 'dancehall', 'dub', 'psytrance', 'hardstyle',
  'breakbeat', 'jungle', 'edm', 'pop rock', 'soft rock', 'hard rock', 'glam rock', 'folk rock',
  'blues rock', 'acoustic', 'instrumental', 'chillout', 'new age', 'musical', 'dance', 'rnb',
  'chanson francaise', 'brazilian', 'french pop', 'spanish pop', 'turkish', 'arabic', 'bollywood',
  'mandopop', 'visual kei', 'emo pop', 'post-rock', 'math rock', 'noise rock', 'stoner rock',
  'power metal', 'folk metal', 'symphonic metal', 'metalcore', 'post-hardcore', 'screamo',
  'garage rock', 'surf rock', 'rockabilly', 'rock and roll', 'rhythm and blues', 'northern soul',
  'southern soul', 'neo soul', 'quiet storm', 'go-go', 'boogie', 'electro', 'eurodance', 'europop',
  'italo disco', 'hi-nrg', 'new jack swing', 'contemporary r&b', 'urban contemporary',
];

const DECADE_TAGS = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];

const JUNK_ARTIST =
  /^(karaoke version|ameritz|party allstars|the latin party allstars|the latin party)$/i;
const JUNK_TITLE =
  /originally recorded|in the style of|\(karaoke|\(radio edit\)|\(instrumental\)/i;
const JUNK_PLAYLIST =
  /\b(?:war|army|saigon|vietnam|documentary|sound effects|meditation|sleep|study|workout only)\b/i;

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

function addTrack(catalog, artist, title, source, meta = {}) {
  const a = artist?.trim();
  const t = normalizeTitle(title?.trim() ?? '');
  if (!a || !t || t.length < 2) return false;
  if (JUNK_ARTIST.test(a)) return false;
  if (JUNK_TITLE.test(t)) return false;
  const key = trackKey(a, t);
  if (catalog.has(key)) return false;
  catalog.set(key, { artist: a, title: t, source, ...meta });
  return true;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url, timeout = 20000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchLastFmMethod(params) {
  if (!LASTFM_KEY) return null;
  const q = new URLSearchParams({ ...params, api_key: LASTFM_KEY, format: 'json' });
  return fetchJson(`https://ws.audioscrobbler.com/2.0/?${q}`);
}

async function fetchLastfmTagTop(tag, limit = 100) {
  const data = await fetchLastFmMethod({ method: 'tag.gettoptracks', tag, limit: String(limit) });
  if (!data || data.error) return [];
  return (data.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: `lastfm-tag-${tag.replace(/\s+/g, '-')}`,
  }));
}

function scorePlaylist(title, genre, year) {
  const t = (title ?? '').toLowerCase();
  const g = genre.toLowerCase();
  if (JUNK_PLAYLIST.test(t)) return -10;
  let score = 0;
  if (t.includes(String(year))) score += 4;
  for (const word of g.split(/\s+/)) {
    if (word.length >= 3 && t.includes(word)) score += 2;
  }
  if (/\b(?:hits|best|top|classic|greatest|essential|legend)\b/i.test(t)) score += 2;
  if (/\b(?:mix|remix|cover|karaoke|tribute)\b/i.test(t)) score -= 3;
  return score;
}

async function fetchDeezerGenreYearTracks(genre, year, limit = TRACKS_PER_CELL) {
  const queries = [
    `${genre} ${year}`,
    `${genre} hits ${year}`,
    `best ${genre} ${year}`,
    `top ${genre} songs ${year}`,
  ];
  let bestPl = null;
  let bestScore = 0;
  for (const q of queries) {
    const search = await fetchJson(
      `https://api.deezer.com/search/playlist?q=${encodeURIComponent(q)}&limit=8`,
    );
    for (const pl of search?.data ?? []) {
      const sc = scorePlaylist(pl.title, genre, year);
      if (sc > bestScore) {
        bestScore = sc;
        bestPl = pl;
      }
    }
    if (bestScore >= 5) break;
    await sleep(80);
  }
  if (!bestPl || bestScore < 2) return [];

  const tracks = await fetchJson(
    `https://api.deezer.com/playlist/${bestPl.id}/tracks?limit=${Math.min(limit + 8, 50)}`,
  );
  const out = [];
  for (const t of tracks?.data ?? []) {
    if (out.length >= limit) break;
    out.push({
      artist: t.artist?.name ?? '',
      title: t.title ?? '',
      source: `genre-year:${genre}:${year}`,
      year,
      genre,
      playlist: bestPl.title?.slice(0, 60),
    });
  }
  return out;
}

async function poolMap(items, concurrency, fn) {
  let idx = 0;
  let done = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
      done += 1;
      if (done % 200 === 0) {
        console.log(`progress ${done}/${items.length}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

async function main() {
  const catalog = new Map();
  if (mergeExisting && existsSync(OUT)) {
    const existing = JSON.parse(readFileSync(OUT, 'utf8'));
    for (const t of existing.tracks ?? []) {
      addTrack(catalog, t.artist, t.title, t.source ?? 'existing', {
        year: t.year,
        genre: t.genre,
      });
    }
    console.log(`loaded existing: ${catalog.size}`);
  }

  const before = catalog.size;
  let addedLastfm = 0;
  let addedCells = 0;

  if (LASTFM_KEY) {
    console.log('Last.fm: year tags…');
    for (let year = YEAR_FROM; year <= YEAR_TO; year += 1) {
      for (const t of await fetchLastfmTagTop(String(year), 80)) {
        if (addTrack(catalog, t.artist, t.title, `lastfm-year-${year}`, { year })) addedLastfm += 1;
      }
      await sleep(280);
    }
    console.log(`+ lastfm years: ${catalog.size} (+${catalog.size - before})`);

    console.log('Last.fm: decades…');
    for (const decade of DECADE_TAGS) {
      for (const t of await fetchLastfmTagTop(decade, 120)) {
        if (addTrack(catalog, t.artist, t.title, `lastfm-decade-${decade}`)) addedLastfm += 1;
      }
      await sleep(280);
    }
    console.log(`+ lastfm decades: ${catalog.size}`);

    console.log('Last.fm: all genres (top tracks)…');
    for (const genre of GENRES) {
      for (const t of await fetchLastfmTagTop(genre, 50)) {
        if (addTrack(catalog, t.artist, t.title, `lastfm-tag-${genre.replace(/\s+/g, '-')}`, { genre })) {
          addedLastfm += 1;
        }
      }
      await sleep(250);
    }
    console.log(`+ lastfm genres: ${catalog.size} (+${addedLastfm} lastfm total)`);
  } else {
    console.warn('LASTFM_API_KEY missing — skipping Last.fm year/genre tags');
  }

  if (!skipDeezer) {
    const cells = [];
    for (let year = YEAR_FROM; year <= YEAR_TO; year += 1) {
      for (const genre of GENRES) {
        cells.push({ genre, year });
      }
    }
    console.log(
      `Deezer genre×year: ${cells.length} cells (${GENRES.length} genres × ${YEAR_TO - YEAR_FROM + 1} years), ` +
        `${TRACKS_PER_CELL} tracks/cell max, concurrency=${CONCURRENCY}`,
    );

    let cellAdded = 0;
    await poolMap(cells, CONCURRENCY, async ({ genre, year }) => {
      try {
        const tracks = await fetchDeezerGenreYearTracks(genre, year, TRACKS_PER_CELL);
        let n = 0;
        for (const t of tracks) {
          if (addTrack(catalog, t.artist, t.title, t.source, { year: t.year, genre: t.genre })) {
            n += 1;
            cellAdded += 1;
          }
        }
        if (n > 0) addedCells += 1;
      } catch {
        // skip cell
      }
      await sleep(60);
    });
    console.log(`+ deezer genre×year: ${cellAdded} tracks from ${addedCells} non-empty cells → catalog=${catalog.size}`);
  }

  const tracks = [...catalog.values()];
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        count: tracks.length,
        genreYearMeta: { yearFrom: YEAR_FROM, yearTo: YEAR_TO, genres: GENRES.length, tracksPerCell: TRACKS_PER_CELL },
        tracks,
      },
      null,
      0,
    ),
  );
  console.log(`Wrote ${tracks.length} tracks (+${tracks.length - before} new) → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
