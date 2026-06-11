import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { primaryArtistName } from './artist-primary.js';

export type ArtistGenderRu = 'masculine' | 'feminine';
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
  if (/\s&\s/.test(artist)) return true;
  if (/\band\b/i.test(artist) && artist.split(/\s+/).length >= 3) return true;
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

  const gender = lookupSoloGender(artist) ?? 'masculine';
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

/** Safety net before TTS — fix «их путь» for solo artists when LLM slips. */
export function fixSoloArtistPronounsRu(script: string, artist: string): string {
  const grammar = resolveArtistGrammarRu(artist);
  if (grammar.kind !== 'solo' || !grammar.gender) return script;

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

export function registerSoloArtist(name: string, gender: 'm' | 'f'): void {
  loadGrammarData();
  soloByName!.set(normalizeArtistKey(name), gender === 'f' ? 'feminine' : 'masculine');
}

export function registerGroupArtist(name: string): void {
  loadGrammarData();
  groupNames!.add(normalizeArtistKey(name));
}
