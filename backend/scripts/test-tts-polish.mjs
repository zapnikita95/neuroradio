import { polishScriptForSpeechDelivery } from '../dist/services/tts-speech-polish.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { buildYandexSsml, hasLatinForSsml } from '../dist/services/tts-yandex-ssml.js';
import { ALL_VOICES, coerceVoiceForSpeechKit } from '../dist/services/voices.js';
import { findIncompleteEnding, trimToLastCompleteSentence, stripTrackTitleGuillemets } from '../dist/services/story-quality.js';

const ellaScript =
  'TikTok — это не просто приложение, а лабиринт, где из спальни вырвался звук, который теперь слушатели не могут вытеснить. Ella Boh записала «babydoll» в своей маленькой комнате, а её друг, убеждённый, что шутка может стать вирусом, выложил клип без малейшего продюсерского плана. Сначала это был лишь шёпот в ночи, но алгоритм подхватил мелодию, и она начала разлетаться по ленте, как пыльца по ветру. Слышать, как в припеве звучит «lalala», но за этим скрывается не просто прикол, а попытка отразить внутренний диалог, где каждый «малыш» — это часть её собственного эха. В этом и есть суть: bedroom‑запись превратилась в глобальный трек, а безымянный друг стал тем, кто открыл дверь в мир, где талант может родиться в четырех стенах. И всё, что осталось, — это слушать, как';

const mustKeep = ['а её друг', 'но за этим', 'а попытка', 'где каждый', 'bedroom', 'а безымянный', 'где талант'];

const polished = polishScriptForSpeechDelivery(ellaScript);
for (const phrase of mustKeep) {
  if (!polished.includes(phrase.replace('bedroom', 'bedroom'))) {
    const ok =
      phrase === 'bedroom' ? /bedroom/i.test(polished) : polished.includes(phrase);
    if (!ok) {
      console.error(`FAIL: missing "${phrase}" after polish`);
      console.error('polished:', polished);
      process.exit(1);
    }
  }
}
console.log('OK: conjunctions preserved after polish');

const incomplete = findIncompleteEnding(ellaScript);
if (!incomplete) {
  console.error('FAIL: should detect incomplete ending');
  process.exit(1);
}
const trimmed = trimToLastCompleteSentence(ellaScript);
if (findIncompleteEnding(trimmed)) {
  console.error('FAIL: trim should fix ending');
  console.error('trimmed:', trimmed);
  process.exit(1);
}
console.log('OK: incomplete ending trimmed to:', trimmed.slice(-60));

const marked = prepareYandexTtsText(ellaScript, { artist: 'Ella Boh', title: 'babydoll' });
if (!marked.includes('в кавычках')) {
  console.error('FAIL: quotes not expanded for speech');
  process.exit(1);
}
if (marked.includes('фраза в кавычках')) {
  console.error('FAIL: should not use "фраза в кавычках"');
  process.exit(1);
}
if (marked.includes('On Mor Tim') || marked.includes('Spиrs')) {
  console.error('FAIL: should not transliterate Latin to fake Cyrillic');
  process.exit(1);
}
console.log('OK: marked text polish');

const britneyScript =
  'Когда Britney Spears выпустила «Baby One More Time», никто не ожидал, что школьная форма станет символом целой эпохи. «Baby One More Time» — это не просто песня, это точка отсчёта новой эры поп-музыки.';
const britneyMarked = prepareYandexTtsText(britneyScript, {
  artist: 'Britney Spears',
  title: 'Baby One More Time',
});
if (!britneyMarked.includes('Baby One More Time')) {
  console.error('FAIL: English title must stay Latin in marked text');
  console.error(britneyMarked);
  process.exit(1);
}
if (britneyMarked.includes('On Mor Tim')) {
  console.error('FAIL: must not butcher English title');
  process.exit(1);
}
if (!hasLatinForSsml(britneyMarked)) {
  console.error('FAIL: should use SSML for mixed RU/EN');
  process.exit(1);
}
const ssml = buildYandexSsml(britneyMarked, 'ermil');
if (!ssml.includes('xml:lang="en-US">Baby One More Time</lang>')) {
  console.error('FAIL: SSML must wrap title in en-US');
  console.error(ssml);
  process.exit(1);
}
if (ssml.includes('<voice')) {
  console.error('FAIL: Yandex SSML must not use <voice> tag');
  process.exit(1);
}
if (!ssml.includes('xml:lang="en-US">Britney Spears</lang>')) {
  console.error('FAIL: SSML must wrap artist in en-US');
  process.exit(1);
}
console.log('OK: Britney SSML en-US lang tags');

