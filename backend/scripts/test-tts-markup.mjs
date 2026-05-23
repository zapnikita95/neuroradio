import { prepareYandexTtsText, latinToPhonemeBlock } from '../dist/services/tts-markup.js';

const sample =
  'На живом концерте Fanfare Ciocarlia вышел с «Moliendo café» — зал замолчал. ' +
  'Я стоял у мониторов, звукорежиссёры краснели от свиста в колонках.';

console.log('=== Latin phonemes ===');
console.log('James:', latinToPhonemeBlock('James'));
console.log('Brown:', latinToPhonemeBlock('Brown'));
console.log('café:', latinToPhonemeBlock('café'));

console.log('\n=== Full markup ===');
console.log(
  prepareYandexTtsText(sample, {
    artist: 'Fanfare Ciocarlia',
    title: 'Moliendo café',
  }),
);

console.log('\n=== Stress words ===');
console.log(prepareYandexTtsText('Инженер у монитора в студии поставил атлас на замок.', {}));
