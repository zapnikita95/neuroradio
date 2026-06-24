/**
 * Edge TTS prep — без Yandex-фонетики.
 * Run: npm run build && node scripts/test-edge-tts-prepare.mjs
 */
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import {
  ensureEdgeLatinCitationOpener,
  prepareEdgeTtsText,
} from '../dist/services/tts-edge-prepare.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import {
  hasForeignSegmentsForEdge,
  splitMixedLanguageForEdge,
} from '../dist/services/tts-mixed-segments.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

const namesOff =
  'Эта группа когда-то записала хит с гитарным риффом. Они сделали его визитной карточкой альбома.';
const edgeOff = prepareEdgeTtsText(namesOff, {
  artist: 'The Offspring',
  title: 'Self Esteem',
  speakTrackNamesInVoiceover: false,
});
console.log('edgeOff:', edgeOff);
ok(/эта группа/i.test(edgeOff), 'names OFF: keeps эта группа');
ok(/они/i.test(edgeOff), 'names OFF: keeps они');
ok(!/The Offspring/i.test(edgeOff), 'names OFF: no latin artist');
ok(!/Self Esteem/i.test(edgeOff), 'names OFF: no latin title');
ok(!/эмп(\+)?э/i.test(edgeOff), 'edge OFF: no Yandex phonetic junk');

const yandexOff = prepareYandexTtsText(namesOff, {
  artist: 'The Offspring',
  title: 'Self Esteem',
  speakTrackNamesInVoiceover: false,
  sentencePauses: false,
});
ok(/эта группа|этот/i.test(yandexOff), 'yandex OFF unchanged: placeholders');
ok(!/The Offspring/i.test(yandexOff), 'yandex OFF: still strips latin artist');

const namesOn =
  'Self Esteem by The Offspring — редкий момент, когда они соединили панк и мелодию. Этот трек стал хитом.';
const edgeOn = prepareEdgeTtsText(namesOn, {
  artist: 'The Offspring',
  title: 'Self Esteem',
  speakTrackNamesInVoiceover: true,
});
console.log('edgeOn:', edgeOn);
ok(/The Offspring/i.test(edgeOn), 'names ON: latin artist kept');
ok(/Self Esteem/i.test(edgeOn), 'names ON: latin title kept');
ok(/они/i.test(edgeOn), 'names ON: keeps они in body');
ok(/этот трек/i.test(edgeOn), 'names ON: keeps этот трек after first mention');
ok(!/\+/.test(edgeOn), 'edge ON: no stress plus marks');
ok(!/х\+ит/i.test(edgeOn), 'edge ON: no Yandex stress on Russian');

const segs = splitMixedLanguageForEdge(edgeOn, 'The Offspring', 'Self Esteem');
ok(hasForeignSegmentsForEdge(edgeOn, 'The Offspring', 'Self Esteem'), 'mixed latin segments');
ok(segs.some((s) => s.lang === 'en'), 'EN voice segment exists');
ok(segs.some((s) => s.lang === 'ru' && /они/i.test(s.text)), 'RU segment keeps они');

const placeholderOn =
  'Эта группа соединила панк и мелодию. Они записали этот трек за одну ночь.';
const withOpener = ensureEdgeLatinCitationOpener(
  placeholderOn,
  'The Offspring',
  'Self Esteem',
  true,
);
console.log('withOpener:', withOpener);
ok(/^Self Esteem by The Offspring/i.test(withOpener), 'opener prepends latin once');
ok(/эта группа/i.test(withOpener), 'opener does not replace body placeholder');

const sanitizeEdge = sanitizeScriptForTts(
  'Billboard назвал этот трек хитом. Эта группа тогда была на пике.',
  'Queen',
  'Bohemian Rhapsody',
  [],
  {
    speakTrackNamesInVoiceover: false,
    trackArtist: 'Queen',
    trackTitle: 'Bohemian Rhapsody',
    skipForeignPhonetic: true,
  },
);
console.log('sanitizeEdge:', sanitizeEdge);
ok(/Billboard/i.test(sanitizeEdge), 'skipForeignPhonetic: latin Billboard kept for Edge EN');
ok(/эта группа/i.test(sanitizeEdge), 'skipForeignPhonetic: placeholder kept');

const stromaeScript =
  'Mauvaise journée — Stromae. Родился в семье руандийского отца и бельгийской матери.';
const stromaeEdge = prepareEdgeTtsText(stromaeScript, {
  artist: 'Stromae',
  title: 'Mauvaise journée',
  speakTrackNamesInVoiceover: true,
});
const stromaeSegs = splitMixedLanguageForEdge(stromaeEdge, 'Stromae', 'Mauvaise journée');
console.log('stromaeSegs:', stromaeSegs);
ok(/journée/u.test(stromaeEdge), 'Stromae: journée intact as one word');
ok(
  stromaeSegs.filter((s) => s.lang === 'fr').length === 1 &&
    /Mauvaise journée — Stromae/i.test(stromaeSegs.find((s) => s.lang === 'fr')?.text ?? ''),
  'Stromae: one FR segment for title+artist',
);

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll Edge TTS prepare checks passed.');
