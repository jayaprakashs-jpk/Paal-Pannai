import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, KV, NumField, PickerField, Row, Screen, SectionTitle, Txt, S, C, toast } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { list, insert, getById, raw, Row as DbRow } from '../../src/db/repo';
import { CATEGORIES, SPECIES, SpeciesKey } from '../../src/lib/constants';
import { calcFeed, avgDailyMilk, FeedResult, GreenAvailability, PregnancyStage } from '../../src/lib/feed';
import { currentPregnancy } from '../../src/lib/breeding';
import { addDays, today } from '../../src/lib/dates';
import { toNum } from '../../src/lib/money';
import { useLoad } from '../../src/lib/hooks';

async function inputsFor(a: DbRow) {
  const milk = await raw<{ date: string; litres: number }>(
    `SELECT date, litres FROM milk_entries WHERE animal_id = ? AND deleted_at IS NULL AND date >= ?`, [a.id, addDays(today(), -14)]);
  const ev = await list('breeding_events', { where: 'animal_id = ?', params: [a.id] });
  const p = currentPregnancy(a.species, ev as any, today());
  const stage: PregnancyStage = p ? (p.info.stage === 'late' ? 'late' : 'early') : 'none';
  return { milk: avgDailyMilk(milk, 7), stage };
}

export default function FeedCalc() {
  const t = useT();
  const r = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { data: animals } = useLoad(() => list('animals', { where: `status='active'`, orderBy: 'nickname' }), [] as DbRow[], []);
  const [sel, setSel] = useState(animalId ?? '');
  const [species, setSpecies] = useState<string>('cow');
  const [category, setCategory] = useState('milking');
  const [weight, setWeight] = useState('');
  const [milk, setMilk] = useState('');
  const [preg, setPreg] = useState<PregnancyStage>('none');
  const [green, setGreen] = useState<GreenAvailability>('normal');
  const [heads, setHeads] = useState('1');
  const [age, setAge] = useState('4');
  const [maize, setMaize] = useState('0.4');
  const [farmTotal, setFarmTotal] = useState<{ res: FeedResult; n: number } | null>(null);

  useEffect(() => {
    if (!sel) return;
    (async () => {
      const a = await getById<DbRow>('animals', sel);
      if (!a) return;
      setSpecies(a.species); setCategory(a.category ?? ''); setWeight(a.weight_kg ? String(a.weight_kg) : '');
      setHeads(String(a.head_count ?? 1));
      const x = await inputsFor(a);
      setMilk(x.milk ? String(x.milk) : '0'); setPreg(x.stage);
    })();
  }, [sel]);

  const sp = species as SpeciesKey;
  const res = useMemo(() => calcFeed({
    species, category, weightKg: toNum(weight), milkLitresPerDay: toNum(milk), pregnancy: preg, greenAvailability: green,
    headCount: toNum(heads, 1), ageWeeks: toNum(age, 4), maizeShare: toNum(maize, 0.4),
  }), [species, category, weight, milk, preg, green, heads, age, maize]);

  const dairy = ['cow', 'buffalo', 'goat', 'sheep'].includes(species);
  const cattle = species === 'cow' || species === 'buffalo';

  const computeFarm = async () => {
    const all = await list('animals', { where: `status='active'` });
    const sum: FeedResult = { perAnimal: false, dryMatterKg: 0, greenKg: 0, dryKg: 0, concentrateKg: 0, maizeKg: 0, brankg: 0, oilcakeKg: 0, mineralKg: 0, saltKg: 0, waterL: 0, notes: [] };
    let n = 0;
    for (const a of all) {
      if (!a.weight_kg && a.species !== 'poultry') continue;
      const x = await inputsFor(a);
      const f = calcFeed({
        species: a.species, category: a.category, weightKg: a.weight_kg ?? 0, milkLitresPerDay: x.milk, pregnancy: x.stage,
        greenAvailability: green, headCount: a.head_count ?? 1, ageWeeks: 4, maizeShare: toNum(maize, 0.4),
      });
      for (const k of ['dryMatterKg', 'greenKg', 'dryKg', 'concentrateKg', 'maizeKg', 'brankg', 'oilcakeKg', 'mineralKg', 'saltKg', 'waterL'] as const) sum[k] += f[k];
      n++;
    }
    setFarmTotal({ res: sum, n });
    if (!n) toast(t('Feed calculator'), t('Add animals with weights first.'));
  };

  const line = (k: string, v: number, unit = 'kg') => v > 0 ? <KV k={t(k)} v={`${Math.round(v * 100) / 100} ${unit}`} bold /> : null;

  return (
    <Screen>
      <Title>{t('Feed & maize calculator')}</Title>
      <Card>
        <PickerField label={t('Pick an animal (optional)')} value={sel} onChange={setSel} allowEmpty
          options={animals.map(a => ({ value: a.id, label: `${a.nickname}${a.tag_id ? ' · ' + a.tag_id : ''}` }))} />
        <Chips label={t('Species')} value={species} onChange={v => { setSpecies(v); setCategory(CATEGORIES[v as SpeciesKey][0].key); }}
          options={SPECIES.map(s => ({ value: s.key, label: s.label }))} />
        <Chips label={t('Category')} value={category} onChange={setCategory} options={(CATEGORIES[sp] ?? []).map(c => ({ value: c.key, label: c.label }))} />
        {species === 'poultry' ? (
          <>
            <NumField label={t('Number of birds')} value={heads} onChangeText={setHeads} />
            {category === 'broiler' || category === 'chick' ? <NumField label={t('Age in completed weeks (0 = first week)')} value={age} onChangeText={setAge} /> : null}
          </>
        ) : (
          <NumField label={t('Body weight (kg)')} value={weight} onChangeText={setWeight} suffix="kg" />
        )}
        {dairy ? <NumField label={t('Milk per day (litres)')} value={milk} onChangeText={setMilk} suffix="L" /> : null}
        {dairy ? <Chips label={t('Pregnancy')} value={preg} onChange={v => setPreg(v as PregnancyStage)}
          options={[{ value: 'none', label: 'Not pregnant' }, { value: 'early', label: 'Early' }, { value: 'late', label: 'Late (last 2 months)' }]} /> : null}
        {dairy ? <Chips label={t('Green fodder available?')} value={green} onChange={v => setGreen(v as GreenAvailability)}
          options={[{ value: 'plenty', label: 'Plenty' }, { value: 'normal', label: 'Normal' }, { value: 'limited', label: 'Limited' }, { value: 'none', label: 'None' }]} /> : null}
        {species !== 'dog' && species !== 'other' ? (
          <Chips label={t('Maize flour share in concentrate')} value={maize} onChange={setMaize}
            options={[{ value: '0.3', label: '30%' }, { value: '0.4', label: '40%' }, { value: '0.5', label: '50%' }, { value: '0.6', label: '60%' }]} translate={false} />
        ) : null}
      </Card>

      <SectionTitle>{res.perAnimal ? t('Daily ration per animal') : t('Daily feed for the flock')}</SectionTitle>
      <Card tone="ok">
        {line('Green fodder (Theevanam)', res.greenKg)}
        {line('Dry fodder / straw', res.dryKg)}
        {line('Concentrate mix total', res.concentrateKg)}
        {line('Maize flour (Makkachola Maavu)', res.maizeKg)}
        {line('Rice / wheat bran', res.brankg)}
        {line('Oil cake (groundnut / cotton)', res.oilcakeKg)}
        {line('Mineral mixture', res.mineralKg)}
        {line('Salt', res.saltKg)}
        {line('Clean water needed', res.waterL, 'L')}
        {res.notes.map((n, i) => <Txt key={i} v="small" style={{ marginTop: 4 }}>• {t(n.text, n.vars)}</Txt>)}
        {cattle ? <Txt v="small" style={{ marginTop: 8 }}>{t('Split concentrate into morning and evening milking time.')}</Txt> : null}
      </Card>
      <Txt v="small" style={{ marginVertical: S.sm }}>
        {t('This is a general guide, not a vet prescription. Watch body condition and milk yield, and adjust with your vet.')}
      </Txt>

      <Row style={{ flexWrap: 'wrap' }}>
        <Btn small v="secondary" icon="bell-ring" title={t('Set feeding reminders')} onPress={() => r.push('/care/reminders')} />
        <Btn small v="secondary" icon="calculator" title={t('Whole farm total')} onPress={computeFarm} />
      </Row>

      {farmTotal && farmTotal.n > 0 ? (
        <>
          <SectionTitle>{t('Whole farm per day')} ({farmTotal.n})</SectionTitle>
          <Card>
            {line('Green fodder (Theevanam)', farmTotal.res.greenKg)}
            {line('Dry fodder / straw', farmTotal.res.dryKg)}
            {line('Maize flour (Makkachola Maavu)', farmTotal.res.maizeKg)}
            {line('Rice / wheat bran', farmTotal.res.brankg)}
            {line('Oil cake (groundnut / cotton)', farmTotal.res.oilcakeKg)}
            <KV k={t('Maize flour for 30 days')} v={`${Math.round(farmTotal.res.maizeKg * 30)} kg`} bold color={C.primary} />
          </Card>
        </>
      ) : null}
      <View style={{ height: S.xl }} />
    </Screen>
  );
}
