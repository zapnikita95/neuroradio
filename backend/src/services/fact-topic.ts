import { isCatalogMetadataSeed, isTrackDurationCatalogSeed } from './reference-fact-quality.js';

/**
 * Generic fact topics — no track/album names in keys.
 * Any fact text maps to one primary topic for dedup across sources.
 */

export type FactTopicKey =
  | 'award_ceremony'
  | 'chart_success'
  | 'listening_stats'
  | 'music_video'
  | 'studio_recording'
  | 'album_context'
  | 'live_performance'
  | 'sampling_credits'
  | 'lyrics_backstory'
  | 'censorship'
  | 'band_formation'
  | 'artist_biography'
  | 'cultural_impact'
  | 'performer_fatigue'
  | 'collaboration'
  | 'posthumous_legacy'
  | 'cover_tribute'
  | 'scene_movement'
  | 'misc';

export const FACT_TOPIC_LABELS_RU: Record<FactTopicKey, string> = {
  award_ceremony: 'награды / церемония',
  chart_success: 'чарты / хиты',
  listening_stats: 'статистика прослушиваний',
  music_video: 'клип / видео',
  studio_recording: 'запись в студии',
  album_context: 'альбом / сингл (контекст релиза)',
  live_performance: 'живые выступления',
  sampling_credits: 'сэмплы / заимствования',
  lyrics_backstory: 'смысл / происхождение текста',
  censorship: 'цензура / запреты',
  band_formation: 'создание группы',
  artist_biography: 'биография артиста',
  cultural_impact: 'культурное влияние',
  performer_fatigue: 'усталость от хита',
  collaboration: 'коллаборации',
  posthumous_legacy: 'наследие после смерти',
  cover_tribute: 'каверы / трибьюты',
  scene_movement: 'сцена / движение',
  misc: 'прочее',
};

type TopicRule = { topic: FactTopicKey; pattern: RegExp };

