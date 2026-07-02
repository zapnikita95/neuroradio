const HANDLE = () => process.env.BLUESKY_HANDLE?.trim() ?? '';
const APP_PASSWORD = () => process.env.BLUESKY_APP_PASSWORD?.trim() ?? '';

export function isBlueskyPublishConfigured(): boolean {
  return Boolean(HANDLE() && APP_PASSWORD());
}

async function createSession(): Promise<{ accessJwt: string; did: string }> {
  const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: HANDLE(), password: APP_PASSWORD() }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bluesky session ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { accessJwt?: string; did?: string };
  if (!data.accessJwt || !data.did) throw new Error('Bluesky session missing token');
  return { accessJwt: data.accessJwt, did: data.did };
}

export async function publishToBluesky(text: string): Promise<string | null> {
  if (!isBlueskyPublishConfigured()) return null;
  const { accessJwt, did } = await createSession();
  const now = new Date().toISOString();
  const res = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text: text.slice(0, 300),
        createdAt: now,
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bluesky post ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { uri?: string };
  return data.uri ?? null;
}
