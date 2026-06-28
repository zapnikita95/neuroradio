/**
 * Social / streaming brands → Russian TTS (no en-US SSML switch, no pause after «в/на»).
 * Display script may stay Latin; call only in speech pipeline (Yandex + Edge).
 */

const WB = '(?<![\\p{L}\\p{N}])';
const WE = '(?![\\p{L}\\p{N}])';

/** Longest phrases first when applying in order. */
const SOCIAL_PLATFORM_TTS: Array<{ pattern: RegExp; spoken: string }> = [
  { pattern: new RegExp(`${WB}Apple\\s+Music${WE}`, 'giu'), spoken: 'Эпл Мьюзик' },
  { pattern: new RegExp(`${WB}Google\\s+Play${WE}`, 'giu'), spoken: 'Гугл Плей' },
  { pattern: new RegExp(`${WB}Sound\\s*Cloud${WE}`, 'giu'), spoken: 'Саундклауд' },
  { pattern: new RegExp(`${WB}SoundCloud${WE}`, 'giu'), spoken: 'Саундклауд' },
  { pattern: new RegExp(`${WB}Last\\s*\\.\\s*fm${WE}`, 'giu'), spoken: 'Ласт эф эм' },
  { pattern: new RegExp(`${WB}Last\\.fm${WE}`, 'giu'), spoken: 'Ласт эф эм' },
  { pattern: new RegExp(`${WB}MySpace${WE}`, 'giu'), spoken: 'Майспейс' },
  { pattern: new RegExp(`${WB}Myspace${WE}`, 'giu'), spoken: 'Майспейс' },
  { pattern: new RegExp(`${WB}Facebook${WE}`, 'giu'), spoken: 'Фейсбук' },
  { pattern: new RegExp(`${WB}Instagram${WE}`, 'giu'), spoken: 'Инстаграм' },
  { pattern: new RegExp(`${WB}Snapchat${WE}`, 'giu'), spoken: 'Снапчат' },
  { pattern: new RegExp(`${WB}Pinterest${WE}`, 'giu'), spoken: 'Пинтерест' },
  { pattern: new RegExp(`${WB}Linked\\s*In${WE}`, 'giu'), spoken: 'ЛинкедИн' },
  { pattern: new RegExp(`${WB}LinkedIn${WE}`, 'giu'), spoken: 'ЛинкедИн' },
  { pattern: new RegExp(`${WB}Bandcamp${WE}`, 'giu'), spoken: 'Бэндкемп' },
  { pattern: new RegExp(`${WB}Spotify${WE}`, 'giu'), spoken: 'Спотифай' },
  { pattern: new RegExp(`${WB}YouTube${WE}`, 'giu'), spoken: 'Ютуб' },
  { pattern: new RegExp(`${WB}Youtube${WE}`, 'giu'), spoken: 'Ютуб' },
  { pattern: new RegExp(`${WB}TikTok${WE}`, 'giu'), spoken: 'ТикТок' },
  { pattern: new RegExp(`${WB}Tiktok${WE}`, 'giu'), spoken: 'ТикТок' },
  { pattern: new RegExp(`${WB}Twitter${WE}`, 'giu'), spoken: 'Твиттер' },
  { pattern: new RegExp(`${WB}Telegram${WE}`, 'giu'), spoken: 'Телеграм' },
  { pattern: new RegExp(`${WB}WhatsApp${WE}`, 'giu'), spoken: 'Вотсап' },
  { pattern: new RegExp(`${WB}Discord${WE}`, 'giu'), spoken: 'Дискорд' },
  { pattern: new RegExp(`${WB}Reddit${WE}`, 'giu'), spoken: 'Реддит' },
  { pattern: new RegExp(`${WB}Tumblr${WE}`, 'giu'), spoken: 'Тамблер' },
  { pattern: new RegExp(`${WB}Twitch${WE}`, 'giu'), spoken: 'Твитч' },
  { pattern: new RegExp(`${WB}Shazam${WE}`, 'giu'), spoken: 'Шазам' },
  { pattern: new RegExp(`${WB}Deezer${WE}`, 'giu'), spoken: '\u0414\u0438\u0437\u0435\u0440' },
  { pattern: new RegExp(`${WB}Tidal${WE}`, 'giu'), spoken: 'Тайдал' },
  { pattern: new RegExp(`${WB}iTunes${WE}`, 'giu'), spoken: 'Айтюнс' },
  { pattern: new RegExp(`${WB}VKontakte${WE}`, 'giu'), spoken: 'ВКонтакте' },
  { pattern: new RegExp(`${WB}VK\\s+Music${WE}`, 'giu'), spoken: 'ВК Мьюзик' },
  { pattern: new RegExp(`${WB}VK${WE}`, 'giu'), spoken: 'ВК' },
];

export function normalizeSocialPlatformsForRussianTts(text: string): string {
  let result = text;
  for (const { pattern, spoken } of SOCIAL_PLATFORM_TTS) {
    pattern.lastIndex = 0;
    result = result.replace(pattern, spoken);
  }
  return result;
}
