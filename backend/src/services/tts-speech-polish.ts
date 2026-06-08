/**
 * Last-mile conversational polish before TTS — keeps facts, improves speakability.
 */

const BUREAUCRATIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/(?:^|[\s,.])в\s+связи\s+с\s+тем,?\s+что/giu, ' потому что'],
  [/(?:^|[\s,.])следует\s+отметить,?\s+что/giu, ' '],
  [/(?:^|[\s,.])необходимо\s+отметить/giu, ' '],
  [/(?:^|[\s,.])является\s+одним\s+из/giu, ' один из'],
  [/(?:^|[\s,.])на\s+сегодняшний\s+день/giu, ' сейчас'],
  [/(?:^|[\s,.])в\s+рамках/giu, ' в'],
  [/(?:^|[\s,.])осуществил[аи]?\s+запись/giu, ' записал'],
  [/(?:^|[\s,.])был[аи]?\s+выпущен[аы]?/giu, ' вышел'],
  [/(?:^|[\s,.])данный\s+трек/giu, ' этот трек'],
  [/(?:^|[\s,.])данная\s+композиция/giu, ' эта песня'],
  [/(?:^|[\s,.])в\s+контексте/giu, ' '],
  [/(?:^|[\s,.])имеет\s+место/giu, ' '],
];

/** Safe radio-style openers when sentence is too dry (no fact change). */
const DRY_OPENER_FIXES: Array<[RegExp, string]> = [
  [/^Трек\s+был\s+записан/i, 'Слушайте — трек записали'],
  [/^Песня\s+была\s+выпущена/i, 'Вышла песня'],
  [/^Композиция\s+стала/i, 'Эта песня стала'],
];

const MAX_SENTENCE_WORDS = 22;

/** Split on conjunctions but keep «а», «но», «где» — plain split() eats the delimiter. */
const CONJUNCTION_SPLIT_RE =
  /(?<=\s)(и|а|но|потому что|когда|где|который|которая|которые)(\s+)/gi;

function countWords(sentence: string): number {
  return sentence.trim().split(/\s+/).filter(Boolean).length;
}

function splitSentenceOnConjunctions(sentence: string): string[] {
  const parts = sentence.split(CONJUNCTION_SPLIT_RE);
  if (parts.length <= 1) return [sentence];

  const chunks: string[] = [parts[0] ?? ''];
  for (let i = 1; i < parts.length; i += 3) {
    const conj = parts[i] ?? '';
    const space = parts[i + 1] ?? ' ';
    const rest = parts[i + 2] ?? '';
    chunks.push(`${conj}${space}${rest}`);
  }
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function startsWithCoordinatingConjunction(text: string): boolean {
  return /^(?:и|а|но)\s/i.test(text.trim());
}

/** Split overly long sentences at natural conjunctions. */
export function splitLongSentencesForSpeech(text: string): string {
  const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out: string[] = [];

  for (const sentence of parts) {
    if (countWords(sentence) <= MAX_SENTENCE_WORDS) {
      out.push(sentence);
      continue;
    }

    const chunks = splitSentenceOnConjunctions(sentence);
    if (chunks.length <= 1) {
      out.push(sentence);
      continue;
    }

    let buffer = chunks[0] ?? '';
    for (let i = 1; i < chunks.length; i += 1) {
      const piece = chunks[i] ?? '';
      const candidate = `${buffer} ${piece}`.trim();
      if (countWords(candidate) > MAX_SENTENCE_WORDS && buffer.trim()) {
        if (startsWithCoordinatingConjunction(piece)) {
          buffer = candidate;
          continue;
        }
        const trimmed = buffer.trim();
        out.push(/[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`);
        buffer = piece;
      } else {
        buffer = candidate;
      }
    }
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      out.push(/[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`);
    }
  }

  return out.join(' ');
}

const NATURAL_SPEECH_FIXES: Array<[RegExp, string]> = [
  [/(?:^|[\s,.!?«»])меня\s+до\s+сих\s+пор\s+мурашки\s+бегут/giu, ' у меня до сих пор мурашки бегут'],
  [/(?:^|[\s,.!?«»])меня\s+мурашки\s+бегут/giu, ' у меня мурашки бегут'],
  [/(?:^|[\s,.!?«»])меня\s+до\s+сих\s+пор\s+мурашки\b/giu, ' у меня до сих пор мурашки'],
  [/(?:^|[\s,.!?«»])зациклил(?:и|а|o)?(?=[\s,.!?»«»-]|$)/giu, ' гоняли по кругу'],
  [/(?:^|[\s,.!?«»])зацикливали(?=[\s,.!?»«»-]|$)/giu, ' включали на повторе'],
  [
    /((?:^|[\s,.«»])(?:в\s+)?(?:начале|конце|середине)\s+(?:19|20)\d{2}(?:\s+года)?)\s+тогда(?=[\s,.!?»«»-]|$)/giu,
    '$1',
  ],
];

export function polishScriptForSpeechDelivery(script: string): string {
  let result = script.trim();

  for (const [pattern, replacement] of BUREAUCRATIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of DRY_OPENER_FIXES) {
    result = result.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of NATURAL_SPEECH_FIXES) {
    result = result.replace(pattern, replacement);
  }

  result = result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\./g, '.').trim();
  result = splitLongSentencesForSpeech(result);

  return result;
}
