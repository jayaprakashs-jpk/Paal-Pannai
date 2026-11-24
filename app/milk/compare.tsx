import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Badge, Card, Chips, Empty, KV, NumField, Row, Screen, SectionTitle, Txt, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, raw, Row as DbRow } from '../../src/db/repo';
import { compareBuyers, ratePerLitre, societyVsPrivate, weightedQuality, pickRate } from '../../src/lib/milk';
import { addDays, today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { BUYER_KINDS } from '../../src/lib/constants';

export default function Compare() {
  const t = useT();
  const [fat, setFat] = useState('');
  const [snf, setSnf] = useState('');
  const [lpd, setLpd] = useState('');
  const [mt, setMt] = useState('cow');

  const { data } = useLoad(async () => {
    const buyers = await list('buyers', { where: 'is_active = 1 AND kind != ?', params: ['customer'] });
    const rates = await list('buyer_rates');
    const recent = await raw<DbRow>(`SELECT date, litres, fat, snf FROM milk_entries WHERE date >= ? AND deleted_at IS NULL`, [addDays(today(), -14)]);
    return { buyers, rates, recent };
  }, { buyers: [] as DbRow[], rates: [] as DbRow[], recent: [] as DbRow[] }, []);

  // Pre-fill with the farm's own recent averages
  useEffect(() => {
    const q = weightedQuality(data.recent as any);
    const days = new Set(data.recent.map(x => x.date)).size || 1;
    const litres = data.recent.reduce((s, x) => s + x.litres, 0) / days;
    setFat(p => p || (q.fat ? String(q.fat) : '4.0'));
    setSnf(p => p || (q.snf ? String(q.snf) : '8.5'));
    setLpd(p => p || (litres ? String(Math.round(litres * 10) / 10) : '10'));
  }, [data.recent]);

  const fatN = Number(fat) || null, snfN = Number(snf) || null, l = Number(lpd) || 0;
  const rows = useMemo(() => compareBuyers(data.buyers as any, data.rates as any, today(), fatN, snfN, l, mt), [data, fatN, snfN, l, mt]);
  const sp = useMemo(() => societyVsPrivate(rows, l), [rows, l]);
  const kindLabel = (k: string) => t(BUYER_KINDS.find(x => x.key === k)?.label ?? k);

  const slabs = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5];
  const cols = rows.slice(0, 5);

  return (
    <Screen>
      <Title>{t('Compare rates')}</Title>
      <Card>
        <Chips value={mt} onChange={setMt} options={[{ value: 'cow', label: 'Cow milk' }, { value: 'buffalo', label: 'Buffalo milk' }]} />
        <Row gap={S.md}>
          <View style={{ flex: 1 }}><NumField label={t('My fat %')} value={fat} onChangeText={setFat} /></View>
          <View style={{ flex: 1 }}><NumField label={t('My SNF %')} value={snf} onChangeText={setSnf} /></View>
          <View style={{ flex: 1 }}><NumField label={t('Litres/day')} value={lpd} onChangeText={setLpd} /></View>
        </Row>
        <Txt v="small">{t('Pre-filled from your last 14 days. Change to test.')}</Txt>
      </Card>

      {rows.length === 0 ? <Empty icon="scale-balance" text={t('Add buyers with rates to compare.')} /> : (
        <>
          <SectionTitle>{t('Who pays the most')}</SectionTitle>
          {rows.map((x, i) => (
            <Card key={x.buyer.id} tone={i === 0 ? 'ok' : undefined} style={{ marginBottom: S.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Row><Txt style={{ fontWeight: '700' }}>{x.buyer.name}</Txt>{i === 0 ? <Badge tone="ok" text={t('Best')} /> : null}</Row>
                  <Txt v="small">{kindLabel(x.buyer.kind)}</Txt>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Txt v="h2">{formatINR(x.perLitre)}/L</Txt>
                  {x.diffFromBest > 0 ? <Txt v="small" color={C.danger}>-{formatINR(x.diffFromBest)} {t('vs best')}</Txt> : null}
                </View>
              </Row>
              {l > 0 ? <KV k={t('About per month')} v={formatINR(x.monthlyEstimate, 0)} /> : null}
              {x.rate.bonus_per_litre ? <Txt v="small">{t('Includes bonus')} {formatINR(x.rate.bonus_per_litre)}/L</Txt> : null}
            </Card>
          ))}

          <SectionTitle>{t('Government society vs private')}</SectionTitle>
          {sp.society && sp.privateBest ? (
            <Card tone={sp.winner === 'society' ? 'ok' : 'warn'}>
              <KV k={sp.society.buyer.name} v={`${formatINR(sp.society.perLitre)}/L`} />
              <KV k={sp.privateBest.buyer.name} v={`${formatINR(sp.privateBest.perLitre)}/L`} />
              <Txt style={{ fontWeight: '700', marginTop: 6 }}>
                {sp.winner === 'tie' ? t('Same rate.')
                  : sp.winner === 'society'
                    ? t('Society pays {a} more per litre = about {b} more a month.', { a: formatINR(Math.abs(sp.perLitreDiff)), b: formatINR(Math.abs(sp.monthlyDiff), 0) })
                    : t('Private pays {a} more per litre = about {b} more a month.', { a: formatINR(Math.abs(sp.perLitreDiff)), b: formatINR(Math.abs(sp.monthlyDiff), 0) })}
              </Txt>
              <Txt v="small" style={{ marginTop: 4 }}>
                {t('Also think about: payment delay, bonus at year end, cattle feed and vet support, and whether the buyer takes milk every day.')}
              </Txt>
            </Card>
          ) : <Card><Txt v="small">{t('Add one Government / Co-op society and one private buyer, each with a rate, to see this comparison.')}</Txt></Card>}

          <SectionTitle>{t('Fat slab table (₹/L at your SNF)')}</SectionTitle>
          <ScrollView horizontal>
            <Card>
              <Row gap={0}>
                <Txt v="label" style={{ width: 54 }}>{t('Fat')}</Txt>
                {cols.map(c => <Txt key={c.buyer.id} v="label" style={{ width: 92 }} numberOfLines={1}>{c.buyer.name}</Txt>)}
              </Row>
              {slabs.map(sf => {
                const vals = cols.map(c => ratePerLitre(c.rate, sf, snfN));
                const best = Math.max(...vals);
                return (
                  <Row key={sf} gap={0} style={{ paddingVertical: 4 }}>
                    <Txt style={{ width: 54, fontWeight: '700' }}>{sf.toFixed(1)}</Txt>
                    {vals.map((v, i) => <Txt key={i} style={{ width: 92, fontWeight: v === best ? '800' : '400', color: v === best ? C.ok : C.text }}>{formatINR(v)}</Txt>)}
                  </Row>
                );
              })}
            </Card>
          </ScrollView>
        </>
      )}
    </Screen>
  );
}
