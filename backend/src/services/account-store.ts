import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { factFingerprint } from './fact-bank.js';
import { hasPostgres } from './db.js';
import { hydrateKvFromPostgres, persistKv, persistKvAsync } from './pg-kv.js';
import {
  pgDeletePendingEmailCode,
  pgLoadPendingEmailCode,
  pgSavePendingEmailCode,
} from './pending-email-codes.js';
import {
  migrateStoryDataFromAccountsBlob,
  normalizeStoryHistoryId,
  pgGetUsedSeedFingerprints,
  pgInsertStoryHistory,
  pgInsertUsedSeed,
  pgListStoryHistory,
  pgUpdateStoryHistoryVote,
} from './story-history-store.js';
import { isEmailConfigured } from './email-sender.js';
import { encryptUserSecret } from './user-secrets-crypto.js';
import {
  isYookassaReviewerEmail,
  isYookassaReviewerLoginCode,
  provisionYookassaReviewerAccount,
} from './yookassa-reviewer-accounts.js';

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
  storyNarrator?: string;
  ttsVoice?: string;
  ttsSpeed?: string;
  ttsEmotion?: string;
  ttsPlaybackEngine?: string;
  llmProvider?: string;
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
  vote?: 'like' | 'dislike';
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

export interface PendingWebCabinetCode {
  code: string;
  email: string;
  expiresAt: number;
}

export type WebCabinetStatus = {
  email: string;
  plan: AccountPlan;
  premiumUntil: number | null;
  trialUntil: number | null;
  cardSaved: boolean;
  autoRenew: boolean;
  subscriptionPlan: 'month' | 'quarter' | 'year' | null;
  nextPaymentAt: number | null;
};

export type AccountPlan = 'free' | 'trial' | 'premium';

export interface AccountEntitlement {
  plan: AccountPlan;
  premiumUntil: number;
  trialUntil: number;
  trialStoriesUsed: number;
  premiumProductId: string | null;
  purchaseTokenHash: string | null;
  /** Saved YooKassa card + autopay (no raw payment_method_id exposed). */
  autoRenew?: boolean;
  cardSaved?: boolean;
  subscriptionPlan?: 'month' | 'quarter' | 'year' | null;
  nextPaymentAt?: number | null;
}

export interface EncryptedUserSecretsRecord {
  groq?: string;
  gemini?: string;
  openrouter?: string;
  yandex?: string;
  salute?: string;
}

