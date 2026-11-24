import * as SQLite from 'expo-sqlite';
import { buildDDL } from './schema';
import { TABLE_LIST } from './registry';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('nammoor_pannai.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      for (const stmt of buildDDL()) await db.execAsync(stmt);
      await ensureColumns(db);
      return db;
    })().catch(e => {
      dbPromise = null; // allow retry
      throw e;
    });
  }
  return dbPromise;
}

/** Adds columns that exist in the registry but not yet in an installed phone's table. */
async function ensureColumns(db: SQLite.SQLiteDatabase) {
  for (const t of TABLE_LIST) {
    const info = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t.name})`);
    const have = new Set(info.map(i => i.name));
    for (const c of t.cols) {
      if (have.has(c.name)) continue;
      const type = c.type === 'int' || c.type === 'bool' ? 'INTEGER' : c.type === 'real' ? 'REAL' : 'TEXT';
      // SQLite cannot add NOT NULL columns without a default; keep added columns nullable.
      const def = c.def !== undefined
        ? ` DEFAULT ${c.type === 'int' || c.type === 'bool' || c.type === 'real' ? Number(c.def) : `'${c.def.replace(/'/g, "''")}'`}`
        : '';
      await db.execAsync(`ALTER TABLE ${t.name} ADD COLUMN ${c.name} ${type}${def};`);
    }
  }
}

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', [key]);
  return r ? r.value : null;
}

export async function kvSet(key: string, value: string | null): Promise<void> {
  const db = await getDb();
  if (value === null) await db.runAsync('DELETE FROM kv WHERE key = ?', [key]);
  else await db.runAsync('INSERT OR REPLACE INTO kv(key, value) VALUES (?, ?)', [key, value]);
}

/** Wipes all local data (used when a different account signs in on this phone). */
export async function wipeAll(): Promise<void> {
  const db = await getDb();
  for (const t of TABLE_LIST) await db.runAsync(`DELETE FROM ${t.name}`);
  await db.runAsync('DELETE FROM kv');
}
