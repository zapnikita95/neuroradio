import crypto from 'node:crypto';
import { getPool } from './db.js';
export type SyncScrobbleEntry = {
  id: string;
  artist: string;
  title: string;
  album?: string;
  genre?: string;
  packageName?: string;
  storyTriggered?: boolean;
  scrobbledAt: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeScrobbleId(id: string): string {
  const trimmed = id.trim();
  if (UUID_RE.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

export async function pgInsertScrobbleHistory(
  installId: string,
  accountId: string | null,
  entry: SyncScrobbleEntry,
): Promise<boolean> {
  const scrobbleId = normalizeScrobbleId(entry.id);
  const res = await getPool().query(
    `INSERT INTO scrobble_history (
      id, install_id, account_id, artist, title, album, genre, package_name, story_triggered, scrobbled_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (id) DO UPDATE SET
      story_triggered = EXCLUDED.story_triggered OR scrobble_history.story_triggered,
      account_id = COALESCE(EXCLUDED.account_id, scrobble_history.account_id)`,
    [
      scrobbleId,
      installId.trim().toLowerCase(),
      accountId,
      entry.artist,
      entry.title,
      entry.album ?? null,
      entry.genre ?? null,
      entry.packageName ?? null,
      Boolean(entry.storyTriggered),
      entry.scrobbledAt,
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function pgListScrobbleHistory(
  installId: string,
  accountId: string | null,
  since = 0,
): Promise<SyncScrobbleEntry[]> {
  const normalized = installId.trim().toLowerCase();
  const params: Array<string | number> = [since];
  let sql = `SELECT id, artist, title, album, genre, package_name, story_triggered, scrobbled_at
    FROM scrobble_history WHERE scrobbled_at > $1`;

  if (accountId) {
    params.push(accountId, normalized);
    sql += ` AND (account_id = $2 OR install_id = $3)`;
  } else {
    params.push(normalized);
    sql += ` AND install_id = $2 AND account_id IS NULL`;
  }

  sql += ` ORDER BY scrobbled_at DESC LIMIT 500`;

  const res = await getPool().query(sql, params);
  return res.rows.map((row) => ({
    id: row.id as string,
    artist: row.artist as string,
    title: row.title as string,
    album: (row.album as string | null) ?? undefined,
    genre: (row.genre as string | null) ?? undefined,
    packageName: (row.package_name as string | null) ?? undefined,
    storyTriggered: Boolean(row.story_triggered),
    scrobbledAt: Number(row.scrobbled_at),
  }));
}

export async function pgReassignScrobbleHistoryForInstall(
  installId: string,
  accountId: string,
): Promise<number> {
  const res = await getPool().query(
    `UPDATE scrobble_history SET account_id = $1 WHERE install_id = $2`,
    [accountId, installId.trim().toLowerCase()],
  );
  return res.rowCount ?? 0;
}

export async function pgMergeScrobbleHistoryAccounts(
  fromAccountId: string,
  toAccountId: string,
): Promise<number> {
  if (!fromAccountId.trim() || !toAccountId.trim() || fromAccountId === toAccountId) return 0;
  const res = await getPool().query(
    `UPDATE scrobble_history SET account_id = $2 WHERE account_id = $1`,
    [fromAccountId, toAccountId],
  );
  return res.rowCount ?? 0;
}
