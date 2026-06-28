import fetch from '../proxy-fetch.js';
import { hasGroqApiKey } from './groq.js';

export interface HarvestSttOptions {
  languageCode?: string;
  modelId?: string;
}

export interface HarvestSttResult {
  text: string;
  provider: 'elevenlabs-scribe' | 'groq-whisper';
  modelId: string;
  languageCode: string;
}

async function groqWhisperTranscribe(
  audio: Buffer,
  filename: string,
  languageCode: string,
): Promise<HarvestSttResult> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error('GROQ_API_KEY missing');

  const model = process.env.GROQ_STT_MODEL?.trim() || 'whisper-large-v3';
  const lang = languageCode.startsWith('ru') ? 'ru' : languageCode.slice(0, 2);

  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/mpeg' }), filename || 'audio.mp3');
  form.append('model', model);
  form.append('language', lang);
  form.append('response_format', 'json');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(600_000),
  });

  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq STT ${res.status}: ${raw.slice(0, 400)}`);

  const text = (JSON.parse(raw).text || '').trim();
  if (!text) throw new Error('Groq STT empty transcript');

  return { text, provider: 'groq-whisper', modelId: model, languageCode: lang };
}

/** Railway harvest STT — ElevenLabs Scribe when permitted, else Groq Whisper. */
export async function transcribeHarvestAudio(
  audio: Buffer,
  filename: string,
  options: HarvestSttOptions = {},
): Promise<HarvestSttResult> {
  const languageCode = options.languageCode?.trim() || 'rus';
  const elevenKey = process.env.ELEVENLABS_API_KEY?.trim();

  if (elevenKey) {
    try {
      const { transcribeSpeechElevenLabs } = await import('./elevenlabs-stt.js');
      const out = await transcribeSpeechElevenLabs(audio, filename, {
        languageCode,
        modelId: options.modelId,
      });
      return {
        text: out.text,
        provider: 'elevenlabs-scribe',
        modelId: out.modelId,
        languageCode: out.languageCode,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const missingPerm = /missing_permissions|speech_to_text/i.test(msg);
      if (!missingPerm && !/401|403/.test(msg)) throw err;
      console.warn(`[harvest-stt] ElevenLabs unavailable (${msg.slice(0, 120)}) → groq`);
    }
  }

  if (!hasGroqApiKey()) {
    throw new Error(
      'STT unavailable: ElevenLabs key lacks speech_to_text and GROQ_API_KEY is missing',
    );
  }

  return groqWhisperTranscribe(audio, filename, languageCode);
}
