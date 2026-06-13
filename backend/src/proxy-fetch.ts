import { ensureHidemyProxy, shouldSkipProxy } from './hidemy-proxy.js';

let proxyInit: Promise<void> | null = null;

function initProxy(): Promise<void> {
  if (shouldSkipProxy()) {
    delete process.env.HTTP_PROXY;
    delete process.env.HTTPS_PROXY;
    delete process.env.NODE_USE_ENV_PROXY;
    return Promise.resolve();
  }
  if (!proxyInit) {
    proxyInit = ensureHidemyProxy().then(() => {
      if (shouldSkipProxy()) return;
      if (!process.env.NO_PROXY?.trim()) {
        process.env.NO_PROXY = '127.0.0.1,localhost,::1,*.wikipedia.org,wikipedia.org';
      }
      if (process.env.HTTP_PROXY?.trim() || process.env.HTTPS_PROXY?.trim()) {
        process.env.NODE_USE_ENV_PROXY = '1';
      }
    });
  }
  return proxyInit;
}

/** Global fetch via hidemy HTTP proxy when VPN is on (RU-blocked APIs: Groq, Gemini, Last.fm, ElevenLabs, …). */
export default async function proxyFetch(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  await initProxy();
  return fetch(input, init);
}

export { proxyFetch as fetch };
