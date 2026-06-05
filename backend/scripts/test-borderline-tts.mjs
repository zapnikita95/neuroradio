import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { enhanceMixedLanguageText } from '../dist/services/tts-en-normalize.js';

const script =
  "Tame Impala встал перед аудиторией и сказал: «there's no going back from this point on». Это звучит как бросая вызов самому себе, как будто граница исчезает.";

const enhanced = enhanceMixedLanguageText(script, 'Tame Impala', 'Borderline');
console.log('--- enhanceMixedLanguageText ---');
console.log(enhanced);

let t = enhanced;
t = t.replace(/([.!?…])(\s+)(?=[А-ЯЁа-яё«])/g, '$1 <[small]>$2');
console.log('--- after sentence pauses ---');
console.log(t);
t = t.replace(/,(\s+)(?=[А-ЯЁа-яё])/g, ', <[small]>$1');
console.log('--- after comma pauses ---');
console.log(t);
t = t.replace(/«\s*/g, '«<[small]> ');
console.log('--- after quote open ---');
console.log(t);
t = t.replace(/\s*»/g, ' <[small]>»');
console.log('--- after quote close ---');
console.log(t);

console.log('--- prepareYandexTtsText ---');
console.log(prepareYandexTtsText(script, { artist: 'Tame Impala', title: 'Borderline' }));
