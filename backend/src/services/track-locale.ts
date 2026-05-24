const CYRILLIC_RE = /[\u0400-\u04FF]/;

const COUNTRY_LABELS: Record<string, string> = {
  RU: 'Россия',
  UA: 'Украина',
  BY: 'Беларусь',
  KZ: 'Казахстан',
  US: 'США',
  GB: 'Великобритания',
  DE: 'Германия',
  FR: 'Франция',
  IT: 'Италия',
  ES: 'Испания',
  JP: 'Япония',
  KR: 'Корея',
};

export interface TrackLocale {
  countryCode?: string;
  countryLabelRu: string;
  sceneHintRu: string;
  yearLabelRu: string;
  localeRulesRu: string;
}

function countryLabel(code?: string): string {
  if (!code) return 'неизвестна';
  return COUNTRY_LABELS[code.toUpperCase()] ?? code.toUpperCase();
}

/** Cyrillic artist/title → likely Russian scene unless MusicBrainz says otherwise. */
export function inferCountryFromText(artist: string, title: string): string | undefined {
  if (CYRILLIC_RE.test(artist) || CYRILLIC_RE.test(title)) return 'RU';
  return undefined;
}

function isRussianCountryGenre(genre: string | undefined, title: string, artist: string): boolean {
  const g = (genre ?? '').toLowerCase();
  const text = `${title} ${artist}`.toLowerCase();
  const hasCountryWord = g.includes('country') || text.includes('кантри');
  const isRussian = CYRILLIC_RE.test(artist) || CYRILLIC_RE.test(title);
  return hasCountryWord && isRussian;
}

function sceneForCountry(countryCode: string | undefined, year: number | undefined, genre: string | undefined, title: string, artist: string): string {
  const code = countryCode?.toUpperCase();
  const g = (genre ?? '').toLowerCase();
  const modern = year === undefined || year >= 2010;

  if (code === 'RU' || (!code && inferCountryFromText(artist, title) === 'RU')) {
    if (isRussianCountryGenre(genre, title, artist)) {
      return modern
        ? 'российский кантри/рэп, студии и стриминги, не Nashville и не американская радиола'
        : 'российская кантри-сцена, свои артисты и площадки';
    }
    if (g.includes('hip hop') || g.includes('rap') || g.includes('trap')) {
      return modern
        ? 'российский рэп/трэп, студии, VK, Telegram, фестивали'
        : 'российская рэп-сцена, свои лейблы и площадки';
    }
    if (g.includes('rock') || g.includes('punk') || g.includes('metal')) {
      return modern ? 'российская рок-сцена, клубы и фестивали' : 'российский рок, свои площадки и студии';
    }
    if (g.includes('pop')) {
      return modern ? 'российская поп-сцена, стриминги и соцсети' : 'российская эстрада и поп';
    }
    if (modern) {
      return 'современная российская музыка: стриминги, VK, Telegram, студии, фестивали';
    }
    if (year !== undefined && year >= 2000) {
      return 'российская сцена нулевых: музыкальное ТВ, mp3, первые стримы';
    }
    if (year !== undefined && year >= 1990) {
      return 'российская сцена девяностых: кассеты, рок-клубы, первые частные студии';
    }
    return 'российская музыкальная сцена';
  }

  if (code === 'US' || code === 'GB') {
    if (g.includes('country') && !CYRILLIC_RE.test(artist)) {
      return modern ? 'американская/британская country-сцена' : 'country и Nashville-контекст';
    }
  }

  return '';
}

export function eraContextForPrompt(
  year: number | undefined,
  genre: string | undefined,
  locale?: Pick<TrackLocale, 'countryCode' | 'sceneHintRu'>,
  artist = '',
  title = '',
): string {
  const regional = locale?.sceneHintRu || sceneForCountry(locale?.countryCode, year, genre, title, artist);
  if (regional) return regional;

  const g = (genre ?? '').toLowerCase();
  if (g.includes('jazz') || g.includes('swing')) return 'джазовая эпоха, клубы и джем-сейшены';
  if (g.includes('blues') || g.includes('soul')) return 'соул и блюз, южные клубы и ночные сцены';
  if (g.includes('rock') || g.includes('metal') || g.includes('punk')) return 'рок-сцена, концерты и гаражи';
  if (g.includes('electronic') || g.includes('house') || g.includes('techno') || g.includes('dance')) {
    return 'клубная электроника, склады и диджейские стыки';
  }
  if (g.includes('hip hop') || g.includes('rap')) return 'хип-хоп с блока, уличные вечеринки';
  if (g.includes('pop')) return 'поп-культура, радио и телевидение';
  if (!year) return 'эпоха артиста — без винтажных клише, если трек современный';
  if (year < 1960) return 'ранний период, винил и живое радио';
  if (year < 1970) return 'расцвет соула и рока';
  if (year < 1980) return 'золотая эра рока и диско';
  if (year < 1990) return 'музыкальное телевидение, кассеты и фестивали';
  if (year < 2000) return 'клубы и ремиксы';
  if (year < 2010) return 'интернет-форумы и первые стримы';
  return 'современная сцена, стриминги и соцсети';
}

export function resolveTrackLocale(params: {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  countryCode?: string;
}): TrackLocale {
  const countryCode = params.countryCode?.toUpperCase() || inferCountryFromText(params.artist, params.title);
  const countryLabelRu = countryLabel(countryCode);
  const sceneHintRu = sceneForCountry(countryCode, params.year, params.genre, params.title, params.artist);
  const yearLabelRu = params.year
    ? String(params.year)
    : countryCode === 'RU' || inferCountryFromText(params.artist, params.title) === 'RU'
      ? 'неизвестен — ориентируйся на современную российскую сцену, не на СССР и не на американское радио'
      : 'неизвестен — не выдумывай винтаж (радиола, Apollo), если трек звучит современно';

  const localeRulesRu = countryCode === 'RU'
    ? 'Трек из России: места, быт, сленг и индустрия — российские. Не Nashville, не Apollo, не «радиола» для современного российского трека.'
    : countryCode
      ? `Трек связан со страной ${countryLabelRu}: история должна быть из этой культурной сцены, не из чужой.`
      : 'Страна неизвестна — не приписывай конкретную американскую или советскую эпоху без оснований.';

  return {
    countryCode,
    countryLabelRu,
    sceneHintRu: sceneHintRu || eraContextForPrompt(params.year, params.genre, undefined, params.artist, params.title),
    yearLabelRu,
    localeRulesRu,
  };
}
