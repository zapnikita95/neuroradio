import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryArtistName } from './artist-primary.js';

export type ArtistGenderRu = 'masculine' | 'feminine' | 'neutral';
export type ArtistCollectiveKind = 'solo' | 'group';

export interface ArtistGrammarRu {
  kind: ArtistCollectiveKind;
  gender?: ArtistGenderRu;
  subject: string;
  possessive: string;
  reflexive: string;
  promptHint: string;
}

type SoloMap = Record<string, 'm' | 'f'>;

const FEMININE_FIRST_NAMES = new Set([
  'adele',
  'alicia',
  'ariana',
  'billie',
  'britney',
  'carly',
  'celine',
  'charli',
  'cher',
  'christina',
  'diana',
  'dua',
  'grimes',
  'halsey',
  'janis',
  'jennifer',
  'joni',
  'katy',
  'kylie',
  'lady',
  'lauren',
  'laurence',
  'lana',
  'lorde',
  'madonna',
  'mariah',
  'miley',
  'nancy',
  'nicki',
  'norah',
  'olivia',
  'pink',
  'rihanna',
  'rosalia',
  'selena',
  'shakira',
  'sheryl',
  'sia',
  'taylor',
  'tina',
  'whitney',
  'zara',
  'zemfira',
]);

function inferGenderFromFirstName(artist: string): ArtistGenderRu | undefined {
  const primary = primaryArtistName(artist).trim();
  const first = primary.split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}]/gu, '');
  if (!first) return undefined;
  if (FEMININE_FIRST_NAMES.has(first)) return 'feminine';
  return undefined;
}

const __dir = dirname(fileURLToPath(import.meta.url));
let soloByName: Map<string, ArtistGenderRu> | null = null;
let groupNames: Set<string> | null = null;

function normalizeArtistKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadGrammarData(): void {
  if (soloByName && groupNames) return;
  soloByName = new Map();
  groupNames = new Set();
  try {
    const raw = readFileSync(join(__dir, '../data/solo-artist-grammar.json'), 'utf8');
    const data = JSON.parse(raw) as { solo?: SoloMap; groups?: string[] };
    for (const [name, gender] of Object.entries(data.solo ?? {})) {
      soloByName.set(normalizeArtistKey(name), gender === 'f' ? 'feminine' : 'masculine');
    }
    for (const name of data.groups ?? []) {
      groupNames!.add(normalizeArtistKey(name));
    }
  } catch {
    soloByName = new Map();
    groupNames = new Set();
  }
}

const GROUP_NAME_RE =
  /\b(?:band|group|duo|duet|trio|quartet|quintet|orchestra|ensemble|collective|crew|peas|brothers|sisters|boys|girls)\b/i;

function looksLikeGroupName(artist: string): boolean {
  const n = normalizeArtistKey(artist);
  loadGrammarData();
  if (groupNames!.has(n)) return true;
  if (/^the\s/.test(n)) return true;
  if (GROUP_NAME_RE.test(artist)) return true;
  if (/\bpeople\b/i.test(artist)) return true;
  if (/\s&\s/.test(artist)) return true;
  if (/\band\b/i.test(artist) && artist.split(/\s+/).length >= 3) return true;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length >= 3 && words.includes('the')) return true;
  return false;
}

function lookupSoloGender(artist: string): ArtistGenderRu | undefined {
  loadGrammarData();
  const n = normalizeArtistKey(artist);
  if (soloByName!.has(n)) return soloByName!.get(n);
  const primary = normalizeArtistKey(primaryArtistName(artist));
  return soloByName!.get(primary);
}

export function resolveArtistGrammarRu(artist: string): ArtistGrammarRu {
  if (looksLikeGroupName(artist)) {
    return {
      kind: 'group',
      subject: 'они',
      possessive: 'их',
      reflexive: 'себя',
      promptHint:
        'Артист — группа/коллектив. Пиши «они», «их», «у них». Не используй «он/она/его/её» про коллектив.',
    };
  }

  const gender = lookupSoloGender(artist) ?? inferGenderFromFirstName(artist);
  if (gender === 'feminine') {
    return {
      kind: 'solo',
      gender,
      subject: 'она',
      possessive: 'её',
      reflexive: 'себя',
      promptHint:
        'Артист — сольная исполнительница. Пиши «она», «её», «у неё». НЕ пиши «они/их» про одного артиста.',
    };
  }

  if (gender === 'masculine') {
    return {
      kind: 'solo',
      gender,
      subject: 'он',
      possessive: 'его',
      reflexive: 'себя',
      promptHint:
        'Артист — сольный исполнитель. Пиши «он», «его», «у него». НЕ пиши «они/их» про одного артиста.',
    };
  }

  return {
    kind: 'solo',
    gender: 'neutral',
    subject: '',
    possessive: '',
    reflexive: '',
    promptHint:
      'Род артиста неизвестен. НЕ используй он/она/они/его/её/их и родовые окончания (-ый/-ая, вложил/вложила). ' +
      'Пиши нейтрально: «Lauren Sanderson — единственный ребёнок…», «в треке сочетаются…», «артист записал» → «эта запись сочетает».',
  };
}

