import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, DateField, Field, NumField, PickerField, Screen, Toggle, Txt, confirm, toast, Spacer } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { toNum } from '../../src/lib/money';
import { priceEntry } from '../../src/services/milkRates';
import { useBusy } from '../../src/lib/hooks';

export default function MilkEdit() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { busy, run } = useBusy();
  const [e, setE] = useState<DbRow | null>(null);
  const [buyers, setBuyers] = useState<DbRow[]>([]);
  const [f, setF] = useState({ date: '', litres: '', fat: '', snf: '', buyer_id: '', sold: true });
  useEffect(() => {
    (async () => {
      const x = await getById<DbRow>('milk_entries', id);
      setBuyers(await list('buyers', { orderBy: 'name' }));
      if (!x) return;
      setE(x);
      setF({ date: x.date, litres: String(x.litres), fat: x.fat ? String(x.fat) : '', snf: x.snf ? String(x.snf) : '', buyer_id: x.buyer_id ?? '', sold: !!x.sold });
    })();
  }, [id]);
  if (!e) return <Screen><Title>{t('Edit milk entry')}</Title></Screen>;

  const save = () => run(async () => {
    const litres = toNum(f.litres);
    if (litres <= 0 || litres > 200) return toast(t('Litres'), t('Enter litres between 0 and 200.'));
    const fat = f.fat ? toNum(f.fat) : null;
    const snf = f.snf ? toNum(f.snf) : null;
    const p = f.sold ? await priceEntry(f.buyer_id, f.date, litres, fat, snf, e.milk_type || 'any') : { rate: null, amount: null };
    // Keep a scanned slip's own amount if the price cannot be computed
    await update('milk_entries', id, {
      date: f.date, litres, fat, snf, buyer_id: f.sold && f.buyer_id ? f.buyer_id : null, sold: f.sold,
      rate_per_litre: p.rate ?? (f.sold ? e.rate_per_litre : null), amount: p.amount ?? (f.sold ? e.amount : null),
    });
    r.back();
  });

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{t('Edit milk entry')}</Title>
      <Card>
        <DateField label={t('Date')} value={f.date} onChange={v => setF({ ...f, date: v })} />
        <NumField label={t('Litres')} value={f.litres} onChangeText={v => setF({ ...f, litres: v })} suffix="L" />
        <NumField label={t('Fat %')} value={f.fat} onChangeText={v => setF({ ...f, fat: v })} />
        <NumField label={t('SNF %')} value={f.snf} onChangeText={v => setF({ ...f, snf: v })} />
        <Toggle label={t('Sold to a buyer')} value={f.sold} onChange={v => setF({ ...f, sold: v })} />
        {f.sold ? <PickerField label={t('Buyer')} value={f.buyer_id} onChange={v => setF({ ...f, buyer_id: v })} allowEmpty options={buyers.map(b => ({ value: b.id, label: b.name }))} /> : null}
      </Card>
      <Spacer />
      <Btn v="danger" title={t('Delete entry')} onPress={async () => {
        if (!(await confirm(t('Delete entry?'), `${e.litres} L`, t('Delete'), t('Cancel'), true))) return;
        await remove('milk_entries', id); r.back();
      }} />
    </Screen>
  );
}
