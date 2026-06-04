import fs from 'node:fs';
import path from 'node:path';
import type { UserTier } from './entitlements.js';

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'dev-tier-overrides.json');

type DevTierFile = Record<string, UserTier>;

let cache: DevTierFile | null = null;

function load(): DevTierFile {
  if (cache) return cache;
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
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  cache = store;
}

export function isDevTierSwitchEnabled(): boolean {
  const flag = process.env.ALLOW_DEV_TIER_SWITCH?.trim().toLowerCase();
  return flag === 'true' || flag === '1' || flag === 'on';
}

export function getDevTierOverride(installId: string): UserTier | null {
  const normalized = installId.trim().toLowerCase();
  const tier = load()[normalized];
  if (tier === 'free' || tier === 'trial' || tier === 'premium') return tier;
  return null;
}

export function setDevTierOverride(installId: string, tier: UserTier | null): UserTier | null {
  const normalized = installId.trim().toLowerCase();
  const store = { ...load() };
  if (tier === null) {
    delete store[normalized];
  } else if (tier === 'free' || tier === 'trial' || tier === 'premium') {
    store[normalized] = tier;
  }
  save(store);
  return getDevTierOverride(installId);
}
