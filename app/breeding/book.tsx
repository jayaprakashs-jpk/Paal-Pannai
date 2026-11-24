import React, { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, NumField, PickerField, Screen, Txt, toast, confirm, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT, tNow } from '../../src/i18n';
import { getById, insert, list, Row as DbRow } from '../../src/db/repo';
import { openWhatsApp } from '../../src/services/share';
import { scheduleOnce } from '../../src/services/notifications';
import { fmtDateTime } from '../../src/lib/dates';
import { toNum } from '../../src/lib/money';
import { useBusy } from '../../src/lib/hooks';

const SERVICES = [
  { value: 'Vet visit', label: 'Vet visit' }, { value: 'AI service (Oosi)', label: 'AI service (Oosi)' },
  { value: 'Semen delivery', label: 'Semen delivery' }, { value: 'Vaccination', label: 'Vaccination' }, { value: 'Other', label: 'Other' },
];

export default function Book() {
  const t = useT();
  const r = useRouter();
  const { providerId } = useLocalSearchParams<{ providerId: string }>();
  const { busy, run } = useBusy();
  const [p, setP] = useState<DbRow | null>(null);
  const [animals, setAnimals] = useState<DbRow[]>([]);
  const [f, setF] = useState<any>({ service: 'Vet visit', animal_id: '', scheduled_at: new Date(Date.now() + 3600_000).toISOString(), fee: '', notes: '' });
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  useEffect(() => {
    getById<DbRow>('providers', providerId).then(x => { setP(x); if (x?.fee) set('fee', String(x.fee)); });
    list('animals', { where: `status='active'`, orderBy: 'nickname' }).then(setAnimals);
  }, [providerId]);
  if (!p) return <Screen><Title>{t('Book')}</Title></Screen>;

  const msg = () => {
    const a = animals.find(x => x.id === f.animal_id);
    return `${t('Hello')} ${p.name}, ${t('I would like to book')}: ${t(f.service)}${a ? ` (${a.nickname})` : ''} ${t('on')} ${fmtDateTime(f.scheduled_at)}.${f.notes ? ' ' + f.notes : ''}`;
  };

  const save = (send: boolean) => run(async () => {
    if (new Date(f.scheduled_at).getTime() < Date.now() - 60_000) return toast(t('Date'), t('Choose a time in the future.'));
    const b = await insert<DbRow>('bookings', {
      provider_id: p.id, animal_id: f.animal_id || null, service: f.service, scheduled_at: f.scheduled_at,
      status: 'requested', fee: f.fee ? toNum(f.fee) : null, notes: f.notes,
    });
    await scheduleOnce(`booking.${b.id}`, new Date(new Date(f.scheduled_at).getTime() - 3600_000), tNow('Booking in 1 hour'), `${p.name}: ${f.service}`);
    if (send) await openWhatsApp(p.phone, msg());
    toast(t('Booking saved'), send ? t('Send the WhatsApp message to ask them to confirm.') : t('Call to confirm.'));
    r.back();
  });

  return (
    <Screen>
      <Title>{t('Book')}</Title>
      <Card>
        <Txt v="h2" style={{ marginBottom: S.md }}>{p.name}</Txt>
        <Chips label={t('Service')} value={f.service} onChange={v => set('service', v)} options={SERVICES} />
        <PickerField label={t('Animal (optional)')} value={f.animal_id} onChange={v => set('animal_id', v)} allowEmpty options={animals.map(a => ({ value: a.id, label: a.nickname }))} />
        <DateField label={t('When')} mode="datetime" value={f.scheduled_at} onChange={v => set('scheduled_at', v)} />
        <NumField label={t('Expected fee (₹)')} value={f.fee} onChangeText={v => set('fee', v)} />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
        <Btn icon="whatsapp" title={t('Save & send on WhatsApp')} onPress={() => save(true)} loading={busy} disabled={!p.phone} />
        <Btn v="secondary" title={t('Save request only')} onPress={() => save(false)} disabled={busy} style={{ marginTop: 8 }} />
      </Card>
      <Txt v="small" style={{ marginTop: S.md }}>{t('The vet or dealer is not an app user, so this sends a request. They confirm by phone or WhatsApp. Mark it Confirmed in My bookings after they reply.')}</Txt>
    </Screen>
  );
}
