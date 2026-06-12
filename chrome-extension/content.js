/** Reads now-playing from Media Session (+ fallbacks) and forwards to extension background. */

/** @type {string[]} */
let pausedMedia = [];

function readMediaSession() {
  const md = navigator.mediaSession?.metadata;
  if (!md) return null;
  const artist = md.artist?.trim() || '';
  const title = md.title?.trim() || '';
  if (!artist || !title) return null;
  const album = md.album?.trim() || '';
  let isPlaying = navigator.mediaSession.playbackState === 'playing';
  if (navigator.mediaSession.playbackState === 'none') {
    isPlaying = [...document.querySelectorAll('audio, video')].some((el) => !el.paused);
  }
  return { artist, title, album, isPlaying };
}

/** Yandex Music / Spotify DOM fallbacks when Media Session is empty. */
function readDomFallback() {
  const host = location.hostname;
  if (host.includes('music.yandex')) {
    const titleEl =
      document.querySelector('[class*="TrackTitle"]') ||
      document.querySelector('.track-type-link_title') ||
      document.querySelector('[data-test-id="track-title"]');
    const artistEl =
      document.querySelector('[class*="TrackArtists"]') ||
      document.querySelector('.track-type-link_artist') ||
      document.querySelector('[data-test-id="track-artist"]');
    const artist = artistEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';
    if (artist && title) {
      return { artist, title, album: '', isPlaying: true };
    }
  }
  if (host.includes('open.spotify.com')) {
    const titleEl = document.querySelector('[data-testid="context-item-link"]');
    const artistEl = document.querySelector('[data-testid="context-item-info-subtitle"]');
    const artist = artistEl?.textContent?.trim() || '';
    const title = titleEl?.textContent?.trim() || '';
    if (artist && title) {
      return { artist, title, album: '', isPlaying: true };
    }
  }
  if (host.includes('youtube.com')) {
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string');
    const title = titleEl?.textContent?.trim() || '';
    const channel = document.querySelector('#channel-name a, ytd-channel-name a')?.textContent?.trim() || '';
    if (title && channel) {
      return { artist: channel, title, album: '', isPlaying: true };
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
  chrome.runtime.sendMessage({
    type: 'track',
    artist: track.artist,
    title: track.title,
    album: track.album,
    isPlaying: track.isPlaying,
    url: location.href,
  });
}

chrome.runtime.onMessage.addListener((msg) => {
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
});

setInterval(pollTrack, 2000);
pollTrack();

// Media Session updates fire faster than polling
if (navigator.mediaSession) {
  try {
    navigator.mediaSession.setActionHandler('play', () => setTimeout(pollTrack, 300));
    navigator.mediaSession.setActionHandler('pause', () => setTimeout(pollTrack, 300));
  } catch {
    /* some pages restrict setActionHandler */
  }
}
