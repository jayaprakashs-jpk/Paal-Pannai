import React, { useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chips, DateField, Empty, Field, KV, NumField, PickerField, Row, Screen, SectionTitle, Txt, confirm, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { insert, list, remove, Row as DbRow } from '../../src/db/repo';
import { EXPENSE_CATEGORIES } from '../../src/lib/constants';
import { firstDayOfMonth, fmtDate, lastDayOfMonth, today } from '../../src/lib/dates';
import { formatINR, toNum } from '../../src/lib/money';

const UNITS = ['kg', 'bundle', 'load', 'bag', 'litre', 'day', 'piece'];

export default function Expenses() {
  const t = useT();
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({ date: today(), category: 'fodder_green', amount: '', qty: '', unit: 'kg', animal_id: '', herd_id: '', vendor: '', notes: '' });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const m0 = firstDayOfMonth(today()), m1 = lastDayOfMonth(today());
  const { data, reload } = useLoad(async () => ({
    rows: await list('expenses', { orderBy: 'date DESC, created_at DESC', limit: 60 }),
    animals: await list('animals', { where: `status='active'`, orderBy: 'nickname' }),
    herds: await list('herds', { orderBy: 'name' }),
    month: await list('expenses', { where: 'date BETWEEN ? AND ?', params: [m0, m1] }),
  }), { rows: [] as DbRow[], animals: [] as DbRow[], herds: [] as DbRow[], month: [] as DbRow[] }, []);

  const total = data.month.reduce((s, x) => s + x.amount, 0);
  const save = () => run(async () => {
    const a = toNum(f.amount);
    if (a <= 0 || a > 10_000_000) return toast(t('Amount'), t('Enter a valid amount.'));
    if (f.date > today()) return toast(t('Date'), t('Date is in the future.'));
    await insert('expenses', {
      date: f.date, category: f.category, amount: a, qty: f.qty ? toNum(f.qty) : null, unit: f.qty ? f.unit : null,
      animal_id: f.animal_id || null, herd_id: f.animal_id ? null : f.herd_id || null, vendor: f.vendor, notes: f.notes,
    });
    setF({ ...f, amount: '', qty: '', vendor: '', notes: '' });
    await reload();
  });

  return (
    <Screen>
      <Title>{t('Expenses')}</Title>
      <Card tone="warn"><KV k={t('This month')} v={formatINR(total, 0)} bold /></Card>
      <SectionTitle>{t('Add expense')}</SectionTitle>
      <Card>
        <DateField label={t('Date')} value={f.date} onChange={v => set('date', v)} />
        <Chips label={t('Category')} value={f.category} onChange={v => set('category', v)} options={EXPENSE_CATEGORIES.map(c => ({ value: c.key, label: c.label }))} />
        <NumField label={t('Amount (₹)')} value={f.amount} onChangeText={v => set('amount', v)} />
        {['fodder_green', 'fodder_dry', 'vaikkol', 'rice_bran', 'concentrate'].includes(f.category) ? (
          <>
            <NumField label={t('Quantity (optional)')} value={f.qty} onChangeText={v => set('qty', v)} />
            {f.qty ? <Chips value={f.unit} onChange={v => set('unit', v)} options={UNITS.map(u => ({ value: u, label: u }))} /> : null}
          </>
        ) : null}
        <PickerField label={t('For one animal (optional)')} value={f.animal_id} onChange={v => set('animal_id', v)} allowEmpty options={data.animals.map(a => ({ value: a.id, label: a.nickname }))} />
        {!f.animal_id ? <PickerField label={t('For a herd (optional)')} value={f.herd_id} onChange={v => set('herd_id', v)} allowEmpty options={data.herds.map(h => ({ value: h.id, label: h.name }))} /> : null}
        <Field label={t('Shop / person')} value={f.vendor} onChangeText={v => set('vendor', v)} />
        <Field label={t('Note')} value={f.notes} onChangeText={v => set('notes', v)} />
        <Btn title={t('Save expense')} onPress={save} loading={busy} />
      </Card>
      <SectionTitle>{t('Recent')}</SectionTitle>
      {data.rows.length === 0 ? <Empty icon="cash-minus" text={t('No expenses yet')} /> : data.rows.map(x => (
        <Card key={x.id} style={{ marginBottom: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{t(EXPENSE_CATEGORIES.find(c => c.key === x.category)?.label ?? x.category)}</Txt>
              <Txt v="small">{fmtDate(x.date)}{x.qty ? ` · ${x.qty} ${x.unit}` : ''}{x.vendor ? ` · ${x.vendor}` : ''}{x.animal_id ? ` · ${data.animals.find(a => a.id === x.animal_id)?.nickname ?? ''}` : ''}</Txt>
            </View>
            <Txt style={{ fontWeight: '700' }}>{formatINR(x.amount, 0)}</Txt>
            <Btn small v="ghost" icon="delete" title="" onPress={async () => { if (await confirm(t('Delete expense?'), formatINR(x.amount, 0), t('Delete'), t('Cancel'), true)) { await remove('expenses', x.id); reload(); } }} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
