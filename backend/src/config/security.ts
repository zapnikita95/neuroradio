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
    storyBurstPerInstallPerMinute: 2,

    ipGlobalPerHour: 80,
    healthPerIpPerMinute: 30,
  },
} as const;

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}
