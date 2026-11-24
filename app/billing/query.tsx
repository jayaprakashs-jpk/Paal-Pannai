import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, KV, NumField, PickerField, Row, Screen, SectionTitle, Txt, confirm, toast, Spacer, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { fmtDate, fmtDateTime, today } from '../../src/lib/dates';
import { formatINR, round2, toNum } from '../../src/lib/money';
import { openWhatsApp } from '../../src/services/share';
import { useBusy } from '../../src/lib/hooks';

export default function Query() {
  const t = useT();
  const r = useRouter();
  const p = useLocalSearchParams<{ id?: string; billId?: string }>();
  const { busy, run } = useBusy();
  const [id, setId] = useState(p.id);
  const [buyers, setBuyers] = useState<DbRow[]>([]);
  const [bills, setBills] = useState<DbRow[]>([]);
  const [updates, setUpdates] = useState<DbRow[]>([]);
  const [note, setNote] = useState('');
  const [f, setF] = useState<any>({ party_id: '', bill_id: p.billId ?? '', title: '', expected: '', received: '', status: 'open', raised_on: today(), resolution_note: '' });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  const load = async () => {
    setBuyers(await list('buyers', { orderBy: 'name' }));
    setBills(await list('bills', { orderBy: 'period_end DESC' }));
    if (id) {
      const q = await getById<DbRow>('payment_queries', id);
      if (q) setF({ party_id: q.party_id, bill_id: q.bill_id ?? '', title: q.title, expected: String(q.expected_amount ?? ''), received: String(q.received_amount ?? ''), status: q.status, raised_on: q.raised_on, resolution_note: q.resolution_note ?? '' });
      setUpdates(await list('query_updates', { where: 'query_id = ?', params: [id], orderBy: 'at DESC' }));
    }
  };
  useEffect(() => { load(); }, [id]);
  // prefill from a bill
  useEffect(() => {
    if (id || !f.bill_id) return;
    getById<DbRow>('bills', f.bill_id).then(b => b && setF((x: any) => ({ ...x, party_id: b.party_id, expected: String(b.total), received: String(b.paid_amount), title: `${b.bill_no} ${t('amount short')}` })));
  }, [f.bill_id]);

  const missing = round2(toNum(f.expected) - toNum(f.received));

  const save = () => run(async () => {
    if (!f.party_id) return toast(t('Pick buyer'), t('Choose who owes the money.'));
    if (!f.title.trim()) return toast(t('Title needed'), t('Write what is missing.'));
    if (missing <= 0 && f.status !== 'resolved') return toast(t('Amount'), t('Expected amount must be more than received.'));
    const row = {
      party_id: f.party_id, bill_id: f.bill_id || null, title: f.title.trim(), expected_amount: toNum(f.expected), received_amount: toNum(f.received),
      missing_amount: Math.max(0, missing), status: f.status, raised_on: f.raised_on,
      resolved_on: f.status === 'resolved' || f.status === 'rejected' ? today() : null, resolution_note: f.resolution_note,
    };
    if (id) await update('payment_queries', id, row);
    else { const q = await insert<DbRow>('payment_queries', row); setId(q.id); }
    toast(t('Saved'));
  });

  const addNote = async () => {
    if (!id || !note.trim()) return;
    await insert('query_updates', { query_id: id, note: note.trim(), at: new Date().toISOString() });
    setNote(''); await load();
  };

  const party = buyers.find(b => b.id === f.party_id);
  const msg = `${t('Hello')} ${party?.name ?? ''}, ${f.title}. ${t('Expected')} ${formatINR(toNum(f.expected))}, ${t('received')} ${formatINR(toNum(f.received))}, ${t('missing')} ${formatINR(Math.max(0, missing))}. ${t('Please check and clear.')}`;

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{id ? t('Query') : t('New missing amount query')}</Title>
      <Card>
        <PickerField label={t('Buyer / agent / company')} value={f.party_id} onChange={v => set('party_id', v)} options={buyers.map(b => ({ value: b.id, label: b.name }))} />
        <PickerField label={t('Related bill (optional)')} value={f.bill_id} onChange={v => set('bill_id', v)} allowEmpty
          options={bills.filter(b => !f.party_id || b.party_id === f.party_id).map(b => ({ value: b.id, label: `${b.bill_no} · ${formatINR(b.total, 0)}` }))} />
        <Field label={t('What is the problem?')} value={f.title} onChangeText={v => set('title', v)} placeholder={t('e.g. Last month payment short')} />
        <Row gap={S.md}>
          <View style={{ flex: 1 }}><NumField label={t('Should have got (₹)')} value={f.expected} onChangeText={v => set('expected', v)} /></View>
          <View style={{ flex: 1 }}><NumField label={t('Actually got (₹)')} value={f.received} onChangeText={v => set('received', v)} /></View>
        </Row>
        <Card tone={missing > 0 ? 'warn' : 'ok'}><KV k={t('Missing amount')} v={formatINR(Math.max(0, missing))} bold /></Card>
        <View style={{ height: S.md }} />
        <DateField label={t('Raised on')} value={f.raised_on} onChange={v => set('raised_on', v)} />
        <Chips label={t('Status')} value={f.status} onChange={v => set('status', v)} options={[{ value: 'open', label: 'Open' }, { value: 'in_progress', label: 'In progress' }, { value: 'resolved', label: 'Resolved' }, { value: 'rejected', label: 'Rejected' }]} />
        {f.status === 'resolved' || f.status === 'rejected' ? <Field label={t('How was it settled?')} value={f.resolution_note} onChangeText={v => set('resolution_note', v)} multiline /> : null}
        {party?.phone ? <Btn small v="secondary" icon="whatsapp" title={t('Message them')} onPress={() => openWhatsApp(party.phone, msg)} /> : null}
      </Card>

      {id ? (
        <>
          <SectionTitle>{t('Follow-up notes')}</SectionTitle>
          <Card>
            <Field value={note} onChangeText={setNote} placeholder={t('e.g. Called agent, he promised on Friday')} />
            <Btn small title={t('Add note')} onPress={addNote} />
          </Card>
          {updates.map(u => <Card key={u.id} style={{ marginTop: 6 }}><Txt v="small">{fmtDateTime(u.at)}</Txt><Txt>{u.note}</Txt></Card>)}
          <Spacer />
          <Btn v="ghost" title={t('Delete query')} onPress={async () => { if (await confirm(t('Delete query?'), '', t('Delete'), t('Cancel'), true)) { await remove('payment_queries', id); r.back(); } }} />
        </>
      ) : null}
    </Screen>
  );
}
