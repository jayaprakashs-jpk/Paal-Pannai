import { list, Row } from '../db/repo';
import { profileFor } from '../lib/breeding';

/** Animals that can be bred / come into heat: females of species we have a cycle for. */
export async function breederAnimals(): Promise<Row[]> {
  const all = await list('animals', { where: `status = 'active'`, orderBy: 'nickname COLLATE NOCASE' });
  return all.filter(a => a.sex !== 'male' && !!profileFor(a.species) &&
    !['calf', 'kid', 'lamb', 'puppy'].includes(a.category ?? ''));
}
