import type { LatinTtsReplacement } from './tts-foreign-pronounce.js';
import type { SileroVoicePreset } from './silero-voices.js';

export interface SileroTtsTextTrace {
  originalScript: string;
  artist: string;
  title: string;
  afterProperNames: string;
  afterLatinTransliteration: string;
  latinReplacements: LatinTtsReplacement[];
  prepared: string;
}

/** ЗАГЛАВНАЯ гласная = куда Silero ставит ударение (+ перед гласной). */
export function formatStressReadableLine(word: string): string {
  const cleaned = word.replace(/^[«»"'(\[]+|[,.!?…:;»"')\]]+$/g, '');
  if (!cleaned.includes('+')) {
    return `${cleaned} — без + (ударение модели по умолчанию)`;
  }
  const plain = cleaned.replace(/\+/g, '');
  const stressedChar = cleaned.match(/\+([а-яёА-ЯЁ])/)?.[1];
  const readable = cleaned.replace(/\+([а-яёА-ЯЁ])/gi, (_, v) => v.toUpperCase()).replace(/\+/g, '');
  return `${plain} → ударная «${stressedChar ?? '?'}» → читается: ${readable}`;
}

export function formatSileroStressBlock(prepared: string): string {
  const tokens = prepared.split(/\s+/).filter(Boolean);
  return tokens.map((t) => `  ${formatStressReadableLine(t)}`).join('\n');
}

export function formatLatinReplacementBlock(replacements: LatinTtsReplacement[]): string {
  if (replacements.length === 0) {
    return '  (латиницы не было — или уже кириллица в скрипте)';
  }
  const uniq = new Map<string, LatinTtsReplacement>();
  for (const r of replacements) {
    const key = `${r.from}\0${r.to}`;
    if (!uniq.has(key)) uniq.set(key, r);
  }
  return [...uniq.values()]
    .map((r) => {
      const tag =
        r.source === 'dictionary'
          ? 'словарь'
          : r.source === 'artist'
            ? 'артист'
            : r.source === 'title'
              ? 'трек'
              : 'транслит';
      return `  ${r.from.padEnd(28)} →  ${r.to}  [${tag}]`;
    })
    .join('\n');
}

export function formatSileroTranscriptReport(options: {
  trace: SileroTtsTextTrace;
  preset?: SileroVoicePreset;
  voice?: string;
  sampleId?: string;
  synthMs?: number;
  audioBytes?: number;
  audioFileName?: string;
}): string {
  const { trace, preset, voice, sampleId, synthMs, audioBytes, audioFileName } = options;
  const voiceLine = preset
    ? `${preset.labelRu} (${preset.moodRu}; аналог Yandex: ${preset.yandexAnalogue})`
    : (voice ?? 'baya');

  return [
    '══════════════════════════════════════════════════════════',
    ' SILERO — КАРТОЧКА ОЗВУЧКИ (скопируй целиком и пришли в чат)',
    '══════════════════════════════════════════════════════════',
    sampleId ? `Образец: ${sampleId}` : null,
    `Голос: ${voiceLine}`,
    synthMs != null ? `Синтез: ${synthMs} ms` : null,
    audioBytes != null ? `Файл: ${audioFileName ?? '?'} (${audioBytes} bytes)` : null,
    '',
    '── 1. ИСХОДНЫЙ СКРИПТ (история, латиница как в фактах) ──',
    trace.originalScript,
    '',
    '── 2. ЛАТИНИЦА → КИРИЛЛИЦА (Silero не умеет SSML lang; иначе «робот») ──',
    '   Это НЕ перевод на русский — фонетика EN/IT в кириллице для русского голоса.',
    formatLatinReplacementBlock(trace.latinReplacements),
    '',
    '── 3. ТЕКСТ НА ВХОД SILERO (+ = маркер ударения ПЕРЕД гласной) ──',
    trace.prepared,
    '',
    '── 4. УДАРЕНИЯ ПО СЛОВАМ (ЗАГЛАВНАЯ = ударная гласная) ──',
    formatSileroStressBlock(trace.prepared),
    '',
    '── 5. PAYLOAD (exact, для diff) ──',
    trace.prepared,
    '',
  ]
    .filter((line) => line != null)
    .join('\n');
}
