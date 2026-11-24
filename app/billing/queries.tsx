import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, Chips, Empty, Fab, ListItem, Screen, Txt, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, Row as DbRow } from '../../src/db/repo';
import { fmtDate } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { statusLabel } from '../../src/lib/labels';

export default function Queries() {
  const t = useT();
  const r = useRouter();
  const [f, setF] = useState('open');
  const { data } = useLoad(async () => ({
    q: await list('payment_queries', { orderBy: 'raised_on DESC' }),
    buyers: await list('buyers'),
  }), { q: [] as DbRow[], buyers: [] as DbRow[] }, []);
  const shown = data.q.filter(x => f === 'all' || (f === 'open' ? x.status === 'open' || x.status === 'in_progress' : x.status === 'resolved' || x.status === 'rejected'));
  const open = data.q.filter(x => x.status === 'open' || x.status === 'in_progress');
  const missing = open.reduce((s, x) => s + (x.missing_amount ?? 0), 0);
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>{t('Missing amount queries')}</Title>
        <Card tone={missing > 0 ? 'warn' : 'ok'}>
          <Txt v="small">{t('Open missing amount')}</Txt>
          <Txt v="h2" color={missing > 0 ? C.warn : C.ok}>{formatINR(missing)}</Txt>
        </Card>
        <View style={{ height: 12 }} />
        <Chips value={f} onChange={setF} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
        {shown.length === 0 ? <Empty icon="help-circle-outline" text={t('No queries')} /> : shown.map(x => (
          <ListItem key={x.id} icon="help-circle" title={`${data.buyers.find(b => b.id === x.party_id)?.name ?? '-'} · ${formatINR(x.missing_amount ?? 0, 0)}`}
            subtitle={`${x.title} · ${fmtDate(x.raised_on)}`}
            badge={<Badge tone={x.status === 'resolved' ? 'ok' : x.status === 'rejected' ? 'danger' : x.status === 'in_progress' ? 'info' : 'warn'} text={t(statusLabel(x.status))} />}
            onPress={() => r.push(`/billing/query?id=${x.id}`)} />
        ))}
      </Screen>
      <Fab onPress={() => r.push('/billing/query')} />
    </View>
  );
}
