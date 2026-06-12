export const DEFAULT_BACKEND = 'https://www.efir-ai.ru';

const LEGACY_BACKEND = 'https://music-story-production.up.railway.app';

export const DEFAULT_SETTINGS = {
  backendUrl: DEFAULT_BACKEND,
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

const SYNC_KEYS = Object.keys(DEFAULT_SETTINGS);

export async function loadSettings() {
  const data = await chrome.storage.sync.get(SYNC_KEYS);
  const local = await chrome.storage.local.get(['installId']);
  const merged = { ...DEFAULT_SETTINGS, ...data, installId: local.installId || '' };

  if (!merged.installId) {
    merged.installId = crypto.randomUUID();
    await chrome.storage.local.set({ installId: merged.installId });
  }

  if (!merged.backendUrl?.trim() || merged.backendUrl === LEGACY_BACKEND) {
    merged.backendUrl = DEFAULT_BACKEND;
    await chrome.storage.sync.set({ backendUrl: DEFAULT_BACKEND });
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
  const syncPart = { ...settings };
  delete syncPart.installId;
  await chrome.storage.sync.set(syncPart);
}
