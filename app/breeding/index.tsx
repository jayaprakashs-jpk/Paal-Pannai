import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Btn, Card, Empty, KV, ListItem, Row, Screen, SectionTitle, Txt, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, Row as DbRow } from '../../src/db/repo';
import { breederAnimals } from '../../src/services/breedingData';
import { currentPregnancy, expectedDelivery, nextHeatAfterFailure, nextHeatWindow, profileFor } from '../../src/lib/breeding';
import { addDays, daysBetween, fmtDate, fmtDateTime, isoToLocalDate, today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';

export default function Breeding() {
  const t = useT();
  const r = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { data } = useLoad(async () => ({
    animals: await breederAnimals(),
    heats: await list('heat_records', { orderBy: 'heat_at DESC' }),
    events: await list('breeding_events', { orderBy: 'done_at DESC' }),
  }), { animals: [] as DbRow[], heats: [] as DbRow[], events: [] as DbRow[] }, []);

  const animals = animalId ? data.animals.filter(a => a.id === animalId) : data.animals;
  const td = today();

  const status = (a: DbRow) => {
    const evs = data.events.filter(e => e.animal_id === a.id);
    const heats = data.heats.filter(h => h.animal_id === a.id);
    const p = currentPregnancy(a.species, evs as any, td);
    const prof = profileFor(a.species)!;
    if (p && p.confirmed) {
      const due = expectedDelivery(a.species, isoToLocalDate(p.event.done_at))!;
      return { tone: 'ok' as const, text: t('Pregnant {d} days · due {date}', { d: p.info.daysPregnant, date: fmtDate(due) }), href: undefined };
    }
    if (p && !p.confirmed) {
      const w = nextHeatWindow(a.species, isoToLocalDate(p.event.done_at))!;
      return { tone: 'warn' as const, text: t('Served {date}. Watch for heat {from} to {to}, then confirm pregnancy.', { date: fmtDate(isoToLocalDate(p.event.done_at)), from: fmtDate(w.start), to: fmtDate(w.end) }), href: `/breeding/check?id=${p.event.id}` };
    }
    const failed = evs.find(e => e.status === 'failed');
    const lastHeat = heats[0];
    const base = [failed ? isoToLocalDate(failed.done_at) : null, lastHeat ? isoToLocalDate(lastHeat.heat_at) : null].filter(Boolean).sort().pop() as string | undefined;
    if (base) {
      const w = (failed && isoToLocalDate(failed.done_at) === base ? nextHeatAfterFailure(a.species, base, td) : nextHeatWindow(a.species, base))!;
      const diff = daysBetween(td, w.expected);
      return { tone: diff <= 3 && diff >= -3 ? ('warn' as const) : undefined, text: t('Next heat (Next Paruvam) about {date} (window {from} to {to})', { date: fmtDate(w.expected), from: fmtDate(w.start), to: fmtDate(w.end) }), href: undefined };
    }
    return { tone: undefined, text: t('No heat recorded yet. Cycle is about {n} days.', { n: prof.cycleDays }), href: undefined };
  };

  const pendingChecks = data.events.filter(e => e.status === 'pending');

  return (
    <Screen>
      <Title>{t('Breeding & heat cycle')}</Title>
      <Row style={{ flexWrap: 'wrap' }}>
        <Btn icon="heart-pulse" title={t('Log heat (Paruvam)')} onPress={() => r.push(`/breeding/heat${animalId ? `?animalId=${animalId}` : ''}`)} />
        <Btn icon="needle" v="secondary" title={t('Log Oosi / mating')} onPress={() => r.push(`/breeding/service${animalId ? `?animalId=${animalId}` : ''}`)} />
      </Row>
      <Row style={{ flexWrap: 'wrap', marginTop: S.sm }}>
        <Btn small v="ghost" icon="doctor" title={t('Vets & semen')} onPress={() => r.push('/breeding/providers')} />
        <Btn small v="ghost" icon="egg" title={t('Poultry')} onPress={() => r.push('/breeding/poultry')} />
      </Row>

      {pendingChecks.length ? (
        <>
          <SectionTitle>{t('Waiting for result')}</SectionTitle>
          {pendingChecks.map(e => {
            const a = data.animals.find(x => x.id === e.animal_id);
            if (!a) return null;
            return (
              <ListItem key={e.id} icon="stethoscope" tone="warn" title={a.nickname}
                subtitle={`${e.method === 'ai' ? t('Oosi (AI)') : t('Natural mating')} · ${fmtDate(isoToLocalDate(e.done_at))} · ${t('Did she conceive?')}`}
                onPress={() => r.push(`/breeding/check?id=${e.id}`)} />
            );
          })}
        </>
      ) : null}

      <SectionTitle>{t('Animals')}</SectionTitle>
      {animals.length === 0 ? <Card><Empty icon="cow" text={t('Add female cows, buffalo, goats or sheep to track breeding.')} /></Card> : animals.map(a => {
        const s = status(a);
        return (
          <Card key={a.id} tone={s.tone} style={{ marginBottom: S.sm }} onPress={() => r.push(`/animal/${a.id}`)}>
            <Txt style={{ fontWeight: '700' }}>{a.nickname} <Txt v="small">{a.tag_id ?? ''}</Txt></Txt>
            <Txt v="small" style={{ color: C.text }}>{s.text}</Txt>
          </Card>
        );
      })}

      <SectionTitle>{t('Recent records')}</SectionTitle>
      {[...data.events.map(e => ({ k: 'e', at: e.done_at, e })), ...data.heats.map(h => ({ k: 'h', at: h.heat_at, e: h }))]
        .filter(x => !animalId || x.e.animal_id === animalId)
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15).map(x => {
          const a = data.animals.find(y => y.id === x.e.animal_id);
          if (x.k === 'h') return <ListItem key={x.e.id} icon="heart-pulse" title={`${a?.nickname ?? ''} · ${t('In heat')}`} subtitle={fmtDateTime(x.at)} />;
          const cost = (x.e.semen_cost || 0) + (x.e.service_charge || 0) + (x.e.vet_fee || 0);
          return (
            <ListItem key={x.e.id} icon="needle" title={`${a?.nickname ?? ''} · ${x.e.method === 'ai' ? t('Oosi (AI)') : t('Natural mating')}`}
              subtitle={`${fmtDateTime(x.at)} · ${t(x.e.status === 'pending' ? 'Waiting' : x.e.status === 'confirmed' ? 'Pregnant' : x.e.status === 'failed' ? 'Failed' : 'Delivered')}${cost ? ' · ' + formatINR(cost, 0) : ''}${x.e.semen_breed ? ' · ' + x.e.semen_breed : ''}`}
              onPress={() => r.push(`/breeding/check?id=${x.e.id}`)} />
          );
        })}
    </Screen>
  );
}
