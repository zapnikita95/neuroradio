/** MVP: log now-playing from content scripts; full story trigger needs JWT from popup config. */
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'track') return;
  console.log('[Music Story]', msg.artist, '—', msg.title);
  chrome.storage.sync.get(['backendUrl', 'installId'], (cfg) => {
    if (!cfg.backendUrl) return;
    // POST /v1/story/full requires app JWT — extension uses same installId + /v1/auth/token flow (TODO).
  });
});
