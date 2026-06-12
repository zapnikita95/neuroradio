/** Offscreen document — plays story audio (MV3 service worker cannot use Audio). */
let player = null;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;

  if (msg.type === 'play-audio') {
    const url = msg.url;
    if (!url) {
      sendResponse({ ok: false, error: 'no url' });
      return true;
    }
    try {
      if (player) {
        player.pause();
        player = null;
      }
      player = new Audio(url);
      player.addEventListener('ended', () => {
        chrome.runtime.sendMessage({ type: 'story-ended' }).catch(() => undefined);
      });
      player.addEventListener('error', () => {
        chrome.runtime.sendMessage({
          type: 'story-error',
          error: 'Не удалось воспроизвести аудио',
        }).catch(() => undefined);
      });
      void player.play().then(() => sendResponse({ ok: true })).catch((err) => {
        sendResponse({ ok: false, error: err?.message || 'play failed' });
      });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'play failed' });
    }
    return true;
  }

  if (msg.type === 'stop-audio') {
    if (player) {
      player.pause();
      player = null;
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});
