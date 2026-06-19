import net from 'node:net';

export function shouldSkipProxy(): boolean {
  return (
    process.env.SKIP_PROXY === '1' ||
    process.env.SKIP_PROXY === 'true' ||
    process.argv.includes('--no-proxy') ||
    process.argv.includes('--direct')
  );
}

/** hidemy.name VPN exposes XRay HTTP proxy on 127.0.0.1:1301 — Node needs HTTP_PROXY. */
export async function ensureHidemyProxy(): Promise<void> {
  if (shouldSkipProxy()) {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NODE_USE_ENV_PROXY;
    return;
  }
  if (!process.env.NO_PROXY?.trim()) {
    process.env.NO_PROXY = '127.0.0.1,localhost,::1';
  }
  const outbound =
    process.env.OUTBOUND_PROXY?.trim() ||
    process.env.ELEVENLABS_PROXY?.trim() ||
    process.env.HTTPS_PROXY?.trim() ||
    process.env.HTTP_PROXY?.trim();
  if (outbound) {
    process.env.HTTP_PROXY = outbound;
    process.env.HTTPS_PROXY = outbound;
    process.env.NODE_USE_ENV_PROXY = '1';
    const safe = outbound.replace(/\/\/([^:@/]+):([^@/]+)@/, '//$1:***@');
    console.log(`[proxy] outbound → ${safe}`);
    return;
  }
  const alive = await new Promise<boolean>((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: 1301 });
    s.once('connect', () => {
      s.end();
      resolve(true);
    });
    s.once('error', () => resolve(false));
    setTimeout(() => {
      s.destroy();
      resolve(false);
    }, 600);
  });
  if (alive) {
    process.env.HTTP_PROXY = 'http://127.0.0.1:1301';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:1301';
    process.env.NODE_USE_ENV_PROXY = '1';
    console.log('[proxy] hidemy.name → http://127.0.0.1:1301');
  }
}
