/** Reject mythology / disambiguation / non-musician pages when resolving artist Wikipedia. */

const NON_MUSIC_WIKI_RE =
  /\b(?:mythology|legend|archer|fictional character|may refer to|disambiguation|hero of|ancient persian|greek myth|roman myth|biblical|saint)\b/i;

const NON_MUSIC_PROFESSION_WIKI_RE =
  /\b(?:lawyer|attorney|advocate|barrister|solicitor|politician|journalist|judge|prosecutor|diplomat|businessman|entrepreneur|футболист|политик|журналист|судья|прокурор|деput|губернатор|министр)\b/i;

const NON_MUSIC_PROFESSION_RU_RE =
  /\b(?:адвокат|юрист|политик|журналист|судья|прокурор|депутат|губернатор|министр|футболист|тренер|актёр|актриса|режиссёр|режиссер|писатель|поэт)\b/i;

const MUSIC_WIKI_RE =
  /\b(?:singer|musician|rapper|band|album|single|song|record|pop|hip hop|electronic|producer|DJ|artist|composer|vocalist|discography|music video|Billboard|Grammy|певец|певица|музыкант|группа|рок|рэпер|альбом|сингл|трек|клип|музыкальн)\b/i;

export function isNonMusicProfessionText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return false;
  const hasProfession =
    NON_MUSIC_PROFESSION_WIKI_RE.test(trimmed) || NON_MUSIC_PROFESSION_RU_RE.test(trimmed);
  if (!hasProfession) return false;
  return !MUSIC_WIKI_RE.test(trimmed);
}

export function isMusicArtistWikiExtract(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40) return false;
  if (NON_MUSIC_WIKI_RE.test(trimmed)) return false;
  if (isNonMusicProfessionText(trimmed)) return false;
  return MUSIC_WIKI_RE.test(trimmed);
}

function hasCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text);
}

/** Prefer musician/singer pages — critical for RU names (Фейгин, Серёга, …). */
export function buildMusicFirstWikiCandidates(primary: string): string[] {
  const short = primary.trim().split(/\s+/).length === 1 && primary.trim().length <= 12;
  const cyrillic = hasCyrillic(primary);
  const ruMusic = cyrillic
    ? [
        `${primary} (музыкант)`,
        `${primary} (группа)`,
        `${primary} (певец)`,
        `${primary} (рок-группа)`,
        `${primary} (рэпер)`,
      ]
    : [];
  const base = [
        `${primary} (singer)`,
        `${primary} (musician)`,
        `${primary} (rapper)`,
        `${primary} (band)`,
        `${primary} (musical group)`,
        primary,
      ];
  const withGerman = /\b(lino|boi|kid|mc)\b/i.test(primary)
    ? [`${primary} German rapper`, `${primary} deutsch`, ...base]
    : base;
  const merged = cyrillic ? [...ruMusic, ...withGerman] : withGerman;
  return short ? merged : [primary, ...merged.filter((t) => t !== primary)];
}
