/**
 * Run: npm run build && node scripts/test-story-quality.mjs
 */
import { validateStoryScript, sanitizeScriptForTts, findLlmGarbage } from '../dist/services/story-quality.js';
import { validateLlmSeedCandidate } from '../dist/services/story-llm-fact-hunt.js';
import { hasEnglishLeak } from '../dist/services/story-russian-language.js';
import { prepareYandexTtsText } from '../dist/services/tts-markup.js';

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed++;
}
function ok(msg) {
  console.log(`OK: ${msg}`);
}

const BAD_LOU_BEGA =
  'Я сидел в студии, где мы собирались по вечерам. Вдруг раздался характерный гитарный рифф «Mambo No. 5» Lou Bega, и я просто забыл обо всем. Музыка может соединить всех нас.';

const BAD_HAWKINS =
  "Сквозь миганье лампочек студии я слышу шепот гитариста. Он подсказывает Screamin' Jay Hawkins, как создать шарм. Эта песня чрезвычайно влияющая на развитие рока.";

const GOOD_SAMPLE =
  'Продюсер взял старый сэмпл «Perez Prado» — «Mambo No. 5» — и Lou Bega дописал куплеты в студии в Мюнхене. На радио сначала крутили только клубную версию, без списка имён. Потом лейбл вытащил сингл в эфир, и каждый куплет перечислял девушку с другого континента — от «Sandra» до «Marilyn». Именно этот приём сделали главной фишкой трека, а не гитарный рифф, как многие думают сегодня в клубах.';

const LOU_SEED =
  'Lou Bega adapted Perez Prado Mambo No. 5 and added verses listing women names in Munich studio.';

for (const [label, text] of [
  ['Lou Bega water', BAD_LOU_BEGA],
  ['Hawkins water', BAD_HAWKINS],
]) {
  const val = validateStoryScript(text, '30s', 'Lou Bega', 'Mambo No. 5', {
    referenceFacts: [LOU_SEED],
  });
  if (val.ok) {
    fail(`${label} should be rejected`);
  } else {
    ok(`${label} rejected (${val.reason})`);
  }
}

const goodVal = validateStoryScript(GOOD_SAMPLE, '30s', 'Lou Bega', 'Mambo No. 5', {
  referenceFacts: [
    LOU_SEED,
    'Perez Prado',
    'Munich',
    'verses listing women',
    'club version',
    'radio',
  ],
  strictLength: false,
});
if (!goodVal.ok) {
  fail(`good sample rejected: ${goodVal.reason}`);
} else {
  ok('concrete fact sample accepted');
}

const ENGLISH_LEAK =
  '«Dancing Queen» — единственный #1 ABBA в США, viral hit на Billboard top-5.';
const repairedLeak = (await import('../dist/services/story-russian-language.js')).repairRussianScriptLanguage(
  ENGLISH_LEAK,
  'ABBA',
  'Dancing Queen',
);
if (/viral\b/i.test(repairedLeak) || /top-5/i.test(repairedLeak) || /#\s*1/.test(repairedLeak)) {
  fail(`repair should fix english jargon: ${repairedLeak}`);
} else {
  ok('english jargon repaired instead of rejecting story');
}
const englishVal = validateStoryScript(repairedLeak, '30s', 'ABBA', 'Dancing Queen', {
  strictLength: false,
  speakTrackNamesInVoiceover: true,
});
if (englishVal.ok) {
  ok('repaired english jargon script accepted');
} else if (englishVal.reason === 'english words in Russian narration') {
  fail('repaired script must not fail english gate');
} else {
  ok(`repaired script: ${englishVal.reason}`);
}

const RUSSIAN_ABBA =
  '«Dancing Queen» — единственный хит ABBA, который дошёл до первого места в американском хит-параде. Для шведов это был редкий случай: их песню услышала вся страна по радио, хотя дома они уже давно правили эфиром.';
const ruVal = validateStoryScript(RUSSIAN_ABBA, '30s', 'ABBA', 'Dancing Queen', {
  referenceFacts: ['It was ABBA\'s only number-one hit on the Billboard Hot 100.'],
  strictLength: false,
});
if (hasEnglishLeak(RUSSIAN_ABBA, 'ABBA', 'Dancing Queen')) {
  fail('pure Russian ABBA sample should not leak English');
} else if (!ruVal.ok && !String(ruVal.reason).includes('too short')) {
  fail(`Russian ABBA sample rejected: ${ruVal.reason}`);
} else {
  ok(ruVal.ok ? 'Russian ABBA sample accepted' : `Russian ABBA lenient (${ruVal.reason})`);
}

