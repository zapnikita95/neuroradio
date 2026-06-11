import assert from 'node:assert/strict';
import {
  buildSystemPrompt,
  buildStoryUserPrompt,
  personaForTrack,
} from '../dist/services/prompts.js';
import {
  buildVoiceoverNamesEconomyPromptBlock,
} from '../dist/services/voiceover-no-names.js';
import {
  findExcessiveNameRepetition,
  countPhraseMentions,
  validateStoryScript,
} from '../dist/services/story-quality.js';
import { getStoryLengthPreset } from '../dist/services/story-length.js';

const ARTIST = 'Gorillaz, Del The Funky Homosapien';
const TITLE = 'Clint Eastwood';
const SEED =
  'The track Clint Eastwood was a breakthrough for the virtual band Gorillaz, blending hip-hop and alternative rock.';

const gorillazBad = `Я обожаю Clint Eastwood от Gorillaz — этот трек стал настоящим прорывом для виртуальной группы. До сих пор помню, как впервые услышал его в клипе, где анимированные персонажи оживают под гипнотический бит и голос Дэл Зэ Фангки Хоумоусэйпиан. Меня цепляет, как они соединили альтернативный рок с хипхопом, создав что-то совершенно новое. Я знаю, что этот трек стал визитной карточкой Gorillaz и до сих пор звучит на их концертах. У меня до сих пор мурашки, когда я слышу первые ноты. Gorillaz не просто играли музыку — они создавали целые миры, которые остаются с нами навсегда.`;

const gorillazGood = `Я обожаю Clint Eastwood от Gorillaz — этот трек стал настоящим прорывом для виртуальной группы. До сих пор помню, как впервые услышал его в клипе, где анимированные персонажи оживают под гипнотический бит и голос Дэл Зэ Фангки Хоумоусэйпиан. Меня цепляет, как они соединили альтернативный рок с хипхопом, создав что-то совершенно новое. Я знаю, что эта песня стала визитной карточкой коллектива и до сих пор звучит на их концертах. У меня до сих пор мурашки, когда слышу первые ноты — они не просто играли музыку, а создавали целые миры.`;

// --- prompt block ---
const economy = buildVoiceoverNamesEconomyPromptBlock(ARTIST, TITLE);
assert.match(economy, /максимум ОДИН раз/i);
assert.match(economy, /максимум ДВА раза/i);
assert.match(economy, /они \/ этот коллектив/i);
console.log('OK: economy prompt block');

// --- system prompt includes economy when names mode ---
const persona = personaForTrack(2001, 'alternative', ARTIST, TITLE);
const sys = buildSystemPrompt(persona, getStoryLengthPreset('60s'), 'ru', {
  speakTrackNamesInVoiceover: true,
  artist: ARTIST,
  title: TITLE,
});
assert.match(sys, /ЭКОНОМИЯ ИМЁН/i);
console.log('OK: buildSystemPrompt includes name economy');

const user = buildStoryUserPrompt({
  artist: ARTIST,
  title: TITLE,
  voiceId: 'zahar',
  storyLength: '60s',
  storyNarrator: 'fan',
  speakTrackNamesInVoiceover: true,
  referenceFacts: [SEED],
  selectedReferenceFact: { fact: SEED, scope: 'track', scopeLabelRu: 'трек' },
});
assert.match(user, /ЭКОНОМИЯ ИМЁН/i);
assert.match(user, /не повторяй имя артиста/i);
console.log('OK: buildStoryUserPrompt includes name economy + fan hint');

// --- repetition detector ---
assert.equal(countPhraseMentions(gorillazBad, 'Gorillaz'), 3);
assert.equal(countPhraseMentions(gorillazBad, 'Clint Eastwood'), 1);

const badRep = findExcessiveNameRepetition(gorillazBad, ARTIST, TITLE);
assert.ok(badRep?.includes('Gorillaz'), `expected Gorillaz rejection, got: ${badRep}`);
console.log('OK: Gorillaz bad script rejected:', badRep);

const goodRep = findExcessiveNameRepetition(gorillazGood, ARTIST, TITLE);
assert.equal(goodRep, null, `good script should pass name economy, got: ${goodRep}`);
console.log('OK: pronoun-heavy script passes name economy');

// --- validateStoryScript integration ---
const valBad = validateStoryScript(gorillazBad, '60s', ARTIST, TITLE, {
  referenceFacts: [SEED],
  speakTrackNamesInVoiceover: true,
  strictLength: false,
  skipPersonaCliches: true,
});
assert.equal(valBad.ok, false);
assert.match(valBad.reason, /excessive name repetition/i);
console.log('OK: validateStoryScript rejects hammered names');

console.log('\nAll name-economy tests passed.');
