import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { factFingerprint } from './fact-bank.js';
import { hasPostgres } from './db.js';
import { hydrateKvFromPostgres, persistKv } from './pg-kv.js';
import {
  migrateStoryDataFromAccountsBlob,
  pgGetUsedSeedFingerprints,
  pgInsertStoryHistory,
  pgInsertUsedSeed,
  pgListStoryHistory,
} from './story-history-store.js';

const PREMIUM_PRODUCT_MONTHLY = 'premium_voice_monthly';
const TRIAL_PRODUCT_MONTHLY = 'trial_stories_monthly';
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
  seedFact?: string;
  seedScope?: string;
  interestRating?: number;
}

export interface UsedSeedRecord {
  factFingerprint: string;
  fact: string;
  artist: string;
  title: string;
  scope: 'track' | 'album' | 'artist';
  interestScore: number;
  interestRating: number;
  usedAt: number;
}

export interface ListenStat {
  artistKey: string;
  playCount: number;
  lastPlayedAt: number;
  consecutivePlays: number;
}

export interface PendingEmailCode {
  code: string;
  installId: string;
  email: string;
  expiresAt: number;
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
  email?: string | null;
  telegramId?: number | null;
  telegramUsername?: string | null;
  usedSeeds?: UsedSeedRecord[];
  listenStats?: ListenStat[];
}

interface StoreFile {
  accountsById: Record<string, AccountRecord>;
  installToAccount: Record<string, string>;
  syncCodeToAccount: Record<string, string>;
  emailToAccount?: Record<string, string>;
  telegramToAccount?: Record<string, string>;
  pendingEmailCodes?: Record<string, PendingEmailCode>;
}

const DATA_DIR = process.env.ACCOUNT_DATA_DIR?.trim() || path.join(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'accounts.json');
const ACCOUNTS_KV_KEY = 'accounts';

let cache: StoreFile | null = null;

export async function hydrateAccountStoreFromPostgres(): Promise<void> {
  await hydrateKvFromPostgres(
    ACCOUNTS_KV_KEY,
    STORE_PATH,
    (value) => {
      const parsed = value as StoreFile;
      cache = {
        ...emptyStore(),
        ...parsed,
        emailToAccount: parsed.emailToAccount ?? {},
        telegramToAccount: parsed.telegramToAccount ?? {},
        pendingEmailCodes: parsed.pendingEmailCodes ?? {},
      };
    },
    emptyStore,
  );
}

function emptyStore(): StoreFile {
  return {
    accountsById: {},
    installToAccount: {},
    syncCodeToAccount: {},
    emailToAccount: {},
    telegramToAccount: {},
    pendingEmailCodes: {},
  };
}

function loadStore(): StoreFile {
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
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoreFile;
    cache = {
      ...emptyStore(),
      ...parsed,
      emailToAccount: parsed.emailToAccount ?? {},
      telegramToAccount: parsed.telegramToAccount ?? {},
      pendingEmailCodes: parsed.pendingEmailCodes ?? {},
    };
    return cache;
  } catch {
    cache = emptyStore();
    return cache;
  }
}

function saveStore(store: StoreFile): void {
  cache = store;
  persistKv(ACCOUNTS_KV_KEY, store, STORE_PATH, () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  });
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

export async function migrateAccountStoryDataToPostgres(): Promise<void> {
  if (!hasPostgres()) return;
  const store = loadStore();
  await migrateStoryDataFromAccountsBlob(store.accountsById);
  let stripped = false;
  for (const account of Object.values(store.accountsById)) {
    if ((account.history?.length ?? 0) > 0 || (account.usedSeeds?.length ?? 0) > 0) {
      account.history = [];
      account.usedSeeds = [];
      stripped = true;
    }
  }
  if (stripped) {
    saveStore(store);
    console.log('[postgres] cleared story history/usedSeeds from accounts kv blob');
  }
}

