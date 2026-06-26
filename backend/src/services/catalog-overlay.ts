import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');

function baseCatalogPath(): string {
  const dist = path.join(process.cwd(), 'dist/data/popular-tracks-catalog.json');
  if (fs.existsSync(dist)) return dist;
  return path.join(process.cwd(), 'src/data/popular-tracks-catalog.json');
}

function trackKey(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

/** Main catalog + persistent era-top100 overlay on Railway volume. */
export function loadCatalogWithOverlays(): { tracks: Array<{ artist: string; title: string; source?: string; year?: number }>; generatedAt?: string; count?: number } {
  const base = JSON.parse(fs.readFileSync(baseCatalogPath(), 'utf8')) as {
    tracks?: Array<{ artist: string; title: string; source?: string; year?: number }>;
    generatedAt?: string;
    count?: number;
  };
  const tracks = [...(base.tracks ?? [])];
  const keys = new Set(tracks.map((t) => trackKey(t.artist, t.title)));

  const overlayPath = path.join(DATA_DIR, 'era-top100-tracks.json');
  if (fs.existsSync(overlayPath)) {
    try {
      const overlay = JSON.parse(fs.readFileSync(overlayPath, 'utf8')) as {
        tracks?: Array<{ artist: string; title: string; source?: string; year?: number }>;
      };
      for (const t of overlay.tracks ?? []) {
        const k = trackKey(t.artist, t.title);
        if (keys.has(k)) continue;
        keys.add(k);
        tracks.push(t);
      }
    } catch {
      /* ignore corrupt overlay */
    }
  }

  return { ...base, tracks, count: tracks.length };
}
