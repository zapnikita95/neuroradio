/**
 * Regression checks for enhanced TTS text pipeline (no network).
 * Run: npm run build && node scripts/test-tts-pipeline.mjs
 */
import assert from 'node:assert/strict';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';
import { normalizeYandexSpeechTokens } from '../dist/services/tts-yandex-normalize.js';
import { resolveVoiceDelivery } from '../dist/services/tts-voice-profiles.js';
import {
  PremiumTtsAccessError,
  resolveEffectiveTtsProvider,
} from '../dist/services/tts-router.js';
import { resolveUserTier } from '../dist/services/entitlements.js';
import { setDevTierOverride } from '../dist/services/dev-tier-store.js';
import { enhanceMixedLanguageText } from '../dist/services/tts-en-normalize.js';
import { polishScriptForSpeechDelivery } from '../dist/services/tts-speech-polish.js';
import { buildAzureSsml, preparePlainSpeechText } from '../dist/services/tts-azure-ssml.js';
import { buildSaluteSsml } from '../dist/services/salute-ssml.js';
import { buildYandexSsml } from '../dist/services/tts-yandex-ssml.js';
import { applyRussianStressSafe } from '../dist/services/russian-stress.js';
import {
  hasForeignSegmentsForEdge,
  splitMixedLanguageForEdge,
} from '../dist/services/tts-mixed-segments.js';
import { resolveEdgeTtsDeliveryForPreset } from '../dist/services/edge-tts-en.js';
import { normalizeYearsForRussianTts, normalizeDecadesForRussianTts } from '../dist/services/tts-russian-years.js';
import { sanitizeScriptForTts } from '../dist/services/story-quality.js';
import { sanitizeClosingTail } from '../dist/services/story-closing-phrases.js';
import { normalizeEdgeRussianOrthography } from '../dist/services/tts-edge-normalize.js';

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

test('prepareYandexTtsText reads MP3 as эмп+э три (no en-US lang wrap)', () => {
  const out = prepareYandexTtsText(
    'Трек стал основой для первого в истории MP3-кодирования.',
    { artist: 'Suzanne Vega', title: "Tom's Diner" },
  );
  assert.match(out, /эмп(\+)?э три/i);
  assert.doesNotMatch(out, /\bMP3\b/i);
  const ssml = buildYandexSsml(out);
  assert.doesNotMatch(ssml, /<lang[^>]*>.*?MP3/i);
  assert.doesNotMatch(ssml, /MP3-/i);
});

test('prepareYandexTtsText reads filler as ф+иллер (no en-US lang wrap)', () => {
  const out = prepareYandexTtsText(
    'После такой истории трек звучит не как filler, а как событие.',
    { artist: 'Queen', title: 'I Want To Break Free' },
  );
  assert.match(out, /ф(\+)?иллер/i);
  assert.doesNotMatch(out, /\bfiller\b/i);
  const ssml = buildYandexSsml(out);
  assert.doesNotMatch(ssml, /<lang[^>]*>filler/i);
  assert.doesNotMatch(ssml, /\bfiller\b/i);
});

test('normalizeYandexSpeechTokens reads pop-punk as two words поп панк', () => {
  assert.match(normalizeYandexSpeechTokens('главный pop-punk хит.'), /поп панк/i);
  assert.match(normalizeYandexSpeechTokens('стиль поп-панк.'), /поп панк/i);
  assert.doesNotMatch(normalizeYandexSpeechTokens('pop-punk хит.'), /поппанк/i);
});

test('normalizeYandexSpeechTokens reads LO-FI as л+оу ф+ай', () => {
  const out = normalizeYandexSpeechTokens('Вокруг LO-FI продакшна.');
  assert.match(out, /л(\+)?оу ф(\+)?ай/i);
  assert.doesNotMatch(out, /\bLO-FI\b/i);
  const ssml = buildYandexSsml(out);
  assert.doesNotMatch(ssml, /<lang[^>]*>lo[\s-]?fi/i);
});

