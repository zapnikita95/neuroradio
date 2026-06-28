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
import { ingestHarvestFacts } from '../dist/services/fact-bank.js';
import { isAlbumPrimaryContextFact } from '../dist/services/fact-relevance.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'youtube-harvest');
const PYTHON = process.env.YT_DLP_PYTHON?.trim() || 'C:\\Users\\1\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';

/** LLM interest 1–10; facts below this are discarded before ingest. */
const MIN_BANK_INTEREST = 5;

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

async function railwayTranscribe(audioPath, languageCode = 'rus') {
  const secret = process.env.WEBSITE_DEMO_SECRET?.trim();
  if (!secret) {
    throw new Error('WEBSITE_DEMO_SECRET missing in backend/.env — нужен для STT через Railway');
  }
  const buf = fs.readFileSync(audioPath);
  const t0 = Date.now();
  const res = await fetch(`${bffBaseUrl()}/v1/public/harvest/stt`, {
    method: 'POST',
    headers: {
      'x-website-demo-secret': secret,
      'x-audio-filename': path.basename(audioPath),
      'x-language-code': languageCode,
      'content-type': 'audio/mpeg',
    },
    body: buf,
    signal: AbortSignal.timeout(600_000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Railway STT ${res.status}: ${raw.slice(0, 400)}`);
  }
  const data = JSON.parse(raw);
  const text = (data.text || '').trim();
  if (!text) throw new Error('Railway STT empty');
  return {
    text,
    latencyMs: data.latencyMs ?? Date.now() - t0,
    provider: data.provider || 'elevenlabs-scribe-railway',
  };
}

async function transcribeAudio(audioPath, opts) {
  const lang = opts.languageCode.slice(0, 3) === 'rus' ? 'ru' : opts.languageCode.slice(0, 2);
  if (opts.sttProvider === 'groq') return groqTranscribe(audioPath, lang);
  if (opts.sttProvider === 'local') {
    throw new Error('--stt local отключён: ElevenLabs с Windows → Cloudflare 403. Используй --stt railway');
  }
  return railwayTranscribe(audioPath, opts.languageCode);
}

async function groqJson(system, user, maxTokens = 4096) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY missing');
  const model =
    process.env.GROQ_FACT_MODEL?.trim() ||
    process.env.GROQ_MODEL?.trim() ||
    'llama-3.3-70b-versatile';

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
interest: 10=редкий закулисный факт, 1=банальность/вода.
Максимум 30 фактов, сортировка по interest убыванию.`;

  const user = `Канал: ${channelName}\nВидео: ${videoTitle}\n\nТРАНСКРИПТ:\n${transcript.slice(0, 48_000)}`;
  const { parsed, model, latencyMs, usage } = await groqJson(system, user);

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

async function processVideo(video, opts) {
  const slug = `${video.id}-${Date.now()}`;
  const workDir = path.join(OUT_DIR, slug);
  fs.mkdirSync(workDir, { recursive: true });

  console.log(`\n=== ${video.title} ===`);
  console.log(`url=${video.url} duration=${video.durationSec}s stt=${opts.sttProvider} bff=${bffBaseUrl()}`);

  const { meta, audioPath, audioBytes } = downloadAudio(video.url, workDir, opts.maxSeconds);
  const billedSec =
    opts.maxSeconds > 0 ? Math.min(opts.maxSeconds, meta.durationSec || opts.maxSeconds) : meta.durationSec;
  const cost = estimateScribeCost(billedSec);

  console.log(`[download] ${audioPath} (${(audioBytes / 1024 / 1024).toFixed(2)} MB)`);

  const stt = await transcribeAudio(audioPath, opts);
  fs.writeFileSync(path.join(workDir, 'transcript.txt'), stt.text, 'utf8');
  console.log(`[stt] ${stt.provider} ${stt.text.length} chars ${stt.latencyMs}ms`);

  const llm = await extractFactsWithLlm({
    transcript: stt.text,
    videoTitle: meta.title,
    channelName: meta.channel,
  });
  fs.writeFileSync(path.join(workDir, 'facts-raw.json'), JSON.stringify(llm, null, 2), 'utf8');

  const bankCandidates = llm.facts.filter((f) => f.keepForBank && f.interest >= MIN_BANK_INTEREST);
  const rejected = llm.facts.filter((f) => !f.keepForBank || f.interest < MIN_BANK_INTEREST);
  console.log(
    `[llm] extracted=${llm.facts.length} bankCandidates=${bankCandidates.length} rejected=${rejected.length}`,
  );

  let ingested = 0;
  const ingestLog = [];
  if (!opts.dryRun) {
    for (const f of bankCandidates) {
      const title = ingestTitleForFact(f);
      const saved = ingestHarvestFacts(f.artist, title, [
        {
          fact: f.fact,
          scope: f.scope,
          source: 'llm',
          harvestSource: `youtube:${video.id}`,
          llmInterest: f.interest,
        },
      ]);
      ingestLog.push({ ...f, ingestTitle: title, saved: saved > 0 });
      if (saved > 0) ingested += saved;
    }
    for (const f of rejected) {
      ingestLog.push({
        ...f,
        saved: false,
        rejectReason: f.rejectReason || (f.interest < MIN_BANK_INTEREST ? 'interest_below_threshold' : 'keepForBank=false'),
      });
    }
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
