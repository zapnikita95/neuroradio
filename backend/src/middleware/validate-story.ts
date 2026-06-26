import { Request, Response, NextFunction } from 'express';
import { SECURITY } from '../config/security.js';
import { setLogDetail } from './request-logger.js';
import { resolveStoryLength, StoryLengthId } from '../services/story-length.js';
import { resolveStoryNarrator, StoryNarratorId } from '../services/story-narrator.js';
import { resolveTtsVoice, TtsVoiceSetting } from '../services/voices.js';
import { resolveTtsEmotion, resolveTtsSpeed, TtsEmotion } from '../services/tts-options.js';
import { resolveLlmProvider } from '../services/llm-provider.js';
import { resolveGeminiModel } from '../services/gemini-models.js';
import { resolveTtsVoiceStyle, type TtsVoiceStyleId } from '../services/tts-voice-profiles.js';
import type { TtsProviderId, VoiceTier } from '../services/tts-router.js';
import { resolveStoryLanguage, type StoryLanguageId } from '../services/story-language.js';
import { resolveEdgeVoicePresetId } from '../services/edge-voices.js';
import { normalizeStoryArtist } from '../services/artist-primary.js';
import {
  resolveElevenLabsVoiceSetting,
  type ElevenLabsVoiceSetting,
} from '../services/elevenlabs-voices.js';

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
  local_ollama_url?: unknown;
  local_ollama_model?: unknown;
  yandex_api_key?: unknown;
  yandex_folder_id?: unknown;
  salute_auth_key?: unknown;
  salute_client_id?: unknown;
  salute_client_secret?: unknown;
  user_tts_provider?: unknown;
  skip_server_tts?: unknown;
  /** @deprecated use edge_voice_preset */
  silero_voice?: unknown;
  /** @deprecated use edge_voice_preset */
  silero_voice_preset?: unknown;
  edge_voice_preset?: unknown;
  speak_track_names_in_voiceover?: unknown;
  story_language?: unknown;
  client_platform?: unknown;
}

const VALID_VOICE_TIERS = new Set<string>(['default', 'premium']);
const VALID_TTS_PROVIDERS = new Set<string>([
  'auto',
  'yandex',
  'sber',
  'azure',
  'elevenlabs',
  'edge',
  'silero',
]);

function resolveVoiceTier(value: unknown): VoiceTier {
  if (typeof value === 'string' && VALID_VOICE_TIERS.has(value)) {
    return value as VoiceTier;
  }
  return 'default';
}

function resolveTtsProvider(value: unknown): TtsProviderId {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'silero') return 'edge';
    if (VALID_TTS_PROVIDERS.has(trimmed)) {
      return trimmed as TtsProviderId;
    }
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

function asOptionalOllamaUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed.length > 256) return undefined;
  if (!/^https?:\/\//i.test(trimmed)) return undefined;
  return trimmed;
}

function asOptionalApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.replace(/[\s\n\r]+/g, '').trim();
  if (!trimmed || trimmed.length > 256) return undefined;
  return trimmed;
}

function asOptionalFolderId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 64) return undefined;
  return trimmed;
}

