import fetch from 'node-fetch';
import { interestScore, isBoringFact, filterAndRankFacts } from '../dist/services/reference-fact-quality.js';

const USER_AGENT = 'MusicStoryBFF/1.0';

async function fetchExtendedExtract(lang, title, sentences = 10) {
  const encodedTitle = encodeURIComponent(title.trim().replace(/\s+/g, '_'));
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1` +
    `&exsentences=${sentences}&format=json&origin=*&titles=${encodedTitle}`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  const data = await response.json();
  const page = Object.values(data.query.pages)[0];
  return page?.extract || null;
}

function normalizeWikiText(text) {
  return text
    .replace(/^=+\s*.+?\s*=+$/gm, ' ')
    .replace(/\s=+\s*[^=\n]+?\s*=+\s*/g, ' ')
    .replace(/\(\d{4}[^)]{0,120}\)/g, ' ')
    .replace(/\[[^\]]{0,120}\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mergeSentenceFragments(raw) {
  const merged = [];
  for (const part of raw) {
    const sentence = part.trim();
    if (!sentence) continue;
    if (
      merged.length > 0 &&
      (/^[,;:]/.test(sentence) || /^which\b/i.test(sentence) || sentence.length < 50)
    ) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${sentence}`.replace(/\s+/g, ' ').trim();
    } else {
      merged.push(sentence);
    }
  }
  return merged;
}

function splitWikiSentences(text) {
  return mergeSentenceFragments(
    normalizeWikiText(text)
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim())
      .filter(Boolean),
  ).filter((s) => s.length >= 35 && s.length <= 360);
}

function normalizeForMatch(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSentencesMentioning(text, needle, max = 6) {
  const normalizedNeedle = normalizeForMatch(needle);
  const tokens = normalizedNeedle.split(' ').filter((p) => p.length >= 3);
  return splitWikiSentences(text)
    .filter((sentence) => {
      const lower = normalizeForMatch(sentence);
      if (normalizedNeedle.length >= 8 && lower.includes(normalizedNeedle)) return true;
      const hits = tokens.filter((t) => lower.includes(t)).length;
      const threshold = tokens.length <= 2 ? 1 : Math.min(2, tokens.length);
      return hits >= threshold;
    })
    .slice(0, max);
}

const extract = await fetchExtendedExtract('en', 'Afric Simone', 10);
console.log('extract len', extract?.length);
console.log('--- extract preview ---');
console.log(extract?.slice(0, 800));

const allSentences = splitWikiSentences(extract ?? '');
console.log('\nall sentences', allSentences.length);
for (const s of allSentences) {
  console.log('S:', s.slice(0, 120));
}

const mentions = extractSentencesMentioning(extract ?? '', 'Hafanana');
console.log('\nmentions count', mentions.length);
for (const m of mentions) {
  console.log('---');
  console.log('score', interestScore(m), 'boring', isBoringFact(m));
  console.log(m);
}
console.log('\nranked', filterAndRankFacts(mentions, 4));
