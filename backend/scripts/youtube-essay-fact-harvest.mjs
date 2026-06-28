/**
 * YouTube music-essay → ElevenLabs Scribe STT → LLM fact extract → fact-bank ingest.
 *
 *   node scripts/youtube-essay-fact-harvest.mjs --url "https://www.youtube.com/watch?v=j0AjWTk5Suc"
 *   node scripts/youtube-essay-fact-harvest.mjs --channel broken_dance --limit 1
 *
 * Options:
 *   --dry-run          transcript + LLM only, no bank write
 *   --max-seconds N    clip audio (cost control)
 *   --stt railway|groq|local   default: railway (ElevenLabs Scribe via BFF)
 *   --bff URL                  Railway BFF (default: WEBSITE_DEMO_API_BASE / BFF_URL / efir-ai.ru)
 */
import '../dist/load-env.js';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestHarvestFacts, flushFactBankSync, factFingerprint } from '../dist/services/fact-bank.js';
import { isAlbumPrimaryContextFact } from '../dist/services/fact-relevance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'youtube-harvest');
const PYTHON = process.env.YT_DLP_PYTHON?.trim() || 'C:\\Users\\1\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

/** LLM interest 1–10; facts below this are discarded before ingest. */
const MIN_BANK_INTEREST = 4;

const CHANNELS = {
  broken_dance: 'https://www.youtube.com/@broken_dance/videos',
  'the-fast-flow': 'https://www.youtube.com/@the-fast-flow/videos',
  risazatvorchestvo: 'https://www.youtube.com/@risazatvorchestvo/videos',
  middle8: 'https://www.youtube.com/@Middle8/videos',
};

const SCRIBE_CREDITS_PER_MIN = 330;
const SCRIBE_USD_PER_HOUR = 0.22;

function argValue(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('--')) {
    return process.argv[idx + 1];
  }
  return null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

/** Direct fetch — system VPN, no hidemy proxy. */
async function httpFetch(input, init) {
  if (hasFlag('proxy')) {
    await import('./setup-hidemy-proxy.mjs');
    const { default: proxyFetch } = await import('../dist/proxy-fetch.js');
    return proxyFetch(input, init);
  }
  return fetch(input, init);
}

function runYtDlp(args) {
  const env = { ...process.env };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.NODE_USE_ENV_PROXY;
  const res = spawnSync(PYTHON, ['-m', 'yt_dlp', ...args], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env,
  });
  if (res.status !== 0) {
    throw new Error(`yt-dlp failed: ${(res.stderr || res.stdout || '').slice(0, 800)}`);
  }
  return (res.stdout || '').trim();
}

function listChannelVideos(channelUrl, limit) {
  const out = runYtDlp([
    '--flat-playlist',
    `--playlist-end=${limit}`,
    '--print',
    '%(id)s|%(title)s|%(duration)s|%(channel)s|%(uploader)s',
    channelUrl,
  ]);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, title, duration, channel, uploader] = line.split('|');
      return {
        id,
        title,
        durationSec: Number(duration) || 0,
        url: `https://www.youtube.com/watch?v=${id}`,
        channel: channel || uploader || '',
      };
    });
}

function downloadAudio(videoUrl, workDir, maxSeconds) {
  fs.mkdirSync(workDir, { recursive: true });
  const metaJson = runYtDlp(['--dump-single-json', '--no-playlist', videoUrl]);
  const row = JSON.parse(metaJson);
  const meta = {
    id: row.id,
    title: row.title,
    durationSec: Number(row.duration) || 0,
    url: videoUrl,
    channel: row.channel || row.uploader || '',
  };

  const template = path.join(workDir, `${meta.id}.%(ext)s`);
  const args = [
    '-f',
    'bestaudio/best',
    '--extract-audio',
    '--audio-format',
    'mp3',
    '--audio-quality',
    '5',
    '-o',
    template,
    '--no-playlist',
  ];
  if (maxSeconds > 0) args.push('--download-sections', `*0-${maxSeconds}`);
  args.push(videoUrl);
  runYtDlp(args);

  const candidates = ['mp3', 'm4a', 'webm', 'opus', 'ogg'].map((ext) =>
    path.join(workDir, `${meta.id}.${ext}`),
  );
  const audioPath = candidates.find((p) => fs.existsSync(p));
  if (!audioPath) {
    const any = fs.readdirSync(workDir).find((f) => /\.(mp3|m4a|webm|opus|ogg)$/i.test(f));
    if (!any) throw new Error(`audio not found after download in ${workDir}`);
    return { meta, audioPath: path.join(workDir, any), audioBytes: fs.statSync(path.join(workDir, any)).size };
  }
  return { meta, audioPath, audioBytes: fs.statSync(audioPath).size };
}

