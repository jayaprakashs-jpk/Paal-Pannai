import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Chips, Empty, KV, Row, Screen, Txt, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { raw, Row as DbRow } from '../../src/db/repo';
import { addDays, firstDayOfMonth, fmtDate, today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';

export default function MilkHistory() {
  const t = useT();
  const r = useRouter();
  const [range, setRange] = useState('7');
  const from = range === 'month' ? firstDayOfMonth(today()) : addDays(today(), -Number(range) + 1);
  const { data } = useLoad(() => raw<DbRow>(
    `SELECT m.*, a.nickname, h.name AS herd_name, b.name AS buyer_name FROM milk_entries m
       LEFT JOIN animals a ON a.id = m.animal_id LEFT JOIN herds h ON h.id = m.herd_id LEFT JOIN buyers b ON b.id = m.buyer_id
      WHERE m.date >= ? AND m.deleted_at IS NULL ORDER BY m.date DESC, m.session DESC, m.created_at DESC`, [from]), [] as DbRow[], [from]);

  const days = new Map<string, DbRow[]>();
  for (const x of data) days.set(x.date, [...(days.get(x.date) ?? []), x]);
  const tl = data.reduce((s, x) => s + x.litres, 0);
  const ta = data.reduce((s, x) => s + (x.sold ? x.amount ?? 0 : 0), 0);

  return (
    <Screen>
      <Title>{t('Milk history')}</Title>
      <Chips value={range} onChange={setRange} options={[{ value: '1', label: 'Today' }, { value: '7', label: '7 days' }, { value: '15', label: '15 days' }, { value: 'month', label: 'This month' }]} />
      <Card><KV k={t('Total milk')} v={`${Math.round(tl * 10) / 10} L`} bold /><KV k={t('Sold amount')} v={formatINR(ta)} bold /></Card>
      {data.length === 0 ? <Empty icon="cup-water" text={t('No entries in this period')} /> : [...days.entries()].map(([d, rows]) => (
        <View key={d} style={{ marginTop: S.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h2">{fmtDate(d)}</Txt>
            <Txt v="small">{Math.round(rows.reduce((s, x) => s + x.litres, 0) * 10) / 10} L</Txt>
          </Row>
          {rows.map(x => (
            <Card key={x.id} style={{ marginTop: 6 }} onPress={() => r.push(`/milk/edit?id=${x.id}`)}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '700' }}>{x.nickname ?? x.herd_name ?? t('Farm total')} · {t(x.session === 'morning' ? 'Morning' : 'Evening')}</Txt>
                  <Txt v="small">{x.litres} L{x.fat ? ` · F ${x.fat}` : ''}{x.snf ? ` · S ${x.snf}` : ''}{x.buyer_name ? ` · ${x.buyer_name}` : ''}{x.source === 'scan' ? ' · AI' : ''}</Txt>
                </View>
                <Txt style={{ fontWeight: '700' }}>{x.amount != null ? formatINR(x.amount, 0) : '-'}</Txt>
              </Row>
            </Card>
          ))}
        </View>
      ))}
    </Screen>
  );
}
