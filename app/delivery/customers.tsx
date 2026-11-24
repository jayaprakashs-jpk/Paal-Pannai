import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Btn, Card, Chips, DateField, Empty, Field, KV, NumField, Row, Screen, SectionTitle, Txt, confirm, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { getFarm, insert, list, update, Row as DbRow } from '../../src/db/repo';
import { getPosition } from '../../src/services/location';
import { haversineKm, validLatLng, fmtKm } from '../../src/lib/geo';
import { today } from '../../src/lib/dates';
import { toNum, formatINR } from '../../src/lib/money';
import { DEFAULT_ADDONS } from '../../src/services/delivery';
import { statusLabel } from '../../src/lib/labels';

export default function DeliveryCustomers() {
  const t = useT();
  const { busy, run } = useBusy();
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ name: '', phone: '', address: '', litres: '1', slot: 'morning', price: '', lat: null, lng: null, start: today(), addons: {} as Record<string, string> });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const { data, reload } = useLoad(async () => ({
    subs: await list('delivery_subscriptions', { orderBy: 'created_at DESC' }),
    farm: await getFarm(),
  }), { subs: [] as DbRow[], farm: null as DbRow | null }, []);
  useEffect(() => { if (data.farm?.delivery_price && !f.price) set('price', String(data.farm.delivery_price)); }, [data.farm]);

  const catalog: any[] = Array.isArray(data.farm?.addon_catalog) && data.farm!.addon_catalog.length ? data.farm!.addon_catalog : [];

  const save = () => run(async () => {
    if (!f.name.trim()) return toast(t('Name needed'), t('Enter the customer name.'));
    if (f.address.trim().length < 5) return toast(t('Address'), t('Enter the delivery address.'));
    const litres = toNum(f.litres);
    if (litres <= 0 || litres > 25) return toast(t('Litres'), t('Enter litres between 0 and 25.'));
    let dist: number | null = null;
    if (validLatLng(f.lat, f.lng) && data.farm && validLatLng(data.farm.lat, data.farm.lng)) {
      dist = Math.round(haversineKm({ lat: f.lat, lng: f.lng }, data.farm as any) * 100) / 100;
      const rad = data.farm.delivery_radius_km ?? 0;
      if (rad > 0 && dist > rad && !(await confirm(t('Outside your radius'), t('This address is {d} away, outside your {r} km limit. Add anyway?', { d: fmtKm(dist), r: rad }), t('Add anyway'), t('Cancel')))) return;
    }
    const buyer = await insert<DbRow>('buyers', { name: f.name.trim(), kind: 'customer', phone: f.phone, address: f.address, lat: f.lat, lng: f.lng });
    const addons = catalog.map(c => ({ ...c, qty: toNum(f.addons[c.product], 0) })).filter(a => a.qty > 0);
    await insert('delivery_subscriptions', {
      customer_id: buyer.id, customer_name: f.name.trim(), customer_phone: f.phone, address: f.address.trim(), lat: f.lat, lng: f.lng, distance_km: dist,
      slot: f.slot, litres, price_per_litre: toNum(f.price) || null, addons, start_date: f.start, status: 'active',
    });
    setAdding(false); setF({ ...f, name: '', phone: '', address: '', lat: null, lng: null, addons: {} });
    await reload();
  });

  const enableBilling = async (s: DbRow) => {
    const b = await insert<DbRow>('buyers', { name: s.customer_name || 'Customer', kind: 'customer', phone: s.customer_phone, address: s.address, lat: s.lat, lng: s.lng });
    await update('delivery_subscriptions', s.id, { customer_id: b.id });
    reload();
  };

  return (
    <Screen>
      <Title>{t('Delivery customers')}</Title>
      {!adding ? <Btn icon="account-plus" title={t('Add customer')} onPress={() => setAdding(true)} /> : (
        <Card>
          <Field label={t('Customer name')} value={f.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
          <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
          <Field label={t('Delivery address')} value={f.address} onChangeText={v => set('address', v)} multiline />
          <Btn small v="secondary" icon="crosshairs-gps" title={f.lat ? t('Location pinned') : t('Pin location (stand at the house)')} onPress={async () => {
            const p = await getPosition(); if (p) { set('lat', p.lat); set('lng', p.lng); } else toast(t('Location'), t('Could not get your location.'));
          }} />
          <View style={{ height: S.md }} />
          <NumField label={t('Milk per day (litres)')} value={f.litres} onChangeText={v => set('litres', v)} suffix="L" />
          <Chips label={t('Delivery time')} value={f.slot} onChange={v => set('slot', v)} options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }]} />
          <NumField label={t('Price per litre (₹)')} value={f.price} onChangeText={v => set('price', v)} />
          <DateField label={t('Start date')} value={f.start} onChange={v => set('start', v)} />
          {catalog.map(c => (
            <NumField key={c.product} label={`${t(c.name)} ${t('per day')} (${formatINR(c.price, 0)}/${t(c.unit)})`} value={f.addons[c.product] ?? ''} onChangeText={v => set('addons', { ...f.addons, [c.product]: v })} />
          ))}
          <Row>
            <View style={{ flex: 1 }}><Btn v="ghost" title={t('Cancel')} onPress={() => setAdding(false)} /></View>
            <View style={{ flex: 1 }}><Btn title={t('Save')} onPress={save} loading={busy} /></View>
          </Row>
        </Card>
      )}

      <SectionTitle>{t('Customers')} ({data.subs.length})</SectionTitle>
      {data.subs.length === 0 ? <Empty icon="account-multiple-outline" text={t('No delivery customers yet')} /> : data.subs.map(s => (
        <Card key={s.id} style={{ marginBottom: S.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ fontWeight: '700', flex: 1 }}>{s.customer_name}</Txt>
            <Badge tone={s.status === 'active' ? 'ok' : s.status === 'paused' ? 'warn' : 'muted'} text={t(statusLabel(s.status))} />
          </Row>
          <Txt v="small">{s.litres} L · {t(s.slot === 'morning' ? 'Morning' : 'Evening')}{s.distance_km != null ? ' · ' + fmtKm(s.distance_km) : ''}{s.customer_user_id ? ' · ' + t('ordered in app') : ''}</Txt>
          <Txt v="small">{s.address}</Txt>
          <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>
            {s.status === 'active' ? <Btn small v="ghost" title={t('Pause')} onPress={async () => { await update('delivery_subscriptions', s.id, { status: 'paused' }); reload(); }} /> : null}
            {s.status === 'paused' ? <Btn small v="secondary" title={t('Resume')} onPress={async () => { await update('delivery_subscriptions', s.id, { status: 'active' }); reload(); }} /> : null}
            {s.status !== 'ended' ? <Btn small v="ghost" title={t('End')} onPress={async () => { if (await confirm(t('End subscription?'), s.customer_name, t('End'), t('Cancel'), true)) { await update('delivery_subscriptions', s.id, { status: 'ended', end_date: today() }); reload(); } }} /> : null}
            {!s.customer_id ? <Btn small v="secondary" icon="receipt-text" title={t('Enable billing')} onPress={() => enableBilling(s)} /> : null}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
