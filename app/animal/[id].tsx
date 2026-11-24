import React from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Btn, Card, Empty, KV, ListItem, Row, Screen, SectionTitle, Txt, confirm, S, C, Icon } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { getById, list, raw, remove, update, insert, Row as DbRow } from '../../src/db/repo';
import { speciesIcon, speciesLabel } from '../../src/lib/constants';
import { ageText, fmtDate, today, addDays, isoToLocalDate } from '../../src/lib/dates';
import { averageDailyGain } from '../../src/lib/weight';
import { currentPregnancy, profileFor } from '../../src/lib/breeding';
import { formatINR, toNum } from '../../src/lib/money';
import { avgDailyMilk } from '../../src/lib/feed';
import { cancelOnce } from '../../src/services/notifications';
import { DateField, Field, NumField } from '../../src/ui';
import { useBusy } from '../../src/lib/hooks';
import { categoryLabel, healthKindLabel, statusLabel } from '../../src/lib/labels';

export default function AnimalDetail() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { busy, run } = useBusy();
  const [w, setW] = React.useState('');
  const { data, reload, loading } = useLoad(async () => {
    const a = await getById<DbRow>('animals', id);
    if (!a) return null;
    const health = await list('health_records', { where: 'animal_id = ?', params: [id], orderBy: 'date DESC' });
    const weights = await list('weight_logs', { where: 'animal_id = ?', params: [id], orderBy: 'date ASC' });
    const events = await list('breeding_events', { where: 'animal_id = ?', params: [id], orderBy: 'done_at DESC' });
    const milk = await raw<DbRow>(
      `SELECT date, litres FROM milk_entries WHERE animal_id = ? AND deleted_at IS NULL AND date >= ?`, [id, addDays(today(), -14)]);
    const spent = await raw<{ s: number | null }>(`SELECT SUM(amount) AS s FROM expenses WHERE animal_id = ? AND deleted_at IS NULL`, [id]);
    return { a, health, weights, events, milk, spent: spent[0]?.s ?? 0 };
  }, null as any, [id]);

  if (!data) return <Screen>{loading ? null : <Empty text={t('Animal not found')} />}</Screen>;
  const { a, health, weights, events, milk } = data as { a: DbRow; health: DbRow[]; weights: DbRow[]; events: DbRow[]; milk: DbRow[]; spent: number };
  const isFemaleBreeder = a.sex !== 'male' && !!profileFor(a.species);
  const preg = currentPregnancy(a.species, events as any, today());
  const adg = averageDailyGain(weights as any);
  const avgMilk = avgDailyMilk(milk as any, 7);
  const lastHeat = events[0];

  const addWeight = () => run(async () => {
    const kg = toNum(w, 0);
    if (kg <= 0) return;
    await insert('weight_logs', { animal_id: id, date: today(), weight_kg: kg });
    await update('animals', id, { weight_kg: kg, weight_source: 'manual' });
    setW('');
    await reload();
  });

  const retire = async (status: 'sold' | 'dead') => {
    const ok = await confirm(status === 'sold' ? t('Mark as sold?') : t('Mark as dead?'), t('It will leave your active list. History is kept.'), t('Yes'), t('Cancel'), true);
    if (!ok) return;
    await update('animals', id, { status });
    r.back();
  };

  return (
    <Screen>
      <Title>{a.nickname}</Title>
      <Card>
        <Row gap={S.md}>
          <View style={{ width: 84, height: 84, borderRadius: 14, backgroundColor: C.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {a.photo_uri ? <Image source={{ uri: a.photo_uri }} style={{ width: 84, height: 84 }} /> : <Icon name={speciesIcon(a.species)} size={42} color={C.primary} />}
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h2">{a.nickname}</Txt>
            <Txt v="small">{[a.tag_id, t(speciesLabel(a.species)), a.breed].filter(Boolean).join(' · ')}</Txt>
            <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
              {a.category ? <Badge tone="info" text={t(categoryLabel(a.species, a.category))} /> : null}
              {preg ? <Badge tone="ok" text={preg.confirmed ? t('Pregnant') : t('Served')} /> : null}
              {a.status !== 'active' ? <Badge tone="danger" text={t(statusLabel(a.status))} /> : null}
            </Row>
          </View>
        </Row>
        <View style={{ height: S.md }} />
        <KV k={t('Age')} v={ageText(a.dob)} />
        {a.species === 'poultry' ? <KV k={t('Birds in flock')} v={String(a.head_count)} /> : null}
        <KV k={t('Weight')} v={a.weight_kg ? `${a.weight_kg} kg ${a.weight_source === 'estimated' ? '(' + t('estimated') + ')' : ''}` : '-'} />
        {a.girth_cm ? <KV k={t('Girth / height')} v={`${a.girth_cm} / ${a.height_cm ?? '-'} cm`} /> : null}
        {avgMilk > 0 ? <KV k={t('Milk (7-day average)')} v={`${avgMilk} L/${t('day')}`} /> : null}
        {adg !== null ? <KV k={t('Weight gain')} v={`${Math.round(adg * 1000)} g/${t('day')}`} /> : null}
        <KV k={t('Money spent on this animal')} v={formatINR(data.spent, 0)} />
        {preg ? (
          <KV k={t('Expected delivery')} v={fmtDate(addDays(isoToLocalDate(preg.event.done_at), profileFor(a.species)!.gestationDays))} bold />
        ) : null}
      </Card>

      <Row style={{ flexWrap: 'wrap', marginTop: S.md }}>
        <Btn small icon="pencil" v="secondary" title={t('Edit')} onPress={() => r.push(`/animal/form?id=${id}`)} />
        <Btn small icon="qrcode" v="secondary" title={t('QR tag')} onPress={() => r.push(`/animal/qr?id=${id}`)} />
        <Btn small icon="needle" v="secondary" title={t('Health')} onPress={() => r.push(`/animal/health?animalId=${id}`)} />
        <Btn small icon="grain" v="secondary" title={t('Feed')} onPress={() => r.push(`/care/feed?animalId=${id}`)} />
        {isFemaleBreeder ? <Btn small icon="heart-pulse" v="secondary" title={t('Breeding')} onPress={() => r.push(`/breeding?animalId=${id}`)} /> : null}
        <Btn small icon="map-marker" v="secondary" title={t('Move')} onPress={() => r.push(`/care/location?animalId=${id}`)} />
      </Row>

      {isFemaleBreeder && lastHeat?.expected_heat_date && (lastHeat.status === 'pending' || lastHeat.status === 'failed') ? (
        <Card tone="warn" style={{ marginTop: S.md }}>
          <KV k={t('Next heat (Paruvam) expected')} v={fmtDate(lastHeat.expected_heat_date)} bold />
        </Card>
      ) : null}

      <SectionTitle>{t('Weight log')}</SectionTitle>
      <Card>
        <Row>
          <View style={{ flex: 1 }}><NumField value={w} onChangeText={setW} placeholder={t('Weight today (kg)')} suffix="kg" /></View>
          <View style={{ marginBottom: 12 }}><Btn small title={t('Add')} onPress={addWeight} loading={busy} /></View>
        </Row>
        {weights.slice(-5).reverse().map(x => <KV key={x.id} k={fmtDate(x.date)} v={`${x.weight_kg} kg`} />)}
        {!weights.length ? <Txt v="small">{t('No weights logged yet')}</Txt> : null}
      </Card>

      <SectionTitle>{t('Health history')}</SectionTitle>
      {health.length === 0 ? <Card><Empty icon="needle" text={t('No health records yet')} /></Card> : health.map(h => (
        <ListItem key={h.id} icon={h.kind === 'mortality' ? 'skull' : 'needle'} title={h.title}
          subtitle={`${t(healthKindLabel(h.kind))} · ${fmtDate(h.date)}${h.next_due_date ? ' · ' + t('next') + ' ' + fmtDate(h.next_due_date) : ''}`}
          tone={h.next_due_date && h.next_due_date < today() ? 'warn' : undefined}
          onPress={() => r.push(`/animal/health?id=${h.id}`)} />
      ))}

      {a.status === 'active' ? (
        <Row style={{ marginTop: S.lg }}>
          <View style={{ flex: 1 }}><Btn v="ghost" title={t('Mark sold')} onPress={() => retire('sold')} /></View>
          <View style={{ flex: 1 }}><Btn v="ghost" title={t('Mark dead')} onPress={() => retire('dead')} /></View>
        </Row>
      ) : null}
      <View style={{ height: S.md }} />
      <Btn v="danger" title={t('Delete animal')} onPress={async () => {
        const ok = await confirm(t('Delete animal?'), t('All its records stay in totals but this animal is removed.'), t('Delete'), t('Cancel'), true);
        if (!ok) return;
        for (const h of health) await cancelOnce(`health.${h.id}`);
        await remove('animals', id);
        r.back();
      }} />
    </Screen>
  );
}
