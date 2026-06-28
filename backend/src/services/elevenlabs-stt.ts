import fetch from '../proxy-fetch.js';

export interface ElevenLabsSttOptions {
  languageCode?: string;
  modelId?: string;
}

export interface ElevenLabsSttResult {
  text: string;
  modelId: string;
  languageCode: string;
}

/** Scribe batch STT — uses Railway outbound (EU), not blocked by Cloudflare like local RF. */
export async function transcribeSpeechElevenLabs(
  audio: Buffer,
  filename: string,
  options: ElevenLabsSttOptions = {},
): Promise<ElevenLabsSttResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY missing');

  const modelId = options.modelId?.trim() || process.env.ELEVENLABS_STT_MODEL?.trim() || 'scribe_v2';
  const languageCode = options.languageCode?.trim() || 'rus';

  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), filename || 'audio.mp3');
  form.append('model_id', modelId);
  form.append('language_code', languageCode);
  form.append('timestamps_granularity', 'none');

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form,
    signal: AbortSignal.timeout(600_000),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`ElevenLabs STT ${res.status}: ${raw.slice(0, 400)}`);
  }

  let data: { text?: string; transcript?: string };
  try {
    data = JSON.parse(raw) as { text?: string; transcript?: string };
  } catch {
    throw new Error(`ElevenLabs STT invalid JSON: ${raw.slice(0, 200)}`);
  }

  const text = (data.text || data.transcript || '').trim();
  if (!text) throw new Error('ElevenLabs STT empty transcript');

  return { text, modelId, languageCode };
}
