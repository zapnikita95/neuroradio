/** Reads Media Session from supported players and forwards track to BFF (MVP). */
function readMediaSession() {
  const md = navigator.mediaSession?.metadata;
  if (!md) return null;
  const artist = md.artist?.trim() || '';
  const title = md.title?.trim() || '';
  if (!artist || !title) return null;
  return { artist, title };
}

function pollTrack() {
  const track = readMediaSession();
  if (!track) return;
  chrome.runtime.sendMessage({ type: 'track', ...track });
}

setInterval(pollTrack, 4000);
pollTrack();
