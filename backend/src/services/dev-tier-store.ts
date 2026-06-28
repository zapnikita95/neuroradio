import fs from 'node:fs';
import path from 'node:path';
import type { UserTier } from './entitlements.js';
import { hasPostgres } from './db.js';
import { hydrateKvFromPostgres, persistKv } from './pg-kv.js';
import { getAccountProfile } from './account-store.js';
import { canUseDevTierSwitch, isListedAdminEmail } from './admin-users.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'dev-tier-overrides.json');
const DEV_TIER_KV_KEY = 'dev_tier_overrides';

type DevTierFile = Record<string, UserTier>;

let cache: DevTierFile | null = null;

export async function hydrateDevTierStoreFromPostgres(): Promise<void> {
  await hydrateKvFromPostgres(
    DEV_TIER_KV_KEY,
    STORE_PATH,
    (value) => {
      cache = (value as DevTierFile) ?? {};
    },
    () => ({}),
  );
}

function load(): DevTierFile {
  if (cache) return cache;
  if (hasPostgres()) {
    cache = {};
    return cache;
  }
  try {
    if (!fs.existsSync(STORE_PATH)) {
      cache = {};
      return cache;
    }
    cache = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as DevTierFile;
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

function save(store: DevTierFile): void {
  cache = store;
  persistKv(DEV_TIER_KV_KEY, store, STORE_PATH, () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  });
}

export function isDevTierSwitchEnabled(): boolean {
  const flag = process.env.ALLOW_DEV_TIER_SWITCH?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

const EMAIL_KEY_PREFIX = 'email:';

function normalizeStoredTier(raw: unknown): UserTier | null {
  if (raw === 'free' || raw === 'trial' || raw === 'premium') return raw;
  return null;
}

function emailStorageKey(email: string): string {
  return `${EMAIL_KEY_PREFIX}${email.trim().toLowerCase()}`;
}

function adminEmailForInstall(installId: string): string | null {
  if (!canUseDevTierSwitch(installId)) return null;
  const email = getAccountProfile(installId).email?.trim().toLowerCase();
  if (!email || !isListedAdminEmail(email)) return null;
  return email;
}

function applyTierToKey(store: DevTierFile, key: string, tier: UserTier | null): void {
  if (tier === null) {
    delete store[key];
  } else if (tier === 'free' || tier === 'trial' || tier === 'premium') {
    store[key] = tier;
  }
}

export function getDevTierOverride(installId: string): UserTier | null {
  const normalized = installId.trim().toLowerCase();
  const store = load();
  const fromInstall = normalizeStoredTier(store[normalized]);
  if (fromInstall) return fromInstall;

  const email = adminEmailForInstall(installId);
  if (!email) return null;
  return normalizeStoredTier(store[emailStorageKey(email)]);
}

export function setDevTierOverride(installId: string, tier: UserTier | null): UserTier | null {
  const normalized = installId.trim().toLowerCase();
  const store = { ...load() };
  applyTierToKey(store, normalized, tier);

  const email = adminEmailForInstall(installId);
  if (email) {
    applyTierToKey(store, emailStorageKey(email), tier);
  }

  save(store);
  return getDevTierOverride(installId);
}
