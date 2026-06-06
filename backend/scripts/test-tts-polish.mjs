import { polishScriptForSpeechDelivery, splitLongSentencesForSpeech } from '../dist/services/tts-speech-polish.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { findIncompleteEnding, trimToLastCompleteSentence } from '../dist/services/story-quality.js';

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
if (marked.includes('а её') || marked.includes('но за')) {
  console.log('OK: marked text keeps conjunctions');
} else {
  console.error('FAIL: marked text lost conjunctions');
  console.error(marked);
  process.exit(1);
}
console.log('OK: all TTS polish checks passed');

const damianoScript =
  'Damiano David — итальянский певец, фронтмен рок-группы Måneskin. В 2021 году коллектив победил на фестивале Sanremo Music Festival и на Евровидении с песней «Zitti e buoni». В 2024 году David начал сольную карьеру, выпустив синглы «Silverlines» и «Born with a Broken Heart».';
const damianoMarked = prepareYandexTtsText(damianoScript, {
  artist: 'Damiano David',
  title: 'Next Summer',
});
for (const forbidden of ['Silverlines', 'Zitti e buoni', 'Måneskin', 'Må ']) {
  if (damianoMarked.includes(forbidden)) {
    console.error(`FAIL: Latin left in TTS: ${forbidden}`);
    console.error(damianoMarked);
    process.exit(1);
  }
}
if (!damianoMarked.includes('Зитти') || !damianoMarked.includes('Силверлайнз')) {
  console.error('FAIL: expected Cyrillic pronunciations for Italian/English titles');
  console.error(damianoMarked);
  process.exit(1);
}
console.log('OK: foreign pronunciation transliteration');
