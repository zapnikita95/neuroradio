import fs from 'node:fs';
import path from 'node:path';
import proxyFetch from '../proxy-fetch.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const OVERLAY_PATH = path.join(DATA_DIR, 'era-top100-tracks.json');
const LASTFM_KEY = () => process.env.LASTFM_API_KEY?.trim() ?? '';
const USER_AGENT = 'MusicStoryBFF/1.0 (era-top100 catalog)';

export function isEraTop100AutoEnabled(): boolean {
  const off = process.env.ERA_TOP100_AUTO?.trim().toLowerCase();
  if (off === 'false' || off === '0' || off === 'off') return false;
  return true;
}

function eraYears(): number[] {
  const nowYear = new Date().getFullYear();
  return [0, 2, 4, 9, 19].map((off) => nowYear - 1 - off);
}

function resolveLimit(): number {
  return Math.min(1000, Math.max(10, parseInt(process.env.ERA_TOP100_LIMIT ?? '100', 10)));
}

async function fetchLastfmYearTop(year: number, limit: number) {
  if (!LASTFM_KEY()) return [];
  const q = new URLSearchParams({
    method: 'tag.gettoptracks',
    tag: String(year),
    limit: String(limit),
    api_key: LASTFM_KEY(),
    format: 'json',
  });
  const res = await proxyFetch(`https://ws.audioscrobbler.com/2.0/?${q}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { error?: number; tracks?: { track?: Array<{ name?: string; artist?: { name?: string; '#text'?: string } }> } };
  if (data.error) return [];
  return (data.tracks?.track ?? []).map((t) => ({
    artist: t.artist?.name ?? t.artist?.['#text'] ?? '',
    title: t.name ?? '',
    source: `era-top100:${year}`,
    year,
  }));
}

export function eraOverlayAgeMs(): number | null {
  try {
    if (!fs.existsSync(OVERLAY_PATH)) return null;
    const meta = JSON.parse(fs.readFileSync(OVERLAY_PATH, 'utf8')) as { updatedAt?: string };
    if (!meta.updatedAt) return null;
    return Date.now() - new Date(meta.updatedAt).getTime();
  } catch {
    return null;
  }
}

export async function runEraTop100CatalogUpdate(): Promise<{
  added: number;
  total: number;
  years: number[];
}> {
  const years = eraYears();
  const limit = resolveLimit();
  const existing = fs.existsSync(OVERLAY_PATH)
    ? (JSON.parse(fs.readFileSync(OVERLAY_PATH, 'utf8')) as { tracks?: Array<{ artist: string; title: string; source?: string; year?: number }> }).tracks ?? []
    : [];
  const map = new Map(existing.map((t) => [`${t.artist.toLowerCase()}|${t.title.toLowerCase()}`, t]));
  let added = 0;

  for (const year of years) {
    const rows = await fetchLastfmYearTop(year, limit);
    console.log(`[era-top100] ${year}: ${rows.length} tracks`);
    for (const t of rows) {
      const key = `${t.artist.toLowerCase()}|${t.title.toLowerCase()}`;
      if (map.has(key)) continue;
      map.set(key, t);
      added += 1;
    }
    await new Promise((r) => setTimeout(r, 350));
  }

  const tracks = [...map.values()];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    OVERLAY_PATH,
    JSON.stringify({ updatedAt: new Date().toISOString(), years, limit, added, tracks }, null, 2),
    'utf8',
  );
  console.log(`[era-top100] overlay ${tracks.length} tracks (+${added}) → ${OVERLAY_PATH}`);
  return { added, total: tracks.length, years };
}
