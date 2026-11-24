import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, NumField, Row, Screen, Txt, toast, confirm, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, update, Row as DbRow } from '../../src/db/repo';
import { HEALTH_KINDS } from '../../src/lib/constants';
import { addDays, today } from '../../src/lib/dates';
import { toNum } from '../../src/lib/money';
import { applyHealthAlert } from '../../src/services/alerts';
import { cancelOnce } from '../../src/services/notifications';
import { useBusy } from '../../src/lib/hooks';

const SUGGEST: Record<string, Record<string, string[]>> = {
  vaccination: {
    cow: ['FMD', 'HS (Haemorrhagic septicaemia)', 'BQ (Black quarter)', 'Brucellosis', 'Theileriosis', 'Anthrax', 'Lumpy skin disease'],
    buffalo: ['FMD', 'HS (Haemorrhagic septicaemia)', 'BQ (Black quarter)', 'Brucellosis'],
    goat: ['PPR', 'ET (Enterotoxaemia)', 'Goat pox', 'FMD'],
    sheep: ['PPR', 'ET (Enterotoxaemia)', 'Sheep pox', 'FMD'],
    poultry: ['Ranikhet (RD / Lasota)', 'Gumboro (IBD)', "Marek's", 'Fowl pox', 'IB'],
    dog: ['Rabies', 'DHPP', 'Leptospirosis'],
    other: [],
  },
  deworming: { cow: ['Albendazole', 'Fenbendazole'], buffalo: ['Albendazole'], goat: ['Albendazole', 'Ivermectin'], sheep: ['Albendazole', 'Ivermectin'], poultry: ['Piperazine', 'Levamisole'], dog: ['Drontal'], other: [] },
  treatment: {}, checkup: {}, mortality: {},
};
const NEXT_DAYS: Record<string, { label: string; days: number }[]> = {
  vaccination: [{ label: '+6 months', days: 182 }, { label: '+1 year', days: 365 }, { label: '+21 days', days: 21 }],
  deworming: [{ label: '+3 months', days: 91 }, { label: '+6 months', days: 182 }],
  treatment: [{ label: '+3 days', days: 3 }, { label: '+7 days', days: 7 }],
  checkup: [{ label: '+1 month', days: 30 }], mortality: [],
};

export default function HealthForm() {
  const t = useT();
  const r = useRouter();
  const { animalId, id } = useLocalSearchParams<{ animalId?: string; id?: string }>();
  const { busy, run } = useBusy();
  const [animal, setAnimal] = useState<DbRow | null>(null);
  const [f, setF] = useState<any>({ kind: 'vaccination', title: '', date: today(), next_due_date: '', cost: '', vet_name: '', count: '1', cause: '', notes: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      if (id) {
        const h = await getById<DbRow>('health_records', id);
        if (h) { setF({ ...h, cost: h.cost ? String(h.cost) : '', count: String(h.count ?? 1), next_due_date: h.next_due_date ?? '' }); setAnimal(await getById('animals', h.animal_id)); }
      } else if (animalId) setAnimal(await getById('animals', animalId));
    })();
  }, [id, animalId]);

  const save = () => run(async () => {
    if (!animal) return;
    if (!f.title.trim() && f.kind !== 'mortality') return toast(t('Title needed'), t('What was given or done?'));
    const isFlock = animal.species === 'poultry' && (animal.head_count ?? 1) > 1;
    const count = Math.max(1, Math.floor(toNum(f.count, 1)));
    if (f.kind === 'mortality' && !id) {
      const msg = isFlock ? t('Remove {n} birds from the flock?', { n: count }) : t('Mark {name} as dead? It will leave your active list.', { name: animal.nickname });
      if (!(await confirm(t('Record death'), msg, t('Yes, record'), t('Cancel'), true))) return;
    }
    const row = {
      animal_id: animal.id, kind: f.kind, title: f.title.trim() || t('Mortality'), date: f.date,
      next_due_date: f.next_due_date || null, cost: toNum(f.cost, 0), vet_name: f.vet_name,
      count: f.kind === 'mortality' ? count : 1, cause: f.cause, notes: f.notes,
    };
    const rec = id ? await update<DbRow>('health_records', id, row) : await insert<DbRow>('health_records', row);
    if (f.kind === 'mortality' && !id) {
      if (isFlock && count < animal.head_count) await update('animals', animal.id, { head_count: animal.head_count - count });
      else await update('animals', animal.id, { status: 'dead', head_count: isFlock ? 0 : animal.head_count });
      await cancelOnce(`health.${rec.id}`);
    } else await applyHealthAlert(rec, animal);
    if (toNum(f.cost) > 0 && !id) {
      await insert('expenses', { date: f.date, category: 'medical', amount: toNum(f.cost), animal_id: animal.id, vendor: f.vet_name, notes: row.title });
    }
    r.back();
  });

  const sug = (SUGGEST[f.kind]?.[animal?.species ?? 'other']) ?? [];

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{t('Health record')}</Title>
      {animal ? <Txt v="h2" style={{ marginBottom: S.md }}>{animal.nickname}</Txt> : null}
      <Card>
        <Chips label={t('Type')} value={f.kind} onChange={v => set('kind', v)} options={HEALTH_KINDS.map(h => ({ value: h.key, label: h.label }))} />
        {f.kind !== 'mortality' ? (
          <>
            <Field label={t('Vaccine / medicine / issue')} value={f.title} onChangeText={v => set('title', v)} />
            {sug.length ? (
              <Row style={{ flexWrap: 'wrap', marginBottom: S.md }}>
                {sug.map(s => <Btn key={s} small v="ghost" title={s} onPress={() => set('title', s)} />)}
              </Row>
            ) : null}
          </>
        ) : (
          <>
            {animal?.species === 'poultry' && (animal.head_count ?? 1) > 1 ? <NumField label={t('Number of birds died')} value={f.count} onChangeText={v => set('count', v)} /> : null}
            <Field label={t('Cause (if known)')} value={f.cause} onChangeText={v => set('cause', v)} />
          </>
        )}
        <DateField label={t('Date')} value={f.date} onChange={v => set('date', v)} />
        {f.kind !== 'mortality' ? (
          <>
            <DateField label={t('Next due date (reminder)')} value={f.next_due_date} onChange={v => set('next_due_date', v)} clearable />
            <Row style={{ flexWrap: 'wrap', marginBottom: S.md }}>
              {(NEXT_DAYS[f.kind] ?? []).map(n => <Btn key={n.label} small v="secondary" title={t(n.label)} onPress={() => set('next_due_date', addDays(f.date, n.days))} />)}
            </Row>
          </>
        ) : null}
        <NumField label={t('Cost (₹)')} value={f.cost} onChangeText={v => set('cost', v)} />
        <Field label={t('Vet / person')} value={f.vet_name} onChangeText={v => set('vet_name', v)} />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
      </Card>
    </Screen>
  );
}
