import * as Crypto from 'expo-crypto';
import { getDb } from './client';
import { TABLES, ColType } from './registry';

export type Row = Record<string, any>;

export const uuid = (): string => Crypto.randomUUID();
let lastTs = 0;
/**
 * Strictly increasing timestamps: two writes in the same millisecond still get different values.
 * The sync engine relies on updated_at to tell "edited while uploading" from "unchanged".
 */
export const nowISO = (): string => {
  let t = Date.now();
  if (t <= lastTs) t = lastTs + 1;
  lastTs = t;
  return new Date(t).toISOString();
};

function colMap(table: string): Map<string, ColType> {
  const t = TABLES[table];
  if (!t) throw new Error(`Unknown table ${table}`);
  return new Map(t.cols.map(c => [c.name, c.type]));
}

function toDb(type: ColType, v: any): any {
  if (v === undefined) return null;
  if (v === null) return null;
  if (type === 'bool') return v ? 1 : 0;
  if (type === 'json') return typeof v === 'string' ? v : JSON.stringify(v);
  if ((type === 'real' || type === 'int') && (typeof v === 'string')) {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'text' && typeof v === 'string' && v.trim() === '') return null;
  return v;
}

/** Converts a raw SQLite row to app types (booleans, parsed JSON). */
export function hydrate<T = Row>(table: string, row: Row | null | undefined): T {
  if (!row) return row as any;
  const cm = colMap(table);
  const out: Row = { ...row };
  for (const [name, type] of cm) {
    if (!(name in out)) continue;
    if (type === 'bool') out[name] = out[name] === 1 || out[name] === true;
    else if (type === 'json' && typeof out[name] === 'string') {
      try { out[name] = JSON.parse(out[name]); } catch { out[name] = null; }
    }
  }
  return out as T;
}

export async function insert<T = Row>(table: string, values: Row): Promise<T> {
  const db = await getDb();
  const cm = colMap(table);
  const id = values.id || uuid();
  const ts = nowISO();
  const cols = ['id', 'created_at', 'updated_at', 'dirty'];
  const vals: any[] = [id, values.created_at || ts, ts, 1];
  for (const [k, v] of Object.entries(values)) {
    const type = cm.get(k);
    if (!type) continue; // ignore unknown keys instead of building bad SQL
    cols.push(k);
    vals.push(toDb(type, v));
  }
  await db.runAsync(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    vals,
  );
  return (await getById<T>(table, id)) as T;
}

export async function update<T = Row>(table: string, id: string, patch: Row): Promise<T> {
  const db = await getDb();
  const cm = colMap(table);
  const sets: string[] = ['updated_at = ?', 'dirty = 1'];
  const vals: any[] = [nowISO()];
  for (const [k, v] of Object.entries(patch)) {
    const type = cm.get(k);
    if (!type) continue;
    sets.push(`${k} = ?`);
    vals.push(toDb(type, v));
  }
  vals.push(id);
  await db.runAsync(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, vals);
  return (await getById<T>(table, id)) as T;
}

/** Soft delete so the deletion can sync to the cloud. */
export async function remove(table: string, id: string): Promise<void> {
  const db = await getDb();
  const ts = nowISO();
  await db.runAsync(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?`, [ts, ts, id]);
}

export async function getById<T = Row>(table: string, id: string): Promise<T | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<Row>(`SELECT * FROM ${table} WHERE id = ? AND deleted_at IS NULL`, [id]);
  return r ? hydrate<T>(table, r) : null;
}

export interface ListOpts {
  where?: string;
  params?: any[];
  orderBy?: string;
  limit?: number;
}

export async function list<T = Row>(table: string, opts: ListOpts = {}): Promise<T[]> {
  const db = await getDb();
  const where = ['deleted_at IS NULL'];
  if (opts.where) where.push(`(${opts.where})`);
  const sql =
    `SELECT * FROM ${table} WHERE ${where.join(' AND ')}` +
    (opts.orderBy ? ` ORDER BY ${opts.orderBy}` : '') +
    (opts.limit ? ` LIMIT ${Math.floor(opts.limit)}` : '');
  const rows = await db.getAllAsync<Row>(sql, opts.params || []);
  return rows.map(r => hydrate<T>(table, r));
}

export async function first<T = Row>(table: string, opts: ListOpts = {}): Promise<T | null> {
  const r = await list<T>(table, { ...opts, limit: 1 });
  return r[0] ?? null;
}

/** Raw read for aggregates / joins. Returns untouched rows. */
export async function raw<T = Row>(sql: string, params: any[] = []): Promise<T[]> {
  const db = await getDb();
  return db.getAllAsync<T>(sql, params);
}

export async function rawRun(sql: string, params: any[] = []): Promise<void> {
  const db = await getDb();
  await db.runAsync(sql, params);
}

/** The farm profile is a single-row table. */
export async function getFarm(): Promise<Row | null> {
  return first('farm_profile', { orderBy: 'created_at ASC' });
}

export async function saveFarm(patch: Row): Promise<Row> {
  const existing = await getFarm();
  if (existing) return update('farm_profile', existing.id, patch);
  return insert('farm_profile', patch);
}
