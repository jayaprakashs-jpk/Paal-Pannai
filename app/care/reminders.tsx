import React, { useState } from 'react';
import { View, Pressable, Text } from 'react-native';
import { Btn, Card, Chips, DateField, Empty, Field, ListItem, PickerField, Row, Screen, SectionTitle, Toggle, Txt, confirm, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad, useBusy } from '../../src/lib/hooks';
import { insert, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { cancelReminder, ensureNotificationPermission, scheduleReminder } from '../../src/services/notifications';

const KINDS = [
  { value: 'feed', label: 'Feeding' }, { value: 'water', label: 'Water' },
  { value: 'medicine', label: 'Medicine' }, { value: 'custom', label: 'Other' },
];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRESETS = [
  { kind: 'feed', title: 'Morning feeding', time: '06:00' },
  { kind: 'water', title: 'Water check', time: '12:00' },
  { kind: 'feed', title: 'Evening feeding', time: '17:30' },
];

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

export default function Reminders() {
  const t = useT();
  const { busy, run } = useBusy();
  const { data, reload } = useLoad(async () => ({
    rows: await list('reminders', { orderBy: 'time_hhmm' }),
    animals: await list('animals', { where: `status='active'`, orderBy: 'nickname' }),
  }), { rows: [] as DbRow[], animals: [] as DbRow[] }, []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: 'feed', title: '', time: '06:00', days: [1, 2, 3, 4, 5, 6, 7], animal_id: '' });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  const add = (x: { kind: string; title: string; time: string; days?: number[]; animal_id?: string }) => run(async () => {
    if (!(await ensureNotificationPermission())) {
      toast(t('Notifications off'), t('Allow notifications for this app in phone settings, or reminders cannot ring.'));
    }
    const row = await insert<DbRow>('reminders', {
      kind: x.kind, title: x.title, time_hhmm: x.time, days: (x.days ?? [1, 2, 3, 4, 5, 6, 7]).join(','), enabled: true, animal_id: x.animal_id || null,
    });
    await scheduleReminder(row as any);
    setOpen(false);
    await reload();
  });

  return (
    <Screen>
      <Title>{t('Reminders')}</Title>
      <Txt v="small" style={{ marginBottom: S.md }}>{t('Reminders ring even without internet. On some phones, switch off battery saving for this app so alarms are not delayed.')}</Txt>

      {data.rows.length === 0 ? (
        <Card>
          <Empty icon="bell-outline" text={t('No reminders yet. Add the usual farm times in one tap:')} />
          {PRESETS.map(p => <Btn key={p.title} small v="secondary" title={`${t(p.title)} · ${fmtTime(p.time)}`} onPress={() => add({ kind: p.kind, title: t(p.title), time: p.time })} style={{ marginBottom: 6 }} />)}
        </Card>
      ) : data.rows.map(rem => (
        <Card key={rem.id} style={{ marginBottom: S.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt style={{ fontWeight: '700' }}>{rem.title}</Txt>
              <Txt v="small">{fmtTime(rem.time_hhmm)} · {rem.days === '1,2,3,4,5,6,7' ? t('Every day') : rem.days.split(',').map((d: string) => t(DAY_LABELS[Number(d) - 1])).join(', ')}</Txt>
              {rem.animal_id ? <Txt v="small">{data.animals.find(a => a.id === rem.animal_id)?.nickname}</Txt> : null}
            </View>
            <Toggle label="" value={!!rem.enabled} onChange={async v => {
              const row = await update<DbRow>('reminders', rem.id, { enabled: v });
              await scheduleReminder(row as any);
              await reload();
            }} />
            <Pressable hitSlop={10} onPress={async () => {
              if (!(await confirm(t('Delete reminder?'), rem.title, t('Delete'), t('Cancel'), true))) return;
              await cancelReminder(rem.id); await remove('reminders', rem.id); await reload();
            }}><Text style={{ color: C.danger, fontWeight: '700', marginLeft: 8 }}>{t('Delete')}</Text></Pressable>
          </Row>
        </Card>
      ))}

      <SectionTitle>{t('Add reminder')}</SectionTitle>
      {!open ? <Btn icon="plus" title={t('New reminder')} onPress={() => setOpen(true)} /> : (
        <Card>
          <Chips label={t('Type')} value={f.kind} onChange={v => set('kind', v)} options={KINDS} />
          <Field label={t('Title')} value={f.title} onChangeText={v => set('title', v)} placeholder={t('e.g. Give mineral mixture')} />
          <DateField label={t('Time')} mode="time" value={f.time} onChange={v => set('time', v)} />
          <Txt v="label" style={{ marginBottom: 6 }}>{t('Days')}</Txt>
          <Row style={{ flexWrap: 'wrap', marginBottom: S.md }}>
            {DAY_LABELS.map((d, i) => {
              const on = f.days.includes(i + 1);
              return (
                <Pressable key={d} onPress={() => set('days', on ? f.days.filter(x => x !== i + 1) : [...f.days, i + 1].sort())}
                  style={{ paddingVertical: 8, paddingHorizontal: 11, borderRadius: 16, backgroundColor: on ? C.primary : C.white, borderWidth: 1, borderColor: on ? C.primary : C.border }}>
                  <Text style={{ color: on ? '#fff' : C.text, fontWeight: '600' }}>{t(d)}</Text>
                </Pressable>
              );
            })}
          </Row>
          <PickerField label={t('For animal (optional)')} value={f.animal_id} onChange={v => set('animal_id', v)} allowEmpty
            options={data.animals.map(a => ({ value: a.id, label: a.nickname }))} />
          <Row>
            <View style={{ flex: 1 }}><Btn v="ghost" title={t('Cancel')} onPress={() => setOpen(false)} /></View>
            <View style={{ flex: 1 }}><Btn title={t('Save')} loading={busy} onPress={() => {
              if (!f.title.trim()) return toast(t('Title needed'), t('Write what to remind.'));
              if (!f.days.length) return toast(t('Pick days'), t('Choose at least one day.'));
              add({ kind: f.kind, title: f.title.trim(), time: f.time, days: f.days, animal_id: f.animal_id });
            }} /></View>
          </Row>
        </Card>
      )}
    </Screen>
  );
}
