import crypto from 'node:crypto';

const PREMIUM_PRODUCT_MONTHLY = 'premium_voice_monthly';
const TRIAL_PRODUCT_MONTHLY = 'trial_stories_monthly';
import fs from 'node:fs';
import path from 'node:path';

const SYNC_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_DEVICES = 5;
const MAX_HISTORY = 200;

export interface SyncSettings {
  manualMode?: boolean;
  autoIntercept?: boolean;
  triggerMode?: string;
  everyNTracks?: number;
  sameTrackStoryEveryN?: number;
  specificArtists?: string[];
  specificGenres?: string[];
  storyLength?: string;
  updatedAt?: number;
}

export interface SyncHistoryEntry {
  id: string;
  trackKey: string;
  artist: string;
  title: string;
  script: string;
  angle?: string;
  playedAt: number;
}

export type AccountPlan = 'free' | 'trial' | 'premium';

export interface AccountEntitlement {
  plan: AccountPlan;
  premiumUntil: number;
  trialUntil: number;
  trialStoriesUsed: number;
  premiumProductId: string | null;
  purchaseTokenHash: string | null;
}

interface AccountRecord {
  accountId: string;
  syncCode: string;
  ownerInstallId: string;
  installIds: string[];
  settings: SyncSettings;
  history: SyncHistoryEntry[];
  createdAt: number;
  plan?: AccountPlan;
  premiumUntil?: number;
  trialUntil?: number;
  trialStoriesUsed?: number;
  premiumProductId?: string | null;
  purchaseTokenHash?: string | null;
}

interface StoreFile {
  accountsById: Record<string, AccountRecord>;
  installToAccount: Record<string, string>;
  syncCodeToAccount: Record<string, string>;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');

let cache: StoreFile | null = null;

function emptyStore(): StoreFile {
  return { accountsById: {}, installToAccount: {}, syncCodeToAccount: {} };
}

function loadStore(): StoreFile {
  if (cache) return cache;
  try {
    if (!fs.existsSync(STORE_PATH)) {
      cache = emptyStore();
      return cache;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    cache = JSON.parse(raw) as StoreFile;
    return cache;
  } catch {
    cache = emptyStore();
    return cache;
  }
}

function saveStore(store: StoreFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  cache = store;
}

function generateSyncCode(): string {
  let code = 'MS-';
  for (let i = 0; i < 6; i += 1) {
    code += SYNC_CODE_CHARS[crypto.randomInt(SYNC_CODE_CHARS.length)]!;
  }
  return code;
}

function normalizeSyncCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '');
}

export function resolveAccountId(installId: string): string | null {
  const store = loadStore();
  return store.installToAccount[installId.trim().toLowerCase()] ?? null;
}

export function getQuotaSubject(installId: string): string {
  const accountId = resolveAccountId(installId);
  return accountId ? `account:${accountId}` : `install:${installId}`;
}

export function getSyncStatus(installId: string): {
  linked: boolean;
  accountId: string | null;
  syncCode: string | null;
  deviceCount: number;
  settings: SyncSettings;
} {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  const accountId = store.installToAccount[normalized] ?? null;
  if (!accountId) {
    return { linked: false, accountId: null, syncCode: null, deviceCount: 0, settings: {} };
  }
  const account = store.accountsById[accountId];
  if (!account) {
    return { linked: false, accountId: null, syncCode: null, deviceCount: 0, settings: {} };
  }
  const isOwner = account.ownerInstallId === normalized;
  return {
    linked: true,
    accountId,
    syncCode: isOwner ? account.syncCode : null,
    deviceCount: account.installIds.length,
    settings: account.settings,
  };
}