const POP_HYBRID =
  'В те годы было популярно сочетание pop-музыки и электроники, и «Alors on danse» Stromae это точно показал в студии.';
if (hasEnglishLeak(POP_HYBRID, 'Stromae', 'Alors on danse')) {
  fail('pop-музыки hybrid should not count as English leak');
} else {
  ok('pop-музыки hybrid allowed');
}

const STROMAE_SCRIPT =
  'Mauvaise journée — Stromae, и в этой песне слышны отголоски сложной судьбы. Отец из Руанды и бельгийская мать создали тот уникальный фундамент, на котором строится всё звучание. Stromae мастерски переносит этот опыт в современную поп музыку.';
const stromaeVal = validateStoryScript(STROMAE_SCRIPT, '30s', 'Stromae', 'Mauvaise journée', {
  referenceFacts: [
    'Stromae родился в семье руандийского отца и бельгийской матери, что повлияло на его мультикультурное творчество.',
  ],
  strictLength: false,
  speakTrackNamesInVoiceover: true,
});
if (hasEnglishLeak(STROMAE_SCRIPT, 'Stromae', 'Mauvaise journée', { blockTrackLatin: false })) {
  fail('Stromae + Mauvaise journée (accents) should not leak English');
} else if (!stromaeVal.ok && stromaeVal.reason === 'english words in Russian narration') {
  fail(`Stromae script rejected for english leak: ${stromaeVal.reason}`);
} else {
  ok('Stromae Mauvaise journée title accents allowed');
}

const MTV_SCRIPT =
  'Thriller — Michael Jackson. MTV крутил клип в эфир, когда на канале в основном играли рок.';
const mtvVal = validateStoryScript(MTV_SCRIPT, '30s', 'Michael Jackson', 'Thriller', {
  referenceFacts: ['MTV aired the Thriller video in heavy rotation.'],
  strictLength: false,
  speakTrackNamesInVoiceover: true,
});
if (hasEnglishLeak(MTV_SCRIPT, 'Michael Jackson', 'Thriller')) {
  fail('MTV + artist/title must not count as English leak');
} else if (!mtvVal.ok && mtvVal.reason === 'english words in Russian narration') {
  fail(`MTV script rejected for english leak: ${mtvVal.reason}`);
} else {
  ok('MTV and track names allowed in Russian script');
}

const HYBRID = 'а воукалz записывал guitarist на сцене.';
const hybridFixed = (await import('../dist/services/story-english-normalize.js')).fixLatinCyrillicHybrids(HYBRID);
if (/воукал|guitarist/i.test(hybridFixed)) {
  fail(`hybrid fix failed: ${hybridFixed}`);
} else {
  ok('latin-cyrillic hybrid repaired');
}

const marked = prepareYandexTtsText('Трек Lou Bega «Mambo No. 5» в студии.', {
  artist: 'Lou Bega',
  title: 'Mambo No. 5',
  sentencePauses: false,
});
if (marked.includes('[[')) fail(`TTS should not wrap Latin in phonemes: ${marked}`);
else if (!marked.includes('Lou Bega')) fail(`Latin artist name lost: ${marked}`);
else if (!marked.includes('ст+удии')) fail(`Cyrillic stress missing: ${marked}`);
else ok(`TTS markup (Cyrillic stress only): ${marked}`);

const BEAT_IT_SCRIPT =
  'Beat it — Michael Jackson. Гитарист Van Halen Эдди Ван Хален записал культовый рифф за один дубль. Quincy Jones настоял на хард-роковом звучании.';
const beatItVal = validateStoryScript(BEAT_IT_SCRIPT, '30s', 'Michael Jackson', 'Beat it', {
  referenceFacts: [
    'Beat It Michael Jackson Eddie Van Halen recorded guitar solo in one take for Thriller.',
  ],
  strictLength: false,
  speakTrackNamesInVoiceover: true,
});
if (!beatItVal.ok) {
  fail(`Beat It + Van Halen guest should pass: ${beatItVal.reason}`);
} else {
  ok('Beat It Van Halen guest musician accepted');
}

const beatItTts = prepareYandexTtsText(
  'мощный гитарный рифф Эдди Ван Халена вплелся в поп-стиль.',
  { artist: 'Michael Jackson', title: 'Beat it', sentencePauses: false },
);
if (!/хал\+ена/i.test(beatItTts)) {
  fail(`Van Halen stress missing in TTS: ${beatItTts}`);
} else {
  ok(`Van Halen TTS stress: ${beatItTts}`);
}

const RACISM_SCRIPT =
  'Jencarlos с треком Caramba удивил: текст наполнен темой расизма и дискриминации, артист рассказывает о личном опыте.';
