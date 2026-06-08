/**
 * Regression checks for enhanced TTS text pipeline (no network).
 * Run: npm run build && node scripts/test-tts-pipeline.mjs
 */
import assert from 'node:assert/strict';
import { prepareYandexTtsText, prepareSileroTtsText, prepareSileroTtsTextTrace } from '../dist/services/tts-markup.js';
import { resolveVoiceDelivery } from '../dist/services/tts-voice-profiles.js';
import {
  PremiumTtsAccessError,
  resolveEffectiveTtsProvider,
} from '../dist/services/tts-router.js';
import { resolveUserTier } from '../dist/services/entitlements.js';
import { enhanceMixedLanguageText } from '../dist/services/tts-en-normalize.js';
import { polishScriptForSpeechDelivery } from '../dist/services/tts-speech-polish.js';
import { buildAzureSsml, preparePlainSpeechText } from '../dist/services/tts-azure-ssml.js';
import { buildSaluteSsml } from '../dist/services/salute-ssml.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { applyRussianStressSafe } from '../dist/services/russian-stress.js';
import {
  hasEnglishSegmentsForSilero,
  splitMixedLanguageForSilero,
} from '../dist/services/tts-silero-segments.js';
import { wrapSileroRussianSsml } from '../dist/services/tts-silero-ssml.js';
import { normalizeYearsForRussianTts } from '../dist/services/tts-russian-years.js';

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

console.log('[test-tts-pipeline]');

test('mixed EN stays inline without articulation pauses', () => {
  const out = enhanceMixedLanguageText(
    'Трек Bohemian Rhapsody взорвал чарты.',
    'Queen',
    'Bohemian Rhapsody',
  );
  assert.doesNotMatch(out, /<\[small\]>\s*Bohemian/i);
  assert.match(out, /Bohemian/i);
});

test('SSML does not split trailing в in трэков before Latin name', () => {
  const ssml = buildYandexSsml(
    'Stranger in Moscow — один из самых личных трэков Michael Jackson.',
  );
  assert.doesNotMatch(ssml, /трэко<lang/i);
  assert.match(ssml, /трэков/i);
  assert.match(ssml, /<lang xml:lang="en-US">Michael Jackson/i);
});

test('SSML keeps preposition с in Russian stream before Latin', () => {
  const ssml = buildYandexSsml('подписал контракт с лейблом Young Money Entertainment.');
  assert.doesNotMatch(ssml, /<lang xml:lang="ru-RU">с<\/lang>/i);
  assert.match(ssml, /с лейблом/i);
  assert.match(ssml, /<lang xml:lang="en-US">Young Money Entertainment/i);
});

