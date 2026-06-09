export type EdgeVoicePresetId =
  | 'dmitry_calm'
  | 'svetlana_calm'
  | 'dmitry_lively'
  | 'svetlana_lively'
  | 'daria';

export interface EdgeVoicePreset {
  id: EdgeVoicePresetId;
  ruVoice: string;
  enVoice: string;
  rateOffsetPct: number;
  pitch: string;
  labelRu: string;
  descriptionRu: string;
}

export const EDGE_VOICE_PRESETS: Record<EdgeVoicePresetId, EdgeVoicePreset> = {
  dmitry_calm: {
    id: 'dmitry_calm',
    ruVoice: 'ru-RU-DmitryNeural',
    enVoice: 'en-US-EricNeural',
    rateOffsetPct: 0,
    pitch: '+0Hz',
    labelRu: 'Дмитрий — спокойный',
    descriptionRu: 'Ровный мужской голос Microsoft Edge',
  },
  svetlana_calm: {
    id: 'svetlana_calm',
    ruVoice: 'ru-RU-SvetlanaNeural',
    enVoice: 'en-US-JennyNeural',
    rateOffsetPct: 0,
    pitch: '+0Hz',
    labelRu: 'Светлана — спокойная',
    descriptionRu: 'Нейтральный женский голос Microsoft Edge',
  },
  dmitry_lively: {
    id: 'dmitry_lively',
    ruVoice: 'ru-RU-DmitryNeural',
    enVoice: 'en-US-ChristopherNeural',
    rateOffsetPct: 6,
    pitch: '+1Hz',
    labelRu: 'Дмитрий — бодрый',
    descriptionRu: 'Энергичная мужская подача, ближе к радио',
  },
  svetlana_lively: {
    id: 'svetlana_lively',
    ruVoice: 'ru-RU-SvetlanaNeural',
    enVoice: 'en-US-AriaNeural',
    rateOffsetPct: 5,
    pitch: '+2Hz',
    labelRu: 'Светлана — живая',
    descriptionRu: 'Выразительный женский голос',
  },
  daria: {
    id: 'daria',
    ruVoice: 'ru-RU-DariyaNeural',
    enVoice: 'en-US-MichelleNeural',
    rateOffsetPct: 0,
    pitch: '+0Hz',
    labelRu: 'Дария — мягкая',
    descriptionRu: 'Мягкий женский тембр Microsoft Edge',
  },
};

const SILERO_TO_EDGE: Record<string, EdgeVoicePresetId> = {
  aidar: 'dmitry_calm',
  eugene: 'dmitry_lively',
  baya: 'svetlana_calm',
  kseniya: 'svetlana_lively',
  xenia: 'svetlana_lively',
};

export function resolveEdgeVoicePresetId(value?: string | null): EdgeVoicePresetId {
  const raw = value?.trim().toLowerCase();
  if (raw && raw in EDGE_VOICE_PRESETS) return raw as EdgeVoicePresetId;
  if (raw && raw in SILERO_TO_EDGE) return SILERO_TO_EDGE[raw]!;
  return 'svetlana_calm';
}

export function resolveEdgeVoicePreset(value?: string | null): EdgeVoicePreset {
  return EDGE_VOICE_PRESETS[resolveEdgeVoicePresetId(value)];
}