const racismVal = validateStoryScript(RACISM_SCRIPT, '30s', 'Jencarlos', 'Caramba', {
  referenceFacts: ['Caramba is a flirtatious Latin pop dance song by Jencarlos.'],
});
if (racismVal.ok) {
  fail('racism hallucination script should be rejected');
} else {
  ok(`racism script rejected (${racismVal.reason})`);
}

const llmBad = validateLlmSeedCandidate(
  {
    fact: 'Песня про расизм и борьбу за равенство.',
    scope: 'track',
    evidenceSnippetIndex: 0,
    evidenceQuote: 'Latin pop dance',
  },
  ['Caramba is a flirtatious Latin pop dance song by Jencarlos.'],
  'Jencarlos',
  'Caramba',
);
if (llmBad.ok) {
  fail('llm seed with invented racism should fail');
} else {
  ok(`llm racism seed rejected (${llmBad.reason})`);
}

const REDBONE_FACTS = [
  'Billboard (November 24, 1973) called "Come and Get Your Love" moments of very commercial material deserving FM radio airplay.',
  'Cash Box (March 30, 1974): Artie Goodman recommended it as one of the best pop records of the year.',
];
const REDBONE_SCRIPT =
  'В то время как журнал Billboard называл «Come and Get Your Love» материалом для радиоэфира, критик Арти Гудмен из Cash Box в марте семьдесят четвертого года рекомендовал её как одну из лучших поп-записей года.';
if (hasEnglishLeak(REDBONE_SCRIPT, 'Graham Blvd', 'Come and Get Your Love', { referenceFacts: REDBONE_FACTS })) {
  fail('Billboard/Cash Box script should not leak English');
} else {
  ok('Billboard + Cash Box proper nouns allowed');
}

const { fixVocalLanguage } = await import('../dist/services/story-english-normalize.js');
const { findNewsSeedBleedIntoRecordingStory, findOffSeedInvention } =
  await import('../dist/services/story-quality.js');

if (fixVocalLanguage('а воукалз записывал он сам') !== 'а вокал записывал он сам') {
  fail(`voocalz fix got: ${fixVocalLanguage('а воукалз записывал он сам')}`);
} else {
  ok('воукалз → вокал');
}

const CHICAGO_TEACHERS_SEED =
  'In September 2012, the Chicago Teachers Union launched a strike that shut down Chicago Public Schools for seven days.';
const BEAT_IT_BAD_SCRIPT =
  'Эта песня вышла в 1983 году. В ней звучит гитара Эдди Ван Хэлина, а воукалз записывал он сам, пока в соседнем помещении проходила забастовка учителей.';

const bleed = findNewsSeedBleedIntoRecordingStory(
  BEAT_IT_BAD_SCRIPT,
  'Beat It',
  [CHICAGO_TEACHERS_SEED],
);
if (!bleed) {
  fail('Chicago Teachers seed woven into Beat It recording must be rejected');
} else {
  ok(`Chicago Teachers bleed rejected (${bleed})`);
}

const hallucinated = findOffSeedInvention(
  'Гитарист записал solo, пока рядом шла забастовка учителей.',
  ['Beat It Michael Jackson Eddie Van Halen recorded guitar solo in one take for Thriller.'],
);
if (!hallucinated) {
  fail('teachers strike hallucination without seed must be rejected');
} else {
  ok(`teachers strike hallucination rejected (${hallucinated})`);
}

const sanitizedBeatIt = sanitizeScriptForTts(BEAT_IT_BAD_SCRIPT, 'Michael Jackson', 'Beat It', [
  CHICAGO_TEACHERS_SEED,
]);
if (/\bвоукал/i.test(sanitizedBeatIt)) {
  fail(`sanitized script still has воукал: ${sanitizedBeatIt}`);
} else {
  ok('sanitize replaces воукалz with вокал');
}

// --- Opening anchor (first 1–2 sentences, not sentence 1 only) ---
const {
  openingAnchoredToFact,
  openingBlockForAnchor,
} = await import('../dist/services/story-quality.js');
const { qualityOptionsForProductionAttempt } = await import('../dist/services/story-generate-loop.js');

const STROMAE_SEED =
  'Paul van Haver, known as Stromae, was born in Brussels to a Rwandan father and Belgian mother.';
const STROMAE_TWO_SENT =
  'Родился в Брюсселе в семье с руандийскими корнями. Отец приехал из Руанды, мать была бельгийкой — так вырос Stromae.';
