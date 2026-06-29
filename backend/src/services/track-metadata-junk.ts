/** Voice messages / messenger audio — not music tracks (iOS Messages, Telegram, etc.). */
const VOICE_MESSAGE_PATTERNS = [
  'voice message',
  'voice note',
  'voice msg',
  'audio message',
  'vocal message',
  'video message',
  'голосовое сообщение',
  'голосовое',
  'голосовая заметка',
  'аудиосообщение',
  'аудио сообщение',
  'аудиозаметка',
] as const;

function normalizeField(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesVoiceMessagePattern(value: string): boolean {
  const normalized = normalizeField(value);
  if (!normalized) return false;
  return VOICE_MESSAGE_PATTERNS.some(
    (pattern) => normalized === pattern || normalized.startsWith(`${pattern} `),
  );
}

export function isNonMusicTrackMetadata(artist: string, title: string): boolean {
  return matchesVoiceMessagePattern(artist) || matchesVoiceMessagePattern(title);
}
