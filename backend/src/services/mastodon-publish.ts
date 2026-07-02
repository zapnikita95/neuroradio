const INSTANCE = () => process.env.MASTODON_INSTANCE_URL?.trim().replace(/\/$/, '') ?? '';
const TOKEN = () => process.env.MASTODON_ACCESS_TOKEN?.trim() ?? '';

export function isMastodonPublishConfigured(): boolean {
  return Boolean(INSTANCE() && TOKEN());
}

export async function publishToMastodon(text: string): Promise<string | null> {
  const base = INSTANCE();
  const token = TOKEN();
  if (!base || !token) return null;

  const res = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: text.slice(0, 500), visibility: 'public' }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mastodon ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string; url?: string };
  return data.url ?? data.id ?? null;
}