export interface AccountRecord {
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
  /** YooKassa saved card for autopay (like Movie Planner). */
  yookassaPaymentMethodId?: string | null;
  subscriptionPlan?: 'month' | 'quarter' | 'year' | null;
  nextPaymentAt?: number | null;
  autoRenew?: boolean;
  lastRecurringAttemptAt?: number | null;
  /** AES-GCM blob for per-install transport key (never plain). */
  secretsTransportEnc?: string | null;
  /** User-supplied API keys — always encrypted blobs, never plain. */
  encryptedUserSecrets?: EncryptedUserSecretsRecord | null;
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
  pendingWebCabinetCodes?: Record<string, PendingWebCabinetCode>;
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
        pendingWebCabinetCodes: parsed.pendingWebCabinetCodes ?? {},
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
    pendingWebCabinetCodes: {},
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

function applyStoreFromBlob(data: StoreFile): StoreFile {
  cache = {
    ...emptyStore(),
    ...data,
    emailToAccount: data.emailToAccount ?? {},
    telegramToAccount: data.telegramToAccount ?? {},
    pendingEmailCodes: data.pendingEmailCodes ?? {},
  };
  return cache;
}

async function ensureAccountStoreLoaded(): Promise<StoreFile> {
  if (hasPostgres()) {
    const { pgKvLoad } = await import('./db.js');
    const data = await pgKvLoad<StoreFile>(ACCOUNTS_KV_KEY);
    if (data) return applyStoreFromBlob(data);
    if (!cache) cache = emptyStore();
    return cache;
  }
  return loadStore();
}

function pruneStaleInstallIds(store: StoreFile, account: AccountRecord): void {
  account.installIds = account.installIds.filter((id) => store.installToAccount[id] === account.accountId);
}

function detachInstallFromAccount(store: StoreFile, installId: string, accountId: string): void {
  const account = store.accountsById[accountId];
  if (!account) return;
  account.installIds = account.installIds.filter((id) => id !== installId);
  if (store.installToAccount[installId] === accountId) {
    delete store.installToAccount[installId];
  }
  if (account.installIds.length === 0) {
    delete store.accountsById[accountId];
    delete store.syncCodeToAccount[account.syncCode];
    for (const [email, id] of Object.entries(store.emailToAccount ?? {})) {
      if (id === accountId) delete store.emailToAccount![email];
    }
    for (const [tg, id] of Object.entries(store.telegramToAccount ?? {})) {
      if (id === accountId) delete store.telegramToAccount![tg];
    }
  }
}

function attachInstallToAccount(
  store: StoreFile,
  account: AccountRecord,
  normalized: string,
): { ok: true } | { ok: false; error: string } {
  pruneStaleInstallIds(store, account);

  const prevAccountId = store.installToAccount[normalized];
  if (prevAccountId && prevAccountId !== account.accountId) {
    detachInstallFromAccount(store, normalized, prevAccountId);
  }

  if (account.installIds.includes(normalized)) {
    store.installToAccount[normalized] = account.accountId;
    return { ok: true };
  }

  while (account.installIds.length >= MAX_DEVICES) {
    const evictable = account.installIds.filter((id) => id !== account.ownerInstallId);
    const victim = evictable[0] ?? account.installIds[0];
    if (!victim) break;
    account.installIds = account.installIds.filter((id) => id !== victim);
    if (store.installToAccount[victim] === account.accountId) {
      delete store.installToAccount[victim];
    }
  }

  if (account.installIds.length >= MAX_DEVICES) {
    return { ok: false, error: `Максимум ${MAX_DEVICES} устройств` };
  }

  account.installIds.push(normalized);
  store.installToAccount[normalized] = account.accountId;
  if (!account.ownerInstallId || !account.installIds.includes(account.ownerInstallId)) {
    account.ownerInstallId = normalized;
  }
  return { ok: true };
}

function saveStore(store: StoreFile): void {
  cache = store;
  persistKv(ACCOUNTS_KV_KEY, store, STORE_PATH, () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  });
}

