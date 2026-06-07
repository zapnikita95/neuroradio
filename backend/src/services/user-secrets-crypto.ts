import crypto from 'node:crypto';

const PREFIX = 'v1:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function resolveMasterKeyMaterial(): string {
  const fromEnv = process.env.USER_SECRETS_ENCRYPTION_KEY?.trim();
  if (fromEnv) return fromEnv;
  const jwt = process.env.AUTH_JWT_SECRET?.trim();
  if (jwt) return jwt;
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) return groq;
  throw new Error('USER_SECRETS_ENCRYPTION_KEY is not configured');
}

export function masterSecretsKey(): Buffer {
  return crypto.createHash('sha256').update(resolveMasterKeyMaterial(), 'utf8').digest();
}

export function encryptUserSecret(plaintext: string, key: Buffer = masterSecretsKey()): string {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptUserSecret(blob: string, key: Buffer = masterSecretsKey()): string | null {
  if (!blob.startsWith(PREFIX)) return null;
  try {
    const buf = Buffer.from(blob.slice(PREFIX.length), 'base64url');
    if (buf.length <= IV_LEN + TAG_LEN) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function isEncryptedUserSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}