export function pushHistory(
  installId: string,
  entry: SyncHistoryEntry,
): SyncHistoryEntry[] | null {
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  let accountId = store.installToAccount[normalized] ?? null;
  if (!accountId) return null;

  if (hasPostgres()) {
    void pgInsertStoryHistory(normalized, accountId, entry).catch((err) =>
      console.error('[postgres] pushHistory failed:', err instanceof Error ? err.message : err),
    );
    return null;
  }

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

export async function pushHistoryAsync(
  installId: string,
  entry: SyncHistoryEntry,
): Promise<SyncHistoryEntry[]> {
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return [];

  if (hasPostgres()) {
    await pgInsertStoryHistory(normalized, accountId, entry);
    return pgListStoryHistory(normalized, accountId, 0);
  }

  return pushHistory(installId, entry) ?? [];
}

export function pullHistory(installId: string, since = 0): SyncHistoryEntry[] | null {
  if (hasPostgres()) {
    return null;
  }
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  const history = store.accountsById[accountId]?.history ?? [];
  if (since <= 0) return history;
  return history.filter((h) => h.playedAt > since);
}

export async function pullHistoryAsync(installId: string, since = 0): Promise<SyncHistoryEntry[] | null> {
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return null;

  if (hasPostgres()) {
    const rows = await pgListStoryHistory(normalized, accountId, since);
    return rows;
  }

  return pullHistory(installId, since);
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
export const WELCOME_TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

function grantWelcomeTrialIfEligible(account: AccountRecord): void {
  const now = Date.now();
  if (account.plan === 'premium' && (account.premiumUntil ?? 0) > now) return;
  if (account.plan === 'trial' && (account.trialUntil ?? 0) > now) return;
  account.plan = 'trial';
  account.trialUntil = now + WELCOME_TRIAL_MS;
  account.trialStoriesUsed = 0;
  console.log(`[account] welcome trial 7d account=${account.accountId.slice(0, 8)} until=${new Date(account.trialUntil).toISOString()}`);
}

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getAccountProfile(installId: string): {
  accountId: string | null;
  email: string | null;
  telegramId: number | null;
  telegramUsername: string | null;
  plan: AccountPlan | null;
  trialUntil: number | null;
  premiumUntil: number | null;
} {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()] ?? null;
  if (!accountId) {
    return {
      accountId: null,
      email: null,
      telegramId: null,
      telegramUsername: null,
      plan: null,
      trialUntil: null,
      premiumUntil: null,
    };
  }
  const account = store.accountsById[accountId];
  const ent = account ? entitlementFromAccount(account) : null;
  return {
    accountId,
    email: account?.email ?? null,
    telegramId: account?.telegramId ?? null,
    telegramUsername: account?.telegramUsername ?? null,
    plan: ent?.plan ?? null,
    trialUntil: ent?.trialUntil ?? null,
    premiumUntil: ent?.premiumUntil ?? null,
  };
}

export function startEmailLogin(installId: string, emailRaw: string): { ok: true; expiresInSec: number } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Некорректный email' };
  }
  const store = loadStore();
  const normalized = installId.trim().toLowerCase();
  let accountId = store.installToAccount[normalized];
  if (!accountId) {
    accountId = createAccount(installId).accountId;
  }
  const code = String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + 15 * 60 * 1000;
  store.pendingEmailCodes = store.pendingEmailCodes ?? {};
  store.pendingEmailCodes[email] = { code, installId: normalized, email, expiresAt };
  saveStore(store);
  if (process.env.SMTP_HOST?.trim()) {
    void import('./email-sender.js').then((m) => m.sendLoginCodeEmail(email, code)).catch((err) => {
      console.warn('[email-auth] send failed:', err instanceof Error ? err.message : err);
    });
  } else {
    console.log(`[email-auth] code for ${email}: ${code} (set SMTP_HOST or read logs)`);
  }
  return { ok: true, expiresInSec: 900 };
}

export function verifyEmailLogin(
  installId: string,
  emailRaw: string,
  codeRaw: string,
): { ok: true; accountId: string } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.trim();
  const store = loadStore();
  store.pendingEmailCodes = store.pendingEmailCodes ?? {};
  store.emailToAccount = store.emailToAccount ?? {};
  const pending = store.pendingEmailCodes[email];
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: 'Код истёк — запроси новый' };
  }
  if (pending.code !== code) {
    return { ok: false, error: 'Неверный код' };
  }
  const normalized = installId.trim().toLowerCase();
  if (pending.installId !== normalized) {
    return { ok: false, error: 'Код выдан другому устройству' };
  }

  let accountId = store.emailToAccount[email];
  const isFirstRegistration = !accountId;
  if (!accountId) {
    accountId = store.installToAccount[normalized] ?? createAccount(installId).accountId;
  }
  const account = store.accountsById[accountId];
  if (!account) return { ok: false, error: 'Аккаунт недоступен' };

  account.email = email;
  if (isFirstRegistration) {
    grantWelcomeTrialIfEligible(account);
  }
  if (!account.installIds.includes(normalized)) {
    if (account.installIds.length >= MAX_DEVICES) {
      return { ok: false, error: `Максимум ${MAX_DEVICES} устройств` };
    }
    account.installIds.push(normalized);
  }
  store.installToAccount[normalized] = accountId;
  store.emailToAccount[email] = accountId;
  delete store.pendingEmailCodes[email];
  saveStore(store);
  return { ok: true, accountId };
}

