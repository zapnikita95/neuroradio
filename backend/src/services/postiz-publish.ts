/**
 * Postiz aggregator — one API posts to X, Threads, LinkedIn, Instagram, etc.
 * Connect accounts in Postiz UI, then set POSTIZ_INTEGRATIONS=id:threads,id:x
 * Self-hosted Postiz is free (Docker); cloud from $29/mo.
 */
const API_BASE = () =>
  (process.env.POSTIZ_API_URL?.trim() || 'https://api.postiz.com/public/v1').replace(/\/$/, '');
const API_KEY = () => process.env.POSTIZ_API_KEY?.trim() ?? '';

export function isPostizPublishConfigured(): boolean {
  return Boolean(API_KEY() && parsePostizIntegrations().length > 0);
}

/** Legacy: comma-separated IDs → default type threads */
export function integrationIds(): string[] {
  return parsePostizIntegrations().map((x) => x.id);
}

export function parsePostizIntegrations(): Array<{ id: string; type: string }> {
  const detailed = process.env.POSTIZ_INTEGRATIONS?.trim();
  if (detailed) {
    return detailed
      .split(/[,;]+/)
      .map((entry) => {
        const [id, type = 'threads'] = entry.split(':');
        return { id: id.trim(), type: type.trim() || 'threads' };
      })
      .filter((x) => x.id);
  }
  const raw = process.env.POSTIZ_INTEGRATION_IDS?.trim() ?? '';
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => ({ id, type: 'threads' }));
}

async function postizFetch(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${API_BASE()}${path}`, {
    ...init,
    headers: {
      Authorization: API_KEY(),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
}

export async function uploadPostizVideo(localPath: string): Promise<{ id: string; path: string } | null> {
  if (!API_KEY()) return null;
  const buf = await import('node:fs/promises').then((fs) => fs.readFile(localPath));
  const form = new FormData();
  form.append('file', new Blob([buf], { type: 'video/mp4' }), 'efir-story.mp4');
  const res = await postizFetch('/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postiz upload ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string; path?: string };
  if (!data.id || !data.path) return null;
  return { id: data.id, path: data.path };
}

export async function publishViaPostiz(
  text: string,
  videoPath?: string | null,
): Promise<string[]> {
  const integrations = parsePostizIntegrations();
  if (!API_KEY() || integrations.length === 0) return [];

  let videoMeta: { id: string; path: string } | null = null;
  if (videoPath) {
    try {
      videoMeta = await uploadPostizVideo(videoPath);
    } catch (err) {
      console.warn('[postiz] video upload failed, text-only:', err instanceof Error ? err.message : err);
    }
  }

  const posts = integrations.map(({ id, type }) => ({
    integration: { id },
    value: [
      {
        content: text.slice(0, 2000),
        image: videoMeta ? [{ id: videoMeta.id, path: videoMeta.path }] : [],
      },
    ],
    settings: { __type: type },
  }));

  const res = await postizFetch('/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'now',
      date: new Date().toISOString(),
      shortLink: false,
      tags: ['efir-ai'],
      posts,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Postiz posts ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { id?: string; posts?: Array<{ id?: string }> };
  return [data.id, ...(data.posts?.map((p) => p.id).filter(Boolean) ?? [])].filter(Boolean) as string[];
}
