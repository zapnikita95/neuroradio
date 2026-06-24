/**
 * Edge FR segmentation + optional live synth for Stromae / Mauvaise journée.
 * Run: npm run build && node scripts/test-edge-french-stromae.mjs
 * Live: node scripts/test-edge-french-stromae.mjs --live
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EdgeTTS } from 'edge-tts-universal';
import {
  ensureEdgeLatinCitationOpener,
  prepareEdgeTtsText,
} from '../dist/services/tts-edge-prepare.js';
import { splitMixedLanguageForEdge } from '../dist/services/tts-mixed-segments.js';
import { edgeForeignLang } from '../dist/services/tts-foreign-lang.js';
import { isFrenchLatinPhrase } from '../dist/services/fr-lang-detect.js';

const live = process.argv.includes('--live');
const artist = 'Stromae';
const title = 'Mauvaise journée';
const script =
  'Mauvaise journée — Stromae. Родился в семье руандийского отца и бельгийской матери — это слышно в каждой строке.';

console.log('=== French detect ===');
console.log('title isFrench:', isFrenchLatinPhrase(title));
console.log('artist isFrench:', isFrenchLatinPhrase(artist));
console.log('title edge lang:', edgeForeignLang(title, artist, title));
console.log('artist edge lang:', edgeForeignLang(artist, artist, title));

const prepared = prepareEdgeTtsText(script, {
  artist,
  title,
  speakTrackNamesInVoiceover: true,
});
console.log('\nprepared:', prepared);

const segs = splitMixedLanguageForEdge(prepared, artist, title);
console.log('\nsegments:');
for (const s of segs) console.log(`  [${s.lang}] ${s.text}`);

const badSplit = segs.some((s) => /\bjourn\b/i.test(s.text) && !/journée/i.test(s.text));
if (badSplit) {
  console.error('\nFAIL: journée split into journ + e');
  process.exitCode = 1;
} else {
  console.log('\nOK: journée not split at accent');
}

const frSegs = segs.filter((s) => s.lang === 'fr');
if (frSegs.length !== 1 || !/Mauvaise journée — Stromae/i.test(frSegs[0].text)) {
  console.error('FAIL: expected one FR segment "Mauvaise journée — Stromae", got:', frSegs);
  process.exitCode = 1;
} else {
  console.log('OK: opener on single FR voice (no RU dash between)');
}

if (live) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outDir = path.join(__dirname, '..', 'audio', 'edge-french-test');
  await mkdir(outDir, { recursive: true });

  for (const [label, voice] of [
    ['fr-title', 'fr-FR-DeniseNeural'],
    ['en-title', 'en-US-JennyNeural'],
    ['ru-body', 'ru-RU-SvetlanaNeural'],
  ]) {
    const text =
      label === 'fr-title'
        ? title
        : label === 'en-title'
          ? title
          : 'Родился в семье руандийского отца и бельгийской матери.';
    const tts = new EdgeTTS(text, voice, { rate: '+0%', pitch: '+0Hz' });
    const buf = Buffer.from(await (await tts.synthesize()).audio.arrayBuffer());
    const fp = path.join(outDir, `${label}.wav`);
    await writeFile(fp, buf);
    console.log(`wrote ${fp} (${buf.length} bytes)`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll Edge French checks passed.');