async function groqTranscribe(audioPath, languageCode = 'ru') {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(audioPath)], { type: 'audio/mpeg' }), path.basename(audioPath));
  form.append('model', process.env.GROQ_STT_MODEL?.trim() || 'whisper-large-v3');
  form.append('language', languageCode.slice(0, 2));
  form.append('response_format', 'json');

  const t0 = Date.now();
  const res = await httpFetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(600_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq STT ${res.status}: ${raw.slice(0, 400)}`);
  const text = (JSON.parse(raw).text || '').trim();
  if (!text) throw new Error('Groq STT empty');
  return { text, latencyMs: Date.now() - t0, provider: 'groq-whisper' };
}

function bffBaseUrl() {
  return (
    argValue('bff') ||
    process.env.WEBSITE_DEMO_API_BASE?.trim() ||
    process.env.BFF_URL?.trim() ||
    process.env.PUBLIC_BFF_URL?.trim() ||
    'https://www.efir-ai.ru'
  ).replace(/\/$/, '');
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sttErrorDetail(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  const code =
    err instanceof Error && err.cause && typeof err.cause === 'object' && 'code' in err.cause
      ? String(err.cause.code)
      : '';
  return [msg, cause, code].filter(Boolean).join(' | ');
}

function isTransientHarvestError(err) {
  const blob = sttErrorDetail(err);
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket hang up|EPIPE|ECONNREFUSED|502|503|504|429|rate_limit|stt_failed/i.test(
    blob,
  );
}

async function railwayTranscribe(audioPath, languageCode = 'rus', provider = 'elevenlabs') {
  const secret = process.env.WEBSITE_DEMO_SECRET?.trim();
  if (!secret) {
    throw new Error('WEBSITE_DEMO_SECRET missing in backend/.env — нужен для STT через Railway');
  }
  const buf = fs.readFileSync(audioPath);
  const maxAttempts = 5;
  const providers = provider === 'groq' ? ['groq'] : ['elevenlabs', 'elevenlabs', 'groq', 'groq', 'groq'];
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sttProvider = providers[attempt - 1] ?? provider;
    const t0 = Date.now();
    try {
      const res = await httpFetch(`${bffBaseUrl()}/v1/public/harvest/stt`, {
        method: 'POST',
        headers: {
          'x-website-demo-secret': secret,
          'x-audio-filename': path.basename(audioPath),
          'x-language-code': languageCode,
          'x-stt-provider': sttProvider,
          'content-type': 'audio/mpeg',
        },
        body: buf,
        signal: AbortSignal.timeout(600_000),
      });
      const raw = await res.text();
      if (!res.ok) {
        throw new Error(`Railway STT ${res.status} (${sttProvider}): ${raw.slice(0, 400)}`);
      }
      const data = JSON.parse(raw);
      const text = (data.text || '').trim();
      if (!text) throw new Error(`Railway STT empty (${sttProvider})`);
      if (sttProvider !== provider && attempt > 1) {
        console.warn(`[stt] recovered via ${sttProvider} fallback on attempt ${attempt}`);
      }
      return {
        text,
        latencyMs: data.latencyMs ?? Date.now() - t0,
        provider: data.provider || `${sttProvider}-scribe-railway`,
      };
    } catch (err) {
      lastErr = err;
      const detail = sttErrorDetail(err);
      if (attempt < maxAttempts) {
        const wait = Math.min(attempt * 20_000, 120_000);
        console.warn(
          `[stt] attempt ${attempt}/${maxAttempts} (${sttProvider}) failed: ${detail} — retry in ${wait / 1000}s`,
        );
        await sleepMs(wait);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function transcribeAudio(audioPath, opts) {
  const lang = opts.languageCode.slice(0, 3) === 'rus' ? 'ru' : opts.languageCode.slice(0, 2);
  if (opts.sttProvider === 'groq') return groqTranscribe(audioPath, lang);
  if (opts.sttProvider === 'local') {
    throw new Error('--stt local отключён: ElevenLabs с Windows → Cloudflare 403. Используй --stt railway');
  }
  const railwayProvider = opts.sttProvider === 'railway-groq' ? 'groq' : 'elevenlabs';
  return railwayTranscribe(audioPath, opts.languageCode, railwayProvider);
}

async function groqJsonWithModel(system, user, maxTokens, model) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const t0 = Date.now();
  const res = await httpFetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.12,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq empty');
  return { parsed: JSON.parse(content), model, latencyMs: Date.now() - t0, usage: data.usage ?? null };
}

async function geminiJson(system, user, maxTokens = 4096) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY missing');
  const model = process.env.GEMINI_FACT_MODEL?.trim() || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const t0 = Date.now();
  const res = await httpFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.12,
        maxOutputTokens: maxTokens,
        responseMimeType: 'application/json',
      },
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw);
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini empty');
  return { parsed: JSON.parse(content), model, latencyMs: Date.now() - t0, usage: null };
}

function parseGroqRetryMs(msg) {
  const m = msg.match(/try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
  if (!m) return null;
  const h = Number(m[1] || 0);
  const min = Number(m[2] || 0);
  const s = Number(m[3] || 0);
  return Math.round((h * 3600 + min * 60 + s) * 1000);
}

async function openRouterJson(system, user, maxTokens = 4096) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');
  const model =
    process.env.OPENROUTER_FACT_MODEL?.trim() ||
    process.env.OPENROUTER_FREE_FACT_MODEL?.trim() ||
    'google/gemma-3-27b-it';
  const t0 = Date.now();
  const res = await httpFetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://efir-ai.ru',
      'X-Title': 'Music Story Harvest',
    },
    body: JSON.stringify({
      model,
      temperature: 0.12,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 400)}`);
  const data = JSON.parse(raw);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter empty');
  return { parsed: JSON.parse(content), model, latencyMs: Date.now() - t0, usage: data.usage ?? null };
}

