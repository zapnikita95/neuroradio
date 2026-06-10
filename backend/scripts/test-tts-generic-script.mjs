/**
 * Run: npm run build && node scripts/test-tts-generic-script.mjs
 */
import { genericizeScriptForVoiceover, isPrimarilyLatin } from '../dist/services/tts-generic-script.js';
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
console.log('RU →', ruOut);

const stress = applyRussianStressSafe('Трек собран из чужих семплами и барабанов.');
ok(stress.includes('с+эмплами'), 'семплами stress on first syllable');
console.log('stress →', stress);

if (process.exitCode) process.exit(process.exitCode);
console.log('\nAll generic/stress checks passed.');
