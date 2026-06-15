/**
 * Run: npm run build && node scripts/test-story-quality.mjs
 */
import { validateStoryScript } from '../dist/services/story-quality.js';
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
if (!hasEnglishLeak(ENGLISH_LEAK, 'ABBA', 'Dancing Queen')) {
  fail('english leak sample should be detected');
} else {
  ok('english leak detected');
}
const englishVal = validateStoryScript(ENGLISH_LEAK, '30s', 'ABBA', 'Dancing Queen');
if (englishVal.ok) {
  fail('english leak script should be rejected');
} else {
  ok(`english leak rejected (${englishVal.reason})`);
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

process.exit(failed > 0 ? 1 : 0);