export function validateStoryFullBody(req: Request, res: Response, next: NextFunction): void {
  const body = req.body as StoryFullBody;

  const artistRaw = asTrimmedString(body.artist, SECURITY.maxArtistLength);
  const artist = artistRaw ? normalizeStoryArtist(artistRaw) : '';
  const title = asTrimmedString(body.title, SECURITY.maxTitleLength);
  if (!artist || !title) {
    const artistLen = typeof body.artist === 'string' ? body.artist.trim().length : -1;
    const titleLen = typeof body.title === 'string' ? body.title.trim().length : -1;
    setLogDetail(res, `validate: artist/title artistLen=${artistLen} titleLen=${titleLen}`);
    res.status(400).json({ error: 'Invalid artist or title (required, max 200 chars each)' });
    return;
  }
  if (artistRaw !== artist) {
    console.log(`[artist] normalized "${artistRaw}" → "${artist}"`);
  }

  let previousScripts: string[] = [];
  if (body.previous_scripts !== undefined) {
    if (!Array.isArray(body.previous_scripts)) {
      setLogDetail(res, 'validate: previous_scripts not array');
      res.status(400).json({ error: 'previous_scripts must be an array' });
      return;
    }
    previousScripts = [];
    for (const item of body.previous_scripts) {
      const script = asTrimmedString(item, SECURITY.maxPreviousScriptLength);
      if (script) previousScripts.push(script);
    }
    if (previousScripts.length > SECURITY.maxPreviousScripts) {
      console.warn(
        `[validate] previous_scripts truncated ${previousScripts.length} -> ${SECURITY.maxPreviousScripts}`,
      );
      previousScripts = previousScripts.slice(0, SECURITY.maxPreviousScripts);
    }
  }

  const storyLength: StoryLengthId = resolveStoryLength(body.story_length);
  const storyNarrator: StoryNarratorId = resolveStoryNarrator(body.story_narrator);
  const storyLanguage: StoryLanguageId = resolveStoryLanguage(body.story_language);
  const elevenlabsVoice: ElevenLabsVoiceSetting | undefined =
    storyLanguage === 'en' ? resolveElevenLabsVoiceSetting(body.tts_voice) : undefined;
  const ttsVoice: TtsVoiceSetting =
    storyLanguage === 'en' ? 'auto' : resolveTtsVoice(body.tts_voice);
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
  const secretSource = req.clientSecrets ?? body;
  const groqApiKey = asOptionalApiKey(secretSource.groq_api_key);
  const geminiApiKey = asOptionalApiKey(secretSource.gemini_api_key);
  const openrouterApiKey = asOptionalApiKey(secretSource.openrouter_api_key);
  const localOllamaUrl = asOptionalOllamaUrl(body.local_ollama_url);
  const localOllamaModel = asOptionalModelId(body.local_ollama_model, 128);
  const yandexApiKey = asOptionalApiKey(secretSource.yandex_api_key);
  const yandexFolderId = asOptionalFolderId(secretSource.yandex_folder_id);
  const saluteAuthKey = asOptionalApiKey(secretSource.salute_auth_key);
  const saluteClientId = asOptionalApiKey(secretSource.salute_client_id);
  const saluteClientSecret = asOptionalApiKey(secretSource.salute_client_secret);
  const userTtsProvider =
    typeof body.user_tts_provider === 'string' &&
    (body.user_tts_provider === 'yandex' || body.user_tts_provider === 'sber')
      ? body.user_tts_provider
      : undefined;
  const skipServerTts = body.skip_server_tts === true;
  const legacyVoicePreset =
    asTrimmedString(body.edge_voice_preset, 32) ??
    asTrimmedString(body.silero_voice_preset, 32) ??
    asTrimmedString(body.silero_voice, 32);
  const edgeVoicePreset = resolveEdgeVoicePresetId(legacyVoicePreset);
  const speakTrackNamesInVoiceover = body.speak_track_names_in_voiceover === true;
  const clientPlatform =
    typeof body.client_platform === 'string' && body.client_platform.trim()
      ? body.client_platform.trim().toLowerCase().slice(0, 16)
      : undefined;

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
    local_ollama_url: localOllamaUrl,
    local_ollama_model: localOllamaModel,
    yandex_api_key: yandexApiKey,
    yandex_folder_id: yandexFolderId,
    salute_auth_key: saluteAuthKey,
    salute_client_id: saluteClientId,
    salute_client_secret: saluteClientSecret,
    user_tts_provider: userTtsProvider,
    skip_server_tts: skipServerTts,
    edge_voice_preset: edgeVoicePreset,
    speak_track_names_in_voiceover: speakTrackNamesInVoiceover,
    story_language: storyLanguage,
    ...(elevenlabsVoice ? { elevenlabs_voice: elevenlabsVoice } : {}),
    ...(clientPlatform ? { client_platform: clientPlatform } : {}),
  };
  next();
}
