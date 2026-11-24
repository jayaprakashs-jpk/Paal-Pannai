import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Badge, Banner, Btn, Card, Empty, Field, KV, Row, Screen, SectionTitle, Toggle, Txt, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { MapView } from '../../src/ui/MapView';
import { useT } from '../../src/i18n';
import { requireSupabase, isCloudConfigured } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import { watchPosition } from '../../src/services/location';
import { fmtKm, haversineKm, orderByNearest, validLatLng, LatLng } from '../../src/lib/geo';
import { today } from '../../src/lib/dates';
import { formatINR } from '../../src/lib/money';
import { itemsText, mapsLink } from '../../src/services/delivery';
import { callPhone } from '../../src/services/share';
import { getFarm } from '../../src/db/repo';
import { statusLabel } from '../../src/lib/labels';

export default function Partner() {
  const t = useT();
  const r = useRouter();
  const session = useSession();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [orders, setOrders] = useState<any[]>([]);
  const [me, setMe] = useState<LatLng | null>(null);
  const [sharing, setSharing] = useState(false);
  const sub = useRef<{ remove: () => void } | null>(null);
  const lastSent = useRef(0);
  const [msg, setMsg] = useState('');

  useEffect(() => { getFarm().then(x => x?.owner_name && setName(x.owner_name)); }, []);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const { data, error } = await requireSupabase().rpc('partner_orders', { p_date: today() });
      if (error) throw error;
      setOrders(data ?? []); setMsg('');
    } catch (e: any) { setMsg(String(e?.message ?? e)); }
  }, [session]);
  useFocusEffect(useCallback(() => { load(); const h = setInterval(load, 30000); return () => clearInterval(h); }, [load]));

  const stopShare = useCallback(async () => {
    sub.current?.remove(); sub.current = null; setSharing(false);
    try { await requireSupabase().rpc('partner_stop_sharing'); } catch { /* offline */ }
  }, []);
  useEffect(() => () => { sub.current?.remove(); }, []);

  const startShare = async () => {
    const s = await watchPosition(async f => {
      setMe(f);
      if (Date.now() - lastSent.current < 12000) return;
      lastSent.current = Date.now();
      try { await requireSupabase().rpc('partner_report_location', { p_lat: f.lat, p_lng: f.lng }); } catch { /* retry on next fix */ }
    }, 15000);
    if (!s) return toast(t('Location'), t('Allow location permission to share your live position.'));
    sub.current = s; setSharing(true);
  };

  const join = async () => {
    if (code.trim().length < 4) return toast(t('Farm code'), t('Enter the code the farmer gave you.'));
    try {
      const { data, error } = await requireSupabase().rpc('join_farm_as_partner', { p_code: code.trim(), p_name: name });
      if (error) throw error;
      toast(t('Joined'), `${data}`); setCode(''); load();
    } catch (e: any) { toast(t('Could not join'), String(e?.message ?? e)); }
  };

  const setStatus = async (id: string, status: string) => {
    try {
      const { error } = await requireSupabase().rpc('partner_set_status', { p_order: id, p_status: status });
      if (error) throw error;
      load();
    } catch (e: any) { toast(t('Could not update'), String(e?.message ?? e)); }
  };

  const ordered = useMemo(() => {
    const pts = orders.filter(o => validLatLng(o.lat, o.lng) && (o.status === 'scheduled' || o.status === 'out'));
    const rest = orders.filter(o => !pts.includes(o));
    const start = me ?? (pts[0] ? { lat: pts[0].lat, lng: pts[0].lng } : null);
    if (!start) return orders;
    return [...orderByNearest(start, pts).ordered, ...rest];
  }, [orders, me]);

  if (!isCloudConfigured) return <Screen><Title>{t("Today's deliveries")}</Title><Banner tone="warn" text={t('Cloud is not set up in this build.')} /></Screen>;
  if (!session) return <Screen><Title>{t("Today's deliveries")}</Title><Banner tone="info" text={t('Sign in first.')} action={<Btn small title={t('Sign in')} onPress={() => r.push('/auth')} />} /></Screen>;

  return (
    <Screen>
      <Title>{t("Today's deliveries")}</Title>
      {msg ? <Banner tone="warn" text={msg} /> : null}
      <Card>
        <Toggle label={t('Share my live location')} value={sharing} onChange={v => (v ? startShare() : stopShare())}
          hint={t('Customers and the farmer see where you are while you deliver. Works while this screen is open. Turn off when done.')} />
        <Txt v="label" style={{ marginBottom: 4 }}>{t('Join a farm')}</Txt>
        <Field value={code} onChangeText={setCode} placeholder={t('Farm code')} autoCapitalize="none" maxLength={10} />
        <Btn small v="secondary" title={t('Join')} onPress={join} />
      </Card>

      {ordered.length === 0 ? <Empty icon="moped" text={t('No deliveries for today. Join a farm with its code, or ask the farmer to create today\'s deliveries.')} /> : (
        <>
          <View style={{ marginVertical: S.md }}>
            <MapView height={230} state={{ fit: true, markers: [
              ...ordered.filter(o => validLatLng(o.lat, o.lng)).map((o, i) => ({ lat: o.lat, lng: o.lng, label: String(i + 1), color: (o.status === 'delivered' ? 'green' : 'blue') as 'green' | 'blue' })),
              ...(me ? [{ ...me, label: t('You'), color: 'red' as const }] : []),
            ] }} />
          </View>
          <SectionTitle>{t('Stops')} ({ordered.filter(o => o.status !== 'delivered').length} {t('left')})</SectionTitle>
          {ordered.map((o, i) => (
            <Card key={o.order_id} style={{ marginBottom: S.sm }} tone={o.status === 'delivered' ? 'ok' : undefined}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt style={{ fontWeight: '700', flex: 1 }}>{i + 1}. {o.customer_name}</Txt>
                <Badge tone={o.status === 'delivered' ? 'ok' : o.status === 'out' ? 'info' : o.status === 'missed' ? 'danger' : 'muted'} text={t(statusLabel(o.status))} />
              </Row>
              <Txt v="small">{o.address}</Txt>
              <Txt v="small">{itemsText(o.items)} · {t(o.slot === 'morning' ? 'Morning' : 'Evening')} · {formatINR(o.amount ?? 0, 0)}{me && validLatLng(o.lat, o.lng) ? ' · ' + fmtKm(haversineKm(me, o)) : ''}</Txt>
              <Row style={{ flexWrap: 'wrap', marginTop: 6 }}>
                {validLatLng(o.lat, o.lng) ? <Btn small v="ghost" icon="navigation" title={t('Navigate')} onPress={() => Linking.openURL(mapsLink(o.lat, o.lng))} /> : null}
                {o.customer_phone ? <Btn small v="ghost" icon="phone" title={t('Call')} onPress={() => callPhone(o.customer_phone)} /> : null}
                {o.status === 'scheduled' ? <Btn small v="secondary" title={t('Start')} onPress={() => setStatus(o.order_id, 'out')} /> : null}
                {o.status !== 'delivered' ? <Btn small title={t('Delivered')} onPress={() => setStatus(o.order_id, 'delivered')} /> : null}
                {o.status !== 'delivered' && o.status !== 'missed' ? <Btn small v="ghost" title={t('Missed')} onPress={() => setStatus(o.order_id, 'missed')} /> : null}
              </Row>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
