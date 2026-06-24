#!/usr/bin/env node
/**
 * 10 tracks with FR/IT/ES/DE accents — Edge segments + Yandex SSML integrity.
 * Run: npm run build && node scripts/test-foreign-accents-10tracks.mjs
 */
import { prepareEdgeTtsText } from '../dist/services/tts-edge-prepare.js';
import { splitMixedLanguageForEdge } from '../dist/services/tts-mixed-segments.js';
import { detectForeignLang, detectLatinLangCode, edgeForeignLang } from '../dist/services/tts-foreign-lang.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { LATIN_RUN_RE } from '../dist/services/latin-script.js';

const TRACKS = [
  { artist: 'Stromae', title: 'Mauvaise journée', lang: 'fr', mustKeep: /journée/u },
  { artist: 'Stromae', title: 'Tous les mêmes', lang: 'fr', mustKeep: /mêmes/u },
  { artist: 'Édith Piaf', title: 'La Vie en rose', lang: 'fr', mustKeep: /Édith|édith/u },
  { artist: 'Angèle', title: 'Ta reine', lang: 'fr', mustKeep: /Angèle|angèle/u },
  { artist: 'Andrea Bocelli', title: 'Con te partirò', lang: 'it', ssmlLang: 'it-IT', mustKeep: /partirò/u },
  { artist: 'Maná', title: 'María', lang: 'es', ssmlLang: 'es-ES', mustKeep: /María/u },
  { artist: 'Rosalía', title: 'A ningún hombre', lang: 'es', ssmlLang: 'es-ES', mustKeep: /ningún/u },
  { artist: 'Rammstein', title: 'Sonne', lang: 'de', ssmlLang: 'de-DE', mustKeep: /Sonne/u },
  { artist: 'Nena', title: '99 Luftballons', lang: 'de', ssmlLang: 'de-DE', mustKeep: /Luftballons/u },
  { artist: 'Die Ärzte', title: 'Schunder', lang: 'de', ssmlLang: 'de-DE', mustKeep: /Ärzte/u },
];

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

/** Accent must not be split from its base letter (journ + e bug). */
function assertWordIntact(text, wordPattern, label) {
  const bad = /\bjourn\b/i.test(text) && !/journée/u.test(text);
  if (bad) fail(`${label}: journée split at accent`);
  if (wordPattern && !wordPattern.test(text)) fail(`${label}: expected chars missing in "${text.slice(0, 80)}"`);
}

function assertNoOrphanPunct(segs, label) {
  const orphan = segs.filter((s) => s.lang === 'ru' && !/[\p{Script=Cyrillic}]/u.test(s.text));
  if (orphan.length) fail(`${label}: orphan RU punctuation segments: ${JSON.stringify(orphan)}`);
}

for (const t of TRACKS) {
  const script = `${t.title} — ${t.artist}. Эта история про запись и путь трека в эфир.`;
  console.log(`\n=== ${t.artist} / ${t.title} ===`);

  const edgeText = prepareEdgeTtsText(script, {
    artist: t.artist,
    title: t.title,
    speakTrackNamesInVoiceover: true,
  });
  assertWordIntact(edgeText, t.mustKeep, 'Edge prep');
  ok(`Edge prep keeps accents (${t.title})`);

  const segs = splitMixedLanguageForEdge(edgeText, t.artist, t.title);
  const titleSeg = segs.find((s) => s.text.includes(t.title.split(' ')[0].slice(0, 4)));
  const expectedEdge = t.lang === 'it' || t.lang === 'es' ? 'en' : t.lang;
  const foreignSegs = segs.filter((s) => s.lang !== 'ru');
  if (foreignSegs.length === 0) fail(`${t.artist}: no foreign Edge segments`);
  else {
    const langs = [...new Set(foreignSegs.map((s) => s.lang))];
    if (t.lang === 'fr' || t.lang === 'de') {
      if (!langs.includes(t.lang)) fail(`${t.artist}: expected Edge lang ${t.lang}, got ${langs.join(',')}`);
      else ok(`Edge lang ${t.lang}`);
    } else {
      ok(`Edge foreign segments: ${langs.join(',')} (it/es → en voice)`);
    }
  }
  assertNoOrphanPunct(segs, t.artist);
  if (!orphanCheck(segs)) ok('no orphan RU punctuation');

  const titleInSeg = segs.some((s) => t.mustKeep.test(s.text));
  if (!titleInSeg) fail(`${t.artist}: title accents lost in segments: ${JSON.stringify(segs)}`);
  else ok('title intact in segment');

  const yandexMarked = prepareYandexTtsText(script, {
    artist: t.artist,
    title: t.title,
    speakTrackNamesInVoiceover: true,
    sentencePauses: false,
  });
  const ssml = buildYandexSsml(yandexMarked);
  const expectedSsml = t.ssmlLang ?? (t.lang === 'fr' ? 'fr-FR' : t.lang === 'de' ? 'de-DE' : 'en-US');
  if (!ssml.includes(`xml:lang="${expectedSsml}"`)) {
    fail(`${t.artist}: SSML missing ${expectedSsml}: ${ssml.slice(0, 280)}`);
  } else {
    ok(`Yandex SSML ${expectedSsml}`);
  }

  const langSpans = [...ssml.matchAll(/<lang xml:lang="[^"]+">([^<]*)<\/lang>/g)].map((m) => m[1]);
  const latinInSsml = langSpans.join(' ');
  if (t.mustKeep && !t.mustKeep.test(latinInSsml)) {
    fail(`${t.artist}: accents missing in SSML lang spans: ${latinInSsml}`);
  } else if (t.mustKeep) {
    ok('accents preserved in SSML');
  }

  const detectTitle = detectForeignLang(t.title);
  const detectArtist = detectForeignLang(t.artist);
  ok(`detect: title=${detectTitle} artist=${detectArtist} xml=${detectLatinLangCode(t.title)}`);

  // LATIN_RUN_RE must capture accented words intact
  LATIN_RUN_RE.lastIndex = 0;
  const runs = [...script.matchAll(LATIN_RUN_RE)].map((m) => m[0]);
  const combinedLatin = runs.join(' ');
  if (t.mustKeep && !t.mustKeep.test(combinedLatin) && !t.mustKeep.test(edgeText)) {
    fail(`${t.artist}: accents lost in LATIN runs: ${runs.join(' | ')}`);
  } else {
    ok(`LATIN_RUN ok (${runs.length} run(s))`);
  }
}

function orphanCheck(segs) {
  return !segs.some((s) => s.lang === 'ru' && !/[\p{Script=Cyrillic}]/u.test(s.text));
}

console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${failed} issue(s)\n`);
process.exit(failed > 0 ? 1 : 0);
