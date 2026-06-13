import './load-env.js';
import { ensureHidemyProxy } from './hidemy-proxy.js';

await ensureHidemyProxy();
if (!process.env.NO_PROXY?.trim()) {
  process.env.NO_PROXY = '127.0.0.1,localhost,::1,*.wikipedia.org,wikipedia.org';
}
if (process.env.HTTP_PROXY?.trim() || process.env.HTTPS_PROXY?.trim()) {
  process.env.NODE_USE_ENV_PROXY = '1';
}