if (!openingAnchoredToFact(STROMAE_TWO_SENT, [STROMAE_SEED])) {
  fail('Stromae RU paraphrase opening should anchor via bridges + 2 sentences');
} else {
  ok('Stromae RU paraphrase opening anchors');
}
const stromaeOpening = openingBlockForAnchor(STROMAE_TWO_SENT);
if (!stromaeOpening.includes('бельгий')) {
  fail('openingBlock should include first two sentences');
} else {
  ok('openingBlock spans two sentences');
}

const GENERIC_HOOK =
  'Эта песня — настоящая находка для фанатов. Музыка может соединить всех нас — так звучит настоящий хит.';
const LOU_SEED_SHORT =
  'Lou Bega adapted Perez Prado Mambo No. 5 and added verses listing women names in Munich studio.';
const genericStrict = validateStoryScript(GENERIC_HOOK, '30s', 'Lou Bega', 'Mambo No. 5', {
  referenceFacts: [LOU_SEED_SHORT],
  strictLength: false,
  skipPersonaCliches: true,
});
if (genericStrict.ok) {
  fail('generic watery hook should not pass strict validation');
} else if (
  !String(genericStrict.reason).includes('first sentence') &&
  !String(genericStrict.reason).includes('no concrete fact')
) {
  fail(`generic hook unexpected reason: ${genericStrict.reason}`);
} else {
  ok(`generic hook rejected (${genericStrict.reason})`);
}

const prodOpts = qualityOptionsForProductionAttempt([LOU_SEED_SHORT], 'ru');
const prodGeneric = validateStoryScript(GENERIC_HOOK, '30s', 'Lou Bega', 'Mambo No. 5', prodOpts);
if (!prodGeneric.ok && prodGeneric.reason?.includes('first sentence')) {
  fail('prod options must skip opening anchor gate');
} else {
  ok('prod options skip opening anchor (matches OpenRouter loop)');
}

const NEFFEX_SCRIPT =
  'The Friends Inside My Head (unreleased demo) — NEFFEX — трек, созданный в уникальном режиме. Этот артист выпустил 100 оригинальных песен за 100 недель и отправился в мировой тур. NEFFEX известен тем, что не останавливается — даже демо звучит как готовый хит.';
const NEFFEX_SEED =
  'Fresh off releasing 100 original songs in 100 weeks (for the second time), NEFFEX embarks on his biggest world tour yet.';
const neffexSan = sanitizeScriptForTts(NEFFEX_SCRIPT, 'NEFFEX', 'The Friends Inside My Head (Demo)', [NEFFEX_SEED], {
  speakTrackNamesInVoiceover: true,
});
if (!/этот\s+артист/i.test(neffexSan)) {
  fail(`NEFFEX name economy must keep этот артист placeholder: ${neffexSan}`);
} else {
  ok('NEFFEX keeps этот артист (name economy, not replaced with NEFFEX)');
}
const neffexGarbage = findLlmGarbage(neffexSan, {
  allowVoiceoverPlaceholders: false,
  skipHitMemoryWhenGrounded: true,
  referenceFacts: [NEFFEX_SEED],
});
if (neffexGarbage?.includes('этот')) {
  fail(`NEFFEX этот артист must not be llm garbage: ${neffexGarbage}`);
} else {
  ok('NEFFEX этот артист not llm garbage');
}
const neffexVal = validateStoryScript(neffexSan, '30s', 'NEFFEX', 'The Friends Inside My Head (Demo)', {
  referenceFacts: [NEFFEX_SEED],
  strictLength: false,
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
if (!neffexVal.ok && String(neffexVal.reason).includes('этот')) {
  fail(`NEFFEX validate: ${neffexVal.reason}`);
} else {
  ok(neffexVal.ok ? 'NEFFEX demo story validates' : `NEFFEX lenient (${neffexVal.reason})`);
}

const ORPHAN_QTY =
  'Marino собрал на Last.fm почти тысяч прослушиваний. Это цифры, которые говорят сами за себя.';
const orphanVal = validateStoryScript(ORPHAN_QTY, '30s', 'Marino', 'Worst Enemy', {
  referenceFacts: ['На Last.fm у «Worst Enemy» (Marino) 395,224 прослушиваний.'],
  strictLength: false,
  skipPersonaCliches: true,
  speakTrackNamesInVoiceover: true,
});
if (orphanVal.ok) {
  fail('orphan quantity phrase must fail validateStoryScript');
} else if (!String(orphanVal.reason).includes('orphan quantity')) {
  fail(`orphan quantity wrong reason: ${orphanVal.reason}`);
} else {
  ok('orphan quantity phrase rejected');
}

process.exit(failed > 0 ? 1 : 0);
