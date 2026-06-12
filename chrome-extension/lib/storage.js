export const DEFAULT_BACKEND =
  'https://music-story-production.up.railway.app';

export const DEFAULT_SETTINGS = {
  backendUrl: DEFAULT_BACKEND,
  installId: '',
  desktopAuthSecret: '',
  accessToken: '',
  tokenExpiresAt: 0,
  manualMode: false,
  autoIntercept: true,
  triggerMode: 'EVERY_N_TRACKS',
  everyNTracks: 10,
  sameTrackStoryEveryN: 3,
  storyLength: '60s',
  storyNarrator: 'auto',
  ttsVoice: 'auto',
  ttsSpeed: 'normal',
  ttsEmotion: 'good',
  email: '',
  accountLinked: false,
  profileEmail: '',
  profilePlan: 'free',
  profilePremiumUntil: 0,
};

export async function loadSettings() {
  const keys = Object.keys(DEFAULT_SETTINGS);
  const data = await chrome.storage.sync.get(keys);
  const merged = { ...DEFAULT_SETTINGS, ...data };
  if (!merged.installId) {
    merged.installId = crypto.randomUUID();
    await saveSettings(merged);
  }
  return merged;
}

export async function patchSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  await saveSettings(next);
  return next;
}

export async function saveSettings(settings) {
  await chrome.storage.sync.set(settings);
}