async function llmJson(system, user, maxTokens = 4096) {
  const groqModels = [
    process.env.GROQ_FACT_MODEL?.trim(),
    'llama-3.1-8b-instant',
    process.env.GROQ_MODEL?.trim(),
    'llama-3.3-70b-versatile',
  ].filter(Boolean);
  let lastErr;
  for (const model of [...new Set(groqModels)]) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await groqJsonWithModel(system, user, maxTokens, model);
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('429') || msg.includes('rate_limit')) {
          const waitMs = parseGroqRetryMs(msg);
          if (waitMs && waitMs <= 90 * 60 * 1000 && attempt < 2) {
            console.warn(`[llm] groq ${model} rate limit — wait ${Math.ceil(waitMs / 60000)} min`);
            await sleepMs(waitMs + 3000);
            continue;
          }
          console.warn(`[llm] groq ${model} rate limited — next model…`);
          break;
        }
        throw err;
      }
    }
  }
  if (process.env.GEMINI_API_KEY?.trim()) {
    try {
      console.warn('[llm] groq exhausted → gemini fallback');
      return await geminiJson(system, user, maxTokens);
    } catch (err) {
      lastErr = err;
      console.warn(`[llm] gemini failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    console.warn('[llm] → openrouter fallback');
    return openRouterJson(system, user, maxTokens);
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function groqJson(system, user, maxTokens = 4096) {
  return llmJson(system, user, maxTokens);
}

function extractQuotedName(text) {
  const m = text.match(/[«""']([^»""']{2,80})[»""']/);
  return m?.[1]?.trim() ?? '';
}

function extractAlbumTitleFromFact(text) {
  const patterns = [
    /альбом[аеу]?\s*[«""']([^»""']+)[»""']/i,
    /(?:дебютн(?:ый|ом)|студийн(?:ый|ом))\s+альбом[а]?\s*[«""']?([^»""'«,.\n]{2,80})/i,
    /\balbum\s+[«""']([^»""']+)[»""']/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].trim();
  }
  return '';
}

function normalizeHarvestScope(raw) {
  let scope =
    raw.scope === 'album' ? 'album' : raw.scope === 'track' ? 'track' : 'artist';
  let title = String(raw.title ?? '').trim();

  if (isAlbumPrimaryContextFact(raw.fact) || /\bальбом/i.test(raw.fact)) {
    scope = 'album';
    title = extractAlbumTitleFromFact(raw.fact) || title;
  } else if (scope === 'artist') {
    title = '';
  }

  if (scope === 'album' && !title) {
    title = extractQuotedName(raw.fact);
  }

  return { ...raw, scope, title };
}

async function extractFactsWithLlm({ transcript, videoTitle, channelName }) {
  const system = `Из расшифровки YouTube-эссе о музыке извлеки проверяемые факты.
JSON:
{
  "primaryArtist": "string|null",
  "facts": [
    {
      "artist": "артист/группа",
      "title": "название трека (scope=track) или альбома (scope=album); для artist — пустая строка",
      "scope": "track|album|artist",
      "fact": "1-3 предложения, русский, конкретика",
      "interest": 1-10,
      "keepForBank": true|false
    }
  ]
}
keepForBank=true только если:
- конкретный факт (дата, место, человек, альбом, событие, влияние, запись, смерть, клип, семпл);
- полезен для короткой истории про трек/альбом/артиста;
- НЕ чистое мнение автора («лучший», «идеально передал дух») без фактической опоры.
scope:
- track — факт про конкретный трек/сингл (запись, клип, смысл строк, семпл в треке);
- album — факт про альбом целиком (запись альбома, состав, влияние, история создания); title = название альбома;
- artist — карьера, состав, смерть, влияние на жанр без привязки к одному треку/альбому; title = "".
Если в тексте «альбом «X»» — это scope=album, НЕ track, даже если X совпадает с названием видео.
В каждом fact упомяни artist (группу/исполнителя) хотя бы раз — иначе факт не сохранится.
interest: 10=редкий закулисный факт, 1=банальность/вода.
Максимум 30 фактов, сортировка по interest убыванию.`;

  const user = `Канал: ${channelName}\nВидео: ${videoTitle}\n\nТРАНСКРИПТ:\n${transcript.slice(0, 48_000)}`;
  const { parsed, model, latencyMs, usage } = await llmJson(system, user);

  const facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
    .map((f) =>
      normalizeHarvestScope({
        artist: String(f.artist ?? '').trim(),
        title: String(f.title ?? '').trim(),
        scope: f.scope === 'album' ? 'album' : f.scope === 'track' ? 'track' : 'artist',
        fact: String(f.fact ?? '').trim(),
        interest: Math.max(1, Math.min(10, Number(f.interest) || 1)),
        keepForBank: f.keepForBank === true,
        rejectReason: f.keepForBank === true ? null : String(f.rejectReason ?? 'llm_discard').trim(),
      }),
    )
    .filter((f) => f.fact.length >= 35 && f.artist.length >= 2)
    .sort((a, b) => b.interest - a.interest);

  return { primaryArtist: parsed.primaryArtist ?? null, facts, model, latencyMs, usage };
}

async function verifyFactsQualityWithLlm(facts, videoTitle) {
  if (!facts.length) return facts;
  const system = `Оцени музыкальные факты для банка историй. JSON: {"reviews":[{"i":0,"bankQuality":1-10,"note":"кратко"}]}
bankQuality: 10=редкий закулисный, 1=вода/мнение без факта.
НЕ отсекай факты — только оценка. Сохраняй интересные субъективные детали если есть фактическая опора.`;
  const payload = facts.map((f, i) => ({ i, artist: f.artist, scope: f.scope, title: f.title, fact: f.fact, interest: f.interest }));
  const { parsed } = await llmJson(system, `Видео: ${videoTitle}\n\n${JSON.stringify(payload).slice(0, 12000)}`, 2048);
  const reviews = new Map((parsed.reviews ?? []).map((r) => [Number(r.i), r]));
  return facts.map((f, i) => {
    const r = reviews.get(i);
    const bankQuality = Math.max(1, Math.min(10, Number(r?.bankQuality) || f.interest));
    const mergedInterest = Math.max(f.interest, Math.round(bankQuality * 0.85));
    return {
      ...f,
      bankQuality,
      qualityNote: r?.note ?? null,
      interest: mergedInterest,
      keepForBank: f.keepForBank || bankQuality >= 6,
    };
  });
}

function ingestTitleForFact(f) {
  return f.scope === 'artist' ? '' : f.title;
}

function estimateScribeCost(durationSec) {
  const minutes = durationSec / 60;
  return {
    audioMinutes: Math.round(minutes * 100) / 100,
    creditsEstimate: Math.ceil(minutes * SCRIBE_CREDITS_PER_MIN),
    usdEstimate: Math.round(((durationSec / 3600) * SCRIBE_USD_PER_HOUR) * 10000) / 10000,
  };
}

function videoWorkDir(videoId) {
  return path.join(OUT_DIR, videoId);
}

function loadCheckpoint(workDir) {
  const cpPath = path.join(workDir, 'checkpoint.json');
  if (!fs.existsSync(cpPath)) {
    return { step: 'pending', ingestedFingerprints: [], updatedAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(cpPath, 'utf8'));
  } catch {
    return { step: 'pending', ingestedFingerprints: [], updatedAt: null };
  }
}

function saveCheckpoint(workDir, checkpoint) {
  fs.mkdirSync(workDir, { recursive: true });
  checkpoint.updatedAt = new Date().toISOString();
  const target = path.join(workDir, 'checkpoint.json');
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(checkpoint, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function findExistingAudio(workDir, videoId) {
  for (const ext of ['mp3', 'm4a', 'webm', 'opus', 'ogg']) {
    const p = path.join(workDir, `${videoId}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  const any = fs.readdirSync(workDir, { withFileTypes: true }).find(
    (e) => e.isFile() && /\.(mp3|m4a|webm|opus|ogg)$/i.test(e.name),
  );
  return any ? path.join(workDir, any.name) : null;
}

async function processVideo(video, opts) {
  const workDir = videoWorkDir(video.id);
  fs.mkdirSync(workDir, { recursive: true });
  const checkpoint = loadCheckpoint(workDir);
  const ingestedSet = new Set(checkpoint.ingestedFingerprints ?? []);

  console.log(`\n=== ${video.title} ===`);
  console.log(
    `url=${video.url} duration=${video.durationSec}s stt=${opts.sttProvider} checkpoint=${checkpoint.step} workDir=${workDir}`,
  );

  let meta = {
    id: video.id,
    title: video.title,
    durationSec: video.durationSec,
    url: video.url,
    channel: video.channel || video.channelName || '',
  };
  let audioPath = findExistingAudio(workDir, video.id);
  let audioBytes = audioPath ? fs.statSync(audioPath).size : 0;
  const billedSec =
    opts.maxSeconds > 0
      ? Math.min(opts.maxSeconds, meta.durationSec || opts.maxSeconds)
      : meta.durationSec;
  const cost = estimateScribeCost(billedSec);

  if (!audioPath) {
    const dl = downloadAudio(video.url, workDir, opts.maxSeconds);
    meta = dl.meta;
    audioPath = dl.audioPath;
    audioBytes = dl.audioBytes;
    saveCheckpoint(workDir, { ...checkpoint, step: 'downloaded', ingestedFingerprints: [...ingestedSet] });
    console.log(`[download] ${audioPath} (${(audioBytes / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    console.log(`[download] resume ${audioPath} (${(audioBytes / 1024 / 1024).toFixed(2)} MB)`);
  }

  const transcriptPath = path.join(workDir, 'transcript.txt');
  let stt;
  if (fs.existsSync(transcriptPath) && ['transcribed', 'extracted', 'ingesting', 'done'].includes(checkpoint.step)) {
    const text = fs.readFileSync(transcriptPath, 'utf8').trim();
    stt = { text, provider: 'checkpoint-resume', latencyMs: 0 };
    console.log(`[stt] resume ${stt.text.length} chars`);
  } else {
    stt = await transcribeAudio(audioPath, opts);
    fs.writeFileSync(transcriptPath, stt.text, 'utf8');
    saveCheckpoint(workDir, { step: 'transcribed', ingestedFingerprints: [...ingestedSet] });
    console.log(`[stt] ${stt.provider} ${stt.text.length} chars ${stt.latencyMs}ms`);
  }

  const factsRawPath = path.join(workDir, 'facts-raw.json');
  let llm;
  if (fs.existsSync(factsRawPath) && ['extracted', 'ingesting', 'done'].includes(checkpoint.step)) {
    llm = JSON.parse(fs.readFileSync(factsRawPath, 'utf8'));
    console.log(`[llm] resume ${llm.facts?.length ?? 0} facts`);
  } else {
    llm = await extractFactsWithLlm({
      transcript: stt.text,
      videoTitle: meta.title,
      channelName: meta.channel,
    });
    try {
      llm.facts = await verifyFactsQualityWithLlm(llm.facts, meta.title);
    } catch (err) {
      console.warn(
        `[llm] quality verify skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
    fs.writeFileSync(factsRawPath, JSON.stringify(llm, null, 2), 'utf8');
    saveCheckpoint(workDir, { step: 'extracted', ingestedFingerprints: [...ingestedSet] });
  }

  const bankCandidates = llm.facts.filter((f) => f.keepForBank && f.interest >= MIN_BANK_INTEREST);
  const rejected = llm.facts.filter((f) => !f.keepForBank || f.interest < MIN_BANK_INTEREST);
  console.log(
    `[llm] extracted=${llm.facts.length} bankCandidates=${bankCandidates.length} rejected=${rejected.length}`,
  );

  let ingested = 0;
  const ingestLog = [];
  if (!opts.dryRun) {
    saveCheckpoint(workDir, { step: 'ingesting', ingestedFingerprints: [...ingestedSet] });
    for (const f of bankCandidates) {
      const fp = factFingerprint(f.fact);
      const title = ingestTitleForFact(f);
      if (ingestedSet.has(fp)) {
        ingestLog.push({ ...f, ingestTitle: title, saved: true, resumed: true });
        ingested += 1;
        continue;
      }
      const saved = ingestHarvestFacts(f.artist, title, [
        {
          fact: f.fact,
          scope: f.scope,
          source: 'llm',
          harvestSource: `youtube:${video.id}`,
          llmInterest: f.interest,
        },
      ]);
      flushFactBankSync();
      if (saved > 0) {
        ingestedSet.add(fp);
        ingested += saved;
        saveCheckpoint(workDir, { step: 'ingesting', ingestedFingerprints: [...ingestedSet] });
      }
      const row = { ...f, ingestTitle: title, saved: saved > 0 };
      ingestLog.push(row);
      opts.onFactSaved?.(row, video, meta);
    }
    for (const f of rejected) {
      ingestLog.push({
        ...f,
        saved: false,
        rejectReason: f.rejectReason || (f.interest < MIN_BANK_INTEREST ? 'interest_below_threshold' : 'keepForBank=false'),
      });
    }
    saveCheckpoint(workDir, { step: 'done', ingestedFingerprints: [...ingestedSet] });
  }

  const report = {
    video: { ...meta, url: video.url },
    audio: { path: audioPath, bytes: audioBytes, billedSeconds: billedSec },
    scribe: { provider: stt.provider, ...cost, latencyMs: stt.latencyMs, transcriptChars: stt.text.length },
    llm: {
      model: llm.model,
      latencyMs: llm.latencyMs,
      usage: llm.usage,
      primaryArtist: llm.primaryArtist,
      factsExtracted: llm.facts.length,
      bankCandidates: bankCandidates.length,
      factsIngested: ingested,
    },
    bankCandidates,
    rejected,
    ingestLog,
    dryRun: opts.dryRun,
    workDir,
  };
  fs.writeFileSync(path.join(workDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  return report;
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const maxSeconds = parseInt(argValue('max-seconds') ?? '0', 10) || 0;
  const limit = parseInt(argValue('limit') ?? '1', 10) || 1;
  const channelKey = argValue('channel');
  const url = argValue('url');
  const languageCode = argValue('lang') || 'rus';
  const sttProvider = (argValue('stt') || 'railway').toLowerCase();

  fs.mkdirSync(OUT_DIR, { recursive: true });

  let videos = [];
  if (url) {
    const row = JSON.parse(runYtDlp(['--dump-single-json', '--no-playlist', url]));
    videos = [
      {
        id: row.id,
        title: row.title,
        durationSec: row.duration || 0,
        url,
        channel: row.channel || row.uploader || '',
      },
    ];
  } else if (channelKey) {
    videos = listChannelVideos(CHANNELS[channelKey], limit);
  } else {
    throw new Error('pass --url or --channel broken_dance');
  }

  const reports = [];
  for (const v of videos) {
    reports.push(await processVideo(v, { dryRun, maxSeconds, languageCode, sttProvider }));
  }

  const summaryPath = path.join(OUT_DIR, `summary-${Date.now()}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({ at: new Date().toISOString(), reports }, null, 2));

  console.log('\n=== SUMMARY ===');
  for (const r of reports) {
    console.log(
      `${r.video.title}\n` +
        `  STT: ${r.scribe.provider}, ~${r.scribe.creditsEstimate} cr, ${r.scribe.transcriptChars} chars\n` +
        `  LLM: ${r.llm.factsExtracted} extracted → ${r.llm.bankCandidates} candidates → ${r.llm.factsIngested} ingested\n` +
        `  report: ${path.join(r.workDir, 'report.json')}`,
    );
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export {
  processVideo,
  listChannelVideos,
  downloadAudio,
  transcribeAudio,
  extractFactsWithLlm,
  verifyFactsQualityWithLlm,
  groqJson,
  llmJson,
  isTransientHarvestError,
  bffBaseUrl,
  runYtDlp,
  OUT_DIR,
  ROOT,
};