test('SSML keeps Don\'t Matter To Me as one English phrase without apostrophe pause', () => {
  const ssml = buildYandexSsml('В треке Don\u2019t Matter To Me он использует рэп-сингинг.');
  assert.doesNotMatch(ssml, />Don<\/lang>/i);
  assert.match(ssml, /Dont Matter To Me/i);
  assert.doesNotMatch(ssml, /Don&apos;t|Don't/i);
});

test('SSML reads It\'s as Its without apostrophe break', () => {
  const ssml = buildYandexSsml('трек Wake Me When It\u2019s Over — классика.');
  assert.match(ssml, /Wake Me When Its Over/i);
  assert.doesNotMatch(ssml, /It&apos;s|It's/i);
});

test('SSML softens Russian conjunction before English lang tag', () => {
  const ssml = buildYandexSsml('часть моей жизни, и The Cranberries — легенда.');
  assert.match(ssml, /<emphasis level="reduced">и<\/emphasis>\s*<lang xml:lang="en-US">The Cranberries/i);
  assert.match(ssml, /<lang xml:lang="en-US">The Cranberries<\/lang>/i);
});

test('prepareYandexTtsText reads R&B as ар эн би', () => {
  const out = prepareYandexTtsText('перенёс R&B в мейнстримный хип-хоп.', {
    artist: 'Drake',
    title: 'Test',
  });
  assert.match(out, /ар эн би/i);
  assert.doesNotMatch(out, /\bR\s*&\s*B\b/i);
});

test('prepareYandexTtsText stresses микстейпы', () => {
  const out = prepareYandexTtsText('он выпускал микстейпы Room for Improvement.', {
    artist: 'Drake',
    title: 'Test',
  });
  assert.match(out, /микст\+ейпы/i);
});

test('prepareYandexTtsText keeps preposition в after ар эн би', () => {
  const marked = prepareYandexTtsText('перенёс R&B в мейнстримный хип-хоп.', {
    artist: 'Drake',
    title: 'Test',
  });
  assert.match(marked, /ар эн би в мейнстримный/i);
  const ssml = buildYandexSsml(marked);
  assert.doesNotMatch(ssml, /R&amp;B/i);
});

test('SSML no break before Russian preposition after English', () => {
  const ssml = buildYandexSsml('уровень Drake в мейнстриме.');
  assert.match(ssml, /<lang xml:lang="en-US">Drake<\/lang> в /i);
  assert.doesNotMatch(ssml, /<\/lang><break time="\d+ms"\/>в /i);
});

test('polish splits long bureaucratic phrasing', () => {
  const raw =
    'В связи с тем, что данный трек был выпущен на лейбле, продюсер осуществил запись в студии.';
  const out = polishScriptForSpeechDelivery(raw);
  assert.ok(!/в связи с тем/i.test(out));
  assert.ok(out.length > 10);
});

test('polish keeps coordinated adjectives without period before и', () => {
  const raw =
    'Помню, как впервые услышал этот трек — его ритм казался одновременно чувственным и загадочным, будто он приглашал в тайный мир, куда мало кто мог попасть, и мы тогда только начинали понимать масштаб того, что происходит в эфире каждый вечер.';
  const out = polishScriptForSpeechDelivery(raw);
  assert.doesNotMatch(out, /чувственным\.\s+и загадочным/i);
  assert.match(out, /чувственным\s+и загадочным/i);
});

test('polish fixes меня мурашки бегут', () => {
  const out = polishScriptForSpeechDelivery('Меня до сих пор мурашки бегут, когда я слышу первые ноты.');
  assert.match(out, /у меня до сих пор мурашки бегут/i);
  assert.doesNotMatch(out, /^меня/i);
});

test('polish fixes зациклили and duplicate тогда after year', () => {
  const out = polishScriptForSpeechDelivery(
    'Тогда, в начале 2010 тогда, мы зациклили этот трек.',
  );
  assert.match(out, /в начале 2010/i);
  assert.doesNotMatch(out, /2010\s+тогда/i);
  assert.match(out, /гоняли по кругу/i);
  assert.doesNotMatch(out, /зациклили/i);
});

test('years in начале 2010 года spoken for TTS', () => {
  const spoken = normalizeYearsForRussianTts('Тогда, в начале 2010 года, они уже были легендами.');
  assert.match(spoken, /в начале две тысячи десятого года/i);
  assert.doesNotMatch(spoken, /\b2010\b/);
});

test('prepareYandexTtsText rewrites с Bandcamp to на Bandcamp', () => {
  const out = prepareYandexTtsText(
    'можно было скачать прямо с Bandcamp — и это было ново.',
    { artist: 'Океан Ельзи', title: 'Без бою' },
  );
  assert.match(out, /на Bandcamp/i);
  assert.doesNotMatch(out, /\sс Bandcamp/i);
});

test('SSML reads на Bandcamp without letter эс', () => {
  const marked = prepareYandexTtsText(
    'скачать прямо с Bandcamp — ново для нас.',
    { artist: 'Test', title: 'Test' },
  );
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /на\s*<lang xml:lang="en-US">Bandcamp/i);
  assert.doesNotMatch(ssml, /<emphasis level="reduced">[сС]<\/emphasis>/i);
});

test('SSML reads в начале две тысячи десятого года', () => {
  const marked = prepareYandexTtsText(
    'Тогда, в начале 2010 года, они уже были легендами.',
    { artist: 'Red Hot Chili Peppers', title: 'Snow' },
  );
  assert.match(marked, /в начале две тысячи десятого года/i);
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /две тысячи десятого года/i);
  assert.doesNotMatch(ssml, /\b2010\b/);
});

test('SSML reads moonwalk as moon walk in English', () => {
  const ssml = buildYandexSsml('Его moonwalk изменил сцену.');
  assert.match(ssml, /<lang xml:lang="en-US">moon walk<\/lang>/i);
});

