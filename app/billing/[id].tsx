import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, KV, NumField, Row, Screen, SectionTitle, Txt, confirm, toast, Spacer, S, C, Icon, Badge } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { QR } from '../../src/ui/QR';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { getById, getFarm, insert, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { PAYMENT_MODES } from '../../src/lib/constants';
import { billStatus, dueAmount, upiUri } from '../../src/lib/billing';
import { fmtDate, fmtDateTime } from '../../src/lib/dates';
import { formatINR, toNum } from '../../src/lib/money';
import { recomputePaid, refreshBill } from '../../src/services/billingData';
import { billHtml, billText, openWhatsApp, sharePdf } from '../../src/services/share';
import { cycleLabel } from '../../src/lib/labels';

export default function BillDetail() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { busy, run } = useBusy();
  const [showQr, setShowQr] = useState(false);
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [on, setOn] = useState(new Date().toISOString());
  const [showItems, setShowItems] = useState(false);

  const { data, reload } = useLoad(async () => {
    const bill = await getById<DbRow>('bills', id);
    if (!bill) return null;
    return {
      bill, party: await getById<DbRow>('buyers', bill.party_id), farm: await getFarm(),
      payments: await list('payments', { where: 'bill_id = ?', params: [id], orderBy: 'paid_at DESC' }),
    };
  }, null as any, [id]);
  if (!data) return <Screen><Title>{t('Bill')}</Title></Screen>;
  const { bill, party, farm, payments } = data as { bill: DbRow; party: DbRow | null; farm: DbRow | null; payments: DbRow[] };
  const due = dueAmount(bill.total, bill.paid_amount);
  const items: any[] = Array.isArray(bill.items) ? bill.items : [];

  const addPayment = () => run(async () => {
    const a = toNum(amt, 0);
    if (a <= 0) return toast(t('Amount'), t('Enter the amount received.'));
    if (a > due + 0.005 && !(await confirm(t('More than due'), t('Amount is more than the balance {d}. Save anyway?', { d: formatINR(due) }), t('Save'), t('Cancel')))) return;
    await insert('payments', { bill_id: id, party_id: bill.party_id, amount: a, mode, reference: ref, paid_at: on });
    await recomputePaid(id);
    setAmt(''); setRef('');
    await reload();
  });

  const share = (kind: 'pdf' | 'wa') => run(async () => {
    try {
      if (kind === 'pdf') await sharePdf(billHtml(bill, party, farm, payments), bill.bill_no);
      else await openWhatsApp(party?.phone, billText(bill, party, farm));
    } catch (e: any) { toast(t('Could not share'), String(e?.message ?? e)); }
  });

  const upi = farm?.upi_id ? upiUri(farm.upi_id, farm.owner_name || farm.farm_name || 'Farm', due, bill.bill_no) : null;

  return (
    <Screen>
      <Title>{bill.bill_no}</Title>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">{party?.name ?? '-'}</Txt>
          <Badge tone={bill.status === 'paid' ? 'ok' : bill.status === 'part_paid' ? 'warn' : 'danger'} text={t(bill.status === 'paid' ? 'Paid' : bill.status === 'part_paid' ? 'Part paid' : 'Unpaid')} />
        </Row>
        <Txt v="small">{fmtDate(bill.period_start)} - {fmtDate(bill.period_end)} · {t(cycleLabel(bill.cycle))}</Txt>
        <View style={{ height: S.sm }} />
        <KV k={t('Milk')} v={`${bill.total_litres} L`} />
        <KV k={t('Subtotal')} v={formatINR(bill.subtotal)} />
        {bill.deductions ? <KV k={t('Deductions')} v={`-${formatINR(bill.deductions)}`} /> : null}
        <KV k={t('Bill total')} v={formatINR(bill.total)} bold />
        <KV k={t('Paid')} v={formatINR(bill.paid_amount)} color={C.ok} />
        <KV k={t('Balance due')} v={formatINR(due)} bold color={due > 0 ? C.danger : C.ok} />
      </Card>

      <Row style={{ flexWrap: 'wrap', marginTop: S.md }}>
        <Btn small icon="file-pdf-box" title={t('Share PDF')} onPress={() => share('pdf')} disabled={busy} />
        <Btn small icon="whatsapp" v="secondary" title="WhatsApp" onPress={() => share('wa')} disabled={busy} />
        <Btn small icon="refresh" v="ghost" title={t('Refresh from entries')} onPress={() => run(async () => { await refreshBill(id); await reload(); })} />
      </Row>

      <Pressable onPress={() => setShowItems(!showItems)}>
        <SectionTitle right={<Icon name={showItems ? 'chevron-up' : 'chevron-down'} />}>{t('Milk lines')} ({items.length})</SectionTitle>
      </Pressable>
      {showItems ? (
        <Card>
          {items.map((i, k) => (
            <Row key={k} style={{ justifyContent: 'space-between', paddingVertical: 3 }}>
              <Txt v="small" style={{ flex: 1 }}>{fmtDate(i.date)} {i.session === 'morning' ? 'AM' : i.session === 'evening' ? 'PM' : i.session}</Txt>
              <Txt v="small" style={{ flex: 1.2 }}>{i.litres}L{i.fat ? ` F${i.fat}` : ''}{i.snf ? ` S${i.snf}` : ''}</Txt>
              <Txt style={{ flex: 0.8, textAlign: 'right' }}>{formatINR(i.amount, 0)}</Txt>
            </Row>
          ))}
        </Card>
      ) : null}

      <SectionTitle>{t('Payments')}</SectionTitle>
      {payments.map(p => (
        <Card key={p.id} style={{ marginBottom: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{formatINR(p.amount)} · {t(PAYMENT_MODES.find(m => m.key === p.mode)?.label ?? p.mode)}</Txt>
              <Txt v="small">{fmtDateTime(p.paid_at)}{p.reference ? ' · ' + p.reference : ''}</Txt>
            </View>
            <Btn small v="ghost" title={t('Delete')} onPress={async () => {
              if (!(await confirm(t('Delete payment?'), formatINR(p.amount), t('Delete'), t('Cancel'), true))) return;
              await remove('payments', p.id); await recomputePaid(id); await reload();
            }} />
          </Row>
        </Card>
      ))}
      {due > 0 ? (
        <Card>
          <Txt v="label" style={{ marginBottom: 6 }}>{t('Record a payment received')}</Txt>
          <NumField label={t('Amount (₹)')} value={amt} onChangeText={setAmt} placeholder={String(due)} />
          <Row style={{ marginBottom: S.sm }}><Btn small v="secondary" title={t('Full balance')} onPress={() => setAmt(String(due))} /></Row>
          <Chips label={t('Paid by')} value={mode} onChange={setMode} options={PAYMENT_MODES.map(m => ({ value: m.key, label: m.label }))} />
          {mode !== 'cash' ? <Field label={t('Reference / UTR / UPI txn no.')} value={ref} onChangeText={setRef} autoCapitalize="none" /> : null}
          <DateField label={t('Received on')} mode="datetime" value={on} onChange={setOn} />
          <Btn title={t('Save payment')} onPress={addPayment} loading={busy} />
        </Card>
      ) : null}

      {due > 0 ? (
        <Card style={{ marginTop: S.md }}>
          <Txt v="label" style={{ marginBottom: 6 }}>{t('Ask the buyer to pay you online')}</Txt>
          {upi ? <Btn icon="qrcode" v="secondary" title={t('Show UPI QR for {a}', { a: formatINR(due, 0) })} onPress={() => setShowQr(true)} /> : (
            <Btn v="ghost" icon="plus" title={t('Add your UPI ID in Farm profile')} onPress={() => r.push('/profile')} />
          )}
          {farm?.bank_account_no ? (
            <View style={{ marginTop: S.sm }}>
              <KV k={t('Account name')} v={farm.bank_holder ?? '-'} />
              <KV k={t('Account number')} v={farm.bank_account_no} />
              <KV k="IFSC" v={farm.bank_ifsc ?? '-'} />
            </View>
          ) : null}
        </Card>
      ) : null}

      <Spacer />
      <Row>
        <View style={{ flex: 1 }}><Btn v="secondary" icon="help-circle" title={t('Missing amount?')} onPress={() => r.push(`/billing/query?billId=${id}`)} /></View>
      </Row>
      <Spacer h={8} />
      <Btn v="ghost" title={t('Delete bill')} onPress={async () => {
        if (!(await confirm(t('Delete bill?'), bill.bill_no, t('Delete'), t('Cancel'), true))) return;
        for (const p of payments) await remove('payments', p.id);
        await remove('bills', id); r.back();
      }} />

      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <Pressable onPress={() => setShowQr(false)} style={{ flex: 1, backgroundColor: '#000A', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 16, alignItems: 'center' }}>
            {upi ? <QR value={upi} size={260} /> : null}
            <Txt v="h2" style={{ marginTop: 10 }}>{formatINR(due)}</Txt>
            <Txt v="small">{farm?.upi_id}</Txt>
            <Txt v="small">{t('Tap anywhere to close')}</Txt>
          </View>
        </Pressable>
      </Modal>
    </Screen>
  );
}