const damianoScript =
  'Damiano David — итальянский певец, фронтмен рок-группы Måneskin. В 2021 году коллектив победил с песней «Zitti e buoni».';
const damianoMarked = prepareYandexTtsText(damianoScript, {
  artist: 'Damiano David',
  title: 'Next Summer',
});
if (!/с песней Zitti e buoni/i.test(damianoMarked)) {
  console.error('FAIL: song title must be spoken without "в кavычках" wrapper');
  console.error(damianoMarked);
  process.exit(1);
}
if (!damianoMarked.includes('двадцать первом году')) {
  console.error('FAIL: year must be spoken as Russian ordinal');
  console.error(damianoMarked);
  process.exit(1);
}
if (!damianoMarked.includes('Zitti e buoni')) {
  console.error('FAIL: Italian title must stay Latin for SSML');
  console.error(damianoMarked);
  process.exit(1);
}
const damianoSsml = buildYandexSsml(damianoMarked, 'ermil');
if (!damianoSsml.includes('xml:lang="it-IT">Zitti e buoni')) {
  console.error('FAIL: Italian title should use it-IT in SSML');
  console.error(damianoSsml);
  process.exit(1);
}
console.log('OK: Italian SSML it-IT lang tags');

const mjScript =
  'Michael Jackson, король поп-музыки, выпустил «Hollywood Tonight». Его движения — moonwalk, robot, anti-gravity lean — стали языком всего мира.';
const mjMarked = prepareYandexTtsText(mjScript, {
  artist: 'Michael Jackson',
  title: 'Hollywood Tonight',
});
if (/Hollyw[уy]d|Ton[аa]йt|Mi[чc]ael/i.test(mjMarked)) {
  console.error('FAIL: Latin must not be corrupted by stress pass');
  console.error(mjMarked);
  process.exit(1);
}
if (!mjMarked.includes('Hollywood Tonight') || !mjMarked.includes('Michael Jackson')) {
  console.error('FAIL: artist/title Latin preserved');
  process.exit(1);
}
console.log('OK: Michael Jackson Latin preserved in marked text');

const smoothScript =
  'Carlos Santana выпустил Smooth — трек, который вернул его на вершину чартов.';
const smoothStripped = stripTrackTitleGuillemets(
  'Carlos Santana выпустил «Smooth» — трек, который вернул его на вершину чартов.',
  'Smooth',
);
if (smoothStripped.includes('«Smooth»')) {
  console.error('FAIL: track title guillemets should be stripped');
  process.exit(1);
}
console.log('OK: track title guillemets stripped');

const bepScript =
  'Black Eyed Peas — группа. В составе will.i.am, apl.de.ap и Taboo. Хит — Let\'s Get It Started.';
const bepMarked = prepareYandexTtsText(bepScript, {
  artist: 'Black Eyed Peas',
  title: "Let's Get It Started",
});
if (!bepMarked.includes('will.i.am') || !bepMarked.includes('apl.de.ap')) {
  console.error('FAIL: dotted stage names must survive TTS prep');
  console.error(bepMarked);
  process.exit(1);
}
const bepSsml = buildYandexSsml(bepMarked, 'filipp');
if (bepSsml.includes('<voice')) {
  console.error('FAIL: no voice tag in SSML');
  process.exit(1);
}
console.log('OK: stage names + SSML without voice tag');

for (const voiceId of ALL_VOICES) {
  const apiVoice = coerceVoiceForSpeechKit(voiceId);
  const ssml = buildYandexSsml(bepMarked, apiVoice);
  if (ssml.includes('<voice')) {
    console.error(`FAIL: voice ${voiceId} SSML has forbidden <voice> tag`);
    process.exit(1);
  }
}
console.log(`OK: all ${ALL_VOICES.length} UI voices SSML valid (no voice tag)`);

console.log('OK: all TTS polish checks passed');
