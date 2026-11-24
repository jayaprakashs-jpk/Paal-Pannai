import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Empty, Fab, ListItem, Screen, Txt, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, Row as DbRow } from '../../src/db/repo';
import { BUYER_KINDS } from '../../src/lib/constants';
import { pickRate, ratePerLitre } from '../../src/lib/milk';
import { today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';

export default function Buyers() {
  const t = useT();
  const r = useRouter();
  const { data } = useLoad(async () => ({
    buyers: await list('buyers', { orderBy: 'name COLLATE NOCASE' }),
    rates: await list('buyer_rates'),
  }), { buyers: [] as DbRow[], rates: [] as DbRow[] }, []);
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Title>{t('Buyers & companies')}</Title>
        {data.buyers.length === 0 ? <Empty icon="domain" text={t('Add milk buyers: Aavin society, private dairy, agents, vendors or customers.')} /> : null}
        {data.buyers.map(b => {
          const card = pickRate(data.rates as any, b.id, today());
          return (
            <ListItem key={b.id} icon={b.kind === 'society' ? 'bank' : b.kind === 'customer' ? 'account' : 'domain'}
              title={b.name}
              subtitle={[t(BUYER_KINDS.find(k => k.key === b.kind)?.label ?? ''), b.phone, card ? `${formatINR(ratePerLitre(card, card.std_fat, card.std_snf))} /L` : t('No rate yet')].filter(Boolean).join(' · ')}
              badge={!b.is_active ? <Badge tone="muted" text={t('Inactive')} /> : undefined}
              onPress={() => r.push(`/milk/buyer?id=${b.id}`)} />
          );
        })}
      </Screen>
      <Fab onPress={() => r.push('/milk/buyer')} />
    </View>
  );
}
