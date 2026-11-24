import React, { useCallback, useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Banner, Card, Chips, Empty, Fab, ListItem, Loading, Row, Screen, Txt, S, C, Icon, Btn } from '../../src/ui';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { list, getFarm, Row as DbRow } from '../../src/db/repo';
import { LISTING_CATEGORIES, LISTING_FLOWS, buyFlows } from '../../src/lib/constants';
import { fetchMarket, MarketListing } from '../../src/services/market';
import { getPosition } from '../../src/services/location';
import { useSettings } from '../../src/store/settings';
import { isCloudConfigured } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import { formatINR } from '../../src/lib/money';
import { fmtKm, validLatLng } from '../../src/lib/geo';
import { statusLabel } from '../../src/lib/labels';

export default function Market() {
  const t = useT();
  const r = useRouter();
  const { role } = useSettings();
  const session = useSession();
  const canSell = role === 'farmer' || role === 'agent';
  const [tab, setTab] = useState<'browse' | 'mine'>('browse');
  const [flow, setFlow] = useState('default');
  const [cat, setCat] = useState('all');
  const [radius, setRadius] = useState('50');
  const [rows, setRows] = useState<MarketListing[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);

  const { data: mine } = useLoad(() => list('listings', { orderBy: 'created_at DESC' }), [] as DbRow[], []);

  useEffect(() => {
    (async () => {
      const farm = await getFarm();
      if (farm && validLatLng(farm.lat, farm.lng)) setOrigin({ lat: farm.lat, lng: farm.lng });
      else { const p = await getPosition(6000); if (p) setOrigin({ lat: p.lat, lng: p.lng }); }
    })();
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    const flows = flow === 'default' ? buyFlows(role) : flow === 'all' ? null : [flow];
    const res = await fetchMarket({ origin, radiusKm: radius === 'any' ? null : Number(radius), flows, category: cat === 'all' ? null : cat });
    setRows(res.rows);
    setNote(res.fromCache ? (res.error === 'Offline' ? t('Offline: showing the last list you saw.') : res.error ? t('Could not refresh. Showing the last list you saw.') : '') : '');
    setBusy(false);
  }, [flow, cat, radius, origin, role, t]);

  useEffect(() => { if (tab === 'browse') load(); }, [tab, load, session]);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <Chips value={tab} onChange={v => setTab(v as any)} options={[{ value: 'browse', label: 'Browse' }, ...(canSell ? [{ value: 'mine', label: 'My listings' }] : [])]} />
        {tab === 'browse' ? (
          <>
            {!isCloudConfigured ? <Banner tone="warn" text={t('Cloud is not set up in this build, so the market cannot load.')} /> : !session ? (
              <Banner tone="info" text={t('Sign in to see animals and products for sale near you.')} action={<Btn small title={t('Sign in')} onPress={() => r.push('/auth')} />} />
            ) : null}
            {note ? <Banner tone="warn" text={note} /> : null}
            <Chips label={t('Who is selling to whom')} value={flow} onChange={setFlow}
              options={[{ value: 'default', label: 'For me' }, { value: 'all', label: 'All' }, ...LISTING_FLOWS.map(f => ({ value: f.key, label: f.label }))]} />
            <Chips label={t('What')} value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, ...LISTING_CATEGORIES.map(c => ({ value: c.key, label: c.label }))]} />
            <Chips label={t('Distance')} value={radius} onChange={setRadius} translate={false}
              options={[{ value: '10', label: '10 km' }, { value: '25', label: '25 km' }, { value: '50', label: '50 km' }, { value: '100', label: '100 km' }, { value: 'any', label: t('Any') }]} />
            {busy ? <Loading /> : rows.length === 0 ? <Empty icon="storefront-outline" text={t('Nothing listed here yet.')} /> : rows.map(x => (
              <Card key={x.id} style={{ marginBottom: S.sm }} onPress={() => r.push(`/market/${x.id}`)}>
                <Row gap={S.md}>
                  {x.photos?.[0] ? <Image source={{ uri: x.photos[0] }} style={{ width: 72, height: 72, borderRadius: 10 }} /> : (
                    <View style={{ width: 72, height: 72, borderRadius: 10, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Icon name="storefront" size={28} color={C.primary} /></View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Txt style={{ fontWeight: '700' }} numberOfLines={1}>{x.title}</Txt>
                    <Txt v="h2" color={C.primary}>{formatINR(x.price, 0)} <Txt v="small">/ {t(x.price_unit)}</Txt></Txt>
                    <Txt v="small">{t(LISTING_FLOWS.find(f => f.key === x.flow)?.label ?? '')}{x.village ? ' · ' + x.village : ''}{x.distanceKm != null ? ' · ' + fmtKm(x.distanceKm) : ''}</Txt>
                  </View>
                </Row>
              </Card>
            ))}
          </>
        ) : (
          <>
            {mine.length === 0 ? <Empty icon="tag-outline" text={t('You have not listed anything. Tap + to sell.')} /> : mine.map(x => (
              <ListItem key={x.id} icon="tag" title={x.title} subtitle={`${formatINR(x.price, 0)} / ${t(x.price_unit)} · ${t(LISTING_FLOWS.find(f => f.key === x.flow)?.label ?? '')}`}
                badge={<Badge tone={x.status === 'active' ? 'ok' : 'muted'} text={t(statusLabel(x.status))} />}
                onPress={() => r.push(`/market/${x.id}`)} />
            ))}
          </>
        )}
      </Screen>
      {canSell ? <Fab onPress={() => r.push('/market/new')} /> : null}
    </View>
  );
}
