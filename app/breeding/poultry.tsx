import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Btn, Card, Chips, DateField, Empty, KV, NumField, PickerField, Row, Screen, SectionTitle, Txt, confirm, toast, S, C, ListItem } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad, useBusy } from '../../src/lib/hooks';
import { insert, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { brooderTempC, hatchDue, hatchRatePct, layingRatePct, POULTRY_INCUBATION } from '../../src/lib/breeding';
import { addDays, daysBetween, fmtDate, today } from '../../src/lib/dates';
import { toNum } from '../../src/lib/money';
import { scheduleOnce, atHour } from '../../src/services/notifications';
import { tNow } from '../../src/i18n';

export default function Poultry() {
  const t = useT();
  const { busy, run } = useBusy();
  const { data, reload } = useLoad(async () => ({
    flocks: await list('animals', { where: `species = 'poultry' AND status = 'active'`, orderBy: 'nickname' }),
    eggs: await list('egg_logs', { orderBy: 'date DESC' }),
    hatches: await list('hatch_batches', { orderBy: 'set_date DESC' }),
  }), { flocks: [] as DbRow[], eggs: [] as DbRow[], hatches: [] as DbRow[] }, []);
  const [flock, setFlock] = useState('');
  const [tab, setTab] = useState('eggs');
  const [eDate, setEDate] = useState(today());
  const [eggs, setEggs] = useState('');
  const [birds, setBirds] = useState('');
  const [broken, setBroken] = useState('');
  const [setDate, setSetDate] = useState(today());
  const [eggsSet, setEggsSet] = useState('');
  const [inc, setInc] = useState('21');
  const [hatchedFor, setHatchedFor] = useState<string | null>(null);
  const [hatchedN, setHatchedN] = useState('');
  const [chickDate, setChickDate] = useState(today());

  useEffect(() => { if (!flock && data.flocks[0]) setFlock(data.flocks[0].id); }, [data.flocks]);
  useEffect(() => { const f = data.flocks.find(x => x.id === flock); if (f) setBirds(String(f.head_count ?? 1)); }, [flock, data.flocks]);

  const myEggs = data.eggs.filter(e => e.animal_id === flock);
  const last7 = myEggs.filter(e => e.date > addDays(today(), -7));
  const avgRate = useMemo(() => last7.length ? Math.round(last7.reduce((s, e) => s + layingRatePct(e.eggs, e.birds), 0) / last7.length * 10) / 10 : null, [last7]);
  const flockObj = data.flocks.find(f => f.id === flock);

  const saveEggs = () => run(async () => {
    const n = Math.floor(toNum(eggs, -1)); const b = Math.floor(toNum(birds, 0));
    if (n < 0 || b <= 0) return toast(t('Eggs'), t('Enter number of eggs and birds.'));
    if (n > b * 1.2) return toast(t('Eggs'), t('More eggs than birds. Please check.'));
    const dup = myEggs.find(e => e.date === eDate);
    if (dup) await update('egg_logs', dup.id, { eggs: n, birds: b, broken: Math.floor(toNum(broken, 0)) });
    else await insert('egg_logs', { animal_id: flock, date: eDate, eggs: n, birds: b, broken: Math.floor(toNum(broken, 0)) });
    setEggs(''); setBroken(''); await reload();
  });

  const saveHatch = () => run(async () => {
    const n = Math.floor(toNum(eggsSet, 0));
    if (n <= 0) return toast(t('Hatching'), t('Enter eggs set in the incubator / under the hen.'));
    const days = Math.floor(toNum(inc, 21));
    const b = await insert<DbRow>('hatch_batches', { animal_id: flock, set_date: setDate, eggs_set: n, incubation_days: days });
    await scheduleOnce(`hatch.${b.id}`, atHour(hatchDue(setDate, days), 7), tNow('Hatching day'), tNow('Eggs set on {d} are due to hatch today.', { d: fmtDate(setDate) }));
    setEggsSet(''); await reload();
  });

  if (data.flocks.length === 0) {
    return <Screen><Title>{t('Poultry: eggs & hatching')}</Title><Empty icon="bird" text={t('Add a poultry flock in Animals first (species: Poultry).')} /></Screen>;
  }

  return (
    <Screen>
      <Title>{t('Poultry: eggs & hatching')}</Title>
      <PickerField label={t('Flock')} value={flock} onChange={setFlock} options={data.flocks.map(f => ({ value: f.id, label: `${f.nickname} (${f.head_count})` }))} />
      <Chips value={tab} onChange={setTab} options={[{ value: 'eggs', label: 'Egg laying' }, { value: 'hatch', label: 'Hatching' }, { value: 'brood', label: 'Brooding' }]} />

      {tab === 'eggs' ? (
        <>
          <Card>
            <DateField label={t('Date')} value={eDate} onChange={setEDate} />
            <Row gap={S.md}>
              <View style={{ flex: 1 }}><NumField label={t('Eggs collected')} value={eggs} onChangeText={setEggs} /></View>
              <View style={{ flex: 1 }}><NumField label={t('Birds laying')} value={birds} onChangeText={setBirds} /></View>
            </Row>
            <NumField label={t('Broken / cracked')} value={broken} onChangeText={setBroken} />
            <Btn title={t('Save')} onPress={saveEggs} loading={busy} />
          </Card>
          <SectionTitle>{t('Laying rate')}</SectionTitle>
          <Card tone={avgRate !== null && avgRate < 60 ? 'warn' : 'ok'}>
            <KV k={t('7-day average')} v={avgRate !== null ? `${avgRate}%` : '-'} bold />
            {flockObj?.category === 'layer' && avgRate !== null && avgRate < 60 ? <Txt v="small">{t('Low for layers. Check feed, water, light hours, disease and heat stress.')}</Txt> : null}
          </Card>
          {myEggs.slice(0, 10).map(e => (
            <ListItem key={e.id} icon="egg" title={`${fmtDate(e.date)} · ${e.eggs} ${t('eggs')}`} subtitle={`${layingRatePct(e.eggs, e.birds)}% · ${e.birds} ${t('birds')}${e.broken ? ' · ' + e.broken + ' ' + t('broken') : ''}`} />
          ))}
        </>
      ) : null}

      {tab === 'hatch' ? (
        <>
          <Card>
            <DateField label={t('Date eggs were set')} value={setDate} onChange={setSetDate} />
            <NumField label={t('Number of eggs set')} value={eggsSet} onChangeText={setEggsSet} />
            <Chips label={t('Bird')} value={inc} onChange={setInc} options={Object.entries(POULTRY_INCUBATION).map(([k, d]) => ({ value: String(d), label: `${k} (${d}d)` }))} translate={false} />
            <Txt v="small" style={{ marginBottom: S.md }}>{t('Hatching due: {date}', { date: fmtDate(hatchDue(setDate, toNum(inc, 21))) })}</Txt>
            <Btn title={t('Start batch')} onPress={saveHatch} loading={busy} />
          </Card>
          <SectionTitle>{t('Batches')}</SectionTitle>
          {data.hatches.filter(h => h.animal_id === flock).map(h => {
            const due = hatchDue(h.set_date, h.incubation_days);
            const left = daysBetween(today(), due);
            return (
              <Card key={h.id} style={{ marginBottom: S.sm }}>
                <Txt style={{ fontWeight: '700' }}>{fmtDate(h.set_date)} · {h.eggs_set} {t('eggs')}</Txt>
                <Txt v="small">{h.hatched_count != null ? `${t('Hatched')}: ${h.hatched_count} (${hatchRatePct(h.hatched_count, h.eggs_set)}%)` : left > 0 ? t('Due in {n} days ({date})', { n: left, date: fmtDate(due) }) : t('Due {date}. Enter chicks hatched.', { date: fmtDate(due) })}</Txt>
                {h.hatched_count == null ? (
                  hatchedFor === h.id ? (
                    <Row>
                      <View style={{ flex: 1 }}><NumField value={hatchedN} onChangeText={setHatchedN} placeholder={t('Chicks hatched')} /></View>
                      <View style={{ marginBottom: 12 }}><Btn small title={t('Save')} onPress={async () => { const n = Math.floor(toNum(hatchedN, -1)); if (n < 0 || n > h.eggs_set) return toast(t('Hatching'), t('Chicks cannot be more than eggs set.')); await update('hatch_batches', h.id, { hatched_count: n }); setHatchedFor(null); setHatchedN(''); reload(); }} /></View>
                    </Row>
                  ) : <Btn small v="secondary" title={t('Enter hatched count')} onPress={() => setHatchedFor(h.id)} />
                ) : null}
                <Btn small v="ghost" title={t('Delete')} onPress={async () => { if (await confirm(t('Delete batch?'), '', t('Delete'), t('Cancel'), true)) { await remove('hatch_batches', h.id); reload(); } }} />
              </Card>
            );
          })}
        </>
      ) : null}

      {tab === 'brood' ? (
        <Card>
          <DateField label={t('Date chicks hatched / arrived')} value={chickDate} onChange={setChickDate} />
          {(() => {
            const age = daysBetween(chickDate, today());
            const temp = brooderTempC(age);
            return (
              <>
                <KV k={t('Chick age')} v={`${age} ${t('days')}`} bold />
                <KV k={t('Brooder temperature')} v={temp ? `${temp}°C` : t('No heater needed')} bold color={C.primary} />
                <Txt v="small" style={{ marginTop: 8 }}>{t('Start at 35°C in week 1 and lower by about 3°C each week. Chicks huddling under the lamp = too cold. Spread away from lamp, panting = too hot. Give clean water and chick starter feed always.')}</Txt>
              </>
            );
          })()}
        </Card>
      ) : null}
    </Screen>
  );
}