export function linkTelegramAccount(
  installId: string,
  telegramId: number,
  username: string | undefined,
): { ok: true; accountId: string } | { ok: false; error: string } {
  const store = loadStore();
  store.telegramToAccount = store.telegramToAccount ?? {};
  const normalized = installId.trim().toLowerCase();
  const tgKey = String(telegramId);

  let accountId = store.telegramToAccount[tgKey];
  const isFirstRegistration = !accountId;
  if (!accountId) {
    accountId = store.installToAccount[normalized] ?? createAccount(installId).accountId;
  }
  const account = store.accountsById[accountId];
  if (!account) return { ok: false, error: 'Аккаунт недоступен' };

  account.telegramId = telegramId;
  account.telegramUsername = username ?? null;
  if (isFirstRegistration) {
    grantWelcomeTrialIfEligible(account);
  }
  if (!account.installIds.includes(normalized)) {
    if (account.installIds.length >= MAX_DEVICES) {
      return { ok: false, error: `Максимум ${MAX_DEVICES} устройств` };
    }
    account.installIds.push(normalized);
  }
  store.installToAccount[normalized] = accountId;
  store.telegramToAccount[tgKey] = accountId;
  saveStore(store);
  return { ok: true, accountId };
}

export function recordAccountUsedSeed(
  installId: string,
  input: Omit<UsedSeedRecord, 'factFingerprint' | 'usedAt'>,
): void {
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);

  if (hasPostgres() && accountId) {
    void pgInsertUsedSeed(normalized, accountId, input).catch((err) =>
      console.error('[postgres] recordUsedSeed failed:', err instanceof Error ? err.message : err),
    );
    return;
  }

  const store = loadStore();
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account) return;

  account.usedSeeds = account.usedSeeds ?? [];
  const fp = factFingerprint(input.fact);
  const exists = account.usedSeeds.some((s) => s.factFingerprint === fp);
  if (!exists) {
    account.usedSeeds.unshift({
      ...input,
      factFingerprint: fp,
      usedAt: Date.now(),
    });
    account.usedSeeds = account.usedSeeds.slice(0, 500);
    saveStore(store);
  }
}

export async function recordAccountUsedSeedAsync(
  installId: string,
  input: Omit<UsedSeedRecord, 'factFingerprint' | 'usedAt'>,
): Promise<void> {
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return;

  if (hasPostgres()) {
    await pgInsertUsedSeed(normalized, accountId, input);
    return;
  }

  recordAccountUsedSeed(installId, input);
}

export function getAccountUsedFingerprints(
  installId: string,
  artist: string,
  title: string,
): Set<string> {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  const out = new Set<string>();
  if (!accountId) return out;
  const account = store.accountsById[accountId];
  if (!account?.usedSeeds) return out;

  const artistNorm = artist.trim().toLowerCase();
  for (const seed of account.usedSeeds) {
    if (seed.artist.trim().toLowerCase() === artistNorm) {
      out.add(seed.factFingerprint);
    }
  }
  return out;
}

export async function getAccountUsedFingerprintsAsync(
  installId: string,
  artist: string,
  title: string,
): Promise<Set<string>> {
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return new Set();

  if (hasPostgres()) {
    return pgGetUsedSeedFingerprints(normalized, accountId, artist, title);
  }

  return getAccountUsedFingerprints(installId, artist, title);
}

export function recordAccountListen(installId: string, artist: string, _title: string): void {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account) return;

  const key = artist.trim().toLowerCase();
  account.listenStats = account.listenStats ?? [];
  let stat = account.listenStats.find((s) => s.artistKey === key);
  if (!stat) {
    stat = { artistKey: key, playCount: 0, lastPlayedAt: 0, consecutivePlays: 0 };
    account.listenStats.push(stat);
  }
  const gap = Date.now() - stat.lastPlayedAt;
  stat.consecutivePlays = gap < 2 * 3_600_000 ? stat.consecutivePlays + 1 : 1;
  stat.playCount += 1;
  stat.lastPlayedAt = Date.now();
  saveStore(store);
}

export function getAccountListenStat(installId: string, artist: string): ListenStat | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  const key = artist.trim().toLowerCase();
  return store.accountsById[accountId]?.listenStats?.find((s) => s.artistKey === key) ?? null;
}
