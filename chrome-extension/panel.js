import {
  TTS_VOICES,
  STORY_NARRATORS,
  TTS_SPEEDS,
  TTS_EMOTIONS,
  STORY_LENGTHS,
  TRIGGER_MODES,
} from './lib/presets.js';

function send(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

function fillSelect(el, items, valueKey = 'id', labelKey = 'label') {
  el.innerHTML = '';
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    el.appendChild(opt);
  }
}

function showToast(el, text, isError = false) {
  el.textContent = text || '';
  el.classList.toggle('error', isError);
}

function planLabel(plan) {
  if (plan === 'premium') return 'Premium';
  if (plan === 'trial') return 'Пробный период';
  if (plan === 'free') return 'Free';
  return plan || 'Free';
}

function formatPlanLine(plan, until) {
  const label = planLabel(plan);
  if (plan === 'premium' || plan === 'trial') {
    if (until) {
      return `Тариф: ${label} до ${new Date(until).toLocaleDateString('ru')}`;
    }
    return `Тариф: ${label}`;
  }
  return `Тариф: ${label}`;
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.panel').forEach((p) => {
    p.classList.toggle('active', p.id === `panel-${name}`);
  });
  if (name === 'history') void loadHistoryUi();
}

document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Populate selects
fillSelect(document.getElementById('storyNarrator'), STORY_NARRATORS);
fillSelect(document.getElementById('storyLength'), STORY_LENGTHS);
fillSelect(document.getElementById('ttsVoice'), TTS_VOICES);
fillSelect(document.getElementById('ttsSpeed'), TTS_SPEEDS);
fillSelect(document.getElementById('ttsEmotion'), TTS_EMOTIONS);
fillSelect(document.getElementById('triggerMode'), TRIGGER_MODES);

const els = {
  vinyl: document.getElementById('vinyl'),
  trackTitle: document.getElementById('track-title'),
  trackArtist: document.getElementById('track-artist'),
  statusDot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text'),
  quotaLine: document.getElementById('quota-line'),
  scriptCard: document.getElementById('script-card'),
  scriptText: document.getElementById('script-text'),
  btnTell: document.getElementById('btn-tell'),
  btnStop: document.getElementById('btn-stop'),
  homeToast: document.getElementById('home-toast'),
  profileLine: document.getElementById('profile-line'),
  accountToast: document.getElementById('account-toast'),
  voiceToast: document.getElementById('voice-toast'),
};

function renderState(data) {
  if (!data) return;

  if (data.currentTrack?.title) {
    els.trackTitle.textContent = data.currentTrack.title;
    els.trackArtist.textContent = data.currentTrack.artist;
  } else {
    els.trackTitle.textContent = 'Откройте плеер';
    els.trackArtist.textContent = 'Яндекс · Spotify · YouTube';
  }

  const stateMap = {
    LISTENING: 'Слушаю…',
    FETCHING: 'Генерация + озвучка…',
    PLAYING: 'Озвучка…',
    ERROR: data.errorMessage || 'Ошибка',
    IDLE: 'Ожидание',
  };
  let status = stateMap[data.state] || data.state;
  if (
    data.tracksUntilNext != null &&
    data.state === 'LISTENING' &&
    !data.settings?.manualMode
  ) {
    status += ` · авто через ${data.tracksUntilNext} тр.`;
  }
  els.statusText.textContent = status;

  els.statusDot.className = 'dot';
  if (data.state === 'FETCHING' || data.state === 'PLAYING') {
    els.statusDot.classList.add('busy');
    els.vinyl.classList.remove('paused');
  } else if (data.state === 'ERROR') {
    els.statusDot.classList.add('error');
    els.vinyl.classList.add('paused');
  } else {
    els.vinyl.classList.toggle('paused', !data.currentTrack?.isPlaying);
  }

  if (data.lastStory?.quota) {
    const q = data.lastStory.quota;
    els.quotaLine.innerHTML = `Лимит: <strong>${q.remaining ?? '—'}</strong> / ${q.limit ?? '—'}`;
  } else if (data.settings?.profilePlan) {
    els.quotaLine.textContent = formatPlanLine(
      data.settings.profilePlan,
      data.settings.profilePremiumUntil,
    );
  }

  if (data.lastStory?.script) {
    els.scriptCard.hidden = false;
    els.scriptText.textContent = data.lastStory.script;
  }

  if (data.settings) {
    applySettingsToForm(data.settings);
    const email = data.settings.profileEmail || data.settings.email;
    if (email) {
      els.profileLine.innerHTML = `Аккаунт: <strong>${email}</strong> · ${planLabel(data.settings.profilePlan)}`;
    }
  }

  els.btnTell.disabled =
    !data.currentTrack?.isPlaying ||
    data.state === 'FETCHING' ||
    data.state === 'PLAYING';
}

