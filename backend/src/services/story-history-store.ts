import crypto from 'node:crypto';
import { factFingerprint } from './fact-bank.js';
import { getPool, hasPostgres } from './db.js';
import type { SyncHistoryEntry, UsedSeedRecord } from './account-store.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeStoryHistoryId(id: string): string {
  const trimmed = id.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

export async function migrateStoryDataFromAccountsBlob(
  accountsById: Record<
    string,
    {
      accountId: string;
      installIds: string[];
      history?: SyncHistoryEntry[];
      usedSeeds?: UsedSeedRecord[];
    }
  >,
): Promise<{ historyRows: number; seedRows: number }> {
  if (!hasPostgres()) return { historyRows: 0, seedRows: 0 };

  let historyRows = 0;
  let seedRows = 0;

  for (const account of Object.values(accountsById)) {
    const accountId = account.accountId;
    const ownerInstall = account.installIds[0] ?? accountId;

    for (const entry of account.history ?? []) {
      const inserted = await pgInsertStoryHistory(ownerInstall, accountId, entry);
      if (inserted) historyRows += 1;
    }

    for (const seed of account.usedSeeds ?? []) {
      const inserted = await pgInsertUsedSeed(ownerInstall, accountId, seed);
      if (inserted) seedRows += 1;
    }
  }

  if (historyRows > 0 || seedRows > 0) {
    console.log(
      `[postgres] migrated story data from accounts blob: history=${historyRows} usedSeeds=${seedRows}`,
    );
  }
  return { historyRows, seedRows };
}

export async function pgInsertStoryHistory(
  installId: string,
  accountId: string | null,
  entry: SyncHistoryEntry,
): Promise<boolean> {
  const historyId = normalizeStoryHistoryId(entry.id);
  const res = await getPool().query(
    `INSERT INTO story_history (
      id, install_id, account_id, track_key, artist, title, script, angle,
      seed_fact, seed_scope, interest_rating, played_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id) DO NOTHING`,
    [
      historyId,
      installId.trim().toLowerCase(),
      accountId,
      entry.trackKey,
      entry.artist,
      entry.title,
      entry.script,
      entry.angle ?? null,
      entry.seedFact ?? null,
      entry.seedScope ?? null,
      entry.interestRating ?? null,
      entry.playedAt,
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function pgListStoryHistory(
  installId: string,
  accountId: string | null,
  since = 0,
): Promise<SyncHistoryEntry[]> {
  const normalized = installId.trim().toLowerCase();
  const params: Array<string | number> = [since];
  let sql = `SELECT id, track_key, artist, title, script, angle, seed_fact, seed_scope, interest_rating, played_at
    FROM story_history WHERE played_at > $1`;

  if (accountId) {
    params.push(accountId);
    sql += ` AND account_id = $2`;
  } else {
    params.push(normalized);
    sql += ` AND install_id = $2 AND account_id IS NULL`;
  }

  sql += ` ORDER BY played_at DESC LIMIT 200`;

  const res = await getPool().query(sql, params);
  return res.rows.map((row) => ({
    id: row.id as string,
    trackKey: row.track_key as string,
    artist: row.artist as string,
    title: row.title as string,
    script: row.script as string,
    angle: (row.angle as string | null) ?? undefined,
    playedAt: Number(row.played_at),
    seedFact: (row.seed_fact as string | null) ?? undefined,
    seedScope: (row.seed_scope as string | null) ?? undefined,
    interestRating: row.interest_rating != null ? Number(row.interest_rating) : undefined,
  }));
}

export async function pgInsertUsedSeed(
  installId: string,
  accountId: string | null,
  input: Omit<UsedSeedRecord, 'factFingerprint' | 'usedAt'> & { usedAt?: number },
): Promise<boolean> {
  const fp = factFingerprint(input.fact);
  const normalized = installId.trim().toLowerCase();

  if (accountId) {
    const exists = await getPool().query(
      `SELECT 1 FROM used_seeds
       WHERE account_id = $1 AND fact_fingerprint = $2
         AND lower(artist) = lower($3) AND lower(title) = lower($4) LIMIT 1`,
      [accountId, fp, input.artist, input.title],
    );
    if ((exists.rowCount ?? 0) > 0) return false;
  } else {
    const exists = await getPool().query(
      `SELECT 1 FROM used_seeds
       WHERE install_id = $1 AND account_id IS NULL AND fact_fingerprint = $2
         AND lower(artist) = lower($3) AND lower(title) = lower($4) LIMIT 1`,
      [normalized, fp, input.artist, input.title],
    );
    if ((exists.rowCount ?? 0) > 0) return false;
  }

  const res = await getPool().query(
    `INSERT INTO used_seeds (
      id, install_id, account_id, artist, title, scope, fact_fingerprint, fact,
      interest_score, interest_rating, used_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      crypto.randomUUID(),
      normalized,
      accountId,
      input.artist,
      input.title,
      input.scope,
      fp,
      input.fact,
      input.interestScore,
      input.interestRating,
      input.usedAt ?? Date.now(),
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function pgGetUsedSeedFingerprints(
  installId: string,
  accountId: string | null,
  artist: string,
  title: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const artistNorm = artist.trim().toLowerCase();
  const normalized = installId.trim().toLowerCase();
  const params: string[] = [artistNorm];
  let sql = `SELECT fact_fingerprint, artist, title FROM used_seeds WHERE LOWER(artist) = $1`;

  if (accountId) {
    params.push(accountId);
    sql += ` AND account_id = $2`;
  } else {
    params.push(normalized);
    sql += ` AND install_id = $2 AND account_id IS NULL`;
  }

  const res = await getPool().query(sql, params);
  for (const row of res.rows) {
    const rowArtist = String(row.artist).trim().toLowerCase();
    if (rowArtist === artistNorm) {
      out.add(row.fact_fingerprint as string);
    }
  }
  return out;
}
