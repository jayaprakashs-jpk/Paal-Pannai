import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, DateField, Field, KV, Row, Screen, Txt, confirm, toast, Spacer, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, remove, update, Row as DbRow } from '../../src/db/repo';
import { applyBreedingAlerts } from '../../src/services/alerts';
import { dryOffDate, expectedDelivery, nextHeatAfterFailure, nextHeatWindow, profileFor } from '../../src/lib/breeding';
import { addDays, fmtDate, fmtDateTime, isoToLocalDate, today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { useBusy } from '../../src/lib/hooks';

export default function ConceptionCheck() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { busy, run } = useBusy();
  const [ev, setEv] = useState<DbRow | null>(null);
  const [animal, setAnimal] = useState<DbRow | null>(null);
  const [on, setOn] = useState(today());

  const load = async () => {
    const e = await getById<DbRow>('breeding_events', id);
    setEv(e);
    if (e) setAnimal(await getById('animals', e.animal_id));
  };
  useEffect(() => { load(); }, [id]);
  if (!ev || !animal) return <Screen><Title>{t('Conception check')}</Title></Screen>;

  const prof = profileFor(animal.species)!;
  const sd = isoToLocalDate(ev.done_at);
  const cost = (ev.semen_cost || 0) + (ev.service_charge || 0) + (ev.vet_fee || 0);
  const w = nextHeatWindow(animal.species, sd)!;
  const fw = nextHeatAfterFailure(animal.species, sd, on);
  const due = expectedDelivery(animal.species, sd)!;

  const setStatus = (status: 'confirmed' | 'failed' | 'delivered' | 'pending') => run(async () => {
    const row = await update<DbRow>('breeding_events', id, { status, checked_on: on });
    await applyBreedingAlerts(row, animal);
    await load();
    if (status === 'failed') {
      const nw = nextHeatAfterFailure(animal.species, sd, on)!;
      toast(t('Not pregnant'), t('Next heat (Next Paruvam): {date}. Window {a} to {b}. Alert set.', { date: fmtDate(nw.expected), a: fmtDate(nw.start), b: fmtDate(nw.end) }));
    } else if (status === 'confirmed') {
      toast(t('Pregnancy confirmed'), t('Expected delivery {date}. Alerts set.', { date: fmtDate(due) }));
    }
  });

  return (
    <Screen>
      <Title>{t('Conception check')}</Title>
      <Card>
        <Txt v="h2">{animal.nickname}</Txt>
        <KV k={t('Method')} v={ev.method === 'ai' ? t('Oosi (AI)') : t('Natural mating')} />
        <KV k={t('Served on')} v={fmtDateTime(ev.done_at)} />
        {ev.semen_breed ? <KV k={t('Semen')} v={ev.semen_breed} /> : null}
        {ev.bull_name ? <KV k={t('Bull')} v={ev.bull_name} /> : null}
        {cost ? <KV k={t('Total cost')} v={formatINR(cost, 0)} /> : null}
        <KV k={t('Status')} v={t(ev.status === 'pending' ? 'Waiting for result' : ev.status === 'confirmed' ? 'Pregnant' : ev.status === 'failed' ? 'Not pregnant' : 'Delivered')} bold />
      </Card>

      {ev.status === 'pending' ? (
        <Card tone="warn" style={{ marginTop: S.md }}>
          <Txt style={{ fontWeight: '700' }}>{t('How to check')}</Txt>
          <Txt v="small" style={{ color: C.text }}>
            {t('Watch for heat again between {a} and {b}. If she comes in heat, it failed. Ask the vet to confirm pregnancy after about {n} days.', { a: fmtDate(w.start), b: fmtDate(w.end), n: prof.confirmDays })}
          </Txt>
        </Card>
      ) : null}

      {ev.status === 'pending' || ev.status === 'failed' || ev.status === 'confirmed' ? (
        <Card style={{ marginTop: S.md }}>
          <DateField label={t('Date of this check')} value={on} onChange={setOn} />
          {ev.status !== 'delivered' ? (
            <>
              <Btn icon="check-circle" title={t('Pregnant (Oosi worked)')} onPress={() => setStatus('confirmed')} loading={busy} />
              <Spacer h={8} />
              <Btn v="danger" icon="close-circle" title={t('Not pregnant (Oosi / bull failed)')} onPress={() => setStatus('failed')} disabled={busy} />
              {fw ? <Txt v="small" style={{ marginTop: 8 }}>{t('If failed: next heat about {date}', { date: fmtDate(fw.expected) })}</Txt> : null}
            </>
          ) : null}
        </Card>
      ) : null}

      {ev.status === 'confirmed' ? (
        <Card tone="ok" style={{ marginTop: S.md }}>
          <KV k={t('Expected delivery')} v={fmtDate(due)} bold />
          {dryOffDate(animal.species, due) ? <KV k={t('Stop milking (dry-off)')} v={fmtDate(dryOffDate(animal.species, due)!)} /> : null}
          <Spacer h={8} />
          <Btn v="secondary" icon="baby-carriage" title={t('She delivered')} onPress={() => setStatus('delivered')} disabled={busy} />
        </Card>
      ) : null}

      {ev.status === 'failed' && ev.expected_heat_date ? (
        <Card tone="warn" style={{ marginTop: S.md }}>
          <KV k={t('Next heat (Next Paruvam)')} v={fmtDate(ev.expected_heat_date)} bold />
          <Row><Btn small icon="heart-pulse" title={t('Log heat when it comes')} onPress={() => r.push(`/breeding/heat?animalId=${animal.id}`)} /></Row>
        </Card>
      ) : null}

      {ev.status === 'delivered' ? (
        <Card style={{ marginTop: S.md }}>
          <Btn icon="plus" v="secondary" title={t('Add the calf / kid as new animal')} onPress={() => r.push('/animal/form')} />
        </Card>
      ) : null}

      <Spacer />
      <Btn v="ghost" title={t('Delete this record')} onPress={async () => {
        if (!(await confirm(t('Delete record?'), '', t('Delete'), t('Cancel'), true))) return;
        await remove('breeding_events', id); r.back();
      }} />
    </Screen>
  );
}
