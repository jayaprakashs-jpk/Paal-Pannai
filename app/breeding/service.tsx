import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, KV, NumField, PickerField, Row, Screen, Txt, toast, confirm, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { insert, list, first, Row as DbRow } from '../../src/db/repo';
import { breederAnimals } from '../../src/services/breedingData';
import { applyBreedingAlerts } from '../../src/services/alerts';
import { currentPregnancy } from '../../src/lib/breeding';
import { today, isoToLocalDate } from '../../src/lib/dates';
import { toNum, formatINR } from '../../src/lib/money';
import { useBusy } from '../../src/lib/hooks';

const SEMEN = ['HF (Holstein Friesian)', 'Jersey', 'Gir', 'Sahiwal', 'Murrah (buffalo)', 'Sexed semen (female calf)', 'Boer (goat)', 'Local bull'];

export default function ServiceLog() {
  const t = useT();
  const r = useRouter();
  const { animalId, heatId } = useLocalSearchParams<{ animalId?: string; heatId?: string }>();
  const { busy, run } = useBusy();
  const [animals, setAnimals] = useState<DbRow[]>([]);
  const [providers, setProviders] = useState<DbRow[]>([]);
  const [f, setF] = useState<any>({
    animal_id: animalId ?? '', method: 'ai', done_at: new Date().toISOString(), semen_breed: '', bull_name: '',
    semen_cost: '', service_charge: '', vet_fee: '', provider_id: '', notes: '', heat_id: heatId ?? '',
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => {
    breederAnimals().then(setAnimals);
    list('providers', { orderBy: 'name' }).then(setProviders);
  }, []);
  // link the latest heat automatically
  useEffect(() => {
    if (!f.animal_id || f.heat_id) return;
    first('heat_records', { where: 'animal_id = ?', params: [f.animal_id], orderBy: 'heat_at DESC' }).then(h => h && set('heat_id', h.id));
  }, [f.animal_id]);

  const total = useMemo(() => toNum(f.semen_cost) + toNum(f.service_charge) + toNum(f.vet_fee), [f]);
  const animal = animals.find(a => a.id === f.animal_id);

  const save = () => run(async () => {
    if (!animal) return toast(t('Pick animal'), t('Choose the animal.'));
    if (new Date(f.done_at).getTime() > Date.now() + 3600_000) return toast(t('Date'), t('Time is in the future.'));
    const ev = await list('breeding_events', { where: 'animal_id = ?', params: [animal.id] });
    const p = currentPregnancy(animal.species, ev as any, today());
    if (p) {
      const ok = await confirm(t('Already recorded'), t('{name} already has a service waiting or pregnancy recorded. Add another service anyway?', { name: animal.nickname }), t('Add anyway'), t('Cancel'));
      if (!ok) return;
    }
    const row = await insert<DbRow>('breeding_events', {
      animal_id: animal.id, heat_id: f.heat_id || null, method: f.method, done_at: f.done_at,
      semen_breed: f.method === 'ai' ? f.semen_breed : null, bull_name: f.method === 'natural' ? f.bull_name : null,
      semen_cost: f.method === 'ai' ? toNum(f.semen_cost) : 0, service_charge: toNum(f.service_charge), vet_fee: toNum(f.vet_fee),
      provider_id: f.provider_id || null, status: 'pending', notes: f.notes,
    });
    await applyBreedingAlerts(row, animal);
    if (total > 0) {
      await insert('expenses', { date: isoToLocalDate(f.done_at), category: 'breeding', amount: total, animal_id: animal.id,
        notes: `${f.method === 'ai' ? 'AI' : 'Natural'} ${f.semen_breed || f.bull_name || ''}`.trim() });
    }
    toast(t('Saved'), t('Alerts set: watch for heat, and pregnancy check reminder.'));
    r.replace('/breeding');
  });

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{t('Log Oosi / mating')}</Title>
      <Card>
        <PickerField label={t('Animal')} value={f.animal_id} onChange={v => { set('animal_id', v); set('heat_id', ''); }}
          options={animals.map(a => ({ value: a.id, label: `${a.nickname}${a.tag_id ? ' · ' + a.tag_id : ''}` }))} />
        <Chips label={t('How was she served?')} value={f.method} onChange={v => set('method', v)}
          options={[{ value: 'ai', label: 'Oosi (Artificial insemination)' }, { value: 'natural', label: 'Natural (bull / buck)' }]} />
        <DateField label={t('Date and time')} mode="datetime" value={f.done_at} onChange={v => set('done_at', v)} />
        {f.method === 'ai' ? (
          <>
            <Field label={t('Semen breed / type')} value={f.semen_breed} onChangeText={v => set('semen_breed', v)} />
            <Row style={{ flexWrap: 'wrap', marginBottom: S.md }}>
              {SEMEN.map(s => <Btn key={s} small v="ghost" title={s} onPress={() => set('semen_breed', s)} />)}
            </Row>
            <NumField label={t('Semen cost (₹)')} value={f.semen_cost} onChangeText={v => set('semen_cost', v)} />
          </>
        ) : (
          <Field label={t('Bull / buck name or owner')} value={f.bull_name} onChangeText={v => set('bull_name', v)} />
        )}
        <NumField label={t('Service charge (₹)')} value={f.service_charge} onChangeText={v => set('service_charge', v)} />
        <NumField label={t('Vet doctor fee (₹)')} value={f.vet_fee} onChangeText={v => set('vet_fee', v)} />
        <PickerField label={t('Vet / AI worker')} value={f.provider_id} onChange={v => set('provider_id', v)} allowEmpty
          options={providers.filter(p => p.kind !== 'semen_dealer').map(p => ({ value: p.id, label: p.name }))} />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
        {total > 0 ? <Card tone="ok"><KV k={t('Total cost')} v={formatINR(total, 0)} bold /></Card> : null}
      </Card>
    </Screen>
  );
}
