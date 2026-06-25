import { factMentionsTitle, hasTrackContextSignal } from './fact-relevance.js';
import { isTrackMeaningNarrativeSeed } from './reference-fact-quality.js';

/** Seed explicitly says this track's story/meaning — not just artist wiki. */
export function seedExplicitlyLinksToTrack(seed: string, title: string): boolean {
  const trimmed = seed.trim();
  if (!trimmed || !title.trim()) return false;
  if (isTrackMeaningNarrativeSeed(trimmed)) return true;
  if (!factMentionsTitle(trimmed, title)) return false;
  if (/\b(?:wrote|written|composed|recorded|написал|записал)\b/i.test(trimmed)) return true;
  if (hasTrackContextSignal(trimmed)) return true;
  if (
    /\b(?:written (?:about|for|after|from)|this (?:song|track)|about this (?:song|track)|the song (?:is|was|serves|explores)|про эт\w*\s+(?:песн|трек)|эта\s+песн\w*\s+(?:про|о\b|об)|написан\w*\s+(?:для|про|после|из)|записан\w*\s+(?:после|про))\b/i.test(
      trimmed,
    )
  ) {
    return true;
  }
  return false;
}

/** Bio detail appears in seed — if script ties it to the track, check for false linkage. */
const BIO_TOPIC_PAIRS: Array<{ inSeed: RegExp; inScript: RegExp }> = [
  {
    inSeed: /\b(?:childhood|youth|юност|детств)\b/i,
    inScript: /(?:детств|юност|childhood|youth)/i,
  },
  {
    inSeed: /\b(?:football|soccer|Cerezo|футбол)\b/i,
    inScript: /(?:футбол|soccer|забег\w*|бег\w*\s+по\s+пол|мяч)/i,
  },
  {
    inSeed: /\b(?:school|student|honors|отличник|школ)/i,
    inScript: /(?:школ|отличник|учебник|school)/i,
  },
  {
    inSeed: /\b(?:army|military|арми\w*|draft|откос)\b/i,
    inScript: /\b(?:арми\w*|draft|призыв)/i,
  },
  {
    inSeed: /\b(?:divorce|custody|развод|опек)\b/i,
    inScript: /\b(?:развод|опек|custody)/i,
  },
  {
    inSeed: /\b(?:refugee|UNHCR|Lebanon|бежен|Ливан)\b/i,
    inScript: /\b(?:бежен|refugee|Ливан|UNHCR)/i,
  },
  {
    inSeed: /\b(?:PhD|astrophysic|докторск\w*\s+степен)/i,
    inScript: /(?:астрофизик|докторск|PhD|космическ|пыли)/i,
  },
  {
    inSeed: /\b(?:factory|burglary|увол\w*|воровств)/i,
    inScript: /(?:завод|увол\w*|воровств|burglary)/i,
  },
  {
    inSeed: /\bBRIT\s+School\b/i,
    inScript: /BRIT\s+School|Jessie\s+J|Leona\s+Lewis/i,
  },
  {
    inSeed: /\b(?:Smoky Mountains|twelve children|one-room cabin)\b/i,
    inScript: /Smoky|twelve children|одной комнат|горн/i,
  },
  {
    inSeed: /\bDestiny's Child\b/i,
    inScript: /Destiny's Child|состав|тро(?:йк|их)/i,
  },
  {
    inSeed: /\b(?:Aberdeen|outsider at school)\b/i,
    inScript: /Aberdeen|Абердин|аутсайдер|outsider/i,
  },
  {
    inSeed: /\bwrote hits for other\b/i,
    inScript: /писала хиты|обложек|album covers/i,
  },
  {
    inSeed: /\bschoolteacher\b/i,
    inScript: /учител|schoolteacher|Newcastle/i,
  },
];

/** «Трек про футбол / о школьных годах» — only when seed never tied fact to this title. */
const TRACK_ABOUT_BIO_CLAIM =
  /(?:трек|песн\w*|композици\w*|сингл|песня)\s+(?:про|о|об)\s/i;