export function createAccount(installId: string): { accountId: string; syncCode: string } {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  const existing = store.installToAccount[normalized];
  if (existing) {
    const account = store.accountsById[existing]!;
    return { accountId: existing, syncCode: account.syncCode };
  }

  let syncCode = generateSyncCode();
  while (store.syncCodeToAccount[syncCode]) {
    syncCode = generateSyncCode();
  }

  const accountId = crypto.randomUUID();
  store.accountsById[accountId] = {
    accountId,
    syncCode,
    ownerInstallId: normalized,
    installIds: [normalized],
    settings: {},
    history: [],
    createdAt: Date.now(),
  };
  store.installToAccount[normalized] = accountId;
  store.syncCodeToAccount[syncCode] = accountId;
  saveStore(store);
  return { accountId, syncCode };
}

export function linkAccount(installId: string, syncCodeRaw: string): {
  ok: true;
  accountId: string;
  settings: SyncSettings;
  history: SyncHistoryEntry[];
} | { ok: false; error: string } {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  const syncCode = normalizeSyncCode(syncCodeRaw);
  const accountId = store.syncCodeToAccount[syncCode];
  if (!accountId) {
    return { ok: false, error: 'Код не найден — проверь написание' };
  }

  const account = store.accountsById[accountId];
  if (!account) {
    return { ok: false, error: 'Аккаунт недоступен' };
  }

  if (store.installToAccount[normalized] && store.installToAccount[normalized] !== accountId) {
    return { ok: false, error: 'Это устройство уже привязано к другому аккаунту' };
  }

  if (!account.installIds.includes(normalized)) {
    if (account.installIds.length >= MAX_DEVICES) {
      return { ok: false, error: `Максимум ${MAX_DEVICES} устройств на аккаунт` };
    }
    account.installIds.push(normalized);
    store.installToAccount[normalized] = accountId;
    saveStore(store);
  }

  return {
    ok: true,
    accountId,
    settings: account.settings,
    history: account.history,
  };
}

export function pushSettings(installId: string, settings: SyncSettings): SyncSettings | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  const account = store.accountsById[accountId];
  if (!account) return null;

  const incomingAt = settings.updatedAt ?? Date.now();
  const currentAt = account.settings.updatedAt ?? 0;
  if (incomingAt >= currentAt) {
    account.settings = { ...settings, updatedAt: incomingAt };
    saveStore(store);
  }
  return account.settings;
}

export function pullSettings(installId: string): SyncSettings | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  return store.accountsById[accountId]?.settings ?? null;
}

export function pushHistory(
  installId: string,
  entry: SyncHistoryEntry,
): SyncHistoryEntry[] | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  const account = store.accountsById[accountId];
  if (!account) return null;

  const exists = account.history.some(
    (h) => h.id === entry.id || (h.trackKey === entry.trackKey && h.playedAt === entry.playedAt),
  );
  if (!exists) {
    account.history.unshift(entry);
    account.history = account.history.slice(0, MAX_HISTORY);
    saveStore(store);
  }
  return account.history;
}

export function pullHistory(installId: string, since = 0): SyncHistoryEntry[] | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  const history = store.accountsById[accountId]?.history ?? [];
  if (since <= 0) return history;
  return history.filter((h) => h.playedAt > since);
}

function entitlementFromAccount(account: AccountRecord | undefined): AccountEntitlement {
  return {
    plan: account?.plan ?? 'free',
    premiumUntil: account?.premiumUntil ?? 0,
    trialUntil: account?.trialUntil ?? 0,
    trialStoriesUsed: account?.trialStoriesUsed ?? 0,
    premiumProductId: account?.premiumProductId ?? null,
    purchaseTokenHash: account?.purchaseTokenHash ?? null,
  };
}

/** Entitlement for install (linked account or standalone free). */
export function getEntitlementForInstall(installId: string): AccountEntitlement {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  const accountId = store.installToAccount[normalized];
  if (!accountId) {
    return {
      plan: 'free',
      premiumUntil: 0,
      trialUntil: 0,
      trialStoriesUsed: 0,
      premiumProductId: null,
      purchaseTokenHash: null,
    };
  }
  return entitlementFromAccount(store.accountsById[accountId]);
}

