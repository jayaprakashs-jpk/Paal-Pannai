import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Btn, Card, Chips, DateField, Field, NumField, PickerField, Row, Screen, Txt, confirm, toast, S, C, Icon } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, list, raw, update, Row as DbRow } from '../../src/db/repo';
import { kvGet, kvSet } from '../../src/db/client';
import { ScanRow, normalizeRow } from '../../src/services/ocr';
import { allRates, milkTypeOf, priceEntry } from '../../src/services/milkRates';
import { round2, toNum } from '../../src/lib/money';
import { today } from '../../src/lib/dates';
import { useBusy } from '../../src/lib/hooks';

interface Draft extends ScanRow { key: string; include: boolean; dup: boolean; animal_id: string | null }

export default function ScanReview() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { busy, run } = useBusy();
  const [scan, setScan] = useState<DbRow | null>(null);
  const [rows, setRows] = useState<Draft[]>([]);
  const [animals, setAnimals] = useState<DbRow[]>([]);
  const [buyers, setBuyers] = useState<DbRow[]>([]);
  const [buyer, setBuyer] = useState('');
  const [showImg, setShowImg] = useState(false);

  const match = (tag: string | null, as: DbRow[]) => {
    if (!tag) return null;
    const x = tag.trim().toLowerCase();
    return as.find(a => a.tag_id?.toLowerCase() === x || a.nickname.toLowerCase() === x)?.id ?? null;
  };

  useEffect(() => {
    (async () => {
      const s = await getById<DbRow>('scan_queue', id);
      const as = await list('animals', { where: `status='active'`, orderBy: 'nickname' });
      setAnimals(as); setBuyers(await list('buyers', { where: 'is_active = 1', orderBy: 'name' }));
      setBuyer((await kvGet('milk.lastBuyer')) ?? '');
      setScan(s);
      const res: ScanRow[] = Array.isArray(s?.result) ? s!.result.map(normalizeRow) : [];
      const drafts: Draft[] = [];
      for (const [i, x] of res.entries()) {
        const aid = match(x.animal_tag, as);
        let dup = false;
        if (x.date && x.session && x.litres) {
          const d = await raw<{ c: number }>(`SELECT COUNT(*) AS c FROM milk_entries WHERE date = ? AND session = ? AND litres = ? AND COALESCE(animal_id,'') = ? AND deleted_at IS NULL`, [x.date, x.session, x.litres, aid ?? '']);
          dup = (d[0]?.c ?? 0) > 0;
        }
        drafts.push({ ...x, key: String(i), include: !dup && x.confidence >= 0.4, dup, animal_id: aid });
      }
      setRows(drafts);
    })();
  }, [id]);

  const patch = (k: string, p: Partial<Draft>) => setRows(rs => rs.map(x => (x.key === k ? { ...x, ...p } : x)));
  const problems = (x: Draft) => [
    !x.date ? 'date' : x.date > today() ? 'future' : null, !x.session ? 'session' : null, !x.litres ? 'litres' : null,
  ].filter(Boolean) as string[];
  const chosen = rows.filter(x => x.include);
  const bad = chosen.filter(x => problems(x).length);

  const save = () => run(async () => {
    if (!chosen.length) return toast(t('Nothing selected'), t('Tick at least one row.'));
    if (bad.length) return toast(t('Fix the red rows'), t('Some selected rows are missing a date, session or litres.'));
    if (!(await confirm(t('Save rows'), t('Save {n} milk entries?', { n: chosen.length }), t('Save'), t('Cancel')))) return;
    const rates = await allRates();
    for (const x of chosen) {
      const a = animals.find(y => y.id === x.animal_id);
      const mt = milkTypeOf(a?.species);
      let rate: number | null = null; let amount: number | null = null;
      if (x.amount != null && x.litres) { amount = round2(x.amount); rate = round2(x.amount / x.litres); }
      else if (buyer) { const p = await priceEntry(buyer, x.date!, x.litres!, x.fat, x.snf, mt, rates); rate = p.rate; amount = p.amount; }
      await insert('milk_entries', {
        date: x.date, session: x.session, animal_id: x.animal_id, litres: x.litres, fat: x.fat, snf: x.snf, buyer_id: buyer || null,
        rate_per_litre: rate, amount, sold: true, source: 'scan', milk_type: mt, notes: x.animal_tag && !x.animal_id ? x.animal_tag : null,
      });
    }
    if (buyer) await kvSet('milk.lastBuyer', buyer);
    await update('scan_queue', id, { status: 'saved' });
    toast(t('Saved'), t('{n} entries added to milk history.', { n: chosen.length }));
    r.replace('/milk/history');
  });

  const addRow = () => setRows(rs => [...rs, { key: String(Date.now()), date: today(), session: 'morning', animal_tag: null, litres: null, fat: null, snf: null, amount: null, confidence: 1, include: true, dup: false, animal_id: null }]);

  return (
    <Screen footer={<Btn title={t('Save {n} rows', { n: chosen.length })} onPress={save} loading={busy} />}>
      <Title>{t('Check scanned rows')}</Title>
      <Banner tone="warn" text={t('The AI can misread handwriting. Check every number against the page before saving. Red = needs your fix. Orange = AI was unsure.')} />
      {scan ? (
        <Pressable onPress={() => setShowImg(!showImg)}>
          <Row style={{ marginBottom: S.sm }}><Icon name="image" color={C.info} /><Txt color={C.info} style={{ fontWeight: '700' }}>{showImg ? t('Hide photo') : t('Show photo')}</Txt></Row>
          {showImg ? <Image source={{ uri: scan.image_uri }} style={{ width: '100%', height: 360, borderRadius: 12 }} resizeMode="contain" /> : null}
        </Pressable>
      ) : null}
      <PickerField label={t('Sold to (for rate, if the page has no amount)')} value={buyer} onChange={setBuyer} allowEmpty options={buyers.map(b => ({ value: b.id, label: b.name }))} />

      {rows.map(x => {
        const p = problems(x);
        const unsure = x.confidence < 0.6;
        return (
          <Card key={x.key} tone={x.include && p.length ? 'danger' : unsure ? 'warn' : undefined} style={{ marginBottom: S.sm }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <Pressable onPress={() => patch(x.key, { include: !x.include })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name={x.include ? 'checkbox-marked' : 'checkbox-blank-outline'} color={C.primary} size={26} />
                <Txt style={{ fontWeight: '700' }}>{x.include ? t('Include') : t('Skip')}</Txt>
              </Pressable>
              <Pressable onPress={() => setRows(rs => rs.filter(y => y.key !== x.key))}><Icon name="delete" color={C.danger} /></Pressable>
            </Row>
            {x.dup ? <Txt v="small" color={C.warn}>{t('Looks like an entry you already saved.')}</Txt> : null}
            <DateField label={t('Date')} value={x.date} onChange={v => patch(x.key, { date: v })} />
            <Chips value={x.session ?? ''} onChange={v => patch(x.key, { session: v as any })} options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }]} />
            <PickerField label={`${t('Animal')}${x.animal_tag ? ` (${t('page says')}: ${x.animal_tag})` : ''}`} value={x.animal_id ?? ''} onChange={v => patch(x.key, { animal_id: v || null })} allowEmpty
              placeholder={t('Farm total / not matched')} options={animals.map(a => ({ value: a.id, label: a.nickname }))} />
            <Row gap={S.sm}>
              <View style={{ flex: 1 }}><NumField label={t('Litres')} value={x.litres != null ? String(x.litres) : ''} onChangeText={v => patch(x.key, { litres: v ? toNum(v) : null })} /></View>
              <View style={{ flex: 1 }}><NumField label={t('Fat')} value={x.fat != null ? String(x.fat) : ''} onChangeText={v => patch(x.key, { fat: v ? toNum(v) : null })} /></View>
              <View style={{ flex: 1 }}><NumField label={t('SNF')} value={x.snf != null ? String(x.snf) : ''} onChangeText={v => patch(x.key, { snf: v ? toNum(v) : null })} /></View>
            </Row>
            <NumField label={t('Amount (₹) if on the page')} value={x.amount != null ? String(x.amount) : ''} onChangeText={v => patch(x.key, { amount: v ? toNum(v) : null })} />
          </Card>
        );
      })}
      <Btn v="ghost" icon="plus" title={t('Add a row')} onPress={addRow} />
    </Screen>
  );
}
