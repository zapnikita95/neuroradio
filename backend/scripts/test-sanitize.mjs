import { sanitizeScriptForTts } from '../dist/services/story-quality.js';

const input = 'В 1965-м на show engineers краснели — шестидесятых дух.';
const out = sanitizeScriptForTts(input, 'James Brown', 'I Got You');
console.log('in:', input);
console.log('out:', out);

const p = /(?:^|[\s,.«"—-])(?:шестидесят\w+)(?=[\s,.!?»"—-]|$)/giu;
console.log('simple:', /шестидесят\w+/giu.test('шестидесятых'));
console.log('full:', p.test(' краснели — шестидесятых дух'));
