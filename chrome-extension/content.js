/** Reads now-playing from Media Session (+ fallbacks) and forwards to extension background. */

/** @type {string[]} */
let pausedMedia = [];

function canExtensionApi() {
  try {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}

function safeSendMessage(payload) {
  if (!canExtensionApi()) return;
  try {
    chrome.runtime.sendMessage(payload);
  } catch {
    /* extension context invalidated — refresh the music tab */
  }
}

function splitArtistTitle(raw) {
  const text = raw.trim();
  if (!text) return { artist: '', title: '' };
  const dash = text.includes(' — ') ? ' — ' : text.includes(' - ') ? ' - ' : null;
  if (!dash) return { artist: '', title: text };
  const idx = text.indexOf(dash);
  return {
    artist: text.slice(0, idx).trim(),
    title: text.slice(idx + dash.length).trim(),
  };
}

function readMediaSession() {
  const md = navigator.mediaSession?.metadata;
  if (!md) return null;

  let artist = md.artist?.trim() || '';
  let title = md.title?.trim() || '';
  const album = md.album?.trim() || '';

  if (!title && album) title = album;
  if (!artist && title) {
    const split = splitArtistTitle(title);
    if (split.artist) {
      artist = split.artist;
      title = split.title;
    }
  }
  if (!title && artist) {
    const split = splitArtistTitle(artist);
    if (split.title) {
      artist = split.artist;
      title = split.title;
    }
  }
  if (!title) return null;
  if (!artist) artist = 'Unknown Artist';

  let isPlaying = navigator.mediaSession.playbackState === 'playing';
  if (navigator.mediaSession.playbackState === 'none' || !navigator.mediaSession.playbackState) {
    isPlaying = [...document.querySelectorAll('audio, video')].some((el) => !el.paused);
  }
  return { artist, title, album, isPlaying };
}

function textFrom(el) {
  if (!el) return '';
  return (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
}

function readYandexMusic() {
  const titleSelectors = [
    '[data-test-id="track-title"]',
    '[data-test-id="player-track-title"]',
    '[data-test-id="player-title"]',
    '.track-type-link_title',
    '.player-controls__title',
    '[class*="PlayerTrackTitle"]',
    '[class*="TrackTitle"]',
    '.player-controls_root [class*="title"]',
    'a[href*="/album/"][href*="/track/"]',
  ];
  const artistSelectors = [
    '[data-test-id="track-artist"]',
    '[data-test-id="player-track-artist"]',
    '[data-test-id="player-artist"]',
    '.track-type-link_artist',
    '.player-controls__artist',
    '[class*="PlayerTrackArtist"]',
    '[class*="TrackArtists"]',
    '.player-controls_root [class*="artist"]',
    'a[href*="/artist/"]',
  ];

  let title = '';
  let artist = '';
  for (const sel of titleSelectors) {
    title = textFrom(document.querySelector(sel));
    if (title) break;
  }
  for (const sel of artistSelectors) {
    artist = textFrom(document.querySelector(sel));
    if (artist) break;
  }

  if (!title) {
    const og = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
    if (og) {
      const split = splitArtistTitle(og);
      artist = split.artist || artist;
      title = split.title || og;
    }
  }

  if (!artist || !title) return null;

  const isPlaying =
    [...document.querySelectorAll('audio, video')].some((el) => !el.paused) ||
    navigator.mediaSession?.playbackState === 'playing';

  return { artist, title, album: '', isPlaying };
}

function readDomFallback() {
  const host = location.hostname;
  if (host.includes('music.yandex')) return readYandexMusic();

  if (host.includes('open.spotify.com')) {
    const titleEl = document.querySelector('[data-testid="context-item-link"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitle"]');
    const artist = textFrom(artistEl);
    const title = textFrom(titleEl);
    if (artist && title) {
      return { artist, title, album: '', isPlaying: true };
    }
  }

  if (host.includes('youtube.com')) {
    const titleEl = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string, #title yt-formatted-string',
    );
    const title = textFrom(titleEl);
    const channel =
      textFrom(document.querySelector('#channel-name a, ytd-channel-name a, #owner #channel-name')) ||
      '';
    if (title && channel) {
      const isPlaying =
        [...document.querySelectorAll('video')].some((el) => !el.paused) ||
        navigator.mediaSession?.playbackState === 'playing';
      return { artist: channel, title, album: '', isPlaying };
    }
  }
  return null;
}

function readTrack() {
  const fromSession = readMediaSession();
  if (fromSession) return fromSession;
  return readDomFallback();
}

let lastKey = '';

function pollTrack() {
  const track = readTrack();
  if (!track) return;
  const key = `${track.artist}|${track.title}|${track.isPlaying}`;
  if (key === lastKey) return;
  lastKey = key;
  safeSendMessage({
    type: 'track',
    artist: track.artist,
    title: track.title,
    album: track.album,
    isPlaying: track.isPlaying,
    url: location.href,
  });
}

if (canExtensionApi()) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'get-track') {
      sendResponse(readTrack());
      return true;
    }
    if (msg?.type === 'pause-media') {
      pausedMedia = [];
      document.querySelectorAll('audio, video').forEach((el) => {
        if (!el.paused) {
          pausedMedia.push(el);
          el.pause();
        }
      });
      return;
    }
    if (msg?.type === 'resume-media') {
      for (const el of pausedMedia) {
        try {
          void el.play();
        } catch {
          /* ignore */
        }
      }
      pausedMedia = [];
    }
    return false;
  });

  if (!window.__efirAiTrackPoller) {
    window.__efirAiTrackPoller = true;
    setInterval(pollTrack, 2000);
    pollTrack();

    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.setActionHandler('play', () => setTimeout(pollTrack, 300));
        navigator.mediaSession.setActionHandler('pause', () => setTimeout(pollTrack, 300));
      } catch {
        /* some pages restrict setActionHandler */
      }
    }
  }
}
