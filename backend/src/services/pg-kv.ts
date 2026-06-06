import fs from 'node:fs';
import {
  hasPostgres,
  pgImportJsonFileIfMissing,
  pgKvLoad,
  pgKvSave,
} from './db.js';

export async function hydrateKvFromPostgres(
  key: string,
  filePath: string,
  apply: (value: unknown) => void,
  empty: () => unknown,
): Promise<void> {
  if (!hasPostgres()) return;

  await pgImportJsonFileIfMissing(key, filePath, (p) => {
    try {
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    } catch {
      return null;
    }
  });

  const data = await pgKvLoad(key);
  if (data != null) {
    apply(data);
    console.log(`[postgres] hydrated ${key}`);
  } else {
    apply(empty());
  }
}

export function persistKv(key: string, value: unknown, filePath: string, writeFile: () => void): void {
  if (hasPostgres()) {
    void pgKvSave(key, value).catch((err) =>
      console.error(`[postgres] save ${key} failed:`, err instanceof Error ? err.message : err),
    );
    return;
  }
  writeFile();
}

export async function persistKvAsync(
  key: string,
  value: unknown,
  filePath: string,
  writeFile: () => void,
): Promise<void> {
  if (hasPostgres()) {
    await pgKvSave(key, value);
    return;
  }
  writeFile();
}
