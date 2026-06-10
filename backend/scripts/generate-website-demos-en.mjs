#!/usr/bin/env node
/**
 * EN website demos via Railway BFF (ElevenLabs) — bypasses local Cloudflare 403.
 *
 *   node scripts/generate-website-demos-en.mjs --preview
 *   node scripts/generate-website-demos-en.mjs --all
 *   WEBSITE_DEMO_API_BASE=https://www.efir-ai.ru node scripts/generate-website-demos-en.mjs --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../website/assets/demos/en');

for (const p of [path.resolve(__dirname, '../.env'), path.resolve(__dirname, '../../.env')]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[k]) process.env[k] = v;
  }
}

const API_BASE = (process.env.WEBSITE_DEMO_API_BASE || 'https://www.efir-ai.ru').replace(/\/$/, '');
const DEMO_SECRET = process.env.WEBSITE_DEMO_SECRET?.trim();

const FACT_REGISTRY =
  'Thriller is the only music video in the US National Film Registry — preserved as cultural heritage alongside feature films.';
const FACT_BUDGET =
  'Michael Jackson poured half a million dollars of his own money into the Thriller shoot — producers rolled their eyes, then album sales jumped sevenfold after the premiere.';
const THRILLER_STORY_MINUTE =
  'Michael Jackson made Thriller when music videos were still rewriting the rules. It was not just a track — a fourteen-minute movie. MTV mostly played rock, but Thriller aired in full, interrupting regular programming — unprecedented. Jackson bet on visual stories and put half a million of his own money into the shoot. The budget looked insane until album sales jumped sevenfold after the video dropped. John Landis directed it — two universes colliding. The zombie dance was not in the first draft: choreographer Michael Peters had to convince Landis it would not ruin the horror look. That dance became the clip\'s signature.';
const THRILLER_STORY_FULL =
  THRILLER_STORY_MINUTE +
  ' Thriller is the only music video in the US National Film Registry. Vincent Price recorded the narration, zombie rehearsals ran for weeks. Moonwalk, werewolf transformation, dancing corpses — a new pop-culture religion. VHS players flew off shelves as people rewatched it again and again. The first viral hit before the internet era.';
const BACKSTAGE_SHORT =
  'Just between us. ' +
  FACT_BUDGET +
  ' Vincent Price laid down the narration in a single day — without that voice the video would be a different beast. People rarely say this out loud.';
const BACKSTAGE_MINUTE =
  'Just between us. ' +
  FACT_BUDGET +
  ' Vincent Price recorded the narration in one day — John Landis brought cinematic scale. Choreographer Michael Peters fought for the zombie dance scene cut from the first draft; it became the clip\'s calling card. Jackson pushed for details producers called wasteful — those shots later hijacked MTV. People rarely say this out loud.';
const BACKSTAGE_FULL = BACKSTAGE_MINUTE + ' Makeup took four hours per zombie — hallways smelled of latex. Jackson reshot the final step until it locked to the beat. The label hid the numbers until sales jumped sevenfold. Later the clip entered the National Film Registry — the only music video in the US heritage list.';
const CONTEMPORARY_SHORT =
  'I remember those years. Michael Jackson put half a million into the Thriller video — after the premiere album sales jumped sevenfold. We watched the fourteen-minute clip on MTV in full, then bought VHS tapes to replay it at home.';
const CONTEMPORARY_MINUTE =
  'Michael Jackson poured five hundred thousand dollars of his own money into the Thriller video. I remember MTV mostly spinning rock, but this fourteen-minute film aired whole, interrupting regular shows. After the premiere album sales jumped sevenfold. John Landis came from feature films; Michael Peters had to convince him to keep the zombie dance. It was not just a video — a television event that rewrote the rules. We bought VHS copies in bulk to replay that masterpiece at home.';
const CONTEMPORARY_FULL =
  CONTEMPORARY_MINUTE +
  ' Vincent Price read the narration like a horror movie — goosebumps every time. We practiced the moonwalk by the TV and zombie moves at parties. Years later Thriller entered the National Film Registry — the only music video on the US heritage list.';

const PERSONAS = [
  {
    id: 'radio_host',
    voice: 'rachel',
    speed: 1.08,
    studioVoices: ['rachel', 'adam', 'antoni'],
    short: FACT_REGISTRY + ' This is the video that hijacked MTV!',
    minute: THRILLER_STORY_MINUTE + ' This is the video that hijacked MTV!',
    full: THRILLER_STORY_FULL + ' This is the video that hijacked MTV!',
  },
  {
    id: 'night_dj',
    voice: 'adam',
    speed: 0.92,
    studioVoices: ['adam'],
    short: 'Good night! Quick fact: ' + FACT_REGISTRY + ' Stay on our frequency till morning.',
    minute: 'Good night! Quick fact: ' + THRILLER_STORY_MINUTE + ' Stay on our frequency till morning.',
    full: 'Good night! Quick fact: ' + THRILLER_STORY_FULL + ' Stay on our frequency till morning.',
  },
  {
    id: 'expert',
    voice: 'josh',
    speed: 1.0,
    studioVoices: ['josh', 'adam', 'antoni'],
    short: 'Unique fact: ' + FACT_REGISTRY + ' A pop-horror benchmark of the eighties.',
    minute: 'Unique fact: ' + THRILLER_STORY_MINUTE + ' A pop-horror benchmark of the eighties.',
    full: 'Unique fact: ' + THRILLER_STORY_FULL + ' A pop-horror benchmark of the eighties.',
  },
  {
    id: 'contemporary',
    voice: 'bella',
    speed: 0.98,
    studioVoices: ['bella', 'emily', 'matilda'],
    short: CONTEMPORARY_SHORT,
    minute: 'I remember those years. ' + CONTEMPORARY_MINUTE,
    full: 'I remember those years. ' + CONTEMPORARY_FULL,
  },
  {
    id: 'fan',
    voice: 'elli',
    speed: 1.12,
    studioVoices: ['elli', 'bella', 'rachel'],
    short: 'I love this moment! ' + FACT_REGISTRY + ' I know every second of this video by heart!',
    minute: 'I love this moment! ' + THRILLER_STORY_MINUTE + ' I know every second of this video by heart!',
    full: 'I love this moment! ' + THRILLER_STORY_FULL + ' I know every second of this video by heart!',
  },
  {
    id: 'backstage',
    voice: 'antoni',
    speed: 0.96,
    studioVoices: ['antoni', 'sam'],
    short: BACKSTAGE_SHORT,
    minute: BACKSTAGE_MINUTE,
    full: BACKSTAGE_FULL,
  },
];

function studioShortFile(personaId, voiceId) {
  return `studio-${personaId}-${voiceId}.ogg`;
}
function studioLongFile(personaId, suffix) {
  return `studio-${personaId}${suffix}.ogg`;
}

async function synthRemote(text, voiceId) {
  if (!DEMO_SECRET) {
    throw new Error('WEBSITE_DEMO_SECRET missing in backend/.env');
  }
  const res = await fetch(`${API_BASE}/v1/public/website-demo/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Website-Demo-Secret': DEMO_SECRET,
    },
    body: JSON.stringify({ text, voiceId, lang: 'en' }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TTS ${res.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function writePreview() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    generatedAt: new Date().toISOString(),
    note: 'English website demos — ElevenLabs via Railway proxy',
    personas: PERSONAS.map((p) => ({
      id: p.id,
      voice: p.voice,
      speed: p.speed,
      studioVoices: p.studioVoices,
      speakable: p.short,
      display: p.short,
      file: `persona-${p.id}.ogg`,
    })),
    studioLong: PERSONAS.map((p) => ({
      persona: p.id,
      voice: p.voice,
      len2: { speakable: p.minute, display: p.minute, file: studioLongFile(p.id, '-len2') },
      len4: { speakable: p.full, display: p.full, file: studioLongFile(p.id, '-len4') },
    })),
  };
  const jsonPath = path.join(OUT_DIR, 'preview-texts.json');
  fs.writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('wrote', jsonPath);
}

async function writeOgg(relPath, buf) {
  const out = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
}

async function main() {
  const arg = process.argv[2] ?? '--preview';
  if (arg === '--preview') {
    await writePreview();
    return;
  }
  if (!DEMO_SECRET) {
    console.error('Set WEBSITE_DEMO_SECRET in backend/.env (same value on Railway)');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  await writePreview();

  if (arg === '--personas' || arg === '--all') {
    for (const p of PERSONAS) {
      const buf = await synthRemote(p.short, p.voice);
      await writeOgg(`persona-${p.id}.ogg`, buf);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  if (arg === '--studio' || arg === '--all') {
    for (const p of PERSONAS) {
      for (const voice of p.studioVoices) {
        const buf = await synthRemote(p.short, voice);
        await writeOgg(studioShortFile(p.id, voice), buf);
        await new Promise((r) => setTimeout(r, 400));
      }
    }
  }

  if (arg === '--studio-long' || arg === '--all') {
    for (const p of PERSONAS) {
      const b2 = await synthRemote(p.minute, p.voice);
      await writeOgg(studioLongFile(p.id, '-len2'), b2);
      await new Promise((r) => setTimeout(r, 500));
      const b4 = await synthRemote(p.full, p.voice);
      await writeOgg(studioLongFile(p.id, '-len4'), b4);
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  console.log('done — EN demos in', OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
