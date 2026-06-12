import { findIncompleteEnding, trimToLastCompleteSentence } from './story-quality.js';
import { polishScriptForSpeechDelivery } from './tts-speech-polish.js';

const BROKEN_PATTERNS: RegExp[] = [
  /\s{3,}/,
  /[,.!?]{3,}/,
  /^\s*[,.]/,
];

const MAX_CHARS = 4500;

export interface TtsQualityPassResult {
  text: string;
  adjusted: boolean;
  warnings: string[];
}

export function runTtsQualityPass(
  script: string,
  options: { artist?: string; title?: string } = {},
): TtsQualityPassResult {
  const warnings: string[] = [];
  let text = script.trim();
  let adjusted = false;

  if (text.length > MAX_CHARS) {
    text = `${text.slice(0, MAX_CHARS - 1).trim()}…`;
    warnings.push('truncated for TTS length');
    adjusted = true;
  }

  for (const pattern of BROKEN_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(/\s{3,}/g, ' ').replace(/([,.!?])\1+/g, '$1');
      warnings.push(`fixed pattern: ${pattern.source}`);
      adjusted = true;
    }
  }

  const polished = polishScriptForSpeechDelivery(text, options);
  if (polished !== text) {
    text = polished;
    adjusted = true;
  }

  if (findIncompleteEnding(text)) {
    const trimmed = trimToLastCompleteSentence(text);
    if (!findIncompleteEnding(trimmed)) {
      text = trimmed;
      warnings.push('trimmed incomplete ending for TTS');
      adjusted = true;
    }
  }

  return { text, adjusted, warnings };
}
