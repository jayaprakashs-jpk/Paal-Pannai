import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Btn, Card, Chips, DateField, Empty, KV, ListItem, NumField, PickerField, Row, Screen, SectionTitle, Txt, confirm, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { list, Row as DbRow } from '../../src/db/repo';
import { CYCLES } from '../../src/lib/constants';
import { Cycle, dueAmount, periodFor, previousPeriod } from '../../src/lib/billing';
import { fmtDate, today } from '../../src/lib/dates';
import { formatINR, toNum } from '../../src/lib/money';
import { createBill, previewBill, BillPreview } from '../../src/services/billingData';

export default function Billing() {
  const t = useT();
  const r = useRouter();
  const { busy, run } = useBusy();
  const [party, setParty] = useState('');
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [anchor, setAnchor] = useState(today());
  const [ded, setDed] = useState('');
  const [filter, setFilter] = useState('all');
  const [pv, setPv] = useState<BillPreview | null>(null);

  const { data, reload } = useLoad(async () => ({
    buyers: await list('buyers', { orderBy: 'name COLLATE NOCASE' }),
    bills: await list('bills', { orderBy: 'period_end DESC, created_at DESC' }),
  }), { buyers: [] as DbRow[], bills: [] as DbRow[] }, []);

  const period = useMemo(() => periodFor(cycle, anchor), [cycle, anchor]);
  useEffect(() => { if (party) previewBill(party, period.start, period.end, toNum(ded)).then(setPv); else setPv(null); }, [party, period, ded, data.bills.length]);

  const existing = data.bills.find(b => b.party_id === party && b.cycle === cycle && b.period_start === period.start);

  const make = () => run(async () => {
    if (!party) return toast(t('Pick buyer'), t('Choose who the bill is for.'));
    if (!pv || pv.lines.length === 0) return toast(t('Nothing to bill'), t('No priced milk entries for this buyer in this period.'));
    if (period.end > today() && !(await confirm(t('Period not finished'), t('This period ends on {d}. Bill now with entries so far?', { d: fmtDate(period.end) }), t('Bill now'), t('Cancel')))) return;
    if (pv.unpriced > 0 && !(await confirm(t('Entries without rate'), t('{n} entries have no rate and will be left out. Add the rate first, or continue?', { n: pv.unpriced }), t('Continue'), t('Cancel')))) return;
    if (existing && !(await confirm(t('Bill exists'), t('A bill for this buyer and period already exists. Create another?'), t('Create'), t('Cancel')))) return;
    const b = await createBill(party, cycle, anchor, toNum(ded));
    await reload();
    r.push(`/billing/${b.id}`);
  });

  const bills = data.bills.filter(b => filter === 'all' || (filter === 'due' ? b.status !== 'paid' : b.status === 'paid'));
  const buyerName = (id: string) => data.buyers.find(b => b.id === id)?.name ?? '-';
  const totalDue = data.bills.reduce((s, b) => s + dueAmount(b.total, b.paid_amount), 0);

  return (
    <Screen>
      <Title>{t('Bills & payments')}</Title>
      <Card tone={totalDue > 0 ? 'warn' : 'ok'}>
        <KV k={t('Total pending from buyers')} v={formatINR(totalDue)} bold color={totalDue > 0 ? C.warn : C.ok} />
      </Card>

      <SectionTitle>{t('Make a bill')}</SectionTitle>
      <Card>
        <PickerField label={t('Buyer')} value={party} onChange={setParty} options={data.buyers.map(b => ({ value: b.id, label: b.name }))} />
        <Chips label={t('Billing cycle')} value={cycle} onChange={v => setCycle(v as Cycle)} options={CYCLES.map(c => ({ value: c.key, label: c.label }))} />
        <DateField label={t('Any date in the period')} value={anchor} onChange={setAnchor} />
        <Row style={{ marginBottom: S.md }}>
          <Btn small v="ghost" title={t('Previous period')} onPress={() => setAnchor(previousPeriod(cycle, period).start)} />
          <Btn small v="ghost" title={t('Today')} onPress={() => setAnchor(today())} />
        </Row>
        <NumField label={t('Deductions (₹) e.g. cattle feed advance')} value={ded} onChangeText={setDed} />
        <Card tone="info" style={{ marginBottom: S.md }}>
          <KV k={t('Period')} v={period.start === period.end ? fmtDate(period.start) : `${fmtDate(period.start)} - ${fmtDate(period.end)}`} />
          {pv ? (
            <>
              <KV k={t('Milk')} v={`${pv.totals.totalLitres} L`} />
              <KV k={t('Total')} v={formatINR(pv.totals.total)} bold />
              {pv.unpriced > 0 ? <Txt v="small" color={C.warn}>{t('{n} entries have no rate yet', { n: pv.unpriced })}</Txt> : null}
            </>
          ) : <Txt v="small">{t('Choose a buyer to preview')}</Txt>}
        </Card>
        <Btn icon="receipt-text" title={t('Generate bill')} onPress={make} loading={busy} />
      </Card>

      <SectionTitle>{t('Bills')}</SectionTitle>
      <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'due', label: 'Pending' }, { value: 'paid', label: 'Paid' }]} />
      {bills.length === 0 ? <Empty icon="receipt-text" text={t('No bills yet')} /> : bills.map(b => (
        <ListItem key={b.id} icon="receipt-text" title={`${buyerName(b.party_id)} · ${formatINR(b.total, 0)}`}
          subtitle={`${b.bill_no} · ${fmtDate(b.period_start)} - ${fmtDate(b.period_end)}${dueAmount(b.total, b.paid_amount) > 0 ? ' · ' + t('Due') + ' ' + formatINR(dueAmount(b.total, b.paid_amount), 0) : ''}`}
          badge={<Badge tone={b.status === 'paid' ? 'ok' : b.status === 'part_paid' ? 'warn' : 'danger'} text={t(b.status === 'paid' ? 'Paid' : b.status === 'part_paid' ? 'Part paid' : 'Unpaid')} />}
          onPress={() => r.push(`/billing/${b.id}`)} />
      ))}
    </Screen>
  );
}
