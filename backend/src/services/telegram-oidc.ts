import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://oauth.telegram.org/.well-known/jwks.json'));

export function telegramBotNumericId(): string | null {
  const explicit = process.env.TELEGRAM_BOT_ID?.trim();
  if (explicit) return explicit;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const prefix = token.split(':', 1)[0];
  return /^\d+$/.test(prefix) ? prefix : null;
}

export function telegramOidcClientSecret(): string | null {
  const secret =
    process.env.TELEGRAM_OIDC_CLIENT_SECRET?.trim() ||
    process.env.TELEGRAM_LOGIN_CLIENT_SECRET?.trim() ||
    '';
  return secret || null;
}

export function isTelegramOAuthConfigured(): boolean {
  return Boolean(telegramBotNumericId() && telegramOidcClientSecret());
}

export function resolveTelegramOAuthRedirectUri(): string {
  const raw =
    process.env.TELEGRAM_OAUTH_REDIRECT_URI?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://www.efir-ai.ru';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    u.pathname = '/v1/public/oauth/telegram/callback-bridge';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return 'https://www.efir-ai.ru/v1/public/oauth/telegram/callback-bridge';
  }
}

export function oauthNativeBridgeHtml(queryString: string): string {
  const qs = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  const deeplink = `efirai://oauth/telegram${qs ? `?${qs}` : ''}`;
  const esc = deeplink.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const js = JSON.stringify(deeplink);
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Эфир AI</title>
<script>setTimeout(function(){location.replace(${js});},120);</script>
</head><body style="margin:0;font-family:system-ui,sans-serif;text-align:center;padding:48px 20px;background:#0f0f13;color:#e8eaed">
<p style="font-size:17px;margin-bottom:16px">Возвращаем в приложение…</p>
<p><a href="${esc}" style="color:#a855f7;font-size:16px;text-decoration:none;font-weight:600">Открыть Эфир AI</a></p>
</body></html>`;
}

export async function exchangeTelegramOidcCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ ok: true; idToken: string } | { ok: false; error: string }> {
  const clientId = telegramBotNumericId();
  const clientSecret = telegramOidcClientSecret();
  if (!clientId || !clientSecret) {
    console.warn('[telegram-oauth] exchange skipped: oauth_not_configured');
    return { ok: false, error: 'oauth_not_configured' };
  }

  console.info('[telegram-oauth] token exchange start client_id=%s redirect=%s', clientId, redirectUri);

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  try {
    const resp = await fetch('https://oauth.telegram.org/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body,
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.warn('[telegram-oauth] token failed status=%s body=%s', resp.status, text.slice(0, 400));
      return { ok: false, error: 'telegram_token_failed' };
    }
    const json = JSON.parse(text) as { id_token?: string };
    const idToken = json.id_token?.trim();
    if (!idToken) {
      console.warn('[telegram-oauth] token response missing id_token');
      return { ok: false, error: 'telegram_token_failed' };
    }
    console.info('[telegram-oauth] token ok id_token_len=%s', idToken.length);
    return { ok: true, idToken };
  } catch (err) {
    console.warn('[telegram-oauth] token exception: %s', err instanceof Error ? err.message : err);
    return { ok: false, error: 'telegram_oauth_error' };
  }
}

export async function verifyTelegramIdToken(
  idToken: string,
): Promise<{ ok: true; telegramId: number; username?: string } | { ok: false; error: string }> {
  const clientId = telegramBotNumericId();
  if (!clientId) {
    return { ok: false, error: 'oauth_not_configured' };
  }
  try {
    const { payload } = await jwtVerify(idToken, JWKS, {
      audience: clientId,
      issuer: 'https://oauth.telegram.org',
    });
    const rawId = payload.sub ?? payload.id;
    const telegramId = typeof rawId === 'number' ? rawId : parseInt(String(rawId ?? ''), 10);
    if (!Number.isFinite(telegramId) || telegramId <= 0) {
      console.warn('[telegram-oauth] id_token bad uid payload=%j', payload);
      return { ok: false, error: 'invalid_user' };
    }
    const username =
      typeof payload.preferred_username === 'string'
        ? payload.preferred_username
        : typeof payload.username === 'string'
          ? payload.username
          : undefined;
    console.info('[telegram-oauth] id_token ok telegram_id=%s username=%s', telegramId, username ?? '-');
    return { ok: true, telegramId, username };
  } catch (err) {
    console.warn('[telegram-oauth] id_token verify failed: %s', err instanceof Error ? err.message : err);
    return { ok: false, error: 'bad_id_token' };
  }
}
