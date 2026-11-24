import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Banner, Btn, Card, Chips, DateField, Empty, Field, KV, NumField, Row, Screen, SectionTitle, Txt, confirm, toast, Loading, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { MapView } from '../../src/ui/MapView';
import { useT } from '../../src/i18n';
import { getPosition } from '../../src/services/location';
import { requireSupabase, isCloudConfigured } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import { addDays, today } from '../../src/lib/dates';
import { formatINR, toNum } from '../../src/lib/money';
import { fmtKm, validLatLng } from '../../src/lib/geo';
import { itemsText } from '../../src/services/delivery';
import { getFarm } from '../../src/db/repo';
import { statusLabel } from '../../src/lib/labels';

interface Farm {
  farm_owner: string; farm_name: string | null; owner_name: string | null; village: string | null; distance_km: number;
  radius_km: number; price_per_litre: number | null; addons: { product: string; name: string; unit: string; price: number }[] | null; phone: string | null;
}

export default function CustomerDelivery() {
  const t = useT();
  const r = useRouter();
  const session = useSession();
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Farm | null>(null);
  const [f, setF] = useState<any>({ litres: '1', slot: 'morning', start: addDays(today(), 1), name: '', phone: '', address: '', addons: {} as Record<string, string> });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const [mine, setMine] = useState<any[]>([]);
  const [orders, setOrders] = useState<Record<string, any>>({});
  const [live, setLive] = useState<Record<string, any>>({});

  useEffect(() => { getFarm().then(x => x && setF((p: any) => ({ ...p, name: x.owner_name ?? '', phone: x.phone ?? '' }))); }, []);

  const loadMine = useCallback(async () => {
    if (!session) return;
    try {
      const sb = requireSupabase();
      const { data } = await sb.from('delivery_subscriptions').select('*').eq('customer_user_id', session.user.id).neq('status', 'ended').is('deleted_at', null);
      setMine(data ?? []);
      const ids = (data ?? []).map(x => x.id);
      if (ids.length) {
        const { data: os } = await sb.from('delivery_orders').select('*').in('subscription_id', ids).eq('date', today());
        const m: Record<string, any> = {};
        for (const o of os ?? []) m[o.subscription_id] = o;
        setOrders(m);
        const lv: Record<string, any> = {};
        for (const o of os ?? []) {
          if (o.status === 'out') {
            const { data: l } = await sb.rpc('order_partner_location', { p_order: o.id });
            if (Array.isArray(l) && l[0]) lv[o.subscription_id] = l[0];
          }
        }
        setLive(lv);
      }
    } catch { /* offline: leave as is */ }
  }, [session]);
  useFocusEffect(useCallback(() => { loadMine(); const h = setInterval(loadMine, 20000); return () => clearInterval(h); }, [loadMine]));

  const gps = async () => {
    const p = await getPosition();
    if (!p) return toast(t('Location'), t('Could not get your location. Turn on GPS and allow permission.'));
    setLoc({ lat: p.lat, lng: p.lng });
  };

  const search = async () => {
    if (!loc) return toast(t('Location'), t('Set your delivery location first.'));
    setBusy(true);
    try {
      const { data, error } = await requireSupabase().rpc('farms_in_range', { p_lat: loc.lat, p_lng: loc.lng });
      if (error) throw error;
      setFarms((data ?? []) as Farm[]);
    } catch (e: any) {
      toast(t('Could not search'), t('Needs internet and sign-in.') + '\n' + String(e?.message ?? ''));
    } finally { setBusy(false); }
  };

  const addonTotal = sel?.addons?.reduce((s, a) => s + toNum(f.addons[a.product], 0) * a.price, 0) ?? 0;
  const daily = sel ? toNum(f.litres) * (sel.price_per_litre ?? 0) + addonTotal : 0;

  const place = async () => {
    if (!sel || !loc) return;
    if (f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 10) return toast(t('Details'), t('Enter your name and a 10-digit phone number.'));
    if (f.address.trim().length < 5) return toast(t('Address'), t('Enter your full delivery address.'));
    const litres = toNum(f.litres);
    if (litres <= 0 || litres > 25) return toast(t('Litres'), t('Enter litres between 0 and 25.'));
    if (!(await confirm(t('Confirm order'), t('{l} L {slot} every day from {d}. About {amt} per day.', { l: litres, slot: t(statusLabel(f.slot)), d: f.start, amt: formatINR(daily, 0) }), t('Place order'), t('Cancel')))) return;
    setBusy(true);
    try {
      const addons = (sel.addons ?? []).map(a => ({ ...a, qty: toNum(f.addons[a.product], 0) })).filter(a => a.qty > 0);
      const { error } = await requireSupabase().rpc('place_subscription', {
        p_farm_owner: sel.farm_owner, p_lat: loc.lat, p_lng: loc.lng, p_address: f.address.trim(), p_name: f.name.trim(), p_phone: f.phone.trim(),
        p_slot: f.slot, p_litres: litres, p_addons: addons, p_start: f.start,
      });
      if (error) throw error;
      toast(t('Order placed'), t('The farmer will deliver from {d}.', { d: f.start }));
      setSel(null); setFarms(null);
      await loadMine();
    } catch (e: any) {
      toast(t('Could not place order'), String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  if (!isCloudConfigured) return <Screen><Title>{t('Farms near me')}</Title><Banner tone="warn" text={t('Cloud is not set up in this build.')} /></Screen>;
  if (!session) {
    return (
      <Screen>
        <Title>{t('Farms near me')}</Title>
        <Banner tone="info" text={t('Sign in to find farms that deliver to you.')} action={<Btn small title={t('Sign in')} onPress={() => r.push('/auth')} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>{t('Farms near me')}</Title>
      {mine.length ? (
        <>
          <SectionTitle>{t('My daily milk')}</SectionTitle>
          {mine.map(s => {
            const o = orders[s.id];
            const l = live[s.id];
            return (
              <Card key={s.id} style={{ marginBottom: S.sm }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Txt style={{ fontWeight: '700' }}>{s.litres} L · {t(statusLabel(s.slot))}</Txt>
                  <Badge tone={s.status === 'active' ? 'ok' : 'warn'} text={t(statusLabel(s.status))} />
                </Row>
                <Txt v="small">{s.address}</Txt>
                {o ? <Txt v="small" style={{ marginTop: 4 }}>{t('Today')}: {t(statusLabel(o.status))} · {itemsText(o.items)}</Txt> : <Txt v="small">{t('Today: not scheduled yet')}</Txt>}
                {l && validLatLng(l.lat, l.lng) ? (
                  <View style={{ marginTop: S.sm }}>
                    <MapView height={170} state={{ markers: [{ lat: l.lat, lng: l.lng, label: t('Delivery'), color: 'orange' }, ...(validLatLng(s.lat, s.lng) ? [{ lat: s.lat, lng: s.lng, label: t('You'), color: 'green' as const }] : [])], fit: true }} />
                    <Txt v="small">{t('Your delivery is on the way. Updates every 20 seconds.')}</Txt>
                  </View>
                ) : null}
                <Btn small v="ghost" title={t('Stop this subscription')} onPress={async () => {
                  if (!(await confirm(t('Stop subscription?'), '', t('Stop'), t('Cancel'), true))) return;
                  await requireSupabase().rpc('cancel_my_subscription', { p_id: s.id }); loadMine();
                }} />
              </Card>
            );
          })}
        </>
      ) : null}

      <SectionTitle>{t('Find a farm that delivers to you')}</SectionTitle>
      <Card>
        <Txt v="small" style={{ marginBottom: S.sm }}>{t('You only see farms whose own delivery distance covers your address. Tap the map to set your delivery address, or use GPS.')}</Txt>
        <MapView height={220} pickable state={{ center: loc ?? undefined, markers: loc ? [{ ...loc, label: t('My address'), color: 'red' }] : [], zoom: 14 }} onPick={(lat, lng) => setLoc({ lat, lng })} />
        <Row style={{ marginTop: S.sm }}>
          <Btn small v="secondary" icon="crosshairs-gps" title={t('Use GPS')} onPress={gps} />
          <Btn small icon="magnify" title={t('Find farms')} onPress={search} loading={busy} disabled={!loc} />
        </Row>
      </Card>

      {farms ? (
        farms.length === 0 ? <Empty icon="map-marker-off" text={t('No farm delivers to this address yet.')} /> : farms.map(fm => (
          <Card key={fm.farm_owner} style={{ marginTop: S.sm }} tone={sel?.farm_owner === fm.farm_owner ? 'ok' : undefined} onPress={() => setSel(fm)}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ fontWeight: '700', flex: 1 }}>{fm.farm_name || fm.owner_name || t('Farm')}</Txt>
              <Txt v="h2" color={C.primary}>{fm.price_per_litre ? `${formatINR(fm.price_per_litre, 0)}/L` : ''}</Txt>
            </Row>
            <Txt v="small">{fm.village ?? ''} · {fmtKm(Number(fm.distance_km))} {t('away')} · {t('delivers up to')} {fm.radius_km} km</Txt>
          </Card>
        ))
      ) : null}

      {sel ? (
        <Card style={{ marginTop: S.md }}>
          <Txt v="h2" style={{ marginBottom: S.sm }}>{t('Order from')} {sel.farm_name || sel.owner_name}</Txt>
          <Chips label={t('Litres per day')} value={f.litres} onChange={v => set('litres', v)} translate={false} options={['0.5', '1', '1.5', '2', '3', '5'].map(x => ({ value: x, label: `${x} L` }))} />
          <Chips label={t('Delivery time')} value={f.slot} onChange={v => set('slot', v)} options={[{ value: 'morning', label: 'Morning' }, { value: 'evening', label: 'Evening' }]} />
          <DateField label={t('Start from')} value={f.start} onChange={v => set('start', v)} />
          {(sel.addons ?? []).map(a => (
            <NumField key={a.product} label={`${t(a.name)} ${t('per day')} (${formatINR(a.price, 0)}/${t(a.unit)})`} value={f.addons[a.product] ?? ''} onChangeText={v => set('addons', { ...f.addons, [a.product]: v })} />
          ))}
          <Field label={t('Your name')} value={f.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
          <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
          <Field label={t('Full delivery address')} value={f.address} onChangeText={v => set('address', v)} multiline />
          <KV k={t('About per day')} v={formatINR(daily, 0)} bold />
          <Btn title={t('Place order')} onPress={place} loading={busy} />
        </Card>
      ) : null}
      {busy && !sel ? <Loading /> : null}
    </Screen>
  );
}
