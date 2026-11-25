import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Card, Icon, Row, Screen, SectionTitle, Stat, Txt, ListItem, Empty, C, S, R } from '../../src/ui';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { getFarm } from '../../src/db/repo';
import { loadHome, HomeData } from '../../src/services/dashboard';
import { formatINR } from '../../src/lib/money';
import { useSettings } from '../../src/store/settings';
import { isCloudConfigured } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import { refreshWeather } from '../../src/services/weatherAlerts';

const EMPTY: HomeData = { todayLitres: 0, todayIncome: 0, monthNet: 0, animalCount: 0, alerts: [] };

interface Tile { icon: string; label: string; href: string }

export default function Home() {
  const t = useT();
  const r = useRouter();
  const { role } = useSettings();
  const session = useSession();
  const { data, reload } = useLoad(() => loadHome(t), EMPTY, [t]);
  // Refresh weather in the background (cached 3h) so heat / rain alerts appear without opening the Weather screen.
  useEffect(() => {
    if (role !== 'farmer' && role !== 'agent') return;
    refreshWeather({ maxAgeH: 3 }).then(r => { if (r.fresh) reload(); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  const { data: farm } = useLoad(getFarm, null as any, []);

  const farmerTiles: Tile[] = [
    { icon: 'cup-water', label: 'Add milk', href: '/(tabs)/milk' },
    { icon: 'cow', label: 'Animals', href: '/(tabs)/animals' },
    { icon: 'grain', label: 'Feed calculator', href: '/care/feed' },
    { icon: 'heart-pulse', label: 'Breeding', href: '/breeding' },
    { icon: 'camera-document', label: 'Scan notebook', href: '/scan' },
    { icon: 'receipt-text', label: 'Bills', href: '/billing' },
    { icon: 'cash-minus', label: 'Expenses', href: '/finance/expenses' },
    { icon: 'weather-partly-rainy', label: 'Weather', href: '/weather' },
  ];
  const customerTiles: Tile[] = [
    { icon: 'map-marker-radius', label: 'Farms near me', href: '/delivery/customer' },
    { icon: 'storefront', label: 'Market', href: '/(tabs)/market' },
    { icon: 'weather-partly-rainy', label: 'Weather', href: '/weather' },
    { icon: 'cog', label: 'Settings', href: '/settings' },
  ];
  const partnerTiles: Tile[] = [
    { icon: 'moped', label: "Today's deliveries", href: '/delivery/partner' },
    { icon: 'cog', label: 'Settings', href: '/settings' },
  ];
  const tiles = role === 'customer' ? customerTiles : role === 'delivery_partner' ? partnerTiles : farmerTiles;
  const farmerLike = role === 'farmer' || role === 'agent';

  return (
    <Screen>
      <Txt v="title">{farm?.farm_name ? farm.farm_name : t('Paal Pannai')}</Txt>
      <Txt v="small" style={{ marginBottom: S.md }}>
        {farm?.owner_name ? `${t('Welcome')}, ${farm.owner_name}` : t('Your farm, in your pocket')}
      </Txt>

      {isCloudConfigured && !session ? (
        <Banner tone="info" text={t('You are working offline. Sign in to back up your data and use the marketplace.')}
          action={<Pressable onPress={() => r.push('/auth')}><Txt color={C.info} style={{ fontWeight: '700', marginTop: 6 }}>{t('Sign in')}</Txt></Pressable>} />
      ) : null}

      {farmerLike ? (
        <Row gap={S.sm}>
          <Stat label={t('Milk today')} value={`${data.todayLitres} L`} />
          <Stat label={t('Income today')} value={formatINR(data.todayIncome, 0)} />
          <Stat label={t('Month profit')} value={formatINR(data.monthNet, 0)} color={data.monthNet < 0 ? C.danger : C.ok} />
        </Row>
      ) : null}

      <SectionTitle>{t('Quick actions')}</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: S.sm }}>
        {tiles.map(tile => (
          <Pressable key={tile.href + tile.label} onPress={() => r.push(tile.href as any)}
            style={({ pressed }) => ({
              width: '23.5%', minWidth: 76, aspectRatio: 1, backgroundColor: C.card, borderRadius: R.lg, borderWidth: 1,
              borderColor: C.border, alignItems: 'center', justifyContent: 'center', padding: 4, opacity: pressed ? 0.8 : 1,
            })}>
            <Icon name={tile.icon} size={28} color={C.primary} />
            <Txt v="small" style={{ textAlign: 'center', marginTop: 4, fontSize: 11 }} numberOfLines={2}>{t(tile.label)}</Txt>
          </Pressable>
        ))}
      </View>

      {farmerLike ? (
        <>
          <SectionTitle>{t('Needs attention')}</SectionTitle>
          {data.alerts.length === 0 ? (
            <Card><Empty icon="check-circle-outline" text={data.animalCount ? t('All good. Nothing is due.') : t('Add your first animal to get reminders.')} /></Card>
          ) : data.alerts.map(a => (
            <ListItem key={a.id} icon={a.icon} title={a.title} subtitle={a.subtitle}
              tone={a.tone === 'danger' ? 'danger' : a.tone === 'warn' ? 'warn' : undefined}
              onPress={a.href ? () => r.push(a.href as any) : undefined} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}
