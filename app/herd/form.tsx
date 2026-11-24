import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, Field, Screen, Spacer, Txt, confirm, toast, Row } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, remove, update, raw, rawRun } from '../../src/db/repo';
import { SPECIES } from '../../src/lib/constants';
import { getPosition } from '../../src/services/location';
import { useBusy } from '../../src/lib/hooks';

export default function HerdForm() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({ name: '', species: 'cow', location_name: '', notes: '', lat: null, lng: null });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => { if (id) getById('herds', id).then(h => h && setF(h)); }, [id]);

  const save = () => run(async () => {
    if (!f.name.trim()) return toast(t('Name needed'), t('Please enter a herd name.'));
    const row = { name: f.name.trim(), species: f.species, location_name: f.location_name, notes: f.notes, lat: f.lat, lng: f.lng };
    if (id) await update('herds', id, row); else await insert('herds', row);
    r.back();
  });

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{id ? t('Edit herd') : t('New herd')}</Title>
      <Card>
        <Field label={t('Herd / group name')} value={f.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
        <Chips label={t('Species')} value={f.species} onChange={v => set('species', v)} options={SPECIES.map(s => ({ value: s.key, label: s.label }))} />
        <Field label={t('Shed / grazing area name')} value={f.location_name} onChangeText={v => set('location_name', v)} />
        <Row>
          <Btn small v="secondary" icon="crosshairs-gps" title={f.lat ? t('Update GPS pin') : t('Pin GPS location')} onPress={async () => {
            const p = await getPosition();
            if (p) { set('lat', p.lat); set('lng', p.lng); } else toast(t('Location'), t('Could not get your location.'));
          }} />
        </Row>
        {f.lat ? <Txt v="small" style={{ marginTop: 6 }}>{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</Txt> : null}
        <Spacer />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
      </Card>
      {id ? (
        <>
          <Spacer />
          <Btn v="danger" title={t('Delete herd')} onPress={async () => {
            if (!(await confirm(t('Delete herd?'), t('Animals stay, they just leave this group.'), t('Delete'), t('Cancel'), true))) return;
            const members = await raw<{ id: string }>(`SELECT id FROM animals WHERE herd_id = ? AND deleted_at IS NULL`, [id]);
            for (const m of members) await update('animals', m.id, { herd_id: null });
            await remove('herds', id);
            r.back();
          }} />
        </>
      ) : null}
    </Screen>
  );
}