async function saveStoreAsync(store: StoreFile): Promise<void> {
  cache = store;
  await persistKvAsync(ACCOUNTS_KV_KEY, store, STORE_PATH, () => {
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

export function getAccountByInstallId(installId: string): AccountRecord | null {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return null;
  return store.accountsById[accountId] ?? null;
}

export function saveSecretsTransportEnc(installId: string, blob: string): void {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account) return;
  account.secretsTransportEnc = blob;
  saveStore(store);
}

export function saveEncryptedUserSecrets(
  installId: string,
  secrets: {
    groq_api_key?: string;
    gemini_api_key?: string;
    openrouter_api_key?: string;
    yandex_api_key?: string;
    yandex_folder_id?: string;
    salute_auth_key?: string;
    salute_client_id?: string;
    salute_client_secret?: string;
  },
): void {
  const store = loadStore();
  const accountId = store.installToAccount[installId.trim().toLowerCase()];
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account) return;

  const current: EncryptedUserSecretsRecord = { ...(account.encryptedUserSecrets ?? {}) };
  if (secrets.groq_api_key?.trim()) current.groq = encryptUserSecret(secrets.groq_api_key.trim());
  if (secrets.gemini_api_key?.trim()) current.gemini = encryptUserSecret(secrets.gemini_api_key.trim());
  if (secrets.openrouter_api_key?.trim()) {
    current.openrouter = encryptUserSecret(secrets.openrouter_api_key.trim());
  }
  if (secrets.yandex_api_key?.trim() && secrets.yandex_folder_id?.trim()) {
    current.yandex = encryptUserSecret(
      JSON.stringify({
        apiKey: secrets.yandex_api_key.trim(),
        folderId: secrets.yandex_folder_id.trim(),
      }),
    );
  }
  const saluteDirect = secrets.salute_auth_key?.trim();
  const salutePair =
    secrets.salute_client_id?.trim() && secrets.salute_client_secret?.trim()
      ? Buffer.from(
          `${secrets.salute_client_id.trim()}:${secrets.salute_client_secret.trim()}`,
          'utf8',
        ).toString('base64')
      : undefined;
  if (saluteDirect) current.salute = encryptUserSecret(saluteDirect);
  else if (salutePair) current.salute = encryptUserSecret(salutePair);

  account.encryptedUserSecrets = current;
  saveStore(store);
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
    account.settings = { ...account.settings, ...settings, updatedAt: incomingAt };
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

  const existsIdx = account.history.findIndex(
    (h) => h.id === entry.id || (h.trackKey === entry.trackKey && h.playedAt === entry.playedAt),
  );
  if (existsIdx >= 0) {
    if (entry.vote) {
      account.history[existsIdx]!.vote = entry.vote;
      saveStore(store);
    }
  } else {
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
  await ensureAccountStoreLoaded();
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return [];

  if (hasPostgres()) {
    const normalizedEntry = { ...entry, id: normalizeStoryHistoryId(entry.id) };
    await pgInsertStoryHistory(normalized, accountId, normalizedEntry);
    return pgListStoryHistory(normalized, accountId, 0);
  }

  return pushHistory(installId, entry) ?? [];
}

export async function updateHistoryVoteAsync(
  installId: string,
  historyId: string,
  vote: 'like' | 'dislike',
): Promise<boolean> {
  const accountId = resolveAccountId(installId);
  if (!accountId || !historyId.trim()) return false;
  const normalizedId = normalizeStoryHistoryId(historyId);

  if (hasPostgres()) {
    return pgUpdateStoryHistoryVote(accountId, normalizedId, vote);
  }

  const store = loadStore();
  const account = store.accountsById[accountId];
  if (!account) return false;
  const entry = account.history.find((h) => h.id === normalizedId);
  if (!entry) return false;
  entry.vote = vote;
  saveStore(store);
  return true;
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
  await ensureAccountStoreLoaded();
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return null;

  if (hasPostgres()) {
    const rows = await pgListStoryHistory(normalized, accountId, since);
    return rows;
  }

  return pullHistory(installId, since);
}

export async function pullAccountCloudData(installId: string): Promise<{
  history: SyncHistoryEntry[];
  scrobbles: import('./scrobble-history-store.js').SyncScrobbleEntry[];
} | null> {
  await ensureAccountStoreLoaded();
  const normalized = installId.trim().toLowerCase();
  const accountId = resolveAccountId(installId);
  if (!accountId) return null;

  if (hasPostgres()) {
    const { pgListScrobbleHistory } = await import('./scrobble-history-store.js');
    const [history, scrobbles] = await Promise.all([
      pgListStoryHistory(normalized, accountId, 0),
      pgListScrobbleHistory(normalized, accountId, 0),
    ]);
    return { history, scrobbles };
  }

  const history = pullHistory(installId, 0) ?? [];
  return { history, scrobbles: [] };
}

function entitlementFromAccount(account: AccountRecord | undefined): AccountEntitlement {
  const cardSaved = Boolean(account?.yookassaPaymentMethodId?.trim());
  const autoRenew = cardSaved && account?.autoRenew !== false;
  return {
    plan: account?.plan ?? 'free',
    premiumUntil: account?.premiumUntil ?? 0,
    trialUntil: account?.trialUntil ?? 0,
    trialStoriesUsed: account?.trialStoriesUsed ?? 0,
    premiumProductId: account?.premiumProductId ?? null,
    purchaseTokenHash: account?.purchaseTokenHash ?? null,
    autoRenew,
    cardSaved,
    subscriptionPlan: account?.subscriptionPlan ?? null,
    nextPaymentAt: account?.nextPaymentAt ?? null,
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
      autoRenew: false,
      cardSaved: false,
      subscriptionPlan: null,
      nextPaymentAt: null,
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

/** Activate or extend premium by email (website / YooKassa). Creates account if needed. */
export interface GrantPremiumOptions {
  months?: number;
  productId?: string;
  subscriptionPlan?: 'month' | 'quarter' | 'year';
  paymentMethodId?: string | null;
  autoRenew?: boolean;
}

export function grantPremiumByEmail(
  emailRaw: string,
  options: GrantPremiumOptions = {},
): AccountEntitlement {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Invalid email');
  }
  const months = Math.max(1, options.months ?? 1);
  const store = loadStore();
  store.emailToAccount = store.emailToAccount ?? {};

  let accountId = store.emailToAccount[email];
  if (!accountId) {
    accountId = crypto.randomUUID();
    let syncCode = generateSyncCode();
    while (store.syncCodeToAccount[syncCode]) {
      syncCode = generateSyncCode();
    }
    store.accountsById[accountId] = {
      accountId,
      syncCode,
      ownerInstallId: '',
      installIds: [],
      email,
      settings: {},
      history: [],
      createdAt: Date.now(),
      plan: 'free',
      premiumUntil: 0,
      trialUntil: 0,
      trialStoriesUsed: 0,
      premiumProductId: null,
      purchaseTokenHash: null,
    };
    store.emailToAccount[email] = accountId;
    store.syncCodeToAccount[syncCode] = accountId;
  }

  const account = store.accountsById[accountId];
  if (!account) {
    throw new Error('Account missing after create');
  }

  account.email = email;
  const base = Math.max(Date.now(), account.premiumUntil ?? 0);
  account.plan = 'premium';
  account.premiumUntil = base + months * PREMIUM_MS_MONTH;
  account.premiumProductId = options.productId ?? PREMIUM_PRODUCT_MONTHLY;

  if (options.subscriptionPlan) {
    account.subscriptionPlan = options.subscriptionPlan;
  }
  if (options.paymentMethodId && options.autoRenew !== false) {
    account.yookassaPaymentMethodId = options.paymentMethodId;
    account.autoRenew = true;
  } else if (options.autoRenew === false) {
    account.autoRenew = false;
    account.yookassaPaymentMethodId = null;
    account.nextPaymentAt = null;
  }
  if (account.autoRenew && account.yookassaPaymentMethodId && account.subscriptionPlan) {
    account.nextPaymentAt = account.premiumUntil;
  }

  saveStore(store);
  console.log(
    `[billing] premium by email=${email} months=${months} until=${new Date(account.premiumUntil).toISOString()}` +
      (account.yookassaPaymentMethodId ? ` autopay=${account.subscriptionPlan}` : ' autopay=off'),
  );
  return entitlementFromAccount(account);
}

export function listAccountsDueForRenewal(retryCooldownMs: number): Array<{
  email: string;
  plan: 'month' | 'quarter' | 'year';
  paymentMethodId: string;
}> {
  const store = loadStore();
  const now = Date.now();
  const out: Array<{ email: string; plan: 'month' | 'quarter' | 'year'; paymentMethodId: string }> = [];

  for (const account of Object.values(store.accountsById)) {
    const email = account.email?.trim().toLowerCase();
    const plan = account.subscriptionPlan;
    const paymentMethodId = account.yookassaPaymentMethodId?.trim();
    if (!email || !plan || !paymentMethodId) continue;
    if (account.autoRenew !== true) continue;
    const nextAt = account.nextPaymentAt ?? 0;
    if (nextAt > now) continue;
    const lastAttempt = account.lastRecurringAttemptAt ?? 0;
    if (lastAttempt && now - lastAttempt < retryCooldownMs) continue;
    out.push({ email, plan, paymentMethodId });
  }
  return out;
}

export function markRecurringAttempt(emailRaw: string): void {
  const email = normalizeEmail(emailRaw);
  const store = loadStore();
  const accountId = store.emailToAccount?.[email];
  if (!accountId) return;
  const account = store.accountsById[accountId];
  if (!account) return;
  account.lastRecurringAttemptAt = Date.now();
  saveStore(store);
}

export function cancelAutoRenewByEmail(emailRaw: string): boolean {
  const email = normalizeEmail(emailRaw);
  const store = loadStore();
  const accountId = store.emailToAccount?.[email];
  if (!accountId) return false;
  const account = store.accountsById[accountId];
  if (!account) return false;
  const accessUntil = Math.max(account.premiumUntil ?? 0, account.trialUntil ?? 0);
  account.autoRenew = false;
  account.yookassaPaymentMethodId = null;
  account.nextPaymentAt = null;
  account.lastRecurringAttemptAt = null;
  saveStore(store);
  console.log(
    `[billing] autopay cancelled email=${email} accessUntil=${accessUntil > 0 ? new Date(accessUntil).toISOString() : 'n/a'}`,
  );
  return true;
}

/** Можно ли инициировать автосписание (карта не отвязана, автопродление явно включено). */
export function canChargeRecurringRenewal(emailRaw: string): {
  ok: true;
  plan: 'month' | 'quarter' | 'year';
  paymentMethodId: string;
} | { ok: false } {
  const account = getAccountByEmail(emailRaw);
  if (!account) return { ok: false };
  const email = account.email?.trim().toLowerCase();
  const plan = account.subscriptionPlan;
  const paymentMethodId = account.yookassaPaymentMethodId?.trim();
  if (!email || !plan || !paymentMethodId) return { ok: false };
  if (account.autoRenew !== true) return { ok: false };
  const nextAt = account.nextPaymentAt ?? 0;
  if (nextAt > Date.now()) return { ok: false };
  return { ok: true, plan, paymentMethodId };
}

/** Отвязка карты / отмена автопродления для аккаунта устройства. */
export function cancelAutoRenewByInstall(installId: string): { ok: boolean; error?: string } {
  const account = getAccountByInstallId(installId);
  if (!account) {
    return { ok: false, error: 'NOT_LINKED' };
  }
  const email = account.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: 'NO_EMAIL' };
  }
  if (!account.yookassaPaymentMethodId?.trim() && account.autoRenew === false) {
    return { ok: false, error: 'NO_SAVED_CARD' };
  }
  cancelAutoRenewByEmail(email);
  return { ok: true };
}

function getAccountByEmail(emailRaw: string): AccountRecord | null {
  const email = normalizeEmail(emailRaw);
  const store = loadStore();
  const accountId = store.emailToAccount?.[email];
  if (!accountId) return null;
  return store.accountsById[accountId] ?? null;
}

export function getAccountByEmailForBilling(emailRaw: string): AccountRecord | null {
  return getAccountByEmail(emailRaw);
}

function verifyWebCabinetCode(
  emailRaw: string,
  codeRaw: string,
): { ok: true; email: string } | { ok: false; error: string } {
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.replace(/\D/g, '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Некорректный email' };
  }
  if (code.length < 4) {
    return { ok: false, error: 'Неверный код' };
  }
  if (isYookassaReviewerEmail(email) && isYookassaReviewerLoginCode(email, code)) {
    return { ok: true, email };
  }
  const store = loadStore();
  store.pendingWebCabinetCodes = store.pendingWebCabinetCodes ?? {};
  const pending = store.pendingWebCabinetCodes[email];
  if (!pending || pending.expiresAt < Date.now()) {
    return { ok: false, error: 'Код истёк — запросите новый' };
  }
  if (pending.code !== code) {
    return { ok: false, error: 'Неверный код' };
  }
  return { ok: true, email };
}

