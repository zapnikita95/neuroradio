import type { StoryNarratorId } from './story-narrator.js';

export type ElevenLabsVoiceSetting =
  | 'auto'
  | 'rachel'
  | 'adam'
  | 'antoni'
  | 'bella'
  | 'elli'
  | 'josh'
  | 'sam'
  | 'emily'
  | 'charlie'
  | 'matilda';

export interface ElevenLabsVoicePreset {
  id: ElevenLabsVoiceSetting;
  voiceId: string;
  labelEn: string;
  labelRu: string;
  descriptionEn: string;
  gender: 'female' | 'male';
  tone: 'calm' | 'warm' | 'narrative' | 'energetic' | 'deep';
}

/** Curated premade voices — tuned for short music stories. */
export const ELEVENLABS_VOICE_PRESETS: Record<Exclude<ElevenLabsVoiceSetting, 'auto'>, ElevenLabsVoicePreset> = {
  rachel: {
    id: 'rachel',
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    labelEn: 'Rachel',
    labelRu: 'Рейчел',
    descriptionEn: 'Calm, clear female — default radio host',
    gender: 'female',
    tone: 'calm',
  },
  adam: {
    id: 'adam',
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    labelEn: 'Adam',
    labelRu: 'Адам',
    descriptionEn: 'Deep, confident male narrator',
    gender: 'male',
    tone: 'deep',
  },
  antoni: {
    id: 'antoni',
    voiceId: 'ErXwobaYiN019PkySvjV',
    labelEn: 'Antoni',
    labelRu: 'Антони',
    descriptionEn: 'Warm, well-rounded male',
    gender: 'male',
    tone: 'warm',
  },
  bella: {
    id: 'bella',
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    labelEn: 'Bella',
    labelRu: 'Белла',
    descriptionEn: 'Soft, gentle female',
    gender: 'female',
    tone: 'warm',
  },
  elli: {
    id: 'elli',
    voiceId: 'MF3mGyEYCl7XYWbV9V6O',
    labelEn: 'Elli',
    labelRu: 'Элли',
    descriptionEn: 'Young, upbeat female',
    gender: 'female',
    tone: 'energetic',
  },
  josh: {
    id: 'josh',
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    labelEn: 'Josh',
    labelRu: 'Джош',
    descriptionEn: 'Crisp narrative male',
    gender: 'male',
    tone: 'narrative',
  },
  sam: {
    id: 'sam',
    voiceId: 'yoZ06aMxZJJ28mfd3POQ',
    labelEn: 'Sam',
    labelRu: 'Сэм',
    descriptionEn: 'Raspy, characterful male',
    gender: 'male',
    tone: 'energetic',
  },
  emily: {
    id: 'emily',
    voiceId: 'LcfcDJNUP1GQjkzn1xUU',
    labelEn: 'Emily',
    labelRu: 'Эмили',
    descriptionEn: 'Calm, mature female',
    gender: 'female',
    tone: 'calm',
  },
  charlie: {
    id: 'charlie',
    voiceId: 'IKne3meq5aSn9XLyUdCD',
    labelEn: 'Charlie',
    labelRu: 'Чарли',
    descriptionEn: 'Casual, conversational male',
    gender: 'male',
    tone: 'warm',
  },
  matilda: {
    id: 'matilda',
    voiceId: 'XrExE9yKIg1WjnnlVkGX',
    labelEn: 'Matilda',
    labelRu: 'Матильда',
    descriptionEn: 'Expressive, warm female',
    gender: 'female',
    tone: 'narrative',
  },
};

const VALID_IDS = new Set<string>(['auto', ...Object.keys(ELEVENLABS_VOICE_PRESETS)]);

export function resolveElevenLabsVoiceSetting(value: unknown): ElevenLabsVoiceSetting {
  if (typeof value === 'string' && VALID_IDS.has(value.trim().toLowerCase())) {
    return value.trim().toLowerCase() as ElevenLabsVoiceSetting;
  }
  return 'auto';
}

export function resolveElevenLabsVoiceId(
  setting: ElevenLabsVoiceSetting,
  options: { storyNarrator?: StoryNarratorId; genre?: string } = {},
): string {
  if (setting !== 'auto') {
    return ELEVENLABS_VOICE_PRESETS[setting].voiceId;
  }
  const narrator = options.storyNarrator ?? 'auto';
  const genre = (options.genre ?? '').toLowerCase();
  if (narrator === 'contemporary') {
    return ELEVENLABS_VOICE_PRESETS.bella.voiceId;
  }
  if (narrator === 'backstage') {
    return ELEVENLABS_VOICE_PRESETS.emily.voiceId;
  }
  if (narrator === 'expert') {
    return ELEVENLABS_VOICE_PRESETS.josh.voiceId;
  }
  if (narrator === 'night_dj') {
    return ELEVENLABS_VOICE_PRESETS.antoni.voiceId;
  }
  if (narrator === 'radio_host') {
    return ELEVENLABS_VOICE_PRESETS.charlie.voiceId;
  }
  if (/punk|rock|metal|grunge/.test(genre)) {
    return ELEVENLABS_VOICE_PRESETS.sam.voiceId;
  }
  if (/pop|r&b|soul/.test(genre)) {
    return ELEVENLABS_VOICE_PRESETS.bella.voiceId;
  }
  return ELEVENLABS_VOICE_PRESETS.rachel.voiceId;
}

export function listElevenLabsVoiceOptions(): ElevenLabsVoicePreset[] {
  return Object.values(ELEVENLABS_VOICE_PRESETS);
}
