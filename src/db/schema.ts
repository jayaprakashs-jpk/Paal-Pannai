import { TABLE_LIST, ColType } from './registry';

const SQLITE_TYPE: Record<ColType, string> = {
  text: 'TEXT', int: 'INTEGER', real: 'REAL', bool: 'INTEGER',
  json: 'TEXT', date: 'TEXT', ts: 'TEXT', ref: 'TEXT',
};

function sqlDefault(type: ColType, def: string): string {
  if (type === 'int' || type === 'real' || type === 'bool') return `DEFAULT ${Number(def)}`;
  return `DEFAULT '${def.replace(/'/g, "''")}'`;
}

export function buildDDL(): string[] {
  const out: string[] = [];
  for (const t of TABLE_LIST) {
    const cols = t.cols.map(c => {
      let s = `${c.name} ${SQLITE_TYPE[c.type]}`;
      if (c.notNull) s += ' NOT NULL';
      if (c.def !== undefined) s += ' ' + sqlDefault(c.type, c.def);
      return s;
    });
    out.push(
      `CREATE TABLE IF NOT EXISTS ${t.name} (
        id TEXT PRIMARY KEY NOT NULL,
        owner_id TEXT,
        ${cols.join(',\n        ')},
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 1
      );`,
    );
    out.push(`CREATE INDEX IF NOT EXISTS idx_${t.name}_dirty ON ${t.name}(dirty) WHERE dirty = 1;`);
  }
  // Helpful lookup indexes
  const idx: [string, string][] = [
    ['animals', 'tag_id'], ['animals', 'herd_id'], ['health_records', 'animal_id'],
    ['milk_entries', 'date'], ['milk_entries', 'animal_id'], ['milk_entries', 'buyer_id'],
    ['heat_records', 'animal_id'], ['breeding_events', 'animal_id'],
    ['buyer_rates', 'buyer_id'], ['expenses', 'date'], ['payments', 'party_id'],
    ['bills', 'party_id'], ['delivery_orders', 'date'],
  ];
  for (const [tb, col] of idx) out.push(`CREATE INDEX IF NOT EXISTS idx_${tb}_${col} ON ${tb}(${col});`);
  out.push(`CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);`);
  return out;
}

/** Bump when the registry changes in a way that needs a migration. */
export const SCHEMA_VERSION = 1;
