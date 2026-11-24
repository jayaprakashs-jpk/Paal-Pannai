import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, PickerField, Screen, Txt, toast, confirm, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT, tNow } from '../../src/i18n';
import { insert, Row as DbRow } from '../../src/db/repo';
import { breederAnimals } from '../../src/services/breedingData';
import { bestInseminationTime, nextHeatWindow } from '../../src/lib/breeding';
import { fmtDateTime, isoToLocalDate } from '../../src/lib/dates';
import { scheduleOnce } from '../../src/services/notifications';
import { useBusy } from '../../src/lib/hooks';

export default function HeatLog() {
  const t = useT();
  const r = useRouter();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { busy, run } = useBusy();
  const [animals, setAnimals] = useState<DbRow[]>([]);
  const [aid, setAid] = useState(animalId ?? '');
  const [at, setAt] = useState(new Date().toISOString());
  const [intensity, setIntensity] = useState('normal');
  const [notes, setNotes] = useState('');
  useEffect(() => { breederAnimals().then(setAnimals); }, []);
  const animal = animals.find(a => a.id === aid);

  const save = () => run(async () => {
    if (!animal) return toast(t('Pick animal'), t('Choose the animal in heat.'));
    if (new Date(at).getTime() > Date.now() + 3600_000) return toast(t('Date'), t('Heat time is in the future.'));
    const heat = await insert<DbRow>('heat_records', { animal_id: animal.id, heat_at: at, intensity, notes });
    const best = bestInseminationTime(new Date(at));
    if (animal.species === 'cow' || animal.species === 'buffalo') {
      await scheduleOnce(`heat.${heat.id}.ai`, best, tNow('Best time for insemination'), tNow('{name}: inseminate now for best chance.', { name: animal.nickname }));
    }
    const w = nextHeatWindow(animal.species, isoToLocalDate(at));
    await confirm(t('Saved'),
      (animal.species === 'cow' || animal.species === 'buffalo'
        ? t('Best time for Oosi (AI): {time}. A reminder is set.', { time: fmtDateTime(best.toISOString()) }) + '\n'
        : '') + (w ? t('If not served, next heat is about {date}.', { date: w.expected }) : ''),
      t('OK'), t('Close'));
    r.replace(`/breeding/service?animalId=${animal.id}&heatId=${heat.id}`);
  });

  return (
    <Screen footer={<Btn title={t('Save heat')} onPress={save} loading={busy} />}>
      <Title>{t('Log heat (Paruvam)')}</Title>
      <Card>
        <PickerField label={t('Animal')} value={aid} onChange={setAid} options={animals.map(a => ({ value: a.id, label: `${a.nickname}${a.tag_id ? ' · ' + a.tag_id : ''}` }))} />
        <DateField label={t('When did you first see heat?')} mode="datetime" value={at} onChange={setAt} />
        <Chips label={t('Signs')} value={intensity} onChange={setIntensity} options={[{ value: 'weak', label: 'Weak' }, { value: 'normal', label: 'Normal' }, { value: 'strong', label: 'Strong / standing' }]} />
        <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline />
      </Card>
      <Txt v="small" style={{ marginTop: S.md }}>{t('Signs: restless, bellowing, mucus discharge, mounting others, standing when mounted. Buffalo often show weak ("silent") heat, so watch closely.')}</Txt>
    </Screen>
  );
}
