import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, KV, NumField, Row, Screen, SectionTitle, Stat, Txt, toast, S, C, Banner } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { insert, list, Row as DbRow } from '../../src/db/repo';
import { addDays, firstDayOfMonth, lastDayOfMonth, today, toISODate, parseISODate } from '../../src/lib/dates';
import { formatINR, toNum } from '../../src/lib/money';
import { perAnimalPnL, summarize } from '../../src/lib/finance';
import { EXPENSE_CATEGORIES, INCOME_KINDS } from '../../src/lib/constants';

function rangeFor(k: string): { from: string; to: string } {
  const d = today();
  if (k === 'month') return { from: firstDayOfMonth(d), to: lastDayOfMonth(d) };
  if (k === 'last') { const p = addDays(firstDayOfMonth(d), -1); return { from: firstDayOfMonth(p), to: lastDayOfMonth(p) }; }
  if (k === '90') return { from: addDays(d, -89), to: d };
  if (k === 'year') { const y = parseISODate(d).getFullYear(); return { from: `${y}-01-01`, to: `${y}-12-31` }; }
  return { from: d, to: d };
}

export default function Finance() {
  const t = useT();
  const r = useRouter();
  const { busy, run } = useBusy();
  const [k, setK] = useState('month');
  const [panel, setPanel] = useState<'' | 'income' | 'saving'>('');
  const [f, setF] = useState<any>({ date: today(), kind: 'animal_sale', amount: '', notes: '' });

  const p = rangeFor(k);
  const { data, reload } = useLoad(async () => ({
    milk: await list('milk_entries', { where: 'date BETWEEN ? AND ?', params: [p.from, p.to] }),
    inc: await list('incomes', { where: 'date BETWEEN ? AND ?', params: [p.from, p.to] }),
    exp: await list('expenses', { where: 'date BETWEEN ? AND ?', params: [p.from, p.to] }),
    sav: await list('savings_log'),
    animals: await list('animals'),
  }), { milk: [] as DbRow[], inc: [] as DbRow[], exp: [] as DbRow[], sav: [] as DbRow[], animals: [] as DbRow[] }, [k]);

  const s = summarize(p, data.milk as any, data.inc as any, data.exp as any, data.sav as any);
  const totalSaved = data.sav.reduce((a, x) => a + x.amount, 0);
  const pnl = perAnimalPnL(p, data.animals as any, data.milk as any, data.inc as any, data.exp as any).sort((a, b) => b.net - a.net);
  const maxExp = Math.max(1, ...Object.values(s.expenseByCategory));

  const addIncome = () => run(async () => {
    const a = toNum(f.amount);
    if (a <= 0) return toast(t('Amount'), t('Enter an amount.'));
    if (panel === 'income') await insert('incomes', { date: f.date, kind: f.kind, amount: a, notes: f.notes });
    else await insert('savings_log', { date: f.date, amount: a, notes: f.notes });
    setPanel(''); setF({ date: today(), kind: 'animal_sale', amount: '', notes: '' });
    await reload();
  });

  return (
    <Screen>
      <Title>{t('Profit & loss')}</Title>
      <Chips value={k} onChange={setK} options={[{ value: 'day', label: 'Today' }, { value: 'month', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: '90', label: '90 days' }, { value: 'year', label: 'This year' }]} />
      <Card tone={s.net >= 0 ? 'ok' : 'danger'}>
        <Txt v="small">{s.net >= 0 ? t('Net profit') : t('Net loss')}</Txt>
        <Txt v="big" color={s.net >= 0 ? C.ok : C.danger}>{formatINR(s.net, 0)}</Txt>
      </Card>
      <View style={{ height: S.sm }} />
      <Row gap={S.sm}>
        <Stat label={t('Income')} value={formatINR(s.income, 0)} color={C.ok} />
        <Stat label={t('Expense')} value={formatINR(s.expense, 0)} color={C.danger} />
      </Row>
      <View style={{ height: S.sm }} />
      <Card>
        <KV k={t('Milk sales')} v={formatINR(s.milkIncome, 0)} />
        <KV k={t('Other income')} v={formatINR(s.otherIncome, 0)} />
        <KV k={t('Saved this period')} v={formatINR(s.savings, 0)} />
        <KV k={t('Total savings so far')} v={formatINR(totalSaved, 0)} bold />
        <KV k={t('Cash left after savings')} v={formatINR(s.cashAfterSavings, 0)} bold />
      </Card>
      <Row style={{ flexWrap: 'wrap', marginTop: S.md }}>
        <Btn small icon="cash-plus" title={t('Add income')} onPress={() => setPanel(panel === 'income' ? '' : 'income')} />
        <Btn small icon="piggy-bank" v="secondary" title={t('Add to savings')} onPress={() => setPanel(panel === 'saving' ? '' : 'saving')} />
        <Btn small icon="cash-minus" v="secondary" title={t('Add expense')} onPress={() => r.push('/finance/expenses')} />
      </Row>
      {panel ? (
        <Card style={{ marginTop: S.md }}>
          <DateField label={t('Date')} value={f.date} onChange={v => setF({ ...f, date: v })} />
          {panel === 'income' ? <Chips label={t('Type')} value={f.kind} onChange={v => setF({ ...f, kind: v })} options={INCOME_KINDS.map(x => ({ value: x.key, label: x.label }))} /> : null}
          <NumField label={t('Amount (₹)')} value={f.amount} onChangeText={v => setF({ ...f, amount: v })} />
          <Field label={t('Note')} value={f.notes} onChangeText={v => setF({ ...f, notes: v })} />
          <Btn title={t('Save')} onPress={addIncome} loading={busy} />
        </Card>
      ) : null}

      <SectionTitle>{t('Where the money goes')}</SectionTitle>
      <Card>
        {Object.keys(s.expenseByCategory).length === 0 ? <Txt v="small">{t('No expenses in this period')}</Txt> :
          Object.entries(s.expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, v]) => (
            <View key={cat} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt v="small">{t(EXPENSE_CATEGORIES.find(c => c.key === cat)?.label ?? cat)}</Txt>
                <Txt v="small" style={{ fontWeight: '700' }}>{formatINR(v, 0)}</Txt>
              </Row>
              <View style={{ height: 8, backgroundColor: C.primarySoft, borderRadius: 4 }}>
                <View style={{ height: 8, width: `${Math.max(3, (v / maxExp) * 100)}%`, backgroundColor: C.primary, borderRadius: 4 }} />
              </View>
            </View>
          ))}
      </Card>

      <SectionTitle>{t('Profit per animal')}</SectionTitle>
      <Banner tone="info" text={t('Own costs and milk are exact. Costs not tagged to any animal (labor, transport...) are shared equally by head count, so treat those as an estimate.')} />
      {pnl.length === 0 ? <Card><Txt v="small">{t('No animals')}</Txt></Card> : pnl.map(x => (
        <Card key={x.animal.id} style={{ marginBottom: 6 }} onPress={() => r.push(`/animal/${x.animal.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{x.animal.nickname}</Txt>
              <Txt v="small">{t('Income')} {formatINR(x.income, 0)} · {t('Cost')} {formatINR(x.directExpense + x.sharedExpense, 0)}</Txt>
            </View>
            <Txt v="h2" color={x.net >= 0 ? C.ok : C.danger}>{formatINR(x.net, 0)}</Txt>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