const PREMIUM_MS_MONTH = 31 * 24 * 60 * 60 * 1000;

/**
 * Grant or extend premium on the install's linked account (creates account if needed).
 * Used by billing scaffold until Play Billing verify is wired.
 */
export function grantPremiumSubscription(
  installId: string,
  options: { months?: number; productId?: string; purchaseToken?: string } = {},
): AccountEntitlement {
  const months = Math.max(1, options.months ?? 1);
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  let accountId = store.installToAccount[normalized];
  if (!accountId) {
    const created = createAccount(installId);
    accountId = created.accountId;
    const reloaded = loadStore();
    const account = reloaded.accountsById[accountId];
    if (!account) {
      return getEntitlementForInstall(installId);
    }
    account.plan = 'premium';
    account.premiumUntil = Date.now() + months * PREMIUM_MS_MONTH;
    account.premiumProductId = options.productId ?? PREMIUM_PRODUCT_MONTHLY;
    if (options.purchaseToken) {
      account.purchaseTokenHash = crypto
        .createHash('sha256')
        .update(options.purchaseToken)
        .digest('hex');
    }
    saveStore(reloaded);
    return entitlementFromAccount(account);
  }

  const account = store.accountsById[accountId];
  if (!account) return getEntitlementForInstall(installId);

  const base = Math.max(Date.now(), account.premiumUntil ?? 0);
  account.plan = 'premium';
  account.premiumUntil = base + months * PREMIUM_MS_MONTH;
  account.premiumProductId = options.productId ?? PREMIUM_PRODUCT_MONTHLY;
  if (options.purchaseToken) {
    account.purchaseTokenHash = crypto
      .createHash('sha256')
      .update(options.purchaseToken)
      .digest('hex');
  }
  saveStore(store);
  return entitlementFromAccount(account);
}

const TRIAL_MS_MONTH = 31 * 24 * 60 * 60 * 1000;

export function grantTrialSubscription(
  installId: string,
  options: { months?: number; productId?: string; purchaseToken?: string } = {},
): AccountEntitlement {
  const months = Math.max(1, options.months ?? 1);
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  let accountId = store.installToAccount[normalized];
  if (!accountId) {
    const created = createAccount(installId);
    accountId = created.accountId;
  }

  const reloaded = loadStore();
  const account = reloaded.accountsById[accountId];
  if (!account) return getEntitlementForInstall(installId);

  const base = Math.max(Date.now(), account.trialUntil ?? 0);
  account.plan = 'trial';
  account.trialUntil = base + months * TRIAL_MS_MONTH;
  account.trialStoriesUsed = 0;
  account.premiumProductId = options.productId ?? TRIAL_PRODUCT_MONTHLY;
  if (options.purchaseToken) {
    account.purchaseTokenHash = crypto
      .createHash('sha256')
      .update(options.purchaseToken)
      .digest('hex');
  }
  saveStore(reloaded);
  return entitlementFromAccount(account);
}

/** Учитывается только в активном trial-периоде. */
export function incrementTrialStoryUsage(installId: string): void {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  const accountId = store.installToAccount[normalized];
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account || account.plan !== 'trial') return;
  if ((account.trialUntil ?? 0) <= Date.now()) return;
  account.trialStoriesUsed = (account.trialStoriesUsed ?? 0) + 1;
  saveStore(store);
}

export function getTrialStoryUsage(installId: string): { used: number; limit: number; periodEnds: number } | null {
  const ent = getEntitlementForInstall(installId);
  if (ent.plan !== 'trial' || ent.trialUntil <= Date.now()) return null;
  const limit = parseInt(process.env.TRIAL_STORY_MONTHLY_LIMIT ?? '10', 10);
  return {
    used: ent.trialStoriesUsed,
    limit,
    periodEnds: ent.trialUntil,
  };
}
