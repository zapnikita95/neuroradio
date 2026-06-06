/**
 * Build known-artists.json (~1000 major artist names) from Wikipedia.
 * Run: node scripts/fetch-known-artists.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'MusicStoryBFF/1.0 (known-artists build)';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/data/known-artists.json');
const TARGET = 2500;

const WIKI_TABLE_PAGES = [
  'List_of_best-selling_music_artists',
  'List_of_Billboard_Hot_100_number-one_artists',
  'List_of_artists_who_reached_number_one_on_the_Billboard_Hot_100',
  'List_of_K-pop_artists',
  'Latin_Grammy_Award_for_Best_New_Artist',
  'List_of_highest-certified_music_artists_in_the_United_States',
  'List_of_rock_and_roll_artists',
  'List_of_heavy_metal_bands',
];

const WIKI_CATEGORIES = [
  'Category:American_hip_hop_musicians',
  'Category:American_pop_singers',
  'Category:British_rock_music_groups',
  'Category:German_musicians',
  'Category:French_musicians',
  'Category:Japanese_musicians',
  'Category:K-pop_groups',
  'Category:Heavy_metal_musical_groups',
  'Category:Electronic_music_groups',
  'Category:Reggaeton_musicians',
  'Category:Canadian_musicians',
  'Category:Italian_musicians',
  'Category:Spanish_musicians',
  'Category:Brazilian_musicians',
  'Category:Australian_musicians',
  'Category:Swedish_musicians',
  'Category:Norwegian_musicians',
  'Category:Finnish_musical_groups',
  'Category:Finnish_rock_music_groups',
  'Category:Danish_musical_groups',
  'Category:Polish_musicians',
  'Category:Turkish_musicians',
  'Category:Indian_musicians',
  'Category:South_African_musicians',
  'Category:Nigerian_musicians',
  'Category:Grammy_Award_winners',
  'Category:Brit_Award_winners',
  'Category:Latin_rock_musicians',
  'Category:Alternative_rock_groups',
  'Category:Indie_rock_musical_groups',
  'Category:Pop_rock_musical_groups',
  'Category:Hard_rock_musical_groups',
  'Category:Punk_rock_groups',
  'Category:Grunge_musical_groups',
  'Category:Eurodance_musicians',
  'Category:House_music_groups',
  'Category:Techno_musicians',
  'Category:Trance_musicians',
  'Category:Country_music_singers',
  'Category:Rhythm_and_blues_singers',
  'Category:Soul_musicians',
  'Category:Funk_musicians',
  'Category:Jazz_musicians',
  'Category:Blues_musicians',
  'Category:Classical_composers',
  'Category:Opera_singers',
  'Category:Musicians_from_Los_Angeles',
  'Category:Musicians_from_London',
];

/** Hand-picked global stars — not Latin/indie acts that should stay on wiki path. */
const SEED_MAJOR = [
  'taylor swift', 'beyoncé', 'beyonce', 'jay-z', 'jay z', 'drake', 'eminem', 'coldplay',
  'bts', 'blackpink', 'green day', 'metallica', 'queen', 'the beatles', 'madonna', 'rihanna',
  'ed sheeran', 'ariana grande', 'justin bieber', 'kanye west', 'the weeknd', 'post malone',
  'bruno mars', 'lady gaga', 'adele', 'shakira', 'bad bunny', 'j balvin', 'rosalía',
  'morgenshtern', 'oxxxymiron', 'basta', 'timati', 'miyagi', 'scriptonite',
  'santana', 'the rasmus', 'him', 'nightwish', 'linkin park', 'red hot chili peppers',
  'foo fighters', 'nirvana', 'pearl jam', 'soundgarden', 'alice in chains',
  'u2', 'radiohead', 'oasis', 'blur', 'the cure', 'depeche mode', 'the smiths',
  'bon jovi', 'aerosmith', 'guns n roses', 'ac dc', 'deep purple', 'black sabbath',
  'iron maiden', 'judas priest', 'slayer', 'megadeth', 'anthrax', 'pantera',
  'rammstein', 'scorpions', 'a-ha', 'ace of base', 'aqua', 'europe', 'roxette',
  'within temptation', 'epica', 'apocalyptica', 'lordi', 'children of bodom',
  'moby', 'arash', 'tame impala', 'the killers', 'arctic monkeys', 'muse', 'placebo',
];

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BLOCKLIST = new Set(
  [
    'album', 'single', 'music', 'chart', 'news', 'magazine', 'association', 'industry',
    'wikipedia', 'edit section', 'portal', 'references', 'see also', 'notes', 'definitions',
    'billboard', 'ifpi', 'riaa', 'aria', 'certification', 'record label', 'record producer',
    'songwriter', 'composer', 'concert', 'festival', 'youtube', 'amazon', 'itunes',
    'help cite', 'isbn', 'special booksources', 'the guardian', 'the times', 'forbes',
    'associated press', 'reuters', 'cnn', 'bbc news', 'nme', 'rolling stone', 'variety',
    'universal music', 'sony music', 'warner music', 'face', 'kiss', 'queen', 'journey',
    'alabama', 'chicago', 'genesis', 'heart', 'rush', 'yes', 'america', 'foreigner',
  ].map(normalize),
);

