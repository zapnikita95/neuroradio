/**
 * hidemy.name VPN uses local XRay HTTP proxy (127.0.0.1:1301), not a system tunnel.
 * Node/curl ignore it unless HTTP_PROXY is set — this auto-detects when VPN is connected.
 * Set SKIP_PROXY=1 (or --no-proxy on bulk-seed) to use system VPN / direct egress.
 */
import net from 'node:net';

function shouldSkipProxy() {
  return (
    process.env.SKIP_PROXY === '1' ||
    process.env.SKIP_PROXY === 'true' ||
    process.argv.includes('--no-proxy') ||
    process.argv.includes('--direct')
  );
}
const skipProxy = shouldSkipProxy();

if (skipProxy) {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.NODE_USE_ENV_PROXY;
  console.log('[proxy] skipped (direct / system VPN)');
} else if (!process.env.NO_PROXY?.trim()) {
  process.env.NO_PROXY = '127.0.0.1,localhost,::1';
}
const existing = skipProxy ? '' : process.env.HTTPS_PROXY?.trim() || process.env.HTTP_PROXY?.trim();
if (existing) {
  process.env.NODE_USE_ENV_PROXY = '1';
  console.log(`[proxy] using ${existing}`);
} else {
  const alive = await new Promise((resolve) => {
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
