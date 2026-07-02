import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { trackKey } from './fact-bank.js';
import type { StoryLanguageId } from './story-language.js';
import { resolveStoryNarrator, type StoryNarratorId } from './story-narrator.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'public-voiced-facts.json');

export type PublicVoicedFactSource = 'history' | 'gold';

export interface PublicVoicedFact {
  id: string;
  artist: string;
  title: string;
  /** Exact text as heard by the user — never rewrite for publish. */
  voicedText: string;
  seedFact?: string;
  narrator: StoryNarratorId;
  lang: StoryLanguageId;
  source: PublicVoicedFactSource;
  trackKey: string;
  firstVoicedAt: number;
  publishedOnSite?: boolean;
}

interface PublicVoicedFactsFile {
  updatedAt: number;
  facts: PublicVoicedFact[];
}

const VALID_NARRATORS = new Set([
  'radio_host',
  'night_dj',
  'expert',
  'contemporary',
  'fan',
  'backstage',
  'auto',
]);

function normalizeVoicedText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function publicVoicedFactDedupeKey(
  voicedText: string,
  artist: string,
  title: string,
  narrator: StoryNarratorId,
): string {
  const norm = normalizeVoicedText(voicedText).toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${norm}|${trackKey(artist, title)}|${narrator}`)
    .digest('hex')
    .slice(0, 24);
}

function loadStoreFile(): PublicVoicedFactsFile {
  if (!fs.existsSync(STORE_PATH)) {
    return { updatedAt: Date.now(), facts: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as PublicVoicedFactsFile;
    return { updatedAt: raw.updatedAt ?? Date.now(), facts: Array.isArray(raw.facts) ? raw.facts : [] };
  } catch {
    return { updatedAt: Date.now(), facts: [] };
  }
}

function saveStoreFile(store: PublicVoicedFactsFile): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  store.updatedAt = Date.now();
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function loadPublicVoicedFacts(): PublicVoicedFact[] {
  return loadStoreFile().facts;
}

export function resolveVoicedTextForStorage(voicedTextRaw: string | undefined, script: string): string {
  const voiced = voicedTextRaw?.trim();
  if (voiced && voiced.length >= 20) return voiced;
  return script.trim();
}

export interface AppendPublicVoicedFactInput {
  artist: string;
  title: string;
  voicedText: string;
  seedFact?: string;
  storyNarrator?: string;
  lang?: StoryLanguageId;
  source?: PublicVoicedFactSource;
  voicedAt?: number;
}

export function appendPublicVoicedFact(input: AppendPublicVoicedFactInput): PublicVoicedFact | null {
  const voicedText = normalizeVoicedText(input.voicedText);
  if (voicedText.length < 20) return null;
  if (voicedText.length > 8000) return null;

  const narrator = resolveStoryNarrator(input.storyNarrator) as StoryNarratorId;
  if (!VALID_NARRATORS.has(narrator)) return null;

  const lang: StoryLanguageId = input.lang === 'en' ? 'en' : 'ru';
  const tk = trackKey(input.artist, input.title);
  const dedupe = publicVoicedFactDedupeKey(voicedText, input.artist, input.title, narrator);

  const store = loadStoreFile();
  const existing = store.facts.find(
    (f) =>
      publicVoicedFactDedupeKey(f.voicedText, f.artist, f.title, f.narrator) === dedupe,
  );
  if (existing) return existing;

  const entry: PublicVoicedFact = {
    id: crypto.randomUUID(),
    artist: input.artist.trim(),
    title: input.title.trim(),
    voicedText,
    seedFact: input.seedFact?.trim() || undefined,
    narrator,
    lang,
    source: input.source ?? 'history',
    trackKey: tk,
    firstVoicedAt: input.voicedAt ?? Date.now(),
    publishedOnSite: false,
  };

  store.facts.push(entry);
  saveStoreFile(store);
  console.log(
    `[public-facts] +1 narrator=${entry.narrator} "${entry.artist}" — "${entry.title}" len=${entry.voicedText.length}`,
  );
  return entry;
}

export function listPublicVoicedFacts(opts: {
  narrator?: string;
  lang?: StoryLanguageId;
  limit?: number;
}): PublicVoicedFact[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let list = loadPublicVoicedFacts();
  if (opts.narrator?.trim()) {
    const n = resolveStoryNarrator(opts.narrator);
    list = list.filter((f) => f.narrator === n);
  }
  if (opts.lang) {
    list = list.filter((f) => f.lang === opts.lang);
  }
  return list.sort((a, b) => b.firstVoicedAt - a.firstVoicedAt).slice(0, limit);
}

export function groupPublicVoicedFactsByNarrator(
  lang?: StoryLanguageId,
): Record<string, PublicVoicedFact[]> {
  let list = loadPublicVoicedFacts();
  if (lang) list = list.filter((f) => f.lang === lang);
  const out: Record<string, PublicVoicedFact[]> = {};
  for (const f of list.sort((a, b) => b.firstVoicedAt - a.firstVoicedAt)) {
    if (!out[f.narrator]) out[f.narrator] = [];
    out[f.narrator]!.push(f);
  }
  return out;
}

export function markPublicFactsPublished(ids: string[]): void {
  const store = loadStoreFile();
  const set = new Set(ids);
  for (const f of store.facts) {
    if (set.has(f.id)) f.publishedOnSite = true;
  }
  saveStoreFile(store);
}

export const PUBLIC_VOICED_FACTS_PATH = STORE_PATH;
