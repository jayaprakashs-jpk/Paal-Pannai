import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Btn, Card, Chips, Field, KV, NumField, Row, Screen, SectionTitle, Toggle, Txt, toast, S, C, ListItem } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { MapView } from '../../src/ui/MapView';
import { useT } from '../../src/i18n';
import { getFarm, saveFarm } from '../../src/db/repo';
import { getPosition } from '../../src/services/location';
import { supabase } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import { syncNow } from '../../src/services/sync';
import { toNum } from '../../src/lib/money';
import { validLatLng } from '../../src/lib/geo';
import { DEFAULT_ADDONS } from '../../src/services/delivery';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { openWhatsApp } from '../../src/services/share';

const RADII = ['1', '2', '3', '5', '8', '10', '15'];

export default function FarmerDelivery() {
  const t = useT();
  const r = useRouter();
  const session = useSession();
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({ delivers_direct: false, radius: '3', price: '', lat: null, lng: null, code: '', addons: DEFAULT_ADDONS.map(a => ({ ...a, price: String(a.price || '') })) });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const { data: partners } = useLoad(async () => {
    if (!supabase || !session) return [] as any[];
    const { data } = await supabase.from('farm_partners').select('partner_user, partner_name, active').eq('farm_owner', session.user.id);
    return data ?? [];
  }, [] as any[], [session?.user.id]);

  useEffect(() => {
    getFarm().then(x => x && setF((p: any) => ({
      ...p, delivers_direct: !!x.delivers_direct, radius: String(x.delivery_radius_km || 3), price: x.delivery_price ? String(x.delivery_price) : '',
      lat: x.lat, lng: x.lng, code: x.farm_code ?? '',
      addons: Array.isArray(x.addon_catalog) && x.addon_catalog.length ? x.addon_catalog.map((a: any) => ({ ...a, price: a.price ? String(a.price) : '' })) : p.addons,
    })));
  }, []);

  const save = () => run(async () => {
    if (f.delivers_direct) {
      if (!validLatLng(f.lat, f.lng)) return toast(t('Farm location'), t('Set your farm location first. Customers are matched by distance from here.'));
      const r = toNum(f.radius, 0);
      if (r <= 0 || r > 50) return toast(t('Radius'), t('Choose a radius between 0 and 50 km.'));
      if (toNum(f.price, 0) <= 0) return toast(t('Price'), t('Enter your milk price per litre.'));
    }
    let code = f.code;
    if (f.delivers_direct && !code && supabase && session) {
      const { data, error } = await supabase.rpc('ensure_farm_code');
      if (!error && data) code = data as string;
    }
    await saveFarm({
      delivers_direct: f.delivers_direct, delivery_radius_km: toNum(f.radius, 0), delivery_price: toNum(f.price, 0) || null, lat: f.lat, lng: f.lng, farm_code: code || null,
      addon_catalog: f.addons.filter((a: any) => toNum(a.price) > 0).map((a: any) => ({ product: a.product, name: a.name, unit: a.unit, price: toNum(a.price) })),
    });
    set('code', code);
    const rep = await syncNow();
    toast(t('Saved'), f.delivers_direct
      ? (session ? (rep.ok ? t('Customers inside {r} km can now find you.', { r: f.radius }) : t('Saved on phone. Customers can find you after the next successful sync.')) : t('Saved on phone. Sign in so customers can find you.'))
      : t('Home delivery is off.'));
  });

  return (
    <Screen footer={<Btn title={t('Save delivery settings')} onPress={save} loading={busy} />}>
      <Title>{t('My home delivery')}</Title>
      {!session ? <Banner tone="warn" text={t('Sign in to be found by customers. Without it you can still manage your own delivery customers.')} action={<Btn small title={t('Sign in')} onPress={() => r.push('/auth')} />} /> : null}
      <Card>
        <Toggle label={t('I deliver milk with my own vehicle / staff')} value={f.delivers_direct} onChange={v => set('delivers_direct', v)}
          hint={t('Only customers inside your distance limit can see you and order.')} />
        {f.delivers_direct ? (
          <>
            <Chips label={t('I deliver within (km)')} value={f.radius} onChange={v => set('radius', v)} translate={false} options={RADII.map(x => ({ value: x, label: `${x} km` }))} />
            <NumField label={t('Or type a distance (km)')} value={f.radius} onChangeText={v => set('radius', v)} suffix="km" />
            <NumField label={t('Milk price per litre (₹)')} value={f.price} onChangeText={v => set('price', v)} />
            <Btn small v="secondary" icon="crosshairs-gps" title={validLatLng(f.lat, f.lng) ? t('Update farm location') : t('Set farm location (stand at your farm)')} onPress={async () => {
              const p = await getPosition();
              if (p) { set('lat', p.lat); set('lng', p.lng); } else toast(t('Location'), t('Could not get your location.'));
            }} />
            {validLatLng(f.lat, f.lng) ? (
              <View style={{ marginTop: S.md }}>
                <MapView height={220} state={{ markers: [{ lat: f.lat, lng: f.lng, label: t('My farm') }], circle: { lat: f.lat, lng: f.lng, radiusKm: toNum(f.radius, 0) || 0.1 } }} />
              </View>
            ) : null}
          </>
        ) : null}
      </Card>

      {f.delivers_direct ? (
        <>
          <SectionTitle>{t('Add-on products')}</SectionTitle>
          <Card>
            <Txt v="small" style={{ marginBottom: S.sm }}>{t('Set a price for what you sell. Leave blank to hide it from customers.')}</Txt>
            {f.addons.map((a: any, i: number) => (
              <NumField key={a.product} label={`${t(a.name)} (₹ / ${t(a.unit)})`} value={a.price}
                onChangeText={v => set('addons', f.addons.map((x: any, j: number) => (j === i ? { ...x, price: v } : x)))} />
            ))}
          </Card>

          <SectionTitle>{t('Delivery partners')}</SectionTitle>
          <Card>
            {f.code ? (
              <>
                <KV k={t('Your farm code')} v={f.code} bold color={C.primary} />
                <Txt v="small" style={{ marginBottom: S.sm }}>{t('Give this code to your delivery person. They install the app, choose "Delivery partner", and enter it.')}</Txt>
                <Btn small v="secondary" icon="whatsapp" title={t('Share code')} onPress={() => openWhatsApp('', `${t('Join my farm delivery on Paal Pannai. Farm code')}: ${f.code}`)} />
              </>
            ) : <Txt v="small">{t('Save with internet and sign-in to get your farm code.')}</Txt>}
            {partners.map((p: any) => <KV key={p.partner_user} k={p.partner_name || t('Partner')} v={p.active ? t('Active') : t('Off')} />)}
          </Card>
        </>
      ) : null}

      <SectionTitle>{t('Customers and deliveries')}</SectionTitle>
      <ListItem icon="account-multiple" title={t('Delivery customers')} subtitle={t('Daily subscriptions and add-ons')} onPress={() => r.push('/delivery/customers')} />
      <ListItem icon="map-marker-path" title={t("Today's route")} subtitle={t('Order stops, distance and live partner tracking')} onPress={() => r.push('/delivery/orders')} />
    </Screen>
  );
}
