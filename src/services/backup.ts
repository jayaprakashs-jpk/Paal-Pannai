import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { raw } from '../db/repo';
import { TABLE_LIST } from '../db/registry';

/** Exports every table as one JSON file so a farmer without cloud still has a backup. */
export async function exportBackup(): Promise<void> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLE_LIST) {
    if (t.localOnly) continue;
    out[t.name] = await raw(`SELECT * FROM ${t.name} WHERE deleted_at IS NULL`);
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `nammoor-pannai-backup-${stamp}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify({ app: 'nammoor-pannai', version: 1, exported_at: new Date().toISOString(), data: out }, null, 2));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Backup' });
  }
}
