/**

 * Multi-agent local story pipeline (same Ollama model):

 * 1) Research agent — web search + fact extraction (only from snippets)

 * 2) Narrator agent — JSON story grounded in extracted facts + user ampula/persona

 */

import type { GenerateStoryInput, StoryScript } from './groq.js';

import {

  buildLocalStoryUserPrompt,

  buildLocalSystemPrompt,

  buildPersonaForNarrator,

} from './prompts.js';

import { resolveStoryNarrator } from './story-narrator.js';

import { voiceForYear } from './voices.js';

import {

  countWords,

  findGenericFiction,

  findUngroundedClaims,

  sanitizeScriptForTts,

} from './story-quality.js';

import {

  DEFAULT_STORY_LENGTH,

  getStoryLengthPreset,

  type StoryLengthId,

} from './story-length.js';

import {

  qualityOptionsForLocalAttempt,

  validateGeneratedStory,

} from './story-generate-loop.js';

import { logRejectedScript } from './story-reject-log.js';

import { webSearch, fetchWikipediaSummary } from './local-search.js';

import {

  chatOllama,

  resolveLocalOllamaBaseUrl,

  resolveLocalOllamaModel,

} from './local-ollama.js';



const MAX_NARRATOR_ATTEMPTS = 8;



function parseStoryJson(raw: string): StoryScript | null {

  const trimmed = raw.trim();

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);

  if (!jsonMatch) return null;

  try {

    const parsed = JSON.parse(jsonMatch[0]) as Partial<StoryScript>;

    if (!parsed.script || typeof parsed.script !== 'string') return null;

    return {

      script: parsed.script.trim(),

      word_count: parsed.word_count ?? countWords(parsed.script),

      voiceId: (parsed.voiceId as StoryScript['voiceId']) ?? 'zahar',

    };

  } catch {

    return null;

  }

}



function parseSearchQueries(raw: string): string[] {

  const jsonMatch = raw.match(/\{[\s\S]*\}/);

  if (jsonMatch) {

    try {

      const parsed = JSON.parse(jsonMatch[0]) as { queries?: string[]; search_queries?: string[] };

      const list = parsed.queries ?? parsed.search_queries ?? [];

      return list.map((q) => String(q).trim()).filter(Boolean).slice(0, 4);

    } catch {

      /* fall through */

    }

  }

  return raw

    .split('\n')

    .map((l) => l.replace(/^[-*\d.)]+\s*/, '').trim())

    .filter((l) => l.length > 8)

    .slice(0, 4);

}



function parseExtractedFacts(raw: string): string[] {

  const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);

  if (!jsonMatch) return [];

  try {

    const parsed = JSON.parse(jsonMatch[0]) as { facts?: string[] } | string[];

    const list = Array.isArray(parsed) ? parsed : (parsed.facts ?? []);

    return list

      .map((f) => String(f).trim())

      .filter((f) => f.length >= 20 && f.length <= 280)

      .slice(0, 8);

  } catch {

    return [];

  }

}



async function extractFactsFromSnippets(

  input: GenerateStoryInput,

  baseUrl: string,

  model: string,

  searchBlocks: string[],

  seedFacts: string[],

): Promise<string[]> {

  const system = `Ты — факт-чекер. Из результатов веб-поиска извлеки 3–6 коротких проверяемых фактов об артисте и треке.

Правила:

- Только то, что явно следует из сниппетов поиска. Не додумывай.

- Каждый факт — одно предложение на русском.

- Если сниппет пустой или бесполезный — верни меньше фактов, не выдумывай.

Ответь ТОЛЬКО JSON: {"facts":["факт 1","факт 2"]}`;



  const user = [

    `Артист: ${input.artist}`,

    `Трек: ${input.title}`,

    input.year ? `Год: ${input.year}` : '',

    seedFacts.length ? `Уже известно:\n${seedFacts.map((f) => `- ${f}`).join('\n')}` : '',

    '',

    'Результаты поиска:',

    searchBlocks.join('\n\n'),

  ]

    .filter(Boolean)

    .join('\n');



  const raw = await chatOllama({

    baseUrl,

    model,

    messages: [

      { role: 'system', content: system },

      { role: 'user', content: user },

    ],

    maxTokens: 768,

    temperature: 0.15,

    jsonMode: true,

  });



  const extracted = parseExtractedFacts(raw);

  const merged = [...new Set([...seedFacts, ...extracted].map((s) => s.trim()))].filter(Boolean);

  return merged.slice(0, 10);

}



