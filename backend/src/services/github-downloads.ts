const GH_REPO = process.env.GITHUB_RELEASES_REPO?.trim() || 'zapnikita95/neuroradio';
const CACHE_MS = 5 * 60_000;

export type PublicDownloadLinks = {
  repo: string;
  tag: string | null;
  apkUrl: string | null;
  extensionUrl: string | null;
  publishedAt: string | null;
};

let cache: { at: number; data: PublicDownloadLinks } | null = null;

type GhAsset = { name: string; browser_download_url: string };
type GhRelease = {
  tag_name?: string;
  published_at?: string;
  assets?: GhAsset[];
};

function pickAssets(release: GhRelease): { apk: string | null; ext: string | null } {
  const assets = release.assets ?? [];
  const apk = assets.find((a) => /\.apk$/i.test(a.name))?.browser_download_url ?? null;
  const ext =
    assets.find((a) => /\.zip$/i.test(a.name))?.browser_download_url ??
    assets.find((a) => /\.crx$/i.test(a.name))?.browser_download_url ??
    null;
  return { apk, ext };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'EfirAI-BFF/1.0',
    },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  return res.json();
}

async function resolveFromGitHub(): Promise<PublicDownloadLinks> {
  const base: PublicDownloadLinks = {
    repo: GH_REPO,
    tag: null,
    apkUrl: null,
    extensionUrl: null,
    publishedAt: null,
  };

  try {
    const latest = (await fetchJson(`https://api.github.com/repos/${GH_REPO}/releases/latest`)) as GhRelease;
    const picked = pickAssets(latest);
    if (picked.apk || picked.ext) {
      return {
        ...base,
        tag: latest.tag_name ?? null,
        apkUrl: picked.apk,
        extensionUrl: picked.ext,
        publishedAt: latest.published_at ?? null,
      };
    }
  } catch {
    /* try list */
  }

  const list = (await fetchJson(
    `https://api.github.com/repos/${GH_REPO}/releases?per_page=15`,
  )) as GhRelease[];
  for (const rel of list) {
    const picked = pickAssets(rel);
    if (picked.apk || picked.ext) {
      return {
        ...base,
        tag: rel.tag_name ?? null,
        apkUrl: picked.apk,
        extensionUrl: picked.ext,
        publishedAt: rel.published_at ?? null,
      };
    }
  }

  return base;
}

export async function getPublicDownloadLinks(): Promise<PublicDownloadLinks> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.data;
  const data = await resolveFromGitHub();
  cache = { at: now, data };
  return data;
}