function webCabinetStatusFromAccount(email: string, account: AccountRecord): WebCabinetStatus {
  const ent = entitlementFromAccount(account);
  return {
    email,
    plan: ent.plan,
    premiumUntil: ent.premiumUntil > 0 ? ent.premiumUntil : null,
    trialUntil: ent.trialUntil > 0 ? ent.trialUntil : null,
    cardSaved: ent.cardSaved ?? false,
    autoRenew: ent.autoRenew ?? false,
    subscriptionPlan: ent.subscriptionPlan ?? null,
    nextPaymentAt: ent.nextPaymentAt ?? null,
  };
}

/** Код для входа в личный кабинет на сайте (без привязки к installId). */
export async function startWebCabinetCode(
  emailRaw: string,
): Promise<{ ok: true; expiresInSec: number } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Некорректный email' };
  }
  const store = await ensureAccountStoreLoaded();
  const code = isYookassaReviewerEmail(email) ? '000000' : String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + (isYookassaReviewerEmail(email) ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000);
  store.pendingWebCabinetCodes = store.pendingWebCabinetCodes ?? {};
  store.pendingWebCabinetCodes[email] = { code, email, expiresAt };
  await saveStoreAsync(store);
  const { isEmailConfigured, sendCabinetCodeEmail } = await import('./email-sender.js');
  if (isYookassaReviewerEmail(email)) {
    console.log(`[web-cabinet] YooKassa reviewer ${email} — code ${code}`);
  } else if (isEmailConfigured()) {
    void sendCabinetCodeEmail(email, code).catch((err) => {
      console.warn('[web-cabinet] send failed:', err instanceof Error ? err.message : err);
    });
  } else {
    console.log(`[web-cabinet] code for ${email}: ${code} (set RESEND_API_KEY + RESEND_FROM)`);
  }
  return { ok: true, expiresInSec: 900 };
}

