import { loadSettings, patchSettings } from './lib/storage.js';
import {
  fetchStory,
  fetchProfile,
  pullSyncSettings,
  resolveAudioUrl,
  checkHealth,
} from './lib/api.js';
import { addHistory, loadHistory, clearHistory } from './lib/history.js';
import { TriggerEngine } from './lib/trigger-engine.js';

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
});

const MUSIC_TAB_PATTERNS = [
  '*://music.yandex.ru/*',
  '*://music.yandex.com/*',
  '*://open.spotify.com/*',
  '*://www.youtube.com/*',
  '*://music.youtube.com/*',
];

const triggerEngine = new TriggerEngine();

/** @type {'IDLE' | 'LISTENING' | 'FETCHING' | 'PLAYING' | 'ERROR'} */
let state = 'LISTENING';
let currentTrack = null;
let lastStory = null;
let errorMessage = null;
let busy = false;
/** @type {string[]} */
let previousScripts = [];
let playbackSession = 0;

function displayKey(artist, title) {
  return `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
}

async function publishState() {
  const settings = await awaitSettingsCache();
  const tracksUntilNext = triggerEngine.tracksUntilNext({
    mode: settings.triggerMode,
    everyNTracks: settings.everyNTracks,
    autoIntercept: settings.autoIntercept,
  });
  const snapshot = {
    state,
    currentTrack,
    lastStory,
    errorMessage,
    tracksUntilNext,
    settings,
  };
  chrome.runtime.sendMessage({ type: 'state', ...snapshot }).catch(() => undefined);
  return snapshot;
}

let settingsCache = null;
async function awaitSettingsCache() {
  if (!settingsCache) settingsCache = await loadSettings();
  return settingsCache;
}

async function refreshSettings() {
  settingsCache = await loadSettings();
  return settingsCache;
}

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length > 0) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play Music Story narration audio',
  });
}

async function pauseTabMedia(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'pause-media' });
  } catch {
    /* tab may not have content script */
  }
}

async function resumeTabMedia(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'resume-media' });
  } catch {
    /* ignore */
  }
}

async function playStoryAudio(url) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'play-audio',
    url,
  });
}

async function stopStoryAudio() {
  try {
    await chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-audio' });
  } catch {
    /* offscreen may be closed */
  }
}

async function playStoryForTrack(track, manual = false) {
  if (busy || !track?.artist || !track?.title) return;
  const settings = await refreshSettings();
  if (!settings.backendUrl?.trim()) {
    errorMessage = 'Укажите URL бэкенда в настройках расширения';
    state = 'ERROR';
    publishState();
    return;
  }

  busy = true;
  playbackSession += 1;
  const session = playbackSession;
  state = 'FETCHING';
  errorMessage = null;
  publishState();

  try {
    const story = await fetchStory(settings, {
      artist: track.artist,
      title: track.title,
      previousScripts,
    });
    if (session !== playbackSession) return;

    lastStory = story;
    if (story.script?.trim()) {
      previousScripts = [...previousScripts.slice(-8), story.script.trim()];
    }

    const audioUrl = resolveAudioUrl(settings, story.audioUrl);
    if (!audioUrl) {
      throw new Error('Сервер не вернул audioUrl — проверь Yandex TTS на Railway');
    }

    state = 'PLAYING';
    publishState();
    await pauseTabMedia(track.tabId);

    const playResult = await playStoryAudio(audioUrl);
    if (!playResult?.ok) {
      throw new Error(playResult?.error || 'Ошибка воспроизведения');
    }

    await addHistory({
      trackKey: track.displayKey || displayKey(track.artist, track.title),
      artist: track.artist,
      title: track.title,
      script: story.script || '',
      playedAt: Date.now(),
      audioUrl,
    });
  } catch (err) {
    if (session !== playbackSession) return;
    errorMessage = err instanceof Error ? err.message : String(err);
    state = 'ERROR';
    console.error('[Music Story]', errorMessage);
    await resumeTabMedia(track.tabId);
    publishState();
  } finally {
    busy = false;
  }
}

async function requestTrackFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'get-track' });
  } catch {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tabId, { type: 'get-track' });
    } catch {
      return null;
    }
  }
}

async function pollMusicTabs() {
  const tabs = await chrome.tabs.query({ url: MUSIC_TAB_PATTERNS });
  const ordered = [...tabs].sort((a, b) => Number(b.active) - Number(a.active));
  let fallback = null;

  for (const tab of ordered) {
    if (!tab.id) continue;
    const track = await requestTrackFromTab(tab.id);
    if (!track?.artist || !track?.title) continue;
    const payload = {
      artist: track.artist,
      title: track.title,
      album: track.album || '',
      isPlaying: track.isPlaying !== false,
      tabId: tab.id,
      url: tab.url || '',
    };
    if (track.isPlaying !== false) {
      await onTrackUpdate(payload);
      return;
    }
    if (!fallback) fallback = payload;
  }

  if (fallback) await onTrackUpdate(fallback);
}

async function onTrackUpdate(msg) {
  const artist = msg.artist?.trim();
  const title = msg.title?.trim();
  if (!artist || !title) return;

  const isPlaying = msg.isPlaying !== false;
  const key = displayKey(artist, title);
  const track = {
    artist,
    title,
    album: msg.album?.trim() || '',
    displayKey: key,
    isPlaying,
    tabId: msg.tabId,
    url: msg.url || '',
  };

  const changed =
    !currentTrack ||
    currentTrack.displayKey !== key ||
    currentTrack.isPlaying !== isPlaying;

  currentTrack = track;
  if (!changed) return;

  if (!isPlaying) {
    publishState();
    return;
  }

  state = 'LISTENING';
  errorMessage = null;
  const settings = await refreshSettings();

  if (settings.manualMode) {
    publishState();
    return;
  }

  const shouldPlay = triggerEngine.onTrackPlayed(
    {
      mode: settings.triggerMode,
      autoIntercept: settings.autoIntercept,
      everyNTracks: settings.everyNTracks,
      sameTrackStoryEveryN: settings.sameTrackStoryEveryN,
      specificArtists: [],
      specificGenres: [],
    },
    key,
    artist,
    null,
  );

  publishState();

  if (shouldPlay && !busy) {
    await playStoryForTrack(track, false);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'track') {
    void onTrackUpdate({ ...msg, tabId: sender.tab?.id });
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'get-state') {
    void publishState().then(sendResponse);
    return true;
  }

  if (msg?.type === 'save-settings') {
    void patchSettings(msg.patch || {})
      .then(() => refreshSettings())
      .then(() => publishState())
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg?.type === 'manual-story') {
    void playStoryForTrack(currentTrack, true).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === 'stop-story') {
    playbackSession += 1;
    busy = false;
    void stopStoryAudio();
    void resumeTabMedia(currentTrack?.tabId);
    state = 'LISTENING';
    errorMessage = null;
    publishState();
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'email-start') {
    void refreshSettings()
      .then((s) => import('./lib/api.js').then((api) => api.startEmailLogin(s, msg.email)))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg?.type === 'email-verify') {
    void refreshSettings()
      .then((s) => import('./lib/api.js').then((api) => api.verifyEmailLogin(s, msg.email, msg.code)))
      .then(() => refreshSettings())
      .then((s) => fetchProfile(s))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg?.type === 'sync-pull') {
    void refreshSettings()
      .then((s) => pullSyncSettings(s))
      .then(() => refreshSettings())
      .then(() => publishState())
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg?.type === 'check-health') {
    void refreshSettings()
      .then((s) => checkHealth(s))
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (msg?.type === 'fetch-profile') {
    void refreshSettings()
      .then((s) => fetchProfile(s))
      .then(() => refreshSettings())
      .then(() => publishState())
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg?.type === 'get-history') {
    void loadHistory().then((items) => sendResponse({ items }));
    return true;
  }

  if (msg?.type === 'clear-history') {
    void clearHistory().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg?.type === 'open-panel') {
    void chrome.windows
      .getCurrent()
      .then((w) => chrome.sidePanel.open({ windowId: w.id }))
      .catch(() => undefined);
    sendResponse({ ok: true });
    return false;
  }

  if (msg?.type === 'story-ended') {
    void resumeTabMedia(currentTrack?.tabId);
    state = 'LISTENING';
    publishState();
    return false;
  }

  if (msg?.type === 'story-error') {
    errorMessage = msg.error || 'Ошибка воспроизведения';
    state = 'ERROR';
    void resumeTabMedia(currentTrack?.tabId);
    publishState();
    return false;
  }

  return false;
});

setInterval(() => {
  void pollMusicTabs();
}, 2000);

void refreshSettings().then((s) => {
  if (s.accountLinked || s.email) {
    void pullSyncSettings(s).catch(() => undefined);
  }
  publishState();
  void pollMusicTabs();
});
