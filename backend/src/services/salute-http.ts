import fs from 'node:fs';
import https from 'node:https';

let cachedAgent: https.Agent | undefined | null = null;

/**
 * SaluteSpeech uses Russian NUC root CA — Node may need extra certs.
 * @see https://developers.sber.ru/docs/ru/salutespeech/quick-start/certificates
 */
export function getSaluteHttpsAgent(): https.Agent | undefined {
  if (cachedAgent !== null) return cachedAgent ?? undefined;

  const caPath = process.env.SALUTE_SPEECH_CA_CERT?.trim();
  if (!caPath) {
    cachedAgent = undefined;
    return undefined;
  }

  try {
    const ca = fs.readFileSync(caPath);
    cachedAgent = new https.Agent({ ca });
    return cachedAgent;
  } catch (err) {
    console.warn(
      `[salute-http] cannot read SALUTE_SPEECH_CA_CERT (${caPath}):`,
      err instanceof Error ? err.message : err,
    );
    cachedAgent = undefined;
    return undefined;
  }
}
