import { loadSettings, patchSettings } from './storage.js';
import { speedValue } from './presets.js';

const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

function baseUrl(settings) {
  return settings.backendUrl.replace(/\/$/, '');
}

export async function ensureAccessToken(settings) {
  const now = Date.now();
  if (
    settings.accessToken &&
    settings.tokenExpiresAt > now + TOKEN_REFRESH_MARGIN_MS
  ) {
    return settings.accessToken;
  }

  const body = {
    install_id: settings.installId,
    client_type: 'extension',
    desktop_secret: settings.desktopAuthSecret || '',
  };

  const res = await fetch(`${baseUrl(settings)}/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Auth ${res.status}: ${text.slice(0, 160)}`);
  }

  const data = await res.json();
  const expiresAt = now + (data.expires_in ?? 7776000) * 1000;
  await patchSettings({
    accessToken: data.access_token,
    tokenExpiresAt: expiresAt,
  });
  return data.access_token;
}

export async function authFetch(settings, path, init = {}) {
  const token = await ensureAccessToken(settings);
  return fetch(`${baseUrl(settings)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
}

export async function checkHealth(settings) {
  try {
    const res = await fetch(`${baseUrl(settings)}/health`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function fetchStory(settings, params) {
  const res = await authFetch(settings, '/v1/story/full', {
    method: 'POST',
    body: JSON.stringify({
      artist: params.artist,
      title: params.title,
      previous_scripts: params.previousScripts ?? [],
      story_length: settings.storyLength || '60s',
      story_narrator: settings.storyNarrator || 'auto',
      tts_voice: settings.ttsVoice || 'auto',
      tts_speed: speedValue(settings.ttsSpeed),
      tts_emotion: settings.ttsEmotion || 'good',
      client_platform: 'extension',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) {
      throw new Error('Лимит историй исчерпан. Войдите по email с подпиской.');
    }
    throw new Error(`Сервер ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

export function resolveAudioUrl(settings, audioUrl) {
  if (!audioUrl) return null;
  if (audioUrl.startsWith('http')) return audioUrl;
  const base = baseUrl(settings);
  return `${base}${audioUrl.startsWith('/') ? '' : '/'}${audioUrl}`;
}

export async function startEmailLogin(settings, email) {
  const res = await authFetch(settings, '/v1/account/email/start', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Email start ${res.status}`);
  return data;
}

export async function verifyEmailLogin(settings, email, code) {
  const res = await authFetch(settings, '/v1/account/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Email verify ${res.status}`);
  await patchSettings({ email, accountLinked: true });
  return data;
}

export async function fetchProfile(settings) {
  const res = await authFetch(settings, '/v1/account/profile');
  if (!res.ok) return null;
  const data = await res.json();
  await patchSettings({
    profileEmail: data.email || settings.email || '',
    profilePlan: data.plan || data.entitlement?.plan || 'free',
    profilePremiumUntil: data.premiumUntil || data.entitlement?.premiumUntil || 0,
    accountLinked: Boolean(data.email || data.linked),
  });
  return data;
}

export async function claimWelcomeTrial(settings) {
  const res = await authFetch(settings, '/v1/account/welcome-device', {
    method: 'POST',
    body: JSON.stringify({ device_fingerprint: 'extension' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Trial failed');
  return data;
}

export async function pullSyncSettings(settings) {
  const res = await authFetch(settings, '/v1/sync/status');
  if (!res.ok) return null;
  const data = await res.json();
  if (data.linked && data.settings) {
    const s = data.settings;
    await patchSettings({
      manualMode: s.manualMode ?? settings.manualMode,
      autoIntercept: s.autoIntercept ?? settings.autoIntercept,
      triggerMode: s.triggerMode ?? settings.triggerMode,
      everyNTracks: s.everyNTracks ?? settings.everyNTracks,
      sameTrackStoryEveryN: s.sameTrackStoryEveryN ?? settings.sameTrackStoryEveryN,
      storyLength: s.storyLength ?? settings.storyLength,
      accountLinked: true,
    });
  }
  return data;
}
