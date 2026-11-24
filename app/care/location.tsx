import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Banner, Btn, Card, Chips, Empty, Field, KV, ListItem, PickerField, Row, Screen, SectionTitle, Txt, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { MapView } from '../../src/ui/MapView';
import { useT } from '../../src/i18n';
import { useLoad, useBusy } from '../../src/lib/hooks';
import { insert, list, update, Row as DbRow } from '../../src/db/repo';
import { getPosition, placeName } from '../../src/services/location';
import { AREA_CHANGE_THRESHOLD_M, fmtKm, haversineM, haversineKm, validLatLng } from '../../src/lib/geo';
import { fmtDateTime } from '../../src/lib/dates';
import { notifyNow } from '../../src/services/notifications';
import { tNow } from '../../src/i18n';

export default function LocationScreen() {
  const t = useT();
  const { animalId } = useLocalSearchParams<{ animalId?: string }>();
  const { busy, run } = useBusy();
  const { data } = useLoad(async () => ({
    animals: await list('animals', { where: `status='active'`, orderBy: 'nickname' }),
    herds: await list('herds', { orderBy: 'name' }),
  }), { animals: [] as DbRow[], herds: [] as DbRow[] }, []);
  const [kind, setKind] = useState<'animal' | 'herd'>(animalId ? 'animal' : 'herd');
  const [subject, setSubject] = useState(animalId ?? '');
  const [place, setPlace] = useState('');
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [logs, setLogs] = useState<DbRow[]>([]);

  const col = kind === 'animal' ? 'animal_id' : 'herd_id';
  const reloadLogs = async () => {
    if (!subject) { setLogs([]); return; }
    setLogs(await list('location_logs', { where: `${col} = ?`, params: [subject], orderBy: 'moved_at DESC', limit: 15 }));
  };
  useEffect(() => { reloadLogs(); }, [subject, kind]);
  useEffect(() => { getPosition(8000).then(p => p && setMe({ lat: p.lat, lng: p.lng })); }, []);

  const last = logs[0];
  const awayM = me && last ? haversineM(me, last as any) : null;

  const record = (at: { lat: number; lng: number }, accuracy: number | null) => run(async () => {
    if (!subject) return toast(t('Pick one'), t('Choose an animal or herd first.'));
    if (!validLatLng(at.lat, at.lng)) return toast(t('Location'), t('This location looks wrong. Try again.'));
    const prev = (await list('location_logs', { where: `${col} = ?`, params: [subject], orderBy: 'moved_at DESC', limit: 1 }))[0];
    const dist = prev ? haversineM(prev as any, at) : null;
    const changed = prev ? (dist as number) >= AREA_CHANGE_THRESHOLD_M : false;
    const name = place.trim() || (await placeName(at)) || '';
    const label = kind === 'animal' ? data.animals.find(a => a.id === subject)?.nickname : data.herds.find(h => h.id === subject)?.name;
    await insert('location_logs', {
      [col]: subject, place_name: name, lat: at.lat, lng: at.lng, accuracy, moved_at: new Date().toISOString(),
      distance_m: dist, area_changed: changed,
    });
    if (kind === 'herd') await update('herds', subject, { lat: at.lat, lng: at.lng, location_name: name || undefined });
    if (changed) {
      await notifyNow(tNow('Area changed'), tNow('{name} moved to a new area: {place} ({d} away)', { name: label ?? '', place: name || tNow('new location'), d: fmtKm((dist as number) / 1000) }));
    }
    setPlace(''); setPin(null);
    await reloadLogs();
    toast(changed ? t('Area changed') : t('Saved'), changed ? t('New area saved and alert sent.') : t('Location saved.'));
  });

  const markers = useMemo(() => {
    const m: any[] = logs.slice(0, 6).map((l, i) => ({ lat: l.lat, lng: l.lng, label: i === 0 ? l.place_name || t('Latest') : undefined, color: i === 0 ? 'green' : 'blue' }));
    if (pin) m.push({ lat: pin.lat, lng: pin.lng, label: t('New'), color: 'orange' });
    if (me) m.push({ lat: me.lat, lng: me.lng, label: t('You'), color: 'red' });
    return m;
  }, [logs, pin, me, t]);

  return (
    <Screen>
      <Title>{t('Location & pasture alerts')}</Title>
      <Txt v="small" style={{ marginBottom: S.md }}>
        {t('Stand at the new shed or grazing area and tap "Pin my GPS now". The app saves the spot and sends an alert if it is a new area. A phone can only know its own position, so pin it when you move the animals.')}
      </Txt>
      <Card>
        <Chips value={kind} onChange={v => { setKind(v as any); setSubject(''); }} options={[{ value: 'herd', label: 'Herd / group' }, { value: 'animal', label: 'One animal' }]} />
        <PickerField label={kind === 'animal' ? t('Animal') : t('Herd')} value={subject} onChange={setSubject}
          options={(kind === 'animal' ? data.animals.map(a => ({ value: a.id, label: a.nickname })) : data.herds.map(h => ({ value: h.id, label: h.name })))} />
        <Field label={t('Place name (shed, field, village)')} value={place} onChangeText={setPlace} />
      </Card>

      {awayM !== null && awayM >= AREA_CHANGE_THRESHOLD_M && subject ? (
        <Banner tone="warn" text={t('You are {d} from the last saved place. Moved the animals? Pin the new place below.', { d: fmtKm(awayM / 1000) })} />
      ) : null}

      <View style={{ marginVertical: S.md }}>
        <MapView height={260} pickable state={{ center: me ?? undefined, markers, fit: true }}
          onPick={(lat, lng) => setPin({ lat, lng })} />
        <Txt v="small" style={{ marginTop: 4 }}>{t('Tap the map to choose a spot, or use GPS.')}</Txt>
      </View>

      <Row>
        <View style={{ flex: 1 }}>
          <Btn icon="crosshairs-gps" title={t('Pin my GPS now')} loading={busy} onPress={async () => {
            const p = await getPosition();
            if (!p) return toast(t('Location'), t('Could not get your location. Turn on GPS and allow permission.'));
            setMe({ lat: p.lat, lng: p.lng });
            await record({ lat: p.lat, lng: p.lng }, p.accuracy);
          }} />
        </View>
      </Row>
      {pin ? (
        <View style={{ marginTop: S.sm }}>
          <Btn v="accent" icon="map-marker-check" title={t('Save the spot I tapped')} onPress={() => record(pin, null)} disabled={busy} />
        </View>
      ) : null}

      <SectionTitle>{t('Movement history')}</SectionTitle>
      {logs.length === 0 ? <Card><Empty icon="map-marker-off" text={subject ? t('No locations saved yet') : t('Pick an animal or herd')} /></Card> : logs.map(l => (
        <ListItem key={l.id} icon={l.area_changed ? 'map-marker-alert' : 'map-marker'} tone={l.area_changed ? 'warn' : undefined}
          title={l.place_name || `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}
          subtitle={`${fmtDateTime(l.moved_at)}${l.distance_m != null ? ' · ' + fmtKm(l.distance_m / 1000) + ' ' + t('from previous') : ''}`} />
      ))}
    </Screen>
  );
}