/** Order matters — first match wins. */
const TOPIC_RULES: TopicRule[] = [
  { topic: 'listening_stats', pattern: /\b(?:last\.?fm|слушател|прослушиван|scrobbles?|playcount)\b/i },
  { topic: 'award_ceremony', pattern: /\b(?:grammy|oscar|mtv video music|award|ceremony|номинац|преми[яю]|didn'?t attend)\b/i },
  { topic: 'music_video', pattern: /\b(?:music video|official video|клип|directed by|promotional video|mtv|gondry|режисс|director|visual|анимац|optical illusion)\b/i },
  {
    topic: 'sampling_credits',
    pattern: /\b(?:sampled?|sampling|interpolation|rip(?:ped)? off|borrowed from|based on a riff)\b/i,
  },
  { topic: 'censorship', pattern: /\b(?:banned by|refused to play|censored|radio ban|запрет|цензур)\b/i },
  {
    topic: 'performer_fatigue',
    pattern: /\b(?:grew tired of|removed it from (?:their|the) live|устал от|надоел)\b/i,
  },
  {
    topic: 'live_performance',
    pattern: /\b(?:setlist|live debut|first performed live|концерт|выступлен|tour\b|toured)\b/i,
  },
  {
    topic: 'lyrics_backstory',
    pattern:
      /\b(?:lyrics (?:are|were|mean)|hidden meaning|title (?:was )?inspired|deodorant|meaning of the|текст песни|смысл|написал текст|автором текста)\b/i,
  },
  {
    topic: 'chart_success',
    pattern: /\b(?:topped the|peaked at|billboard|hot 100|charted|number one|reached (?:#|number)|хит(?:ом)?\b)/i,
  },
  {
    topic: 'studio_recording',
    pattern:
      /\b(?:recorded (?:at|the|in)|studio session|took (?:three )?weeks to record|composed (?:the|in)|записан|студи)\b/i,
  },
  {
    topic: 'album_context',
    pattern:
      /\b(?:lead single|opening track|featured on|debut album|second album|third album|альбом|сингл с альбома|first single from)\b/i,
  },
  { topic: 'posthumous_legacy', pattern: /\b(?:after (?:his|her|their) death|posthumous|reclaimed #1|после смерти)\b/i },
  { topic: 'collaboration', pattern: /\b(?:feat\.|featuring|co-?wrote|co-?written|produced by|duet with)\b/i },
  {
    topic: 'band_formation',
    pattern: /\b(?:formed in|founded by|band was formed|создан|образован|основан)\b/i,
  },
  {
    topic: 'cultural_impact',
    pattern:
      /\b(?:grunge anthem|magnum opus|cultural phenomenon|defined (?:a |the )?generation|omnipresence|влияни[ея]|икон[аы])\b/i,
  },
  {
    topic: 'artist_biography',
    pattern:
      /\b(?:born in|known professionally|american (?:rapper|rock|singer)|was an? \w+ (?:rapper|band|singer)|родил(?:ся|ась))\b/i,
  },
  { topic: 'cover_tribute', pattern: /\b(?:covered by|tribute to|кавер)\b/i },
  { topic: 'scene_movement', pattern: /\b(?:punk scene|new wave|hip hop scene|grunge (?:wave|era)|движени[ея])\b/i },
];

function normalizeForTopic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(text: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were', 'been', 'have', 'has', 'had',
    'their', 'they', 'them', 'into', 'about', 'after', 'before', 'when', 'where', 'which', 'while',
    'song', 'track', 'single', 'album', 'band', 'artist', 'music', 'recorded', 'released', 'became',
    'песн', 'трек', 'альбом', 'группа', 'артист', 'был', 'была', 'были', 'это', 'как', 'для', 'при',
  ]);
  return normalizeForTopic(text)
    .split(' ')
    .filter((w) => w.length >= 5 && !stop.has(w));
}

/** Classify any fact into one generic topic (no track names in key). */
export function classifyFactTopic(fact: string): FactTopicKey {
  const trimmed = fact.trim();
  if (!trimmed) return 'misc';
  for (const { topic, pattern } of TOPIC_RULES) {
    if (pattern.test(trimmed)) return topic;
  }
  return 'misc';
}

export function sameFactTopic(a: string, b: string): boolean {
  return classifyFactTopic(a) === classifyFactTopic(b);
}

function isCatalogAlbumContextSeed(fact: string): boolean {
  return isTrackDurationCatalogSeed(fact) || isCatalogMetadataSeed(fact);
}

/** Topic + token overlap — catches paraphrases from different sources. */
export function factsShareTopicOrOverlap(a: string, b: string): boolean {
  const topicA = classifyFactTopic(a);
  const topicB = classifyFactTopic(b);
  if (topicA !== 'misc' && topicA === topicB) {
    // Duration/label catalog vs «first new song» — both album_context, different stories.
    if (topicA === 'album_context' && isCatalogAlbumContextSeed(a) !== isCatalogAlbumContextSeed(b)) {
      return false;
    }
    return true;
  }

  if (factsShareSalientEntity(a, b)) return true;

  const wordsA = significantTokens(a);
  if (wordsA.length === 0) return false;
  const setB = new Set(significantTokens(b));
  const hits = wordsA.filter((w) => setB.has(w)).length;
  const ratio = hits / wordsA.length;
  return hits >= 3 && ratio >= 0.38;
}

const ENTITY_STOP = new Set([
  'michel',
  'official',
  'music',
  'video',
  'album',
  'single',
  'track',
  'band',
  'group',
  'artist',
  'american',
  'british',
  'english',
]);

/** Имена/сущности из факта — чтобы не повторять тот же клип (Gondry) под другим текстом. */
export function extractSalientEntities(fact: string): string[] {
  const out = new Set<string>();
  for (const match of fact.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? []) {
    const token = match.toLowerCase();
    if (token.length >= 5 && !ENTITY_STOP.has(token.split(/\s+/)[0]!)) {
      out.add(token);
    }
  }
  for (const match of fact.match(/\b(?:gondry|michel gondry)\b/gi) ?? []) {
    out.add(match.toLowerCase());
  }
  return [...out];
}

export function factsShareSalientEntity(a: string, b: string): boolean {
  const entitiesA = extractSalientEntities(a);
  if (entitiesA.length === 0) return false;
  const setB = new Set(extractSalientEntities(b));
  return entitiesA.some((entity) => setB.has(entity));
}

export function topicKeySet(facts: string[]): Set<FactTopicKey> {
  const out = new Set<FactTopicKey>();
  for (const f of facts) {
    if (f.trim()) out.add(classifyFactTopic(f));
  }
  return out;
}

export function isTopicBlocked(
  candidate: string,
  blockedTopics: Set<FactTopicKey>,
): boolean {
  const topic = classifyFactTopic(candidate);
  if (topic !== 'misc' && blockedTopics.has(topic)) return true;
  return false;
}

export function poolHasTopicDuplicate(
  candidate: string,
  existingFacts: string[],
): boolean {
  for (const existing of existingFacts) {
    if (factsShareTopicOrOverlap(candidate, existing)) return true;
  }
  return false;
}

export function albumPoolKey(artist: string, album: string): string {
  return `${artist.trim().toLowerCase()}|${album.trim().toLowerCase()}`;
}
