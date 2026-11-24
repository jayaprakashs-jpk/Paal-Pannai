import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Badge, Banner, Btn, Card, Chips, DateField, Empty, KV, Row, Screen, SectionTitle, Txt, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { MapView, MapMarker } from '../../src/ui/MapView';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { getFarm, list, update, Row as DbRow } from '../../src/db/repo';
import { generateOrders, itemsText, mapsLink } from '../../src/services/delivery';
import { fmtKm, haversineKm, orderByNearest, validLatLng } from '../../src/lib/geo';
import { today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { callPhone } from '../../src/services/share';
import { supabase } from '../../src/services/supabase';
import { syncNow } from '../../src/services/sync';
import { statusLabel } from '../../src/lib/labels';

export default function Orders() {
  const t = useT();
  const { busy, run } = useBusy();
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('morning');
  const [live, setLive] = useState<Record<string, { lat: number; lng: number; updated_at: string; partner_name: string | null }>>({});
  const { data, reload } = useLoad(async () => ({
    farm: await getFarm(),
    orders: await list('delivery_orders', { where: 'date = ?', params: [date] }),
    subs: await list('delivery_subscriptions'),
  }), { farm: null as DbRow | null, orders: [] as DbRow[], subs: [] as DbRow[] }, [date]);

  const rows = useMemo(() => data.orders.filter(o => o.slot === slot).map(o => ({ o, s: data.subs.find(x => x.id === o.subscription_id) })).filter(x => x.s), [data, slot]);
  const farmPt = data.farm && validLatLng(data.farm.lat, data.farm.lng) ? { lat: data.farm.lat, lng: data.farm.lng } : null;
  const route = useMemo(() => {
    const withLoc = rows.filter(x => validLatLng(x.s!.lat, x.s!.lng)).map(x => ({ ...x, lat: x.s!.lat as number, lng: x.s!.lng as number }));
    const noLoc = rows.filter(x => !validLatLng(x.s!.lat, x.s!.lng));
    if (!farmPt) return { stops: withLoc, noLoc, totalKm: 0 };
    const pending = withLoc.filter(x => x.o.status === 'scheduled' || x.o.status === 'out');
    const done = withLoc.filter(x => !pending.includes(x));
    const { ordered, totalKm } = orderByNearest(farmPt, pending);
    return { stops: [...ordered, ...done], noLoc, totalKm };
  }, [rows, farmPt]);

  // Live partner position for orders that are out for delivery (needs cloud)
  const poll = useCallback(async () => {
    if (!supabase || date !== today()) return;
    const out = data.orders.filter(o => o.status === 'out');
    const next: typeof live = {};
    for (const o of out) {
      const { data: loc } = await supabase.rpc('order_partner_location', { p_order: o.id });
      const l = Array.isArray(loc) ? loc[0] : null;
      if (l) next[o.id] = l;
    }
    setLive(next);
  }, [data.orders, date]);
  useFocusEffect(useCallback(() => {
    poll();
    const h = setInterval(poll, 20000);
    return () => clearInterval(h);
  }, [poll]));

  const gen = () => run(async () => {
    const n = await generateOrders(date);
    await reload();
    syncNow().catch(() => {});
    toast(t('Deliveries'), n ? t('{n} deliveries created for today.', { n }) : t('Nothing new to create.'));
  });

  const setStatus = async (id: string, status: string) => {
    await update('delivery_orders', id, { status, delivered_at: status === 'delivered' ? new Date().toISOString() : null });
    await reload();
    syncNow().catch(() => {});
  };

  const markers: MapMarker[] = [
    ...(farmPt ? [{ ...farmPt, label: t('Farm'), color: 'green' as const }] : []),
    ...route.stops.map((x, i) => ({ lat: x.lat, lng: x.lng, label: String(i + 1), color: (x.o.status === 'delivered' ? 'green' : x.o.status === 'missed' ? 'red' : 'blue') as MapMarker['color'] })),
    ...Object.values(live).map(l => ({ lat: l.lat, lng: l.lng, label: l.partner_name ?? t('Partner'), color: 'orange' as const })),
  ];
  const doneCount = rows.filter(x => x.o.status === 'delivered').length;

  return (
    <Screen>
      <Title>{t("Today's route")}</Title>
      <DateField value={date} onChange={setDate} />
      <Row>
        <Btn small icon="plus" title={t('Create deliveries from subscriptions')} onPress={gen} loading={busy} />
      </Row>
      <View style={{ height: S.md }} />
      <Chips value={slot} onChange={setSlot} options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }]} />
      {!farmPt ? <Banner tone="warn" text={t('Set your farm location in delivery settings to get route order and distances.')} /> : null}
      {rows.length === 0 ? <Empty icon="moped" text={t('No deliveries for this slot.')} /> : (
        <>
          <Card>
            <KV k={t('Delivered')} v={`${doneCount} / ${rows.length}`} bold />
            {route.totalKm > 0 ? <KV k={t('Route length (approx., straight line)')} v={fmtKm(route.totalKm)} /> : null}
            <KV k={t('Value')} v={formatINR(rows.reduce((s, x) => s + (x.o.amount ?? 0), 0), 0)} />
          </Card>
          {markers.length > 0 ? <View style={{ marginVertical: S.md }}><MapView height={240} state={{ markers, fit: true }} /></View> : null}
          {Object.keys(live).length ? <Txt v="small" color={C.warn}>{t('Orange pin = delivery partner (updates every 20 seconds).')}</Txt> : null}

          <SectionTitle>{t('Stops in order')}</SectionTitle>
          {[...route.stops, ...route.noLoc].map((x, i) => {
            const prev = i === 0 ? farmPt : route.stops[i - 1];
            const d = prev && validLatLng(x.s!.lat, x.s!.lng) ? haversineKm(prev, { lat: x.s!.lat, lng: x.s!.lng }) : null;
            return (
              <Card key={x.o.id} style={{ marginBottom: S.sm }} tone={x.o.status === 'delivered' ? 'ok' : x.o.status === 'missed' ? 'danger' : undefined}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt style={{ fontWeight: '700', flex: 1 }}>{i + 1}. {x.s!.customer_name}</Txt>
                  <Badge tone={x.o.status === 'delivered' ? 'ok' : x.o.status === 'out' ? 'info' : x.o.status === 'missed' ? 'danger' : 'muted'}
                    text={t(statusLabel(x.o.status))} />
                </Row>
                <Txt v="small">{x.s!.address}</Txt>
                <Txt v="small">{itemsText(x.o.items)} · {formatINR(x.o.amount ?? 0, 0)}{d != null ? ' · ' + fmtKm(d) + ' ' + t('from previous') : ''}</Txt>
                {live[x.o.id] ? <Txt v="small" color={C.warn}>{t('Partner is on the way')}</Txt> : null}
                <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>
                  {x.s!.lat ? <Btn small v="ghost" icon="navigation" title={t('Navigate')} onPress={() => Linking.openURL(mapsLink(x.s!.lat, x.s!.lng))} /> : null}
                  {x.s!.customer_phone ? <Btn small v="ghost" icon="phone" title={t('Call')} onPress={() => callPhone(x.s!.customer_phone)} /> : null}
                  {x.o.status === 'scheduled' ? <Btn small v="secondary" title={t('Out')} onPress={() => setStatus(x.o.id, 'out')} /> : null}
                  {x.o.status !== 'delivered' ? <Btn small title={t('Delivered')} onPress={() => setStatus(x.o.id, 'delivered')} /> : null}
                  {x.o.status !== 'delivered' && x.o.status !== 'missed' ? <Btn small v="ghost" title={t('Missed')} onPress={() => setStatus(x.o.id, 'missed')} /> : null}
                </Row>
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
