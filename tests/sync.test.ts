import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

// ---------- fakes for the native / cloud modules ----------
const h = vi.hoisted(() => {
  const state: any = { sqlite: null, remote: new Map<string, Map<string, any>>(), clock: 0, uid: 'user-1', online: true, failUpsert: false };
  return { state };
});

vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    const d = new DatabaseSync(':memory:');
    h.state.sqlite = d;
    return {
      execAsync: async (sql: string) => { d.exec(sql); },
      runAsync: async (sql: string, p: any[] = []) => { d.prepare(sql).run(...p); },
      getAllAsync: async (sql: string, p: any[] = []) => d.prepare(sql).all(...p),
      getFirstAsync: async (sql: string, p: any[] = []) => d.prepare(sql).get(...p) ?? null,
    };
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => randomUUID() }));
vi.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => {} } }));
vi.mock('@react-native-community/netinfo', () => ({
  default: { fetch: async () => ({ isConnected: h.state.online, isInternetReachable: h.state.online }), addEventListener: () => () => {} },
}));
vi.mock('../src/services/auth', () => ({ getUserId: () => h.state.uid }));

vi.mock('../src/services/supabase', () => {
  const tableOf = (n: string) => { if (!h.state.remote.has(n)) h.state.remote.set(n, new Map()); return h.state.remote.get(n)!; };
  const iso = (t: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + t * 1000).toISOString();
  return {
    supabase: {
      from: (name: string) => ({
        upsert: async (rows: any[]) => {
          if (h.state.failUpsert) return { error: { message: 'network down' } };
          const ts = iso(++h.state.clock); // one server timestamp per request, like now() in a transaction
          for (const r of rows) tableOf(name).set(r.id, { ...r, server_updated_at: ts });
          return { error: null };
        },
        select: () => {
          let cursor = '';
          let lim = 1000;
          const q: any = {
            gte: (_c: string, v: string) => { cursor = v; return q; },
            order: () => q,
            limit: (n: number) => { lim = n; return q; },
            then: (res: any) => {
              const rows = [...tableOf(name).values()].filter(r => r.server_updated_at >= cursor)
                .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at) || a.id.localeCompare(b.id)).slice(0, lim);
              return Promise.resolve({ data: rows, error: null }).then(res);
            },
          };
          return q;
        },
      }),
      storage: {},
    },
    isCloudConfigured: true,
  };
});

import { insert, update, remove, list, getById, raw } from '../src/db/repo';
import { syncNow, pendingCount } from '../src/services/sync';
import { getDb, kvSet } from '../src/db/client';

const remoteRows = (t: string) => [...(h.state.remote.get(t)?.values() ?? [])];
const serverEdit = (t: string, id: string, patch: any) => {
  const m = h.state.remote.get(t)!;
  m.set(id, { ...m.get(id), ...patch, server_updated_at: new Date(Date.UTC(2026, 0, 1) + (++h.state.clock) * 1000).toISOString() });
};

beforeEach(async () => {
  h.state.remote = new Map(); h.state.clock = 0; h.state.uid = 'user-1'; h.state.online = true; h.state.failUpsert = false;
  // fresh DB for every test
  await import('../src/db/client').then(async m => {
    (m as any).getDb; // keep import
  });
  const db = await getDb();
  const { TABLE_LIST } = await import('../src/db/registry');
  for (const t of TABLE_LIST) await db.runAsync(`DELETE FROM ${t.name}`);
  await db.runAsync('DELETE FROM kv');
});

