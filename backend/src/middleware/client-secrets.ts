import type { NextFunction, Request, Response } from 'express';
import {
  type ClientSecretsPayload,
  decryptClientSecretsPayload,
  mergeClientSecrets,
  persistClientSecretsEncrypted,
  scrubSecretBodyFields,
} from '../services/client-secrets-transport.js';

declare global {
  namespace Express {
    interface Request {
      clientSecrets?: ClientSecretsPayload;
    }
  }
}

function readPlainSecrets(body: Record<string, unknown>): ClientSecretsPayload {
  const pick = (key: keyof ClientSecretsPayload): string | undefined => {
    const raw = body[key];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };
  return {
    groq_api_key: pick('groq_api_key'),
    gemini_api_key: pick('gemini_api_key'),
    openrouter_api_key: pick('openrouter_api_key'),
    yandex_api_key: pick('yandex_api_key'),
    yandex_folder_id: pick('yandex_folder_id'),
    salute_auth_key: pick('salute_auth_key'),
    salute_client_id: pick('salute_client_id'),
    salute_client_secret: pick('salute_client_secret'),
  };
}

export function extractClientSecrets(req: Request, res: Response, next: NextFunction): void {
  const installId = req.installId?.trim();
  const body = req.body as Record<string, unknown>;
  let secrets: ClientSecretsPayload = {};

  const enc = typeof body.client_secrets_enc === 'string' ? body.client_secrets_enc.trim() : '';
  if (enc && installId) {
    const decrypted = decryptClientSecretsPayload(installId, enc);
    if (!decrypted) {
      res.status(400).json({
        error: 'Invalid encrypted client secrets',
        code: 'CLIENT_SECRETS_DECRYPT_FAILED',
      });
      return;
    }
    secrets = mergeClientSecrets(secrets, decrypted);
  }

  secrets = mergeClientSecrets(secrets, readPlainSecrets(body));

  if (installId && Object.values(secrets).some((v) => typeof v === 'string' && v.length > 0)) {
    persistClientSecretsEncrypted(installId, secrets);
  }

  scrubSecretBodyFields(body);
  req.clientSecrets = secrets;
  next();
}