test('SSML reads Xscape as X scape', () => {
  const ssml = buildYandexSsml('альбом Xscape вышел позже.');
  assert.match(ssml, /<lang xml:lang="en-US">X scape<\/lang>/i);
});

test('SSML reads OneRepublic split', () => {
  const ssml = buildYandexSsml('группа OneRepublic выступала.');
  assert.match(ssml, /<lang xml:lang="en-US">One Republic<\/lang>/i);
});

test('B-side reads as сторону бэ after как', () => {
  const out = prepareYandexTtsText(
    'группа рассматривала этот трек как B- для сингла We Are The Champions.',
    { artist: 'Queen', title: 'We Will Rock You' },
  );
  assert.match(out, /как сторону бэ/i);
  assert.doesNotMatch(out, /\bB-\b/i);
});

test('National Film Registry stays English in SSML', () => {
  const marked = prepareYandexTtsText(
    'клип в National Film Registry США.',
    { artist: 'Michael Jackson', title: 'Thriller' },
  );
  const ssml = buildYandexSsml(marked);
  assert.match(ssml, /<lang xml:lang="en-US">National Film Registry<\/lang>/i);
});

test('stress marks хаоса correctly', () => {
  const out = prepareYandexTtsText('родился из хаоса импровизации.', { artist: 'MJ', title: 'Test' });
  assert.match(out, /х\+аоса/i);
});

test('stress marks Deacon surname as д+икон', () => {
  const out = applyRussianStressSafe('бас Джона Дикона');
  assert.match(out, /Д\+икон/i);
});

test('websitePreview: John Landis → Джон Ландис (not джохн)', () => {
  const out = prepareYandexTtsText('John Landis снял клип.', {
    artist: 'Michael Jackson',
    title: 'Thriller',
    websitePreview: true,
  });
  assert.match(out, /Джон Ландис/i);
  assert.doesNotMatch(out, /джохн/i);
});

test('websitePreview: хореографу Майклу Питерсу, убеждать Джона Ландиса', () => {
  const out = prepareYandexTtsText(
    'Режиссёр John Landis пришёл из кино, а хореографу Michael Peters даже пришлось убеждать его оставить сцену.',
    {
      artist: 'Michael Jackson',
      title: 'Thriller',
      websitePreview: true,
    },
  );
  assert.match(out, /хореографу Майклу Питерсу/i);
  assert.match(out, /убеждать Джона Ландиса/i);
  assert.doesNotMatch(out, /убеждать его/i);
  assert.doesNotMatch(out, /хореографу Майкл Питерс[^у]/i);
});

test('prepareYandexTtsText adds sentence pauses', () => {
  const out = prepareYandexTtsText('Первая фраза. Вторая фраза про джаз.', {
    artist: 'Queen',
    title: 'Test',
    pauseProfile: 'natural',
  });
  assert.match(out, /<\[(?:small|medium)\]>/);
  assert.match(out, /дж(\+)?аз/i);
});

test('voice delivery maps radio_host narrator', () => {
  const d = resolveVoiceDelivery({
    ttsVoice: 'auto',
    ttsStyle: 'auto',
    storyNarrator: 'radio_host',
    year: 1985,
    genre: 'rock',
    clientVoiceLocked: false,
  });
  assert.equal(d.styleId, 'radio_host');
  assert.ok(d.speed >= 0.85 && d.speed <= 1.1);
});

test('premium tier without entitlement throws', () => {
  assert.throws(
    () =>
      resolveEffectiveTtsProvider({
        voiceTier: 'premium',
        ttsProvider: 'auto',
        installId: '00000000-0000-4000-8000-000000000099',
      }),
    PremiumTtsAccessError,
  );
});

test('free tier resolves to silero when enabled', () => {
  const prevEnabled = process.env.SILERO_TTS_ENABLED;
  const prevUrl = process.env.SILERO_TTS_URL;
  process.env.SILERO_TTS_ENABLED = 'true';
  process.env.SILERO_TTS_URL = 'http://127.0.0.1:8001';
  try {
    const p = resolveEffectiveTtsProvider({
      voiceTier: 'default',
      ttsProvider: 'auto',
      installId: '00000000-0000-4000-8000-000000000099',
    });
    assert.equal(p, 'silero');
  } finally {
    if (prevEnabled === undefined) delete process.env.SILERO_TTS_ENABLED;
    else process.env.SILERO_TTS_ENABLED = prevEnabled;
    if (prevUrl === undefined) delete process.env.SILERO_TTS_URL;
    else process.env.SILERO_TTS_URL = prevUrl;
  }
});

