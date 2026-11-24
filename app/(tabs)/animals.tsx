import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, Chips, Empty, Fab, Field, ListItem, Row, Screen, Txt, S, Icon, C } from '../../src/ui';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, Row as DbRow, raw } from '../../src/db/repo';
import { SPECIES, speciesIcon, speciesLabel } from '../../src/lib/constants';
import { currentPregnancy } from '../../src/lib/breeding';
import { today } from '../../src/lib/dates';

export default function Animals() {
  const t = useT();
  const r = useRouter();
  const [q, setQ] = useState('');
  const [sp, setSp] = useState('all');
  const [view, setView] = useState<'animals' | 'herds'>('animals');

  const { data } = useLoad(async () => {
    const animals = await list('animals', { where: `status = 'active'`, orderBy: 'nickname COLLATE NOCASE' });
    const events = await list('breeding_events', { where: `status IN ('pending','confirmed')` });
    const herds = await list('herds', { orderBy: 'name COLLATE NOCASE' });
    const counts = await raw<{ herd_id: string; c: number }>(
      `SELECT herd_id, SUM(COALESCE(head_count,1)) AS c FROM animals WHERE deleted_at IS NULL AND status='active' AND herd_id IS NOT NULL GROUP BY herd_id`);
    return { animals, events, herds, counts: new Map(counts.map(x => [x.herd_id, x.c])) };
  }, { animals: [] as DbRow[], events: [] as DbRow[], herds: [] as DbRow[], counts: new Map<string, number>() }, []);

  const filtered = useMemo(() => data.animals.filter(a =>
    (sp === 'all' || a.species === sp) &&
    (!q || `${a.nickname} ${a.tag_id ?? ''} ${a.breed ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  ), [data.animals, q, sp]);

  const preg = (a: DbRow) => currentPregnancy(a.species, data.events.filter(e => e.animal_id === a.id) as any, today());

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Chips value={view} onChange={v => setView(v as any)} options={[{ value: 'animals', label: 'Animals' }, { value: 'herds', label: 'Herds / groups' }]} />
        {view === 'animals' ? (
          <>
            <Field value={q} onChangeText={setQ} placeholder={t('Search name, tag, breed')} />
            <Chips value={sp} onChange={setSp} options={[{ value: 'all', label: 'All' }, ...SPECIES.map(s => ({ value: s.key, label: s.label }))]} />
            {filtered.length === 0 ? (
              <Empty icon="cow" text={data.animals.length ? t('No match') : t('No animals yet. Tap + to add one.')} />
            ) : filtered.map(a => {
              const p = preg(a);
              return (
                <ListItem key={a.id} icon={speciesIcon(a.species)}
                  title={a.nickname}
                  subtitle={[a.tag_id, t(speciesLabel(a.species)), a.breed, a.species === 'poultry' ? `${a.head_count} ${t('birds')}` : a.weight_kg ? `${a.weight_kg} kg` : null].filter(Boolean).join(' · ')}
                  badge={p ? <Badge tone="info" text={p.confirmed ? t('Pregnant') : t('Served')} /> : undefined}
                  onPress={() => r.push(`/animal/${a.id}`)} />
              );
            })}
          </>
        ) : (
          <>
            {data.herds.length === 0 ? <Empty icon="sheep" text={t('Group animals into a herd to log milk and costs together.')} /> : null}
            {data.herds.map(h => (
              <ListItem key={h.id} icon="account-group" title={h.name}
                subtitle={`${t(speciesLabel(h.species))} · ${data.counts.get(h.id) ?? 0} ${t('animals')}${h.location_name ? ' · ' + h.location_name : ''}`}
                onPress={() => r.push(`/herd/form?id=${h.id}`)} />
            ))}
          </>
        )}
      </Screen>
      <Fab onPress={() => r.push(view === 'animals' ? '/animal/form' : '/herd/form')} />
    </View>
  );
}
