import { Request, Response, NextFunction } from 'express';
import { SECURITY } from '../config/security.js';
import { resolveStoryLength, StoryLengthId } from '../services/story-length.js';
import { resolveStoryNarrator, StoryNarratorId } from '../services/story-narrator.js';
import { resolveTtsVoice, TtsVoiceSetting } from '../services/voices.js';
import { resolveTtsEmotion, resolveTtsSpeed, TtsEmotion } from '../services/tts-options.js';
import { resolveLlmProvider } from '../services/llm-provider.js';
import { resolveGeminiModel } from '../services/gemini-models.js';
import { resolveTtsVoiceStyle, type TtsVoiceStyleId } from '../services/tts-voice-profiles.js';
import type { TtsProviderId, VoiceTier } from '../services/tts-router.js';

interface StoryFullBody {
  artist?: unknown;
  title?: unknown;
  previous_scripts?: unknown;
  story_length?: unknown;
  story_narrator?: unknown;
  tts_voice?: unknown;
  tts_speed?: unknown;
  tts_emotion?: unknown;
  tts_style?: unknown;
  voice_tier?: unknown;
  tts_provider?: unknown;
  llm_provider?: unknown;
  gemini_model?: unknown;
  groq_model?: unknown;
  openrouter_model?: unknown;
  groq_api_key?: unknown;
  gemini_api_key?: unknown;
  openrouter_api_key?: unknown;
}

const VALID_VOICE_TIERS = new Set<string>(['default', 'premium']);
const VALID_TTS_PROVIDERS = new Set<string>(['auto', 'yandex', 'sber', 'azure', 'elevenlabs']);

function resolveVoiceTier(value: unknown): VoiceTier {
  if (typeof value === 'string' && VALID_VOICE_TIERS.has(value)) {
    return value as VoiceTier;
  }
  return 'default';
}

function resolveTtsProvider(value: unknown): TtsProviderId {
  if (typeof value === 'string' && VALID_TTS_PROVIDERS.has(value)) {
    return value as TtsProviderId;
  }
  return 'auto';
}

function asTrimmedString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function asOptionalModelId(value: unknown, maxLen = 128): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) return undefined;
  return trimmed;
}

function asOptionalApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/[\s\n\r]+/g, '').trim();
  if (!trimmed || trimmed.length > 256) return undefined;
  return trimmed;
}

export function validateStoryFullBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as StoryFullBody;

  const artist = asTrimmedString(body.artist, SECURITY.maxArtistLength);
  const title = asTrimmedString(body.title, SECURITY.maxTitleLength);
  if (!artist || !title) {
    res.status(400).json({ error: 'Invalid artist or title (required, max 200 chars each)' });
    return;
  }

  let previousScripts: string[] = [];
  if (body.previous_scripts !== undefined) {
    if (!Array.isArray(body.previous_scripts)) {
      res.status(400).json({ error: 'previous_scripts must be an array' });
      return;
    }
    if (body.previous_scripts.length > SECURITY.maxPreviousScripts) {
      res.status(400).json({ error: `previous_scripts max ${SECURITY.maxPreviousScripts} items` });
      return;
    }
    previousScripts = [];
    for (const item of body.previous_scripts) {
      const script = asTrimmedString(item, SECURITY.maxPreviousScriptLength);
      if (!script) {
        res.status(400).json({ error: 'Invalid previous_scripts entry' });
        return;
      }
      previousScripts.push(script);
    }
  }

  const storyLength: StoryLengthId = resolveStoryLength(body.story_length);
  const storyNarrator: StoryNarratorId = resolveStoryNarrator(body.story_narrator);
  const ttsVoice: TtsVoiceSetting = resolveTtsVoice(body.tts_voice);
  const ttsSpeed = resolveTtsSpeed(
    typeof body.tts_speed === 'number' ? body.tts_speed : Number(body.tts_speed),
  );
  const ttsEmotion: TtsEmotion = resolveTtsEmotion(body.tts_emotion);
  const ttsStyle: TtsVoiceStyleId = resolveTtsVoiceStyle(body.tts_style);
  const voiceTier = resolveVoiceTier(body.voice_tier);
  const ttsProvider = resolveTtsProvider(body.tts_provider);
  const llmProvider = resolveLlmProvider(body.llm_provider);
  const geminiModel = resolveGeminiModel(body.gemini_model);
  const groqModel = asOptionalModelId(body.groq_model);
  const openrouterModel = asOptionalModelId(body.openrouter_model);
  const groqApiKey = asOptionalApiKey(body.groq_api_key);
  const geminiApiKey = asOptionalApiKey(body.gemini_api_key);
  const openrouterApiKey = asOptionalApiKey(body.openrouter_api_key);

  req.body = {
    artist,
    title,
    previous_scripts: previousScripts,
    story_length: storyLength,
    story_narrator: storyNarrator,
    tts_voice: ttsVoice,
    tts_speed: ttsSpeed,
    tts_emotion: ttsEmotion,
    tts_style: ttsStyle,
    voice_tier: voiceTier,
    tts_provider: ttsProvider,
    llm_provider: llmProvider,
    gemini_model: geminiModel,
    groq_model: groqModel,
    openrouter_model: openrouterModel,
    groq_api_key: groqApiKey,
    gemini_api_key: geminiApiKey,
    openrouter_api_key: openrouterApiKey,
  };
  next();
}