async function runResearchAgent(

  input: GenerateStoryInput,

  baseUrl: string,

  model: string,

): Promise<string[]> {

  const seedFacts = input.referenceFacts ?? [];

  const system = `Ты — исследователь музыкальных историй. Придумай 2–3 коротких поисковых запроса (рус/англ) для проверенных фактов об артисте и треке.

Ответь ТОЛЬКО JSON: {"queries":["запрос 1","запрос 2"]}`;



  const user = [

    `Артист: ${input.artist}`,

    `Трек: ${input.title}`,

    input.year ? `Год: ${input.year}` : '',

    input.genre ? `Жанр: ${input.genre}` : '',

    seedFacts.length ? `Уже известные факты:\n${seedFacts.map((f) => `- ${f}`).join('\n')}` : '',

    '',

    'Запросы: история записи, контекст релиза, чарты, длительность, альбом — проверяемые факты.',

  ]

    .filter(Boolean)

    .join('\n');



  console.log(`[local-agent] research start model=${model}`);

  const raw = await chatOllama({

    baseUrl,

    model,

    messages: [

      { role: 'system', content: system },

      { role: 'user', content: user },

    ],

    maxTokens: 256,

    temperature: 0.2,

    jsonMode: true,

  });



  const queries = parseSearchQueries(raw);

  const fallback = [

    `${input.artist} ${input.title} song facts history`,

    `${input.artist} ${input.title} recording album chart`,

  ];

  const toRun = queries.length > 0 ? queries : fallback;

  console.log(`[local-agent] research queries: ${toRun.join(' | ')}`);



  const snippets: string[] = [];

  const wiki = await fetchWikipediaSummary(input.artist, input.title);

  if (wiki) {

    snippets.push(`### Wikipedia\n${wiki}`);

  }

  for (const q of toRun.slice(0, 3)) {

    const result = await webSearch(q, 5);

    snippets.push(`### Поиск: ${q}\n${result}`);

  }



  const facts = await extractFactsFromSnippets(input, baseUrl, model, snippets, seedFacts);

  console.log(`[local-agent] research facts=${facts.length}`);

  for (const f of facts) {

    console.log(`[local-agent] fact: ${f.slice(0, 120)}`);

  }

  return facts;

}



function finalizeStory(

  story: StoryScript,

  input: GenerateStoryInput,

  storyLength: StoryLengthId,

): StoryScript {

  const sanitized = sanitizeScriptForTts(story.script, input.artist, input.title);

  return {

    ...story,

    script: sanitized,

    word_count: countWords(sanitized),

    voiceId: input.voiceId ?? story.voiceId,

  };

}



function hardRejectLocalScript(script: string, referenceFacts: string[]): string | null {

  return findGenericFiction(script) ?? findUngroundedClaims(script, referenceFacts);

}



export async function generateStoryScriptLocal(input: GenerateStoryInput): Promise<StoryScript> {

  const baseUrl = resolveLocalOllamaBaseUrl(input.localOllamaBaseUrl);

  const model = resolveLocalOllamaModel(input.localOllamaModel);



  const storyLength = input.storyLength ?? DEFAULT_STORY_LENGTH;

  const lengthPreset = getStoryLengthPreset(storyLength);

  const narratorId = resolveStoryNarrator(input.storyNarrator);

  const persona = buildPersonaForNarrator(

    narratorId,

    input.year,

    input.genre,

    input.artist,

    input.title,

    input.countryCode,

  );

  const systemPrompt = buildLocalSystemPrompt(persona, lengthPreset);

  const voiceId = input.voiceId ?? voiceForYear(input.year, input.genre);

  const previousScripts = input.previousScripts ?? [];



  const researchedFacts = await runResearchAgent(input, baseUrl, model);

  const referenceFacts =

    researchedFacts.length > 0 ? researchedFacts : (input.referenceFacts ?? []);



  if (referenceFacts.length === 0) {

    throw new Error('No reference facts after local research — cannot write grounded story');

  }



  let retryReason: string | undefined;



  for (let attempt = 0; attempt < MAX_NARRATOR_ATTEMPTS; attempt++) {

    console.log(`[local-agent] narrator attempt=${attempt + 1} model=${model} narrator=${narratorId}`);

    const userPrompt = buildLocalStoryUserPrompt({

      artist: input.artist,

      title: input.title,

      year: input.year,

      genre: input.genre,

      countryCode: input.countryCode,

      voiceId,

      storyLength,

      storyNarrator: narratorId,

      previousScripts,

      retryReason,

      selectedReferenceFact: input.selectedReferenceFact,

      referenceFacts,

    });



    const raw = await chatOllama({

      baseUrl,

      model,

      messages: [

        { role: 'system', content: systemPrompt },

        { role: 'user', content: userPrompt },

      ],

      maxTokens: lengthPreset.maxTokens,

      temperature: 0.28,

      jsonMode: true,

      timeoutMs: 180000,

    });



    const story = parseStoryJson(raw);

    if (!story) {

      retryReason = 'invalid JSON — верни {"script":"...","word_count":N,"voiceId":"zahar"}';

      continue;

    }



    story.voiceId = voiceId;

    story.word_count = countWords(story.script);

    const sanitized = sanitizeScriptForTts(story.script, input.artist, input.title);

    const qOpts = qualityOptionsForLocalAttempt(attempt, MAX_NARRATOR_ATTEMPTS, referenceFacts);



    const hardReject = hardRejectLocalScript(sanitized, referenceFacts);

    if (hardReject) {

      retryReason = `${hardReject}. Перепиши фактологично, только из списка фактов.`;

      logRejectedScript(`local narrator reject (attempt ${attempt + 1})`, sanitized, hardReject);

      continue;

    }



    const quality = validateGeneratedStory(

      sanitized,

      storyLength,

      input.artist,

      input.title,

      qOpts,

    );

    if (quality.ok) {

      console.log(`[local-agent] narrator OK words=${countWords(sanitized)}`);

      return finalizeStory({ ...story, script: sanitized }, { ...input, voiceId }, storyLength);

    }



    retryReason = `${quality.reason ?? 'quality'}. Перепиши фактологично, только из списка фактов.`;

    logRejectedScript(`local narrator reject (attempt ${attempt + 1})`, sanitized, quality.reason ?? 'quality');

  }



  throw new Error('Could not produce a grounded story (local Ollama) — all attempts rejected');

}



export { hasLocalOllamaConfigured } from './local-ollama.js';


