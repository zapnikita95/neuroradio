/**
 * Run: npm run build && node scripts/test-tts-generic-script.mjs
 */
import {
  genericizeScriptForVoiceover,
  isPrimarilyLatin,
  shouldStripLatinTrackNames,
} from '../dist/services/tts-generic-script.js';
import { applyRussianStressSafe } from '../dist/services/russian-stress.js';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('OK:', msg);
  }
}

ok(isPrimarilyLatin('Killing in The Name') === true, 'latin title detected');
ok(isPrimarilyLatin('Лагерная Пыль') === false, 'cyrillic title kept');
ok(isPrimarilyLatin('Snow (Hey Oh)') === true, 'mixed latin title');
ok(shouldStripLatinTrackNames('Король и Шут') === false, 'cyrillic artist not stripped');
ok(shouldStripLatinTrackNames('Snow (Hey Oh)') === true, 'latin title stripped');

const rhcp =
  'Snow от Red Hot Chili Peppers — гитарный рифф с альбома Stadium Arcadium. ' +
  'В начале две тысячи седьмого Snow крутили на повторе.';
const rhcpOut = genericizeScriptForVoiceover(rhcp, 'Red Hot Chili Peppers', 'Snow (Hey Oh)');
ok(!/Snow/i.test(rhcpOut), 'latin title removed from RHCP sample');
ok(!/Red Hot/i.test(rhcpOut), 'latin artist removed');
ok(/эта песня|этот трек|в треке|эта композиция|у этой песни/i.test(rhcpOut), 'track substitute present');
ok(!/\s{2,}|,\s*,/.test(rhcpOut), 'no empty holes in RHCP sample');
console.log('RHCP →', rhcpOut);

const ru =
  'Лагерная Пыль от Король и Шут — редкий трек из середины девяностых. ' +
  'Лагерная Пыль тогда звучала на каждом концерте.';
const ruOut = genericizeScriptForVoiceover(ru, 'Король и Шут', 'Лагерная Пыль');
ok(ruOut.includes('Лагерная Пыль'), 'cyrillic title preserved');
ok(ruOut.includes('от Король и Шут'), 'cyrillic artist kept in lead');
const offspring =
  'Self Esteem от The Offspring — панк-хит девяностых. Offspring тогда гремели на каждом фестивале.';
const offspringOut = genericizeScriptForVoiceover(offspring, 'The Offspring', 'Self Esteem');
ok(!/Offspring/i.test(offspringOut), 'Offspring alias stripped without The');
ok(!/Self Esteem/i.test(offspringOut), 'latin title stripped for Offspring sample');
ok(/группа|исполнитель|артист|музыкант/i.test(offspringOut), 'artist substitute in Offspring sample');
console.log('Offspring →', offspringOut);

const ev =
  'EV выпустил клип на трек Cuppa Tea. История повторилась с EV. Его трек — полностью авторская работа.';
const evOut = genericizeScriptForVoiceover(ev, 'EV', 'Cuppa Tea');
ok(!/\bEV\b/i.test(evOut), 'EV stripped from voiceover');
ok(!/Cuppa Tea/i.test(evOut), 'Cuppa Tea stripped');
ok(/музыкант|исполнитель|артист/i.test(evOut), 'artist substitute at start');
ok(/с ним/i.test(evOut), 'prepositional fix for с артист');
console.log('EV →', evOut);

const vedder =
  'Jonah Weiner из Blender назвал песней, где завораживающий вокал у костра. ' +
  'здесь не просто поёт — он проводит ритуал. В нет потолка — только бесконечность.';
const vedderOut = genericizeScriptForVoiceover(vedder, 'Eddie Vedder', 'No Ceiling');
ok(!/здесь не просто поёт/i.test(vedderOut), 'здесь → он before поёт');
ok(!/В нет потолка/i.test(vedderOut), 'broken No Ceiling phrase fixed');
console.log('Vedder →', vedderOut);

const acdc = '/ — гитарный рифф, который держит весь зал.';
const acdcOut = genericizeScriptForVoiceover(acdc, 'AC/DC', 'Thunderstruck');
ok(!/^\s*\//.test(acdcOut), 'no leading slash after AC/DC strip');
console.log('AC/DC →', acdcOut);

const stress = applyRussianStressSafe('Трек собран из чужих семплами и барабанов.');
ok(stress.includes('с+эмплами'), 'семплами stress on first syllable');
console.log('stress →', stress);

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll generic/stress checks passed.');
