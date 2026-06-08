const SITE_APK_PATH = '/efir-ai.apk';

function siteBaseUrl(): string {
  const raw =
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.TELEGRAM_WIDGET_BASE_URL?.trim() ||
    'https://www.efir-ai.ru';
  return raw.replace(/\/$/, '');
}

export function getSiteApkUrl(): string {
  return `${siteBaseUrl()}${SITE_APK_PATH}`;
}

const GH_REPO = process.env.GITHUB_RELEASES_REPO?.trim() || 'zapnikita95/neuroradio';
const MOBILE_TAG = process.env.GITHUB_MOBILE_RELEASE_TAG?.trim() || 'mobile-latest';
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

function releaseToLinks(release: GhRelease): PublicDownloadLinks {
  const picked = pickAssets(release);
  return {
    repo: GH_REPO,
    tag: release.tag_name ?? null,
    apkUrl: picked.apk,
    extensionUrl: picked.ext,
    publishedAt: release.published_at ?? null,
  };
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
  const empty: PublicDownloadLinks = {
    repo: GH_REPO,
    tag: null,
    apkUrl: null,
    extensionUrl: null,
    publishedAt: null,
  };

  // Always prefer the dedicated mobile-latest tag (not GitHub "latest" which may differ).
  try {
    const mobile = (await fetchJson(
      `https://api.github.com/repos/${GH_REPO}/releases/tags/${encodeURIComponent(MOBILE_TAG)}`,
    )) as GhRelease;
    const picked = pickAssets(mobile);
    if (picked.apk || picked.ext) return releaseToLinks(mobile);
  } catch {
    /* fall through */
  }

  const list = (await fetchJson(
    `https://api.github.com/repos/${GH_REPO}/releases?per_page=15`,
  )) as GhRelease[];
  for (const rel of list) {
    if (rel.tag_name === MOBILE_TAG) {
      const picked = pickAssets(rel);
      if (picked.apk || picked.ext) return releaseToLinks(rel);
    }
  }
  for (const rel of list) {
    const picked = pickAssets(rel);
    if (picked.apk || picked.ext) return releaseToLinks(rel);
  }

  return empty;
}

export async function getPublicDownloadLinks(): Promise<PublicDownloadLinks> {
  const siteApk = getSiteApkUrl();
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) {
    if (!cache.data.apkUrl) return { ...cache.data, apkUrl: siteApk };
    return cache.data;
  }
  let data = await resolveFromGitHub();
  if (!data.apkUrl) data = { ...data, apkUrl: siteApk };
  cache = { at: now, data };
  return data;
}
