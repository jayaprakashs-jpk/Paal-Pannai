import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, Field, NumField, Row, Screen, Toggle, confirm, toast, Spacer } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, remove, update } from '../../src/db/repo';
import { PROVIDER_KINDS } from '../../src/lib/constants';
import { getPosition } from '../../src/services/location';
import { toNum } from '../../src/lib/money';
import { useBusy } from '../../src/lib/hooks';

export default function ProviderForm() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({ kind: 'vet', name: '', phone: '', village: '', address: '', fee: '', notes: '', is_favorite: false, lat: null, lng: null });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => { if (id) getById('providers', id).then(p => p && setF({ ...p, fee: p.fee ? String(p.fee) : '', phone: p.phone ?? '', village: p.village ?? '', address: p.address ?? '', notes: p.notes ?? '' })); }, [id]);

  const save = () => run(async () => {
    if (!f.name.trim()) return toast(t('Name needed'), t('Please enter a name.'));
    const row = { kind: f.kind, name: f.name.trim(), phone: f.phone, village: f.village, address: f.address, fee: f.fee ? toNum(f.fee) : null, notes: f.notes, is_favorite: f.is_favorite, lat: f.lat, lng: f.lng };
    if (id) await update('providers', id, row); else await insert('providers', row);
    r.back();
  });

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{id ? t('Edit contact') : t('New contact')}</Title>
      <Card>
        <Chips label={t('Type')} value={f.kind} onChange={v => set('kind', v)} options={PROVIDER_KINDS} />
        <Field label={t('Name')} value={f.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
        <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
        <Field label={t('Village / town')} value={f.village} onChangeText={v => set('village', v)} />
        <Field label={t('Address')} value={f.address} onChangeText={v => set('address', v)} multiline />
        <NumField label={t('Usual fee (₹)')} value={f.fee} onChangeText={v => set('fee', v)} />
        <Toggle label={t('Favourite')} value={f.is_favorite} onChange={v => set('is_favorite', v)} />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
      </Card>
      {id ? (<><Spacer /><Btn v="danger" title={t('Delete')} onPress={async () => { if (await confirm(t('Delete contact?'), f.name, t('Delete'), t('Cancel'), true)) { await remove('providers', id); r.back(); } }} /></>) : null}
    </Screen>
  );
}
