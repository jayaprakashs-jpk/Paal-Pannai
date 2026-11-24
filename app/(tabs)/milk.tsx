import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Empty, Field, KV, NumField, PickerField, Row, Screen, SectionTitle, Toggle, Txt, confirm, toast, S, C } from '../../src/ui';
import { useT } from '../../src/i18n';
import { useLoad, useBusy } from '../../src/lib/hooks';
import { insert, list, raw, remove, Row as DbRow } from '../../src/db/repo';
import { kvGet, kvSet } from '../../src/db/client';
import { today, fmtDate } from '../../src/lib/dates';
import { toNum, formatINR } from '../../src/lib/money';
import { allRates, milkTypeOf, priceEntry } from '../../src/services/milkRates';
import { ratePerLitre, pickRate, milkAmount } from '../../src/lib/milk';
import { statusLabel } from '../../src/lib/labels';

const MILKERS = ['cow', 'buffalo', 'goat', 'sheep'];

export default function MilkTab() {
  const t = useT();
  const r = useRouter();
  const { busy, run } = useBusy();
  const [date, setDate] = useState(today());
  const [session, setSession] = useState(new Date().getHours() < 12 ? 'morning' : 'evening');
  const [scope, setScope] = useState<'animal' | 'herd' | 'farm'>('animal');
  const [animalId, setAnimalId] = useState('');
  const [herdId, setHerdId] = useState('');
  const [buyerId, setBuyerId] = useState('');
  const [litres, setLitres] = useState('');
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [sold, setSold] = useState(true);

  const { data, reload } = useLoad(async () => ({
    animals: (await list('animals', { where: `status='active'`, orderBy: 'nickname' })).filter(a => MILKERS.includes(a.species)),
    herds: await list('herds', { orderBy: 'name' }),
    buyers: await list('buyers', { where: 'is_active = 1', orderBy: 'name' }),
    rates: await allRates(),
    todayRows: await raw<DbRow>(
      `SELECT m.*, a.nickname, h.name AS herd_name, b.name AS buyer_name FROM milk_entries m
         LEFT JOIN animals a ON a.id = m.animal_id LEFT JOIN herds h ON h.id = m.herd_id LEFT JOIN buyers b ON b.id = m.buyer_id
        WHERE m.date = ? AND m.deleted_at IS NULL ORDER BY m.created_at DESC`, [today()]),
  }), { animals: [] as DbRow[], herds: [] as DbRow[], buyers: [] as DbRow[], rates: [] as any[], todayRows: [] as DbRow[] }, []);

  useEffect(() => { kvGet('milk.lastBuyer').then(v => v && setBuyerId(v)); }, []);

  const animal = data.animals.find(a => a.id === animalId);
  const mt = scope === 'animal' ? milkTypeOf(animal?.species) : 'any';
  const fatN = fat ? toNum(fat) : null;
  const snfN = snf ? toNum(snf) : null;
  const litresN = toNum(litres);

  const preview = useMemo(() => {
    if (!buyerId || !litresN) return null;
    const card = pickRate(data.rates, buyerId, date, mt);
    if (!card) return { missing: true as const };
    const rate = ratePerLitre(card, fatN, snfN);
    return { missing: false as const, rate, amount: milkAmount(litresN, rate) };
  }, [data.rates, buyerId, date, mt, litresN, fatN, snfN]);

  const save = (next: boolean) => run(async () => {
    if (litresN <= 0 || litresN > 200) return toast(t('Litres'), t('Enter litres between 0 and 200.'));
    if (fatN != null && (fatN < 0.5 || fatN > 15)) return toast(t('Fat %'), t('Fat looks wrong. Normal is 2.5 to 9.'));
    if (snfN != null && (snfN < 5 || snfN > 12)) return toast(t('SNF %'), t('SNF looks wrong. Normal is 7.5 to 10.'));
    if (scope === 'animal' && !animalId) return toast(t('Pick animal'), t('Choose which animal gave this milk.'));
    if (scope === 'herd' && !herdId) return toast(t('Pick herd'), t('Choose the herd.'));
    if (date > today()) return toast(t('Date'), t('Date is in the future.'));

    const dup = await raw<{ c: number }>(
      `SELECT COUNT(*) AS c FROM milk_entries WHERE date = ? AND session = ? AND deleted_at IS NULL
         AND COALESCE(animal_id,'') = ? AND COALESCE(herd_id,'') = ?`,
      [date, session, scope === 'animal' ? animalId : '', scope === 'herd' ? herdId : '']);
    if (dup[0]?.c) {
      const ok = await confirm(t('Already entered'), t('There is already an entry for this {s} session. Add another?', { s: t(statusLabel(session)) }), t('Add'), t('Cancel'));
      if (!ok) return;
    }
    const p = sold ? await priceEntry(buyerId, date, litresN, fatN, snfN, mt, data.rates) : { rate: null, amount: null };
    await insert('milk_entries', {
      date, session, animal_id: scope === 'animal' ? animalId : null, herd_id: scope === 'herd' ? herdId : null,
      litres: litresN, fat: fatN, snf: snfN, buyer_id: sold && buyerId ? buyerId : null,
      rate_per_litre: p.rate, amount: p.amount, sold, source: 'manual', milk_type: mt,
    });
    if (buyerId) await kvSet('milk.lastBuyer', buyerId);
    setLitres(''); setFat(''); setSnf('');
    if (next && scope === 'animal') {
      const i = data.animals.findIndex(a => a.id === animalId);
      const n = data.animals[(i + 1) % Math.max(1, data.animals.length)];
      if (n) setAnimalId(n.id);
    }
    await reload();
  });

  const totals = useMemo(() => {
    let m = 0, e = 0, amt = 0;
    for (const x of data.todayRows) { if (x.session === 'morning') m += x.litres; else e += x.litres; if (x.sold) amt += x.amount ?? 0; }
    return { m, e, amt };
  }, [data.todayRows]);

  return (
    <Screen>
      <Row style={{ gap: S.sm, marginBottom: S.md }}>
        <View style={{ flex: 1 }}><DateField value={date} onChange={setDate} /></View>
        <View style={{ flex: 1.2 }}>
          <Chips value={session} onChange={setSession} options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }]} />
        </View>
      </Row>
      <Card>
        <Chips value={scope} onChange={v => setScope(v as any)}
          options={[{ value: 'animal', label: 'One cow' }, { value: 'herd', label: 'Herd total' }, { value: 'farm', label: 'Farm total' }]} />
        {scope === 'animal' ? (
          <PickerField label={t('Animal')} value={animalId} onChange={setAnimalId} placeholder={data.animals.length ? t('Select') : t('Add a milking animal first')}
            options={data.animals.map(a => ({ value: a.id, label: `${a.nickname}${a.tag_id ? ' · ' + a.tag_id : ''}` }))} />
        ) : null}
        {scope === 'herd' ? (
          <PickerField label={t('Herd')} value={herdId} onChange={setHerdId} options={data.herds.map(h => ({ value: h.id, label: h.name }))} />
        ) : null}
        <NumField label={t('Litres')} value={litres} onChangeText={setLitres} suffix="L" />
        <Row gap={S.md}>
          <View style={{ flex: 1 }}><NumField label={t('Fat %')} value={fat} onChangeText={setFat} suffix="%" /></View>
          <View style={{ flex: 1 }}><NumField label={t('SNF %')} value={snf} onChangeText={setSnf} suffix="%" /></View>
        </Row>
        <Toggle label={t('Sold to a buyer')} hint={t('Off = own use or fed to calf (not counted as income)')} value={sold} onChange={setSold} />
        {sold ? (
          <PickerField label={t('Buyer')} value={buyerId} onChange={setBuyerId} allowEmpty placeholder={t('Select buyer (optional)')}
            options={data.buyers.map(b => ({ value: b.id, label: b.name }))} />
        ) : null}
        {preview ? (
          preview.missing ? (
            <Txt v="small" color={C.warn} style={{ marginBottom: S.sm }}>{t('No rate saved for this buyer on this date. The entry is saved and priced when you add the rate.')}</Txt>
          ) : (
            <Card tone="ok" style={{ marginBottom: S.md }}>
              <KV k={t('Rate per litre')} v={formatINR(preview.rate)} />
              <KV k={t('Amount')} v={formatINR(preview.amount)} bold />
            </Card>
          )
        ) : null}
        <Btn icon="check" title={t('Save')} onPress={() => save(false)} loading={busy} />
        {scope === 'animal' && data.animals.length > 1 ? (
          <View style={{ marginTop: 8 }}><Btn v="secondary" icon="skip-next" title={t('Save & next animal')} onPress={() => save(true)} disabled={busy} /></View>
        ) : null}
      </Card>

      <SectionTitle right={<Pressable onPress={() => r.push('/milk/history')}><Txt color={C.info} style={{ fontWeight: '700' }}>{t('History')}</Txt></Pressable>}>
        {t('Today')}
      </SectionTitle>
      <Row gap={S.sm}>
        <View style={{ flex: 1 }}><Card><Txt v="small">{t('Morning')}</Txt><Txt v="h2">{Math.round(totals.m * 10) / 10} L</Txt></Card></View>
        <View style={{ flex: 1 }}><Card><Txt v="small">{t('Evening')}</Txt><Txt v="h2">{Math.round(totals.e * 10) / 10} L</Txt></Card></View>
        <View style={{ flex: 1 }}><Card><Txt v="small">{t('Amount')}</Txt><Txt v="h2">{formatINR(totals.amt, 0)}</Txt></Card></View>
      </Row>
      <View style={{ height: S.sm }} />
      {data.todayRows.length === 0 ? <Empty icon="cup-water" text={t('No milk entered today')} /> : data.todayRows.map(x => (
        <Card key={x.id} style={{ marginBottom: 6 }} onPress={() => r.push(`/milk/edit?id=${x.id}`)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{x.nickname ?? x.herd_name ?? t('Farm total')} · {t(x.session === 'morning' ? 'Morning' : 'Evening')}</Txt>
              <Txt v="small">{x.litres} L{x.fat ? ` · F ${x.fat}` : ''}{x.snf ? ` · S ${x.snf}` : ''}{x.buyer_name ? ` · ${x.buyer_name}` : ''}{!x.sold ? ` · ${t('own use')}` : ''}</Txt>
            </View>
            <Txt style={{ fontWeight: '700' }}>{x.amount != null ? formatINR(x.amount, 0) : '-'}</Txt>
          </Row>
        </Card>
      ))}
      <Row style={{ flexWrap: 'wrap', marginTop: S.md }}>
        <Btn small v="secondary" icon="camera-document" title={t('Scan notebook')} onPress={() => r.push('/scan')} />
        <Btn small v="secondary" icon="domain" title={t('Buyers')} onPress={() => r.push('/milk/buyers')} />
        <Btn small v="secondary" icon="scale-balance" title={t('Compare rates')} onPress={() => r.push('/milk/compare')} />
      </Row>
    </Screen>
  );
}