function applySettingsToForm(s) {
  document.getElementById('storyNarrator').value = s.storyNarrator || 'auto';
  document.getElementById('storyLength').value = s.storyLength || '60s';
  document.getElementById('ttsVoice').value = s.ttsVoice || 'auto';
  document.getElementById('ttsSpeed').value = s.ttsSpeed || 'normal';
  document.getElementById('ttsEmotion').value = s.ttsEmotion || 'good';
  document.getElementById('triggerMode').value = s.triggerMode || 'EVERY_N_TRACKS';
  document.getElementById('everyNTracks').value = s.everyNTracks ?? 10;
  document.getElementById('manualMode').checked = Boolean(s.manualMode);
  document.getElementById('email').value = s.email || s.profileEmail || '';
}

function settingsPatchFromForm() {
  return {
    storyNarrator: document.getElementById('storyNarrator').value,
    storyLength: document.getElementById('storyLength').value,
    ttsVoice: document.getElementById('ttsVoice').value,
    ttsSpeed: document.getElementById('ttsSpeed').value,
    ttsEmotion: document.getElementById('ttsEmotion').value,
    triggerMode: document.getElementById('triggerMode').value,
    everyNTracks: parseInt(document.getElementById('everyNTracks').value, 10) || 10,
    manualMode: document.getElementById('manualMode').checked,
  };
}

async function loadHistoryUi() {
  const res = await send('get-history');
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  if (!res?.items?.length) {
    list.innerHTML = '<p class="hint">Пока пусто — запустите историю на вкладке «Эфир».</p>';
    return;
  }
  for (const item of res.items) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `<strong>${item.artist} — ${item.title}</strong><span>${new Date(item.playedAt).toLocaleString('ru')}</span>`;
    div.addEventListener('click', () => {
      els.scriptCard.hidden = false;
      els.scriptText.textContent = item.script;
      switchTab('home');
    });
    list.appendChild(div);
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'state') renderState(msg);
});

els.btnTell.addEventListener('click', () => {
  void send('manual-story').then(() => send('get-state').then(renderState));
});

els.btnStop.addEventListener('click', () => {
  void send('stop-story').then(() => send('get-state').then(renderState));
});

document.getElementById('btn-save-voice').addEventListener('click', async () => {
  const res = await send('save-settings', { patch: settingsPatchFromForm() });
  if (res?.ok) showToast(els.voiceToast, 'Сохранено');
  else showToast(els.voiceToast, res?.error || 'Ошибка', true);
  const state = await send('get-state');
  renderState(state);
});

document.getElementById('btn-email-start').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const res = await send('email-start', { email });
  if (res?.ok) showToast(els.accountToast, 'Код отправлен');
  else showToast(els.accountToast, res?.error || 'Ошибка', true);
});

document.getElementById('btn-email-verify').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const code = document.getElementById('emailCode').value.trim();
  const res = await send('email-verify', { email, code });
  if (res?.ok) {
    showToast(els.accountToast, 'Вход выполнен');
    await send('fetch-profile');
    await send('sync-pull');
    const state = await send('get-state');
    renderState(state);
  } else {
    showToast(els.accountToast, res?.error || 'Ошибка', true);
  }
});

document.getElementById('btn-sync').addEventListener('click', async () => {
  const res = await send('sync-pull');
  if (res?.ok) showToast(els.accountToast, 'Настройки синхронизированы');
  else showToast(els.accountToast, res?.error || 'Ошибка', true);
  const state = await send('get-state');
  renderState(state);
});

document.getElementById('btn-clear-history').addEventListener('click', async () => {
  await send('clear-history');
  await loadHistoryUi();
});

void send('get-state').then(renderState);
void send('fetch-profile').then(() => send('get-state').then(renderState));
setInterval(() => void send('get-state').then(renderState), 2500);
