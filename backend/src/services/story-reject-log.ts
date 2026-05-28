import { countWords } from './story-quality.js';

/** Log full rejected script to Railway — never shown to user. */
export function logRejectedScript(label: string, script: string, reason: string): void {
  const trimmed = script.trim();
  const words = countWords(trimmed);
  console.warn(`[story] ${label}: ${reason} (${words} words)`);
  if (!trimmed) {
    console.warn('[story] rejected-script: (empty)');
    return;
  }
  console.warn('[story] rejected-script-begin');
  console.warn(trimmed);
  console.warn('[story] rejected-script-end');
}