test('unknown install is free tier', () => {
  assert.equal(
    resolveUserTier('00000000-0000-4000-8000-000000000099'),
    'free',
  );
});

test('azure ssml uses ru-RU neural and english lang tags', () => {
  const plain = preparePlainSpeechText(
    'Трек Queen взорвал чарты.',
    'Queen',
    'Test',
  );
  const ssml = buildAzureSsml(plain, {
    voice: 'ru-RU-DmitryNeural',
    rate: '-8%',
    pauseProfile: 'natural',
  });
  assert.match(ssml, /ru-RU-DmitryNeural/);
  assert.match(ssml, /xml:lang="en-US"/);
  assert.match(ssml, /Queen/);
});

test('salute ssml uses sber voice and breaks', () => {
  const plain = preparePlainSpeechText('Привет. Трек Queen.', 'Queen', 'Test');
  const ssml = buildSaluteSsml(plain, {
    voice: 'Pon_24000',
    rate: 'medium',
    pauseProfile: 'natural',
  });
  assert.match(ssml, /Pon_24000/);
  assert.match(ssml, /<break time="/);
  assert.match(ssml, /xml:lang="en-US"/);
});

test('prepareSileroTtsText keeps Latin titles in English (no Cyrillic transliteration)', () => {
  const script =
    'Crazy Town выпустили Butterfly. Damiano David победил с песней «Zitti e buoni». ' +
    'Звукорежиссёр поймал свист в колонках. В 2021 году коллектив победил снова.';
  const trace = prepareSileroTtsTextTrace(script, {
    artist: 'Crazy Town',
    title: 'Butterfly',
  });
  const out = trace.prepared;
  assert.match(out, /Crazy Town/i);
  assert.match(out, /Butterfly/i);
  assert.match(out, /Zitti e buoni/i);
  assert.doesNotMatch(out, /Крейзи Таун/i);
  assert.doesNotMatch(out, /Баттерфлай/i);
  assert.doesNotMatch(out, /Цитти/i);
  assert.doesNotMatch(out, /в\s+кavыч/i);
  assert.match(out, /двадцать первом году/i);
  assert.match(out, /св\+ист|свист/i);
  assert.match(out, /кол\+он/i);
  assert.doesNotMatch(out, /<\[/);
  assert.equal(trace.latinReplacements.length, 0);
});

test('prepareSileroTtsText strips apostrophe in Latin titles', () => {
  const out = prepareSileroTtsText('трек Wake Me When It\u2019s Over звучит мощно.', {
    artist: 'The Cranberries',
    title: "Wake Me When It's Over",
  });
  assert.match(out, /Its Over/i);
  assert.doesNotMatch(out, /It's/i);
});

test('splitMixedLanguageForSilero keeps The Hit Co. as English', () => {
  const segs = splitMixedLanguageForSilero(
    'The Hit Co. — это группа, и их трэк My Favorite Game — отличный пример.',
    'The Hit Co.',
    'My Favorite Game',
  );
  const en = segs.filter((s) => s.lang === 'en').map((s) => s.text);
  assert.ok(en.some((t) => /The Hit Co/i.test(t)));
  assert.ok(en.some((t) => /My Favorite Game/i.test(t)));
  assert.ok(hasEnglishSegmentsForSilero('The Hit Co. — это группа.', 'The Hit Co.', 'My Favorite Game'));
});

test('wrapSileroRussianSsml adds sentence breaks and prosody', () => {
  const ssml = wrapSileroRussianSsml('Первая фраза. Вторая фраза.', {
    pauseProfile: 'natural',
    styleId: 'radio_host',
  });
  assert.match(ssml, /break time="420ms"/);
  assert.match(ssml, /prosody rate="medium" pitch="x-high"/);
  assert.match(ssml, /<s>/);
  assert.doesNotMatch(ssml, /The Hit/i);
});

console.log(`\n[test-tts-pipeline] ${passed} passed`);
