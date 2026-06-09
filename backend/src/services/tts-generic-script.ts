/** Убираем латиницу трека/артиста из озвучки — естественные русские замены. */

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickVariant(seed: string, count: number): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(hash) % count;
}

/** Двойное «фф» в падежах ломает ударение Edge/Yandex — нормальная форма «рифе». */
export function fixRiffDeclension(text: string): string {
  return text
    .replace(/гитарном риффе/gi, 'гитарном рифе')
    .replace(/гитарным риффом/gi, 'гитарным рифом')
    .replace(/на риффе/gi, 'на рифе')
    .replace(/риффе/gi, 'рифе');
}

function stripLatinRuns(text: string, title: string, artist: string): string {
  let s = text;
  for (const token of [title, artist]) {
    if (!token.trim()) continue;
    s = s.replace(new RegExp(escapeRe(token), 'gi'), '');
  }
  return s.replace(/\s+/g, ' ').trim();
}

function rewriteLead(script: string, title: string, artist: string): string {
  const leadRe = new RegExp(
    `^${escapeRe(title)}\\s+от\\s+${escapeRe(artist)}(\\s*[—–-]\\s*|\\s+)`,
    'i',
  );
  const m = script.match(leadRe);
  if (!m) return script;

  const rest = script.slice(m[0].length).trim();
  const dashLead = /[—–-]\s*$/.test(m[0]) || /^[—–-]/.test(rest);
  const v = pickVariant(`${title}|${artist}`, 5);

  if (dashLead) {
    const body = rest.replace(/^[—–-]\s*/, '');
    const templates = [
      `У этой песни тот самый ${body}`,
      `Эта композиция построена на запоминающемся ${body.replace(/^гитарный рифф/i, 'гитарном рифе')}`,
      `Этот хит держится на ${body.replace(/^гитарный рифф/i, 'гитарном рифе')}`,
      `Сейчас в эфире песня с ${body.replace(/^гитарный рифф/i, 'гитарным рифом')}`,
      `Сейчас играет песня с тем самым ${body}`,
    ];
    return fixRiffDeclension(templates[v]!);
  }

  const templates = [
    `Эта песня ${rest}`,
    `Эта композиция ${rest}`,
    `Этот хит ${rest.replace(/^вышел\b/i, 'появился').replace(/^неожиданно возглавил/i, 'неожиданно возглавил')}`,
    `Текущий трек ${rest}`,
    `В эфире сейчас классика, которая ${rest.replace(/^вышел\b/i, 'вышла').replace(/^неожиданно возглавил/i, 'неожиданно возглавила')}`,
  ];
  return fixRiffDeclension(templates[v]!);
}

/**
 * Заменяет «Title от Artist» и прочую латиницу на обобщённые русские формулировки
 * перед TTS, когда пользователь выключил «названия треков в озвучке».
 */
export function genericizeScriptForVoiceover(
  script: string,
  artist: string,
  title: string,
): string {
  const trimmed = script.trim();
  if (!trimmed || !title.trim() || !artist.trim()) return fixRiffDeclension(trimmed);

  let result = rewriteLead(trimmed, title, artist);
  result = stripLatinRuns(result, title, artist);
  result = result
    .replace(/\bPeppers\b/gi, '')
    .replace(/\bMTV\b/gi, 'МТВ')
    .replace(/\s+,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return fixRiffDeclension(result);
}