function isLikelyArtist(name) {
  const n = normalize(name);
  if (n.length < 2 || n.length > 60) return false;
  if (/^\d/.test(n)) return false;
  if (/^(list of|category:|template:|file:|wikipedia:|edit section|portal )/i.test(name)) return false;
  if (BLOCKLIST.has(n)) return false;
  for (const bad of BLOCKLIST) {
    if (n.includes(bad) && bad.length >= 6) return false;
  }
  const words = n.split(' ');
  if (words.length > 6) return false;
  if (words.every((w) => w.length <= 3)) return false;
  return true;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchTableArtists(pageTitle) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageTitle)}` +
    `&prop=text&format=json&origin=*`;
  const data = await fetchJson(url);
  const html = data?.parse?.text?.['*'] ?? '';
  const names = new Set();
  for (const m of html.matchAll(/<a[^>]+title="([^"]+)"[^>]*>/gi)) {
    const title = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
    if (/^(List |Category:|File:|Template:|Wikipedia:|Help:|Portal:)/i.test(title)) continue;
    if (/edit section/i.test(title)) continue;
    if (isLikelyArtist(title)) names.add(title);
  }
  return [...names];
}

async function fetchCategoryMembers(category, limit = 400) {
  const members = [];
  let cmcontinue;
  do {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json&origin=*` +
      (cmcontinue ? `&cmcontinue=${encodeURIComponent(cmcontinue)}` : '');
    const data = await fetchJson(url);
    if (!data) break;
    for (const m of data.query?.categorymembers ?? []) {
      const title = m.title?.trim();
      if (title && isLikelyArtist(title)) members.push(title);
    }
    cmcontinue = data.continue?.cmcontinue;
    if (members.length >= limit) break;
  } while (cmcontinue);
  return members;
}

async function main() {
  const raw = new Set(SEED_MAJOR.map(normalize));

  for (const page of WIKI_TABLE_PAGES) {
    try {
      for (const name of await fetchTableArtists(page)) {
        raw.add(normalize(name));
      }
      console.log(`+ table ${page}: ${raw.size}`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.warn(`skip table ${page}:`, e.message);
    }
  }

  for (const cat of WIKI_CATEGORIES) {
    if (raw.size >= TARGET + 300) break;
    try {
      for (const name of await fetchCategoryMembers(cat, 350)) {
        raw.add(normalize(name));
      }
      console.log(`+ ${cat}: ${raw.size}`);
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      console.warn(`skip ${cat}:`, e.message);
    }
  }

  const artists = [...raw].filter(isLikelyArtist).sort().slice(0, TARGET);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), count: artists.length, artists }, null, 0),
  );
  console.log(`Wrote ${artists.length} artists → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