/** Safety net before TTS — fix «их путь» for solo artists when LLM slips. */
export function fixSoloArtistPronounsRu(script: string, artist: string): string {
  const grammar = resolveArtistGrammarRu(artist);
  if (grammar.kind !== 'solo') return script;

  if (grammar.gender === 'neutral') {
    return neutralizeGenderedPronounsRu(script, artist);
  }
  if (!grammar.gender) return script;

  const poss = grammar.possessive;
  const subj = grammar.subject;
  const possCap = poss.charAt(0).toUpperCase() + poss.slice(1);
  const subjCap = subj.charAt(0).toUpperCase() + subj.slice(1);

  let result = script;
  const patterns: Array<[RegExp, string]> = [
    [/(?<![а-яёa-z])здесь не просто поёт/gi, `${subj} не просто поёт`],
    [/(?<![а-яёa-z])Здесь не просто поёт/g, `${subjCap} не просто поёт`],
    [/(?<![а-яёa-z])здесь не просто пел/gi, `${subj} не просто пел`],
    [/(?<![а-яёa-z])Здесь не просто пел/g, `${subjCap} не просто пел`],
    [/(?:исполнитель|артист|музыкант|группа)\s+он(?=\s|[,.!?—–-]|$)/giu, `${subj}`],
    [/В нет потолка/gi, 'В этой песне нет потолка'],
    [/\bИх\s+(путь)/g, `${possCap} $1`],
    [/\bих\s+(путь)/g, `${poss} $1`],
    [/\bИх\s+(голос)/g, `${possCap} $1`],
    [/\bих\s+(голос)/g, `${poss} $1`],
    [/\bИх\s+(карьер\w*)/g, `${possCap} $1`],
    [/\bих\s+(карьер\w*)/g, `${poss} $1`],
    [/\bОни\s+(записал\w*)/g, `${subjCap} $1`],
    [/\bони\s+(записал\w*)/g, `${subj} $1`],
    [/\bОни\s+(стал\w*)/g, `${subjCap} $1`],
    [/\bони\s+(стал\w*)/g, `${subj} $1`],
  ];
  for (const [re, repl] of patterns) {
    result = result.replace(re, repl);
  }

  if (grammar.gender === 'feminine') {
    const esc = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`(${esc})\\s+не\\s+просто\\s+пел(?![а-яёa-z])`, 'gi'), '$1 не просто пела');
    result = result.replace(/(?<![а-яёa-z])не просто пел(?![а-яёa-z])/gi, 'не просто пела');
    result = result.replace(/(?<![а-яёa-z])выросший(?![а-яёa-z])/gi, 'выросшая');
    result = result.replace(/(?<![а-яёa-z])вложил(?![а-яёa-z])/gi, 'вложила');
    result = result.replace(/(?<![а-яёa-z])его\s+(голос|боль|путь)/gi, 'её $1');
    result = result.replace(/(?<![а-яёa-z])для него(?![а-яёa-z])/gi, 'для неё');
    result = result.replace(/он создавал(?![а-яёa-z])/gi, 'она создавала');
    result = result.replace(/она создавал(?![а-яёa-z])/gi, 'она создавала');
    result = result.replace(/он записал/gi, 'она записала');
    result = result.replace(/(?<![а-яёa-z])он пел(?![а-яёa-z])/gi, 'она пела');
    result = result.replace(/он стал/gi, 'она стала');
    result = result.replace(/он написал/gi, 'она написала');
    result = result.replace(new RegExp(`(${esc})\\s+—\\s+он\\s+`, 'gi'), '$1 — она ');
    result = result.replace(/ — он /g, ' — она ');
  }

  return result.replace(/\s{2,}/g, ' ').trim();
}

function neutralizeGenderedPronounsRu(script: string, artist: string): string {
  const esc = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let result = script;
  if (esc) {
    result = result.replace(
      new RegExp(`(${esc})\\s*,\\s*(?:выросший|выросшая|родившийся|родившая)(?=[\\s,.!?—–-]|$)`, 'giu'),
      '$1',
    );
    result = result.replace(
      new RegExp(`(${esc})\\s+—\\s+(?:он|она)\\s+`, 'giu'),
      '$1 — ',
    );
  }
  const replacements: Array<[RegExp, string]> = [
    [/,\s*выросший(?=[\s,.!?—–-]|$)/giu, ''],
    [/,\s*выросшая(?=[\s,.!?—–-]|$)/giu, ''],
    [/,\s*родившийся(?=[\s,.!?—–-]|$)/giu, ''],
    [/,\s*родившаяся(?=[\s,.!?—–-]|$)/giu, ''],
    [/(?<![а-яёa-z])меня\s+до\s+сих\s+пор\s+цепляет,\s*как\s+он\s+/giu, 'меня до сих пор цепляет, как в треке '],
    [/(?<![а-яёa-z])меня\s+до\s+сих\s+пор\s+цепляет,\s*как\s+она\s+/giu, 'меня до сих пор цепляет, как в треке '],
    [/(?<![а-яёa-z])он\s+(?:соединил|создал|записал|вложил|стал|пел|написал|делает|проживает)\b/giu, ''],
    [/(?<![а-яёa-z])она\s+(?:соединила|создала|записала|вложила|стала|пела|написала|делает|проживает)\b/giu, ''],
    [/(?<![а-яёa-z])для\s+него\s+/giu, ''],
    [/(?<![а-яёa-z])для\s+неё\s+/giu, ''],
    [/(?<![а-яёa-z])Franz Ferdinand\s+не\s+просто\s+(?:играл|играла)/giu, 'Franz Ferdinand не просто играли'],
    [/(?<![а-яёa-z])Franz Ferdinand\s+—\s+он\s+/giu, 'Franz Ferdinand — они '],
  ];
  for (const [re, repl] of replacements) {
    result = result.replace(re, repl);
  }
  return result.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
}

export function registerSoloArtist(name: string, gender: 'm' | 'f'): void {
  loadGrammarData();
  soloByName!.set(normalizeArtistKey(name), gender === 'f' ? 'feminine' : 'masculine');
}

export function registerGroupArtist(name: string): void {
  loadGrammarData();
  groupNames!.add(normalizeArtistKey(name));
}
