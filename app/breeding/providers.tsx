import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Btn, Card, Chips, Empty, Fab, Field, Row, Screen, Txt, S, C, Icon } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, update, Row as DbRow } from '../../src/db/repo';
import { callPhone, openWhatsApp } from '../../src/services/share';
import { fmtDateTime } from '../../src/lib/dates';
import { PROVIDER_KINDS } from '../../src/lib/constants';
import { formatINR } from '../../src/lib/money';
import { statusLabel } from '../../src/lib/labels';

export default function Providers() {
  const t = useT();
  const r = useRouter();
  const [tab, setTab] = useState<'dir' | 'book'>('dir');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const { data, reload } = useLoad(async () => ({
    providers: await list('providers', { orderBy: 'is_favorite DESC, name COLLATE NOCASE' }),
    bookings: await list('bookings', { orderBy: 'scheduled_at DESC' }),
    animals: await list('animals'),
  }), { providers: [] as DbRow[], bookings: [] as DbRow[], animals: [] as DbRow[] }, []);

  const shown = data.providers.filter(p => (kind === 'all' || p.kind === kind) &&
    (!q || `${p.name} ${p.village ?? ''} ${p.address ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  const changeStatus = (b: DbRow) => Alert.alert(t('Booking status'), '', [
    { text: t('Confirmed'), onPress: async () => { await update('bookings', b.id, { status: 'confirmed' }); reload(); } },
    { text: t('Done'), onPress: async () => { await update('bookings', b.id, { status: 'done' }); reload(); } },
    { text: t('Cancelled'), style: 'destructive', onPress: async () => { await update('bookings', b.id, { status: 'cancelled' }); reload(); } },
    { text: t('Close'), style: 'cancel' },
  ]);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>{t('Vets & semen dealers')}</Title>
        <Chips value={tab} onChange={v => setTab(v as any)} options={[{ value: 'dir', label: 'Directory' }, { value: 'book', label: 'My bookings' }]} />
        {tab === 'dir' ? (
          <>
            <Field value={q} onChangeText={setQ} placeholder={t('Search name or village')} />
            <Chips value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...PROVIDER_KINDS]} />
            {shown.length === 0 ? <Empty icon="doctor" text={t('Save the numbers of your vet, AI worker and semen dealer here.')} /> : shown.map(p => (
              <Card key={p.id} style={{ marginBottom: S.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <Row><Txt style={{ fontWeight: '700' }}>{p.name}</Txt>{p.is_favorite ? <Icon name="star" size={16} color={C.accent} /> : null}</Row>
                    <Txt v="small">{t(PROVIDER_KINDS.find(k => k.value === p.kind)?.label ?? '')}{p.village ? ' · ' + p.village : ''}{p.fee ? ' · ' + formatINR(p.fee, 0) : ''}</Txt>
                  </View>
                  <Btn small v="ghost" icon="pencil" title="" onPress={() => r.push(`/breeding/provider?id=${p.id}`)} />
                </Row>
                <Row style={{ flexWrap: 'wrap', marginTop: S.sm }}>
                  <Btn small v="secondary" icon="phone" title={t('Call')} onPress={() => callPhone(p.phone)} disabled={!p.phone} />
                  <Btn small v="secondary" icon="whatsapp" title="WhatsApp" onPress={() => openWhatsApp(p.phone, '')} disabled={!p.phone} />
                  <Btn small icon="calendar-check" title={t('Book')} onPress={() => r.push(`/breeding/book?providerId=${p.id}`)} />
                </Row>
              </Card>
            ))}
          </>
        ) : (
          <>
            {data.bookings.length === 0 ? <Empty icon="calendar-blank" text={t('No bookings yet')} /> : data.bookings.map(b => {
              const p = data.providers.find(x => x.id === b.provider_id);
              const a = data.animals.find(x => x.id === b.animal_id);
              return (
                <Card key={b.id} style={{ marginBottom: S.sm }} onPress={() => changeStatus(b)}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Txt style={{ fontWeight: '700' }}>{p?.name ?? '-'}</Txt>
                    <Badge tone={b.status === 'done' ? 'ok' : b.status === 'cancelled' ? 'danger' : b.status === 'confirmed' ? 'info' : 'warn'} text={t(statusLabel(b.status))} />
                  </Row>
                  <Txt v="small">{t(b.service)}{a ? ' · ' + a.nickname : ''} · {fmtDateTime(b.scheduled_at)}</Txt>
                </Card>
              );
            })}
            <Txt v="small">{t('Tap a booking to change its status. Bookings are requests: confirm by phone or WhatsApp with the vet or dealer.')}</Txt>
          </>
        )}
      </Screen>
      {tab === 'dir' ? <Fab onPress={() => r.push('/breeding/provider')} /> : null}
    </View>
  );
}