export async function getWebCabinetStatus(
  emailRaw: string,
  codeRaw: string,
): Promise<{ ok: true; status: WebCabinetStatus } | { ok: false; error: string; code?: string }> {
  await ensureAccountStoreLoaded();
  const verified = verifyWebCabinetCode(emailRaw, codeRaw);
  if (!verified.ok) return verified;
  let account = getAccountByEmail(verified.email);
  if (!account && isYookassaReviewerEmail(verified.email)) {
    grantPremiumByEmail(verified.email, { months: 12, subscriptionPlan: 'month', autoRenew: false });
    account = getAccountByEmail(verified.email);
    if (account) provisionYookassaReviewerAccount(account);
    saveStore(loadStore());
  }
  if (!account) {
    return { ok: false, error: 'Аккаунт с этим email не найден', code: 'NOT_FOUND' };
  }
  return { ok: true, status: webCabinetStatusFromAccount(verified.email, account) };
}

export async function cancelSubscriptionViaWebCabinet(
  emailRaw: string,
  codeRaw: string,
): Promise<
  | { ok: true; status: WebCabinetStatus; message: string }
  | { ok: false; error: string; code?: string }
> {
  await ensureAccountStoreLoaded();
  const verified = verifyWebCabinetCode(emailRaw, codeRaw);
  if (!verified.ok) return verified;
  const account = getAccountByEmail(verified.email);
  if (!account) {
    return { ok: false, error: 'Аккаунт с этим email не найден', code: 'NOT_FOUND' };
  }
  if (!account.autoRenew && !account.yookassaPaymentMethodId?.trim()) {
    const store = loadStore();
    delete store.pendingWebCabinetCodes?.[verified.email];
    saveStore(store);
    return {
      ok: true,
      status: webCabinetStatusFromAccount(verified.email, account),
      message: 'Автопродление уже отключено. Доступ сохранится до конца оплаченного периода.',
    };
  }
  cancelAutoRenewByEmail(verified.email);
  const store = loadStore();
  delete store.pendingWebCabinetCodes?.[verified.email];
  saveStore(store);
  const updated = getAccountByEmail(verified.email);
  if (!updated) {
    return { ok: false, error: 'Аккаунт недоступен', code: 'NOT_FOUND' };
  }
  return {
    ok: true,
    status: webCabinetStatusFromAccount(verified.email, updated),
    message:
      'Подписка отменена. Автопродление отключено. Доступ сохранится до конца оплаченного периода.',
  };
}