describe('SQLite schema + repo', () => {
  it('creates every table and applies defaults', async () => {
    const a: any = await insert('animals', { nickname: 'Lakshmi', species: 'cow' });
    expect(a.status).toBe('active');
    expect(a.head_count).toBe(1);
    expect(a.id).toMatch(/[0-9a-f-]{36}/);
    expect((await raw<any>('SELECT dirty FROM animals'))[0].dirty).toBe(1);
  });
  it('converts bool / json / numeric strings on write and read', async () => {
    const b: any = await insert('buyers', { name: 'Aavin', kind: 'society', is_active: false });
    expect(b.is_active).toBe(false);
    const bill: any = await insert('bills', { bill_no: 'X', party_id: b.id, cycle: 'monthly', period_start: '2026-01-01', period_end: '2026-01-31', items: [{ a: 1 }], total: '12,5' });
    expect(bill.items).toEqual([{ a: 1 }]);
    expect(bill.total).toBe(12.5);
  });
  it('ignores unknown columns instead of building bad SQL', async () => {
    const a: any = await insert('animals', { nickname: 'X', species: 'cow', 'evil; DROP TABLE animals; --': 1 });
    expect(a.nickname).toBe('X');
    expect((await raw<any>('SELECT COUNT(*) AS c FROM animals'))[0].c).toBe(1);
  });
  it('soft delete hides rows from list/get but keeps the tombstone', async () => {
    const a: any = await insert('animals', { nickname: 'Gone', species: 'cow' });
    await remove('animals', a.id);
    expect(await list('animals')).toHaveLength(0);
    expect(await getById('animals', a.id)).toBeNull();
    expect((await raw<any>('SELECT deleted_at FROM animals'))[0].deleted_at).not.toBeNull();
  });
});