test('SSML keeps Last.fm as one English lang span', () => {
  const ssml = buildYandexSsml('сингл попал в ротацию на Last.fm.');
  assert.match(ssml, /<lang xml:lang="en-US">Last\.fm<\/lang>/i);
  assert.doesNotMatch(ssml, /<\/lang>\.<lang[^>]*>fm/i);
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

test('SSML merges Title ot Artist into one English phrase', () => {
  const ssml = buildYandexSsml(
    'Killing in The Name от Rage Against The Machine возглавил британский чарт.',
  );
  assert.match(
    ssml,
    /<lang xml:lang="en-US">Killing in The Name by Rage Against The Machine<\/lang>\s+возглавил/i,
  );
  assert.doesNotMatch(ssml, /от<\/lang>|<\/lang>\s*<emphasis[^>]*>от/i);
  assert.doesNotMatch(ssml, /<lang xml:lang="en-US">Killing in The Name<\/lang>/i);
});

test('SSML merges Rammstein title ot artist with de-DE lang', () => {
  const ssml = buildYandexSsml('Du hast от Rammstein — Neue Deutsche Härte.');
  assert.match(ssml, /<lang xml:lang="de-DE">Du hast by Rammstein<\/lang>/i);
  assert.doesNotMatch(ssml, /xml:lang="en-US">Rammstein/i);
});

test('prepareYandexTtsText merges track ot artist from metadata', () => {
  const out = prepareYandexTtsText(
    'Killing in The Name от Rage Against The Machine возглавил чарт.',
    { artist: 'Rage Against The Machine', title: 'Killing in The Name' },
  );
  const ssml = buildYandexSsml(out);
  assert.match(ssml, /Killing in The Name by Rage Against The Machine/i);
  assert.doesNotMatch(ssml, />\s*от\s*</i);
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

test('years after season spoken for TTS', () => {
  const spoken = normalizeYearsForRussianTts('стал саундтреком лета 2014 тогда.');
  assert.match(spoken, /лета две тысячи четырнадцатого года/i);
  assert.doesNotMatch(spoken, /\b2014\b/);
});

test('polish removes тогда after season year', () => {
  const out = polishScriptForSpeechDelivery('стал саундтреком лета 2014 тогда.');
  assert.doesNotMatch(out, /2014\s+тогда/i);
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

test('sanitize keeps 80-х (no «80 тогда» orphan)', () => {
  const out = sanitizeScriptForTts(
    'классикой 80-х вроде Sixteen Candles',
    'Friday Night At The Movies',
    'Canción del Mariachi',
  );
  assert.match(out, /80-х/i);
  assert.doesNotMatch(out, /80\s+тогда/i);
});

test('decades spoken: классикой 80-х → восьмидесятых', () => {
  const spoken = normalizeDecadesForRussianTts('классикой 80-х вроде');
  assert.match(spoken, /классикой восьмидесятых/i);
  assert.doesNotMatch(spoken, /80/i);
});

test('decades spoken: 2020-х → две тысячи двадцатых', () => {
  const spoken = normalizeDecadesForRussianTts('Тогда, в начале 2020-х, мы все искали');
  assert.match(spoken, /две тысячи двадцатых/i);
  assert.doesNotMatch(spoken, /\b2020\b/i);
  assert.doesNotMatch(spoken, /^Тогда, в начале двадцатых/i);
});

test('decades spoken: 2010-х → две тысячи десятых', () => {
  const spoken = normalizeDecadesForRussianTts('стиль 2010-х');
  assert.match(spoken, /две тысячи десятых/i);
});

test('decades spoken: 2000-х → двухтысячных', () => {
  const spoken = normalizeDecadesForRussianTts('в 2000-х');
  assert.match(spoken, /двухтысячных/i);
});

test('closing tail keeps Tous les Mêmes (not ê)', () => {
  const script =
    'Marga Bult — певица. Среди её работ можно выделить Tous les Mêmes.';
  const out = sanitizeClosingTail(script, 'ru');
  assert.match(out, /Tous les Mêmes/i);
  assert.doesNotMatch(out, />ê\./i);
});

test('Yandex TTS: режиссёр Marc Klasfeld и MTV без en-US SSML', () => {
  const script =
    'Режиссёр Marc Klasfeld признался MTV, что клип вдохновлён фильмами Джона Хьюза и классикой 80-х вроде Sixteen Candles.';
  const out = prepareYandexTtsText(script, {
    artist: 'Friday Night At The Movies',
    title: 'Canción del Mariachi',
    speakTrackNamesInVoiceover: false,
  });
  const ssml = buildYandexSsml(out);
  assert.match(out, /Марк Кл\+?асфелд/i);
  assert.match(out, /МТВ/i);
  assert.match(out, /восьмидесятых/i);
  assert.doesNotMatch(out, /Marc Klasfeld/i);
  assert.doesNotMatch(out, /\bMTV\b/i);
  assert.doesNotMatch(ssml, /xml:lang="en-US">Marc/i);
  assert.doesNotMatch(ssml, /xml:lang="en-US">MTV/i);
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

test('trial tier with premium voice does not throw (EN → paid TTS path)', () => {
  const prev = process.env.ALLOW_DEV_TIER_SWITCH;
  process.env.ALLOW_DEV_TIER_SWITCH = 'true';
  const installId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  setDevTierOverride(installId, 'trial');
  try {
    assert.doesNotThrow(() =>
      resolveEffectiveTtsProvider({
        voiceTier: 'premium',
        ttsProvider: 'auto',
        installId,
        storyLanguage: 'en',
      }),
    );
    const provider = resolveEffectiveTtsProvider({
      voiceTier: 'premium',
      ttsProvider: 'auto',
      installId,
      storyLanguage: 'en',
    });
    assert.notEqual(provider, 'edge', `trial EN should not fall back to free edge, got ${provider}`);
  } finally {
    setDevTierOverride(installId, null);
    if (prev === undefined) delete process.env.ALLOW_DEV_TIER_SWITCH;
    else process.env.ALLOW_DEV_TIER_SWITCH = prev;
  }
});

test('free tier resolves to edge TTS', () => {
  const p = resolveEffectiveTtsProvider({
    voiceTier: 'default',
    ttsProvider: 'auto',
    installId: '00000000-0000-4000-8000-000000000099',
  });
  assert.equal(p, 'edge');
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

test('splitMixedLanguageForEdge splits Latin for mixed Edge voices', () => {
  const segs = splitMixedLanguageForEdge(
    'The Hit Co. — это группа, и их трэк My Favorite Game — отличный пример.',
    'The Hit Co.',
    'My Favorite Game',
  );
  const en = segs.filter((s) => s.lang === 'en').map((s) => s.text);
  assert.ok(en.some((t) => /The Hit Co/i.test(t)));
  assert.ok(en.some((t) => /My Favorite Game/i.test(t)));
  assert.ok(hasForeignSegmentsForEdge('The Hit Co. — это группа.', 'The Hit Co.', 'My Favorite Game'));
});

test('Edge TTS rate uses integer percent not +6.00%', () => {
  const d = resolveEdgeTtsDeliveryForPreset('dmitry_lively', 1.0);
  assert.match(d.rate, /^\+6%$/);
  assert.doesNotMatch(d.rate, /\.00/);
});

test('normalizeEdgeRussianOrthography collapses loanword geminates', () => {
  assert.equal(
    normalizeEdgeRussianOrthography('Этот хит держится на гитарном риффе с альбома.'),
    'Этот хит держится на гитарном рифе с альбома.',
  );
  assert.equal(
    normalizeEdgeRussianOrthography('гитарный рифф с альбома'),
    'гитарный риф с альбома',
  );
  assert.equal(
    normalizeEdgeRussianOrthography('В классе играли басс и рифф.'),
    'В классе играли бас и риф.',
  );
  assert.equal(
    normalizeEdgeRussianOrthography('Он учился в классе и бассейне.'),
    'Он учился в классе и бассейне.',
  );
});

console.log(`\n[test-tts-pipeline] ${passed} passed`);
