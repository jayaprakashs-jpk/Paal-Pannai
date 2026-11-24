import NetInfo from '@react-native-community/netinfo';
import { getDb, kvGet, kvSet } from '../db/client';
import { SYNCED_TABLES, TABLES, TableDef } from '../db/registry';
import { setSettings } from '../store/settings';
import { getUserId } from './auth';
import { supabase } from './supabase';
import { uploadListingPhotos } from './photos';

/**
 * Offline-first sync. Rules (kept deliberately simple and predictable):
 *  - Every local write marks the row dirty and bumps updated_at.
 *  - PUSH: dirty rows are upserted by id. Deletes are tombstones (deleted_at).
 *  - PULL: rows with server_updated_at newer than the table cursor are applied.
 *  - CONFLICT: if the same row is dirty on this phone, this phone wins and overwrites the cloud
 *    on its push. Otherwise the cloud copy wins. Server time (not the phone clock) drives pulls,
 *    so a wrong phone date cannot hide changes.
 */
const PUSH_BATCH = 200;
const PULL_PAGE = 500;

export interface SyncReport {
  ok: boolean;
  skipped?: 'not_configured' | 'signed_out' | 'offline' | 'busy' | 'account_mismatch';
  pushed: number;
  pulled: number;
  errors: string[];
}

let running = false;

function toRemote(def: TableDef, row: Record<string, any>, uid: string): Record<string, any> {
  const out: Record<string, any> = {
    id: row.id, owner_id: uid, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null,
  };
  for (const c of def.cols) {
    const v = row[c.name];
    if (v === null || v === undefined) { out[c.name] = null; continue; }
    if (c.type === 'bool') out[c.name] = v === 1 || v === true;
    else if (c.type === 'json') { try { out[c.name] = typeof v === 'string' ? JSON.parse(v) : v; } catch { out[c.name] = null; } }
    else out[c.name] = v;
  }
  return out;
}

function toLocal(def: TableDef, row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {
    id: row.id, owner_id: row.owner_id, created_at: row.created_at, updated_at: row.updated_at, deleted_at: row.deleted_at ?? null,
  };
  for (const c of def.cols) {
    const v = row[c.name];
    if (v === null || v === undefined) { out[c.name] = null; continue; }
    if (c.type === 'bool') out[c.name] = v ? 1 : 0;
    else if (c.type === 'json') out[c.name] = typeof v === 'string' ? v : JSON.stringify(v);
    else out[c.name] = v;
  }
  return out;
}

async function pushTable(name: string, uid: string, report: SyncReport) {
  const db = await getDb();
  const def = TABLES[name];
  for (let guard = 0; guard < 200; guard++) {
    const rows = await db.getAllAsync<Record<string, any>>(
      `SELECT * FROM ${name} WHERE dirty = 1 ORDER BY updated_at ASC LIMIT ${PUSH_BATCH}`,
    );
    if (!rows.length) return;
    let prepared = rows;
    if (name === 'listings') prepared = await Promise.all(rows.map(r => uploadListingPhotos(r, uid)));
    const payload = prepared.map(r => toRemote(def, r, uid));
    const { error } = await supabase!.from(name).upsert(payload, { onConflict: 'id' });
    if (error) { report.errors.push(`${name}: ${error.message}`); return; }
    // Clear dirty only if the row was not edited while the request was in flight.
    for (const r of prepared) {
      await db.runAsync(
        `UPDATE ${name} SET dirty = 0, owner_id = ? WHERE id = ? AND updated_at = ?`,
        [uid, r.id, r.updated_at],
      );
    }
    report.pushed += rows.length;
    if (rows.length < PUSH_BATCH) return;
  }
}

async function pullTable(name: string, report: SyncReport) {
  const db = await getDb();
  const def = TABLES[name];
  let cursor = (await kvGet(`sync.cursor.${name}`)) || '1970-01-01T00:00:00Z';
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await supabase!
      .from(name).select('*').gte('server_updated_at', cursor)
      .order('server_updated_at', { ascending: true }).order('id', { ascending: true }).limit(PULL_PAGE);
    if (error) { report.errors.push(`${name}: ${error.message}`); return; }
    if (!data || !data.length) return;
    for (const remote of data) {
      const local = await db.getFirstAsync<{ dirty: number }>(`SELECT dirty FROM ${name} WHERE id = ?`, [remote.id]);
      if (local && local.dirty === 1) continue; // this phone has unsynced edits: they win on push
      const row = toLocal(def, remote);
      const cols = Object.keys(row);
      await db.runAsync(
        `INSERT OR REPLACE INTO ${name} (${cols.join(',')}, dirty) VALUES (${cols.map(() => '?').join(',')}, 0)`,
        cols.map(c => row[c]),
      );
      report.pulled++;
    }
    const last = data[data.length - 1].server_updated_at as string;
    if (data.length < PULL_PAGE) { await kvSet(`sync.cursor.${name}`, last); return; }
    if (last === cursor) { await kvSet(`sync.cursor.${name}`, last); return; } // cannot advance; stop
    cursor = last;
    await kvSet(`sync.cursor.${name}`, cursor);
  }
}

export async function syncNow(): Promise<SyncReport> {
  const report: SyncReport = { ok: false, pushed: 0, pulled: 0, errors: [] };
  if (!supabase) return { ...report, skipped: 'not_configured' };
  const uid = getUserId();
  if (!uid) return { ...report, skipped: 'signed_out' };
  if (running) return { ...report, skipped: 'busy' };
  const net = await NetInfo.fetch();
  if (!net.isConnected || net.isInternetReachable === false) return { ...report, skipped: 'offline' };

  running = true;
  try {
    const prev = await kvGet('sync.user');
    if (prev && prev !== uid) return { ...report, skipped: 'account_mismatch' };
    if (!prev) await kvSet('sync.user', uid);

    for (const t of SYNCED_TABLES) await pushTable(t, uid, report);
    for (const t of SYNCED_TABLES) await pullTable(t, report);
    report.ok = report.errors.length === 0;
    if (report.ok) await setSettings({ lastSyncAt: new Date().toISOString() });
  } catch (e: any) {
    report.errors.push(String(e?.message ?? e));
  } finally {
    running = false;
  }
  return report;
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  let n = 0;
  for (const t of SYNCED_TABLES) {
    const r = await db.getFirstAsync<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE dirty = 1`);
    n += r?.c ?? 0;
  }
  return n;
}

let debounce: ReturnType<typeof setTimeout> | null = null;

/** Auto-sync when the phone gets internet back. Returns an unsubscribe function. */
export function startAutoSync(): () => void {
  const unsub = NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable !== false) {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { syncNow().catch(() => {}); }, 3000);
    }
  });
  return () => { unsub(); if (debounce) clearTimeout(debounce); };
}