describe('sync engine', () => {
  it('pushes local rows (with owner + typed values) and clears the dirty flag', async () => {
    const b: any = await insert('buyers', { name: 'Ravi', kind: 'agent', is_active: true });
    await insert('bills', { bill_no: 'N1', party_id: b.id, cycle: 'daily', period_start: '2026-01-01', period_end: '2026-01-01', items: [{ x: 1 }], total: 10 });
    const rep = await syncNow();
    expect(rep.ok).toBe(true);
    expect(rep.pushed).toBe(2);
    expect(await pendingCount()).toBe(0);
    const rb = remoteRows('buyers')[0];
    expect(rb.owner_id).toBe('user-1');
    expect(rb.is_active).toBe(true);                 // boolean, not 1
    expect(remoteRows('bills')[0].items).toEqual([{ x: 1 }]); // object, not a JSON string
  });

  it('pulls rows from another device and applies types', async () => {
    h.state.remote.set('animals', new Map([['r1', { id: 'r1', owner_id: 'user-1', nickname: 'Remote cow', species: 'cow', head_count: 1, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null, server_updated_at: '2026-01-01T00:00:01Z' }]]));
    const rep = await syncNow();
    expect(rep.pulled).toBe(1);
    const a: any = await getById('animals', 'r1');
    expect(a.nickname).toBe('Remote cow');
    expect((await raw<any>('SELECT dirty FROM animals WHERE id = ?', ['r1']))[0].dirty).toBe(0);
  });

  it('a clean local row takes the newer cloud version', async () => {
    const a: any = await insert('animals', { nickname: 'Old', species: 'cow' });
    await syncNow();
    serverEdit('animals', a.id, { nickname: 'Edited elsewhere' });
    await syncNow();
    expect(((await getById('animals', a.id)) as any).nickname).toBe('Edited elsewhere');
  });

  it('an UNSYNCED local edit is never overwritten by a pull, and then wins in the cloud', async () => {
    const a: any = await insert('animals', { nickname: 'Base', species: 'cow' });
    await syncNow();
    await update('animals', a.id, { nickname: 'Local edit' });         // dirty
    serverEdit('animals', a.id, { nickname: 'Other phone edit' });
    h.state.online = true;
    await syncNow();
    expect(((await getById('animals', a.id)) as any).nickname).toBe('Local edit');
    expect(remoteRows('animals')[0].nickname).toBe('Local edit');
  });

  it('if the upload FAILS, the pull must not clobber an unsynced local edit', async () => {
    const a: any = await insert('animals', { nickname: 'Base', species: 'cow' });
    await syncNow();
    await update('animals', a.id, { nickname: 'Local edit' });
    serverEdit('animals', a.id, { nickname: 'Other phone edit' });
    h.state.failUpsert = true;                 // push fails, pull still runs
    await syncNow();
    expect(((await getById('animals', a.id)) as any).nickname).toBe('Local edit');
    h.state.failUpsert = false;
    await syncNow();                           // later the local edit wins in the cloud
    expect(remoteRows('animals')[0].nickname).toBe('Local edit');
  });

  it('deletes propagate as tombstones in both directions', async () => {
    const a: any = await insert('animals', { nickname: 'Del', species: 'cow' });
    await syncNow();
    await remove('animals', a.id);
    await syncNow();
    expect(remoteRows('animals')[0].deleted_at).not.toBeNull();
    // delete made elsewhere
    const b: any = await insert('animals', { nickname: 'Del2', species: 'cow' });
    await syncNow();
    serverEdit('animals', b.id, { deleted_at: '2026-02-01T00:00:00Z' });
    await syncNow();
    expect(await getById('animals', b.id)).toBeNull();
  });

  it('offline: nothing is lost, writes queue, and sync resumes when online', async () => {
    h.state.online = false;
    await insert('animals', { nickname: 'Offline cow', species: 'cow' });
    const rep = await syncNow();
    expect(rep.skipped).toBe('offline');
    expect(await pendingCount()).toBe(1);
    h.state.online = true;
    expect((await syncNow()).pushed).toBe(1);
    expect(remoteRows('animals')).toHaveLength(1);
  });

  it('a failed upload keeps rows dirty so they are retried', async () => {
    await insert('animals', { nickname: 'Retry me', species: 'cow' });
    h.state.failUpsert = true;
    const rep = await syncNow();
    expect(rep.ok).toBe(false);
    expect(rep.errors[0]).toMatch(/network down/);
    expect(await pendingCount()).toBe(1);
    h.state.failUpsert = false;
    expect((await syncNow()).ok).toBe(true);
    expect(await pendingCount()).toBe(0);
  });

  it('an edit made DURING an upload stays dirty (is not marked clean by mistake)', async () => {
    const a: any = await insert('animals', { nickname: 'v1', species: 'cow' });
    const db = await getDb();
    // simulate the user editing between SELECT and the post-upload UPDATE by editing inside the fake server
    const orig: any = (await import('../src/services/supabase')).supabase!.from.bind((await import('../src/services/supabase')).supabase!);
    const sup: any = (await import('../src/services/supabase')).supabase;
    sup.from = (name: string) => {
      const t: any = orig(name);
      const up = t.upsert;
      t.upsert = async (rows: any[]) => {
        const res = await up(rows);
        if (name === 'animals') await update('animals', a.id, { nickname: 'v2-during-upload' });
        return res;
      };
      return t;
    };
    await syncNow();
    sup.from = orig;
    expect((await raw<any>('SELECT dirty FROM animals WHERE id = ?', [a.id]))[0].dirty).toBe(1);
    await syncNow();
    expect(remoteRows('animals')[0].nickname).toBe('v2-during-upload');
    void db;
  });

  it('refuses to merge a different account into this phone\'s data', async () => {
    await insert('animals', { nickname: 'Mine', species: 'cow' });
    await syncNow();
    h.state.uid = 'user-2';
    const rep = await syncNow();
    expect(rep.skipped).toBe('account_mismatch');
    expect(remoteRows('animals').every(r => r.owner_id === 'user-1')).toBe(true);
  });

  it('pages through more than one pull page without skipping rows', async () => {
    const m = new Map<string, any>();
    for (let i = 0; i < 1203; i++) {
      const id = `id-${String(i).padStart(5, '0')}`;
      m.set(id, { id, owner_id: 'user-1', nickname: `A${i}`, species: 'cow', head_count: 1, status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', deleted_at: null,
        server_updated_at: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 150) * 1000).toISOString() }); // 150 rows share a timestamp
    }
    h.state.remote.set('animals', m);
    const rep = await syncNow();
    expect(rep.ok).toBe(true);
    expect((await raw<any>('SELECT COUNT(*) AS c FROM animals'))[0].c).toBe(1203);
  });

  it('is idempotent: a second sync with no changes sends and receives nothing new', async () => {
    await insert('animals', { nickname: 'Once', species: 'cow' });
    await syncNow();
    const rep = await syncNow();
    expect(rep.pushed).toBe(0);
    expect(remoteRows('animals')).toHaveLength(1);
  });

  it('device-only tables (scan queue) are never uploaded', async () => {
    await insert('scan_queue', { image_uri: 'file:///x.jpg' });
    await syncNow();
    expect(h.state.remote.get('scan_queue')).toBeUndefined();
    await kvSet('x', 'y');
  });
});
