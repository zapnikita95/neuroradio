const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const SECURITY = {
  jsonBodyLimit: process.env.JSON_BODY_LIMIT?.trim() || '32kb',

  maxArtistLength: 200,
  maxTitleLength: 200,
  maxPreviousScripts: 8,
  maxPreviousScriptLength: 2500,

  audioUrlTtlSec: parseInt(process.env.AUDIO_URL_TTL_SECONDS ?? '3600', 10),

  /** Debug signing cert only when explicitly allowed (disable on public Play release). */
  allowDebugCert: process.env.ALLOW_DEBUG_CERT?.trim() !== 'false',

  limits: {
    authPerIpPerMinute: 5,
    authPerIpPerDay: 40,
    authPerInstallPerDay: 12,

    storyPerInstallPerHour: 10,
    /** Free tier on shared server Groq + Yandex TTS */
    storyPerInstallPerDay: parseInt(process.env.FREE_STORY_DAILY_LIMIT ?? '10', 10),
    /** Per-minute cap on /v1/story/full — not Gemini RPM */
    storyBurstPerInstallPerMinute: 6,

    ipGlobalPerHour: 80,
    healthPerIpPerMinute: 30,
  },
} as const;

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Dev phone — без лимитов на shared Groq/TTS сервере. */
const BUILTIN_UNLIMITED_INSTALL_IDS = [
  'f68bc60f-f229-4195-a5a5-201c7d667e7a',
];

export function getUnlimitedInstallIds(): ReadonlySet<string> {
  const ids = new Set<string>(BUILTIN_UNLIMITED_INSTALL_IDS.map((id) => id.toLowerCase()));
  const raw = process.env.UNLIMITED_INSTALL_IDS?.trim();
  if (raw) {
    for (const part of raw.split(',')) {
      const id = part.trim().toLowerCase();
      if (UUID_RE.test(id)) ids.add(id);
    }
  }
  return ids;
}

export function isUnlimitedInstall(installId: string): boolean {
  const normalized = installId.trim().toLowerCase();
  if (!normalized || normalized === 'unknown') return false;
  return getUnlimitedInstallIds().has(normalized);
}
