import React from 'react';
import { Image, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Badge, Btn, Card, Empty, KV, NumField, Row, Screen, SectionTitle, Txt, confirm, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { getById, insert, update, remove, Row as DbRow } from '../../src/db/repo';
import { fetchListing, MarketListing } from '../../src/services/market';
import { getUserId } from '../../src/services/auth';
import { LISTING_FLOWS } from '../../src/lib/constants';
import { callPhone, openWhatsApp } from '../../src/services/share';
import { formatINR, toNum } from '../../src/lib/money';
import { fmtDate, today } from '../../src/lib/dates';
import { MapView } from '../../src/ui/MapView';
import { validLatLng } from '../../src/lib/geo';
import { syncNow } from '../../src/services/sync';
import { statusLabel } from '../../src/lib/labels';

export default function ListingDetail() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [soldPrice, setSoldPrice] = React.useState('');
  const [selling, setSelling] = React.useState(false);
  const { data: l, reload } = useLoad(async () => {
    const mine = await getById<DbRow>('listings', id);
    if (mine) return { ...(mine as any), _mine: true } as MarketListing & { _mine?: boolean };
    const remote = await fetchListing(id);
    return remote ? ({ ...remote, _mine: remote.owner_id === getUserId() } as MarketListing & { _mine?: boolean }) : null;
  }, null as (MarketListing & { _mine?: boolean }) | null, [id]);

  if (!l) return <Screen><Title>{t('Listing')}</Title><Empty text={t('Listing not found')} /></Screen>;
  const d = l.details ?? {};
  const photos = l.photos ?? [];
  const msg = `${t('Hello, I saw your listing')}: ${l.title} (${formatINR(l.price, 0)}) ${t('on Nammoor Pannai')}.`;

  const markSold = async () => {
    const price = toNum(soldPrice, 0);
    if (price <= 0) return;
    await update('listings', id, { status: 'sold' });
    const animalId = (l as any).animal_id as string | null;
    await insert('incomes', { date: today(), kind: animalId ? 'animal_sale' : 'product_sale', amount: price, animal_id: animalId, notes: l.title });
    if (animalId) await update('animals', animalId, { status: 'sold' });
    syncNow().catch(() => {});
    r.back();
  };

  return (
    <Screen>
      <Title>{l.title}</Title>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: S.md }}>
          {photos.map(u => <Image key={u} source={{ uri: u }} style={{ width: 260, height: 190, borderRadius: 12, marginRight: 8 }} />)}
        </ScrollView>
      ) : null}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt v="big" color={C.primary}>{formatINR(l.price, 0)}</Txt>
          <Badge tone="info" text={t(LISTING_FLOWS.find(f => f.key === l.flow)?.label ?? '')} />
        </Row>
        <Txt v="small">/ {t(l.price_unit)} · {t('Qty')} {l.quantity}{l.village ? ' · ' + l.village : ''}</Txt>
        {l.description ? <Txt style={{ marginTop: 8 }}>{l.description}</Txt> : null}
      </Card>

      {d.breed || d.weight_kg || d.milk_avg_l ? (
        <>
          <SectionTitle>{t('Animal details')}</SectionTitle>
          <Card>
            {d.breed ? <KV k={t('Breed')} v={d.breed} /> : null}
            {d.dob ? <KV k={t('Born')} v={fmtDate(d.dob)} /> : null}
            {d.weight_kg ? <KV k={t('Weight')} v={`${d.weight_kg} kg`} /> : null}
            {d.girth_cm ? <KV k={t('Girth / height')} v={`${d.girth_cm} / ${d.height_cm ?? '-'} cm`} /> : null}
            {d.milk_avg_l != null ? <KV k={t('Milk (average per day)')} v={`${d.milk_avg_l} L`} bold /> : null}
            {Array.isArray(d.milk_history) && d.milk_history.length ? (
              <View style={{ marginTop: 8 }}>
                <Txt v="small">{t('Last 14 days milk (litres)')}</Txt>
                <Row style={{ alignItems: 'flex-end', height: 70, gap: 3 }}>
                  {d.milk_history.slice(-14).map((m: any) => {
                    const max = Math.max(...d.milk_history.map((x: any) => x.litres), 1);
                    return <View key={m.date} style={{ flex: 1, height: Math.max(4, (m.litres / max) * 64), backgroundColor: C.primary, borderRadius: 3 }} />;
                  })}
                </Row>
              </View>
            ) : null}
          </Card>
        </>
      ) : null}

      {validLatLng(l.lat, l.lng) ? (
        <View style={{ marginTop: S.md }}><MapView height={180} state={{ markers: [{ lat: l.lat!, lng: l.lng!, color: 'green' }], zoom: 13 }} /></View>
      ) : null}

      {l._mine ? (
        <View style={{ marginTop: S.lg }}>
          {l.status === 'active' ? (
            selling ? (
              <Card>
                <NumField label={t('Sold for (₹)')} value={soldPrice} onChangeText={setSoldPrice} />
                <Btn title={t('Confirm sold (adds to income)')} onPress={markSold} />
              </Card>
            ) : (
              <Row>
                <View style={{ flex: 1 }}><Btn icon="check" title={t('Mark sold')} onPress={() => setSelling(true)} /></View>
                <View style={{ flex: 1 }}><Btn v="ghost" title={t('Close listing')} onPress={async () => { await update('listings', id, { status: 'closed' }); syncNow().catch(() => {}); reload(); }} /></View>
              </Row>
            )
          ) : <Badge tone="muted" text={t(statusLabel(l.status ?? "closed"))} />}
          <View style={{ height: 8 }} />
          <Btn v="danger" title={t('Delete listing')} onPress={async () => { if (await confirm(t('Delete listing?'), l.title, t('Delete'), t('Cancel'), true)) { await remove('listings', id); syncNow().catch(() => {}); r.back(); } }} />
        </View>
      ) : (
        <Row style={{ marginTop: S.lg }}>
          <View style={{ flex: 1 }}><Btn icon="phone" title={t('Call')} onPress={() => callPhone(l.contact_phone)} disabled={!l.contact_phone} /></View>
          <View style={{ flex: 1 }}><Btn icon="whatsapp" v="secondary" title="WhatsApp" onPress={() => openWhatsApp(l.contact_phone, msg)} disabled={!l.contact_phone} /></View>
        </Row>
      )}
    </Screen>
  );
}
