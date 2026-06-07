import crypto from 'node:crypto';
import { decryptUserSecret, encryptUserSecret } from './user-secrets-crypto.js';
import {
  getAccountByInstallId,
  saveEncryptedUserSecrets,
  saveSecretsTransportEnc,
} from './account-store.js';

const transportByInstall = new Map<string, Buffer>();

export type ClientSecretsPayload = {
  groq_api_key?: string;
  gemini_api_key?: string;
  openrouter_api_key?: string;
  yandex_api_key?: string;
  yandex_folder_id?: string;
  salute_auth_key?: string;
  salute_client_id?: string;
  salute_client_secret?: string;
};

export function getOrCreateTransportKey(installId: string): Buffer {
  const cached = transportByInstall.get(installId);
  if (cached) return cached;

  const account = getAccountByInstallId(installId);
  const fromStore = account?.secretsTransportEnc
    ? decryptUserSecret(account.secretsTransportEnc)
    : null;
  const key = fromStore
    ? Buffer.from(fromStore, 'base64url')
    : crypto.randomBytes(32);

  transportByInstall.set(installId, key);
  saveSecretsTransportEnc(installId, encryptUserSecret(key.toString('base64url')));
  return key;
}

export function exportTransportKeyBase64(installId: string): string {
  return getOrCreateTransportKey(installId).toString('base64url');
}

export function encryptClientSecretsPayload(installId: string, payload: ClientSecretsPayload): string {
  const json = JSON.stringify(payload);
  return encryptUserSecret(json, getOrCreateTransportKey(installId));
}

export function decryptClientSecretsPayload(
  installId: string,
  blob: string,
): ClientSecretsPayload | null {
  const key = transportByInstall.get(installId) ?? getOrCreateTransportKey(installId);
  const json = decryptUserSecret(blob, key);
  if (!json) return null;
  try {
    return JSON.parse(json) as ClientSecretsPayload;
  } catch {
    return null;
  }
}

export function mergeClientSecrets(
  base: ClientSecretsPayload,
  incoming: ClientSecretsPayload,
): ClientSecretsPayload {
  const out = { ...base };
  for (const [k, v] of Object.entries(incoming) as Array<[keyof ClientSecretsPayload, string | undefined]>) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function scrubSecretBodyFields(body: Record<string, unknown>): void {
  for (const field of [
    'groq_api_key',
    'gemini_api_key',
    'openrouter_api_key',
    'yandex_api_key',
    'yandex_folder_id',
    'salute_auth_key',
    'salute_client_id',
    'salute_client_secret',
    'client_secrets_enc',
  ]) {
    delete body[field];
  }
}

export function persistClientSecretsEncrypted(installId: string, secrets: ClientSecretsPayload): void {
  saveEncryptedUserSecrets(installId, secrets);
}
