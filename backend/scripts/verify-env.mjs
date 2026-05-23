import 'dotenv/config';
import fetch from 'node-fetch';

function mask(value) {
  if (!value) return '(пусто)';
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} симв.)`;
}

const groqKey = process.env.GROQ_API_KEY?.trim() ?? '';
const yandexKey = process.env.YANDEX_API_KEY?.trim() ?? '';
const folderId = process.env.YANDEX_FOLDER_ID?.trim() ?? '';
const port = process.env.PORT?.trim() || '3000';

console.log('=== Формат переменных ===');
console.log('GROQ_API_KEY:      ', groqKey ? (groqKey.startsWith('gsk_') ? `OK ${mask(groqKey)}` : `WARN: обычно начинается с gsk_ — ${mask(groqKey)}`) : 'MISSING');
console.log('YANDEX_API_KEY:    ', yandexKey ? `OK ${mask(yandexKey)}` : 'MISSING (опционально)');
console.log('YANDEX_FOLDER_ID:  ', folderId ? (folderId.startsWith('b1') ? `OK ${mask(folderId)}` : `WARN: обычно b1… — ${mask(folderId)}`) : 'MISSING (опционально)');
console.log('PORT:              ', port);

async function testGroq() {
  if (!groqKey) return { ok: false, detail: 'ключ не задан' };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${groqKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Ответь одним словом: работает' }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true, detail: 'Groq отвечает' };
}

async function testYandex() {
  if (!yandexKey || !folderId) return { ok: null, detail: 'пропуск — не все поля заданы' };
  const params = new URLSearchParams({
    text: 'Проверка.',
    lang: 'ru-RU',
    voice: 'marina',
    format: 'oggopus',
    folderId,
  });
  const res = await fetch(`https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize?${params}`, {
    method: 'POST',
    headers: { Authorization: `Api-Key ${yandexKey}` },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, detail: `HTTP ${res.status}: ${body.slice(0, 300)}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return { ok: true, detail: `SpeechKit OK, аудио ${buf.length} байт` };
}

console.log('\n=== Живые проверки ===');
try {
  const groq = await testGroq();
  console.log('Groq:   ', groq.ok ? '✅' : '❌', groq.detail);
} catch (e) {
  console.log('Groq:   ', '❌', e.message);
}

try {
  const yandex = await testYandex();
  if (yandex.ok === null) {
    console.log('Yandex: ', '—', yandex.detail);
  } else {
    console.log('Yandex: ', yandex.ok ? '✅' : '❌', yandex.detail);
  }
} catch (e) {
  console.log('Yandex: ', '❌', e.message);
}
