import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hasPostgres } from './db.js';
import { hydrateKvFromPostgres, persistKv } from './pg-kv.js';
import { getAccountProfile, linkTelegramAccount } from './account-store.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const KV_KEY = 'telegram_mobile_auth';

export interface PendingTelegramMobileCode {
  code: string;
  installId: string;
  expiresAt: number;
  verified: boolean;
  telegramId?: number;
  telegramUsername?: string | null;
}

interface AuthStore {
  pendingByCode: Record<string, PendingTelegramMobileCode>;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'telegram-mobile-auth.json');

let cache: AuthStore | null = null;

function emptyStore(): AuthStore {
  return { pendingByCode: {} };
}

function loadStore(): AuthStore {
  if (cache) return cache;
  if (hasPostgres()) {
    cache = emptyStore();
    return cache;
  }
  try {
    if (!fs.existsSync(STORE_PATH)) {
      cache = emptyStore();
      return cache;
    }
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as AuthStore;
    cache = { ...emptyStore(), ...parsed, pendingByCode: parsed.pendingByCode ?? {} };
    return cache;
  } catch {
    cache = emptyStore();
    return cache;
  }
}

function saveStore(store: AuthStore): void {
  cache = store;
  persistKv(KV_KEY, store, STORE_PATH, () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  });
}

export async function hydrateTelegramMobileAuthFromPostgres(): Promise<void> {
  await hydrateKvFromPostgres(
    KV_KEY,
    STORE_PATH,
    (value) => {
      const parsed = value as AuthStore;
      cache = { ...emptyStore(), ...parsed, pendingByCode: parsed.pendingByCode ?? {} };
    },
    emptyStore,
  );
}

function normalizeCode(raw: string): string {
  let code = raw.trim();
  if (code.toLowerCase().startsWith('mobileauth_')) {
    code = code.slice('mobileauth_'.length);
  }
  return code.toLowerCase();
}

export function extractMobileAuthCodeFromText(text: string | undefined | null): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';

  const low = raw.toLowerCase();
  if (low.startsWith('mobileauth_')) {
    return normalizeCode(raw);
  }

  const parts = raw.split(/\s+/, 2);
  const cmd = (parts[0] ?? '').toLowerCase();
  const arg = (parts[1] ?? '').trim();
  if (!arg) return '';

  if (cmd.startsWith('/start') || cmd.startsWith('/login')) {
    if (arg.toLowerCase().startsWith('mobileauth_')) {
      return normalizeCode(arg);
    }
    if (cmd.startsWith('/login')) {
      return normalizeCode(arg);
    }
  }
  return '';
}

export function startTelegramMobileLogin(installId: string): {
  code: string;
  deepLink: string | null;
  expiresInSec: number;
} {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '') ?? '';
  const normalized = installId.trim().toLowerCase();
  const store = loadStore();

  // Drop expired entries occasionally
  const now = Date.now();
  for (const [key, row] of Object.entries(store.pendingByCode)) {
    if (row.expiresAt < now) delete store.pendingByCode[key];
  }

  const code = crypto.randomBytes(6).toString('hex');
  store.pendingByCode[code] = {
    code,
    installId: normalized,
    expiresAt: now + CODE_TTL_MS,
    verified: false,
  };
  saveStore(store);

  const deepLink = botUsername ? `https://t.me/${botUsername}?start=mobileauth_${code}` : null;
  return { code, deepLink, expiresInSec: Math.floor(CODE_TTL_MS / 1000) };
}

export function markTelegramMobileCodeVerified(
  codeRaw: string,
  telegramId: number,
  username?: string | null,
): boolean {
  const code = normalizeCode(codeRaw);
  if (!code) return false;

  const store = loadStore();
  const pending = store.pendingByCode[code];
  if (!pending) return false;
  if (pending.expiresAt < Date.now()) return false;

  if (pending.verified) {
    return pending.telegramId === telegramId;
  }

  pending.verified = true;
  pending.telegramId = telegramId;
  pending.telegramUsername = username ?? null;
  saveStore(store);
  console.log(`[telegram-mobile] verified code=${code.slice(0, 4)}… tg=${telegramId}`);
  return true;
}

export function checkTelegramMobileLogin(
  installId: string,
  codeRaw: string,
): { ok: true; verified: false } | { ok: true; accountId: string; profile: ReturnType<typeof getAccountProfile> } | { ok: false; error: string } {
  const code = normalizeCode(codeRaw);
  const normalized = installId.trim().toLowerCase();
  const store = loadStore();
  const pending = store.pendingByCode[code];

  if (!pending) {
    return { ok: false, error: 'Код не найден' };
  }
  if (pending.installId !== normalized) {
    return { ok: false, error: 'Код выдан другому устройству' };
  }
  if (pending.expiresAt < Date.now()) {
    delete store.pendingByCode[code];
    saveStore(store);
    return { ok: false, error: 'Код истёк — нажми Telegram ещё раз' };
  }
  if (!pending.verified || pending.telegramId == null) {
    return { ok: true, verified: false };
  }

  const link = linkTelegramAccount(installId, pending.telegramId, pending.telegramUsername ?? undefined);
  if (!link.ok) {
    return { ok: false, error: link.error };
  }

  delete store.pendingByCode[code];
  saveStore(store);

  return {
    ok: true,
    accountId: link.accountId,
    profile: getAccountProfile(installId),
  };
}
