import { countWords } from './story-quality.js';

/** Full story text in server logs (Railway / local-bff.log) — not sent to the client. */
export function logStoryScript(label: string, script: string, meta = ''): void {
  const trimmed = script.trim();
  const words = countWords(trimmed);
  const suffix = meta ? ` ${meta}` : '';
  console.warn(`[story] ${label} (${words} words)${suffix}`);
  if (!trimmed) {
    console.warn('[story] script-text: (empty)');
    return;
  }
  console.warn('[story] script-text-begin');
  console.warn(trimmed);
  console.warn('[story] script-text-end');
}

/** Log full rejected script to Railway — never shown to user. */
export function logRejectedScript(label: string, script: string, reason: string): void {
  logStoryScript(`${label}: ${reason}`, script);
}
