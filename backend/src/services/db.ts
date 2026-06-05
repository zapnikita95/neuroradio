import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function hasPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL!.trim();
    const ssl =
      url.includes('railway') || process.env.PGSSLMODE === 'require'
        ? { rejectUnauthorized: false }
        : undefined;
    pool = new Pool({ connectionString: url, ssl, max: 8 });
    pool.on('error', (err) => console.error('[postgres] pool error:', err.message));
  }
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS story_feedback (
  id UUID PRIMARY KEY,
  install_id TEXT NOT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  vote TEXT NOT NULL,
  reason TEXT NOT NULL,
  script TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS story_feedback_install_idx ON story_feedback (install_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fact_misses (
  id UUID PRIMARY KEY,
  install_id TEXT NOT NULL,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  artist_tier TEXT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS fact_misses_created_idx ON fact_misses (created_at DESC);
`;

export async function initPostgres(): Promise<void> {
  if (!hasPostgres()) return;
  const client = await getPool().connect();
  try {
    await client.query(SCHEMA);
    console.log('[postgres] schema ready');
  } finally {
    client.release();
  }
}

export async function pgKvLoad<T>(key: string): Promise<T | null> {
  const res = await getPool().query('SELECT value FROM kv_store WHERE key = $1', [key]);
  if (!res.rows[0]?.value) return null;
  return res.rows[0].value as T;
}

export async function pgKvSave(key: string, value: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO kv_store (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)],
  );
}

export async function pgImportJsonFileIfMissing(
  key: string,
  filePath: string,
  readFile: (p: string) => string | null,
): Promise<boolean> {
  const existing = await pgKvLoad(key);
  if (existing != null) return false;
  const raw = readFile(filePath);
  if (!raw) return false;
  await pgKvSave(key, JSON.parse(raw));
  console.log(`[postgres] imported ${key} from ${filePath}`);
  return true;
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