export async function unlinkCardViaWebCabinet(
  emailRaw: string,
  codeRaw: string,
): Promise<
  | { ok: true; status: WebCabinetStatus; message: string }
  | { ok: false; error: string; code?: string }
> {
  await ensureAccountStoreLoaded();
  const verified = verifyWebCabinetCode(emailRaw, codeRaw);
  if (!verified.ok) return verified;
  const account = getAccountByEmail(verified.email);
  if (!account) {
    return { ok: false, error: 'Аккаунт с этим email не найден', code: 'NOT_FOUND' };
  }
  if (!account.yookassaPaymentMethodId?.trim() && account.autoRenew === false) {
    return { ok: false, error: 'Карта не привязана — автопродление уже отключено', code: 'NO_SAVED_CARD' };
  }
  cancelAutoRenewByEmail(verified.email);
  const store = loadStore();
  delete store.pendingWebCabinetCodes?.[verified.email];
  saveStore(store);
  const updated = getAccountByEmail(verified.email);
  if (!updated) {
    return { ok: false, error: 'Аккаунт недоступен', code: 'NOT_FOUND' };
  }
  return {
    ok: true,
    status: webCabinetStatusFromAccount(verified.email, updated),
    message:
      'Карта отвязана. Автопродление отключено. Доступ сохранится до конца оплаченного периода.',
  };
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

export async function getAccountProfileLoaded(
  installId: string,
): Promise<ReturnType<typeof getAccountProfile>> {
  await ensureAccountStoreLoaded();
  return getAccountProfile(installId);
}

export async function startEmailLogin(
  installId: string,
  emailRaw: string,
): Promise<{ ok: true; expiresInSec: number } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Некорректный email' };
  }
  const store = await ensureAccountStoreLoaded();
  const normalized = installId.trim().toLowerCase();
  const code = isYookassaReviewerEmail(email)
    ? '000000'
    : String(crypto.randomInt(100000, 999999));
  const expiresAt = Date.now() + (isYookassaReviewerEmail(email) ? 24 * 60 * 60 * 1000 : 15 * 60 * 1000);
  store.pendingEmailCodes = store.pendingEmailCodes ?? {};
  store.pendingEmailCodes[email] = { code, installId: normalized, email, expiresAt };
  await saveStoreAsync(store);
  if (hasPostgres()) {
    await pgSavePendingEmailCode(email, code, normalized, expiresAt);
  }
  if (isYookassaReviewerEmail(email)) {
    console.log(`[email-auth] YooKassa reviewer test account ${email} — code ${code}`);
  } else if (isEmailConfigured()) {
    void import('./email-sender.js').then((m) => m.sendLoginCodeEmail(email, code)).catch((err) => {
      console.warn('[email-auth] send failed:', err instanceof Error ? err.message : err);
    });
  } else {
    console.log(`[email-auth] code for ${email}: ${code} (set RESEND_API_KEY + RESEND_FROM or read logs)`);
  }
  return { ok: true, expiresInSec: 900 };
}

