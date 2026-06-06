import { getPool, hasPostgres } from './db.js';

export interface PendingEmailCode {
  code: string;
  installId: string;
  email: string;
  expiresAt: number;
}

export async function pgSavePendingEmailCode(
  email: string,
  code: string,
  installId: string,
  expiresAt: number,
): Promise<void> {
  if (!hasPostgres()) return;
  await getPool().query(
    `INSERT INTO pending_email_codes (email, code, install_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET code = EXCLUDED.code,
           install_id = EXCLUDED.install_id,
           expires_at = EXCLUDED.expires_at`,
    [email, code, installId, expiresAt],
  );
}

export async function pgLoadPendingEmailCode(email: string): Promise<PendingEmailCode | null> {
  if (!hasPostgres()) return null;
  const res = await getPool().query(
    'SELECT code, install_id, expires_at FROM pending_email_codes WHERE email = $1',
    [email],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    email,
    code: String(row.code),
    installId: String(row.install_id),
    expiresAt: Number(row.expires_at),
  };
}

export async function pgDeletePendingEmailCode(email: string): Promise<void> {
  if (!hasPostgres()) return;
  await getPool().query('DELETE FROM pending_email_codes WHERE email = $1', [email]);
}
