import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

const sample =
  'На живом концерте Fanfare Ciocarlia вышел с «Moliendo café» — зал замолчал. ' +
  'Я стоял у мониторов, звукорежиссёры краснели от свиста в колонках.';

console.log('=== Full markup (Latin unchanged, Cyrillic stressed) ===');
console.log(
  prepareYandexTtsText(sample, {
    artist: 'Fanfare Ciocarlia',
    title: 'Moliendo café',
  }),
);

console.log('\n=== Dean Martin sample ===');
const deanScript =
  'На живом концерте Dean Martin вышел с «Mambo Italiano» — зал замолчал на первой ноте.';
console.log(prepareYandexTtsText(deanScript, { artist: 'Dean Martin', title: 'Mambo Italiano' }));