export async function verifyEmailLogin(
  installId: string,
  emailRaw: string,
  codeRaw: string,
): Promise<{ ok: true; accountId: string } | { ok: false; error: string }> {
  const email = normalizeEmail(emailRaw);
  const code = codeRaw.replace(/\D/g, '').trim();
  if (code.length < 4) {
    return { ok: false, error: 'Неверный код' };
  }
  const store = await ensureAccountStoreLoaded();
  store.pendingEmailCodes = store.pendingEmailCodes ?? {};
  store.emailToAccount = store.emailToAccount ?? {};

  const normalized = installId.trim().toLowerCase();
  const reviewerBypass = isYookassaReviewerEmail(email) && isYookassaReviewerLoginCode(email, code);

  if (!reviewerBypass) {
    let pending = store.pendingEmailCodes[email] ?? null;
    if (hasPostgres()) {
      const fromPg = await pgLoadPendingEmailCode(email);
      if (fromPg) pending = fromPg;
    }
    if (!pending || pending.expiresAt < Date.now()) {
      return { ok: false, error: 'Код истёк — запроси новый' };
    }
    if (pending.code !== code) {
      return { ok: false, error: 'Неверный код' };
    }
    if (pending.installId !== normalized) {
      return { ok: false, error: 'Код выдан другому устройству' };
    }
  }
  let accountId = store.emailToAccount[email];
  const isFirstRegistration = !accountId;
  const prevAnonymousAccountId = store.installToAccount[normalized] ?? null;
  if (!accountId) {
    accountId = prevAnonymousAccountId ?? createAccount(installId).accountId;
  }
  const account = store.accountsById[accountId];
  if (!account) return { ok: false, error: 'Аккаунт недоступен' };

  account.email = email;
  if (isYookassaReviewerEmail(email)) {
    provisionYookassaReviewerAccount(account);
  } else if (isFirstRegistration) {
    grantWelcomeTrialIfEligible(account);
  }
  const attach = attachInstallToAccount(store, account, normalized);
  if (!attach.ok) {
    console.warn(`[email-auth] verify failed email=${email} install=${normalized} reason=${attach.error} devices=${account.installIds.length}`);
    return attach;
  }
  store.installToAccount[normalized] = accountId;
  store.emailToAccount[email] = accountId;
  account.ownerInstallId = normalized;
  if (!reviewerBypass) {
    delete store.pendingEmailCodes[email];
  }
  await saveStoreAsync(store);
  if (hasPostgres()) {
    if (!reviewerBypass) {
      await pgDeletePendingEmailCode(email);
    }
    const { pgReassignScrobbleHistoryForInstall, pgMergeScrobbleHistoryAccounts } =
      await import('./scrobble-history-store.js');
    const { pgReassignStoryHistoryForInstall, pgMergeStoryHistoryAccounts } =
      await import('./story-history-store.js');
    if (
      prevAnonymousAccountId &&
      prevAnonymousAccountId !== accountId
    ) {
      const mergedStories = await pgMergeStoryHistoryAccounts(prevAnonymousAccountId, accountId);
      const mergedScrobbles = await pgMergeScrobbleHistoryAccounts(prevAnonymousAccountId, accountId);
      if (mergedStories > 0 || mergedScrobbles > 0) {
        console.log(
          `[email-auth] merged anonymous account=${prevAnonymousAccountId.slice(0, 8)} → ${accountId.slice(0, 8)} stories=${mergedStories} scrobbles=${mergedScrobbles}`,
        );
      }
      delete store.accountsById[prevAnonymousAccountId];
      for (const [code, id] of Object.entries(store.syncCodeToAccount)) {
        if (id === prevAnonymousAccountId) delete store.syncCodeToAccount[code];
      }
      await saveStoreAsync(store);
    }
    const storyRows = await pgReassignStoryHistoryForInstall(normalized, accountId);
    const scrobbleRows = await pgReassignScrobbleHistoryForInstall(normalized, accountId);
    if (storyRows > 0 || scrobbleRows > 0) {
      console.log(
        `[email-auth] reassigned history install=${normalized} account=${accountId} stories=${storyRows} scrobbles=${scrobbleRows}`,
      );
    }
  }
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
