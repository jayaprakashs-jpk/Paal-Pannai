import React, { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, Field, NumField, PickerField, Row, Screen, Txt, toast, S, C, Icon } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getFarm, insert, list, raw, Row as DbRow } from '../../src/db/repo';
import { LISTING_CATEGORIES, LISTING_FLOWS, sellFlows } from '../../src/lib/constants';
import { useSettings } from '../../src/store/settings';
import { pickPhoto } from '../../src/services/images';
import { getPosition } from '../../src/services/location';
import { addDays, today } from '../../src/lib/dates';
import { toNum } from '../../src/lib/money';
import { validLatLng } from '../../src/lib/geo';
import { useBusy } from '../../src/lib/hooks';
import { syncNow } from '../../src/services/sync';

export default function NewListing() {
  const t = useT();
  const r = useRouter();
  const { role } = useSettings();
  const { busy, run } = useBusy();
  const flows = sellFlows(role);
  const [animals, setAnimals] = useState<DbRow[]>([]);
  const [f, setF] = useState<any>({
    flow: flows[0] ?? 'farmer_customer', category: 'cow', title: '', description: '', price: '', price_unit: 'each', quantity: '1',
    animal_id: '', photos: [] as string[], contact_phone: '', village: '', lat: null, lng: null,
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  useEffect(() => {
    list('animals', { where: `status='active'`, orderBy: 'nickname' }).then(setAnimals);
    getFarm().then(fm => fm && setF((p: any) => ({ ...p, contact_phone: fm.phone ?? '', village: fm.village ?? '', lat: fm.lat, lng: fm.lng })));
  }, []);

  const pickAnimal = (id: string) => {
    set('animal_id', id);
    const a = animals.find(x => x.id === id);
    if (!a) return;
    setF((p: any) => ({
      ...p, animal_id: id, title: p.title || `${a.breed ?? ''} ${a.species}`.trim(),
      category: ['cow', 'buffalo', 'poultry'].includes(a.species) ? a.species : ['goat', 'sheep'].includes(a.species) ? 'goat' : p.category,
      photos: a.photo_uri && !p.photos.length ? [a.photo_uri] : p.photos,
    }));
  };

  const addPhoto = async (src: 'camera' | 'library') => {
    if (f.photos.length >= 4) return toast(t('Photos'), t('Up to 4 photos.'));
    const u = await pickPhoto(src, 1100);
    if (u) set('photos', [...f.photos, u]); else toast(t('Photo'), t('Could not get a photo. Allow camera / gallery permission.'));
  };

  const save = () => run(async () => {
    const price = toNum(f.price, 0);
    if (!f.title.trim()) return toast(t('Title needed'), t('What are you selling?'));
    if (price <= 0 || price > 100_000_000) return toast(t('Price'), t('Enter a valid price.'));
    if (!f.contact_phone || f.contact_phone.replace(/\D/g, '').length < 10) return toast(t('Phone'), t('Buyers need a phone number to contact you.'));
    if (!validLatLng(f.lat, f.lng)) return toast(t('Location'), t('Set your location so nearby buyers can find you.'));

    let details: any = null;
    const a = animals.find(x => x.id === f.animal_id);
    if (a) {
      const milk = await raw<{ date: string; litres: number }>(
        `SELECT date, SUM(litres) AS litres FROM milk_entries WHERE animal_id = ? AND deleted_at IS NULL AND date >= ? GROUP BY date ORDER BY date`, [a.id, addDays(today(), -14)]);
      const avg = milk.length ? Math.round((milk.reduce((s, x) => s + x.litres, 0) / milk.length) * 10) / 10 : null;
      details = {
        breed: a.breed, species: a.species, category: a.category, dob: a.dob, weight_kg: a.weight_kg, girth_cm: a.girth_cm, height_cm: a.height_cm,
        milk_avg_l: avg, milk_history: milk, head_count: a.head_count, tag_id: a.tag_id,
      };
    }
    await insert('listings', {
      flow: f.flow, category: f.category, title: f.title.trim(), description: f.description, price, price_unit: f.price_unit,
      quantity: toNum(f.quantity, 1), animal_id: f.animal_id || null, photos: f.photos, details, lat: f.lat, lng: f.lng,
      village: f.village, contact_phone: f.contact_phone, status: 'active',
    });
    syncNow().catch(() => {});
    toast(t('Listed'), t('Your listing will appear to buyers once it syncs (needs internet and sign-in).'));
    r.back();
  });

  return (
    <Screen footer={<Btn title={t('Post listing')} onPress={save} loading={busy} />}>
      <Title>{t('New listing')}</Title>
      <Card>
        <Chips label={t('Who are you selling to?')} value={f.flow} onChange={v => set('flow', v)} options={LISTING_FLOWS.filter(x => flows.includes(x.key)).map(x => ({ value: x.key, label: x.label }))} />
        <Chips label={t('Category')} value={f.category} onChange={v => set('category', v)} options={LISTING_CATEGORIES.map(c => ({ value: c.key, label: c.label }))} />
        {['cow', 'buffalo', 'goat', 'poultry'].includes(f.category) ? (
          <PickerField label={t('From my animals (adds milk history and measurements)')} value={f.animal_id} onChange={pickAnimal} allowEmpty
            options={animals.map(a => ({ value: a.id, label: `${a.nickname} · ${a.breed ?? a.species}` }))} />
        ) : null}
        <Field label={t('Title')} value={f.title} onChangeText={v => set('title', v)} />
        <Field label={t('Details')} value={f.description} onChangeText={v => set('description', v)} multiline />
        <Row gap={S.md}>
          <View style={{ flex: 1 }}><NumField label={t('Price (₹)')} value={f.price} onChangeText={v => set('price', v)} /></View>
          <View style={{ flex: 1 }}><NumField label={t('Quantity')} value={f.quantity} onChangeText={v => set('quantity', v)} /></View>
        </Row>
        <Chips label={t('Price is per')} value={f.price_unit} onChange={v => set('price_unit', v)} options={[{ value: 'each', label: 'each' }, { value: 'litre', label: 'litre' }, { value: 'kg', label: 'kg' }, { value: 'load', label: 'load' }]} />
        <Field label={t('Phone buyers can call')} value={f.contact_phone} onChangeText={v => set('contact_phone', v)} keyboardType="phone-pad" />
        <Field label={t('Village / town')} value={f.village} onChangeText={v => set('village', v)} />
        <Btn small v="secondary" icon="crosshairs-gps" title={validLatLng(f.lat, f.lng) ? t('Location set (tap to update)') : t('Set location')} onPress={async () => {
          const p = await getPosition();
          if (p) { set('lat', p.lat); set('lng', p.lng); } else toast(t('Location'), t('Could not get your location.'));
        }} />
      </Card>
      <Card style={{ marginTop: S.md }}>
        <Txt v="label" style={{ marginBottom: 6 }}>{t('Photos')}</Txt>
        <Row style={{ flexWrap: 'wrap' }}>
          {f.photos.map((u: string, i: number) => (
            <Pressable key={u} onPress={() => set('photos', f.photos.filter((_: any, j: number) => j !== i))}>
              <Image source={{ uri: u }} style={{ width: 76, height: 76, borderRadius: 10 }} />
              <View style={{ position: 'absolute', top: 2, right: 2, backgroundColor: '#000A', borderRadius: 10 }}><Icon name="close" size={16} color="#fff" /></View>
            </Pressable>
          ))}
        </Row>
        <Row style={{ marginTop: S.sm }}>
          <Btn small v="secondary" icon="camera" title={t('Camera')} onPress={() => addPhoto('camera')} />
          <Btn small v="ghost" icon="image" title={t('Gallery')} onPress={() => addPhoto('library')} />
        </Row>
      </Card>
    </Screen>
  );
}
