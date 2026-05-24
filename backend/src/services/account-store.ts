import crypto from 'node:crypto';
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

interface AccountRecord {
  accountId: string;
  syncCode: string;
  ownerInstallId: string;
  installIds: string[];
  settings: SyncSettings;
  history: SyncHistoryEntry[];
  createdAt: number;
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