/** «Вдохновлён детством / этот опыт влился в трек» with concrete bio nouns nearby. */
const TRACK_INSPIRED_BY_BIO_CLAIM =
  /(?:трек|песн\w*|композици\w*|сингл)[^.!?…]{0,75}(?:вдохнов\w*|родил\w*|выш\w*\s+из|влил\w*|вылил\w*|легл\w*\s+в\s+основ|создан\w*|написан\w*|записан\w*|сочетает)/i;

/** Sound-as-bio metaphor: «риффы как забеги» or «риффы … как будто забеги». */
const BIO_METAPHOR_IN_SOUND =
  /(?:(?:как\s+будто|словно|напомина\w*)[^.!?…]{0,90}(?:рифф|ритм|нот|гитар|мелод|припев|лирик|sound|groove|текст)|(?:рифф|ритм|гитар|мелод|припев|лирик|текст)[^.!?…]{0,90}(?:как\s+будто|словно).{0,50}(?:забег|футбол|поле|школ|учебник))/i;

function scriptMentionsTitle(script: string, title: string): boolean {
  const norm = title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!norm) return false;
  return script
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .includes(norm);
}

/**
 * Artist-scope seed + story falsely claims THIS track is about / inspired by a bio detail.
 * Soft gate: only obvious «трек про X» / «вдохновлён X» when seed never links title.
 */
export function findArtistBioTrackFalseLinkage(
  script: string,
  title: string,
  referenceFacts: string[] = [],
): string | null {
  if (!title.trim() || referenceFacts.length === 0) return null;
  const seed = referenceFacts[0]?.trim() ?? '';
  if (!seed || seedExplicitlyLinksToTrack(seed, title)) return null;
  if (!scriptMentionsTitle(script, title)) return null;

  for (const { inSeed, inScript } of BIO_TOPIC_PAIRS) {
    if (!inSeed.test(seed) || !inScript.test(script)) continue;

    if (TRACK_ABOUT_BIO_CLAIM.test(script)) {
      return 'artist biography falsely linked to track (track-about-bio)';
    }
    if (TRACK_INSPIRED_BY_BIO_CLAIM.test(script)) {
      return 'artist biography falsely linked to track (track-inspired-by-bio)';
    }
    if (BIO_METAPHOR_IN_SOUND.test(script)) {
      return 'artist biography falsely linked to track (bio-metaphor-in-sound)';
    }
  }
  return null;
}

export function buildArtistScopeStoryPromptBlockRu(): string {
  return [
    'СЕМЯ ПРО АРТИСТА (не про этот трек): расскажи биографию или поворот карьеры.',
    'Трек — только рамка эфира («сейчас звучит», «пока крутится»), НЕ сюжет песни.',
    'ЗАПРЕЩЕНО: что ЭТОТ трек про/о/вдохновлён/вытек из деталей семени — если в семени нет прямой связи с названием трека.',
    'МОЖНО: «пока в эфире …», «у исполнителя до славы …», «мало кто знает про …» — параллельно, без «песня про футбол/школу».',
    'Не выдумывай метафоры «риффы как забеги по полю», если семя не связывает звук с биографией.',
  ].join('\n');
}

export function buildArtistScopeStoryPromptBlockEn(): string {
  return [
    'SEED IS ABOUT THE ARTIST (not this track): tell biography or a career turning point.',
    'The track is only an on-air frame ("now playing") — not the song\'s subject.',
    'FORBIDDEN: claiming THIS track is about / inspired by / grew from seed details unless the seed explicitly links them to the title.',
    'OK: "while this plays…", "before fame…", "few know that…" — parallel context, not "the song is about football/school".',
    'Do not invent sound metaphors from bio (e.g. "riffs like football runs") unless the seed says so.',
  ].join('\n');
}
