import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, NumField, PickerField, Row, Screen, Spacer, Txt, KV, toast, C, S } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, list, update, Row as DbRow, raw } from '../../src/db/repo';
import { CATEGORIES, SIZES, SPECIES, SpeciesKey } from '../../src/lib/constants';
import { cmToIn, estimateWeightKg, inToCm } from '../../src/lib/weight';
import { toNum } from '../../src/lib/money';
import { useSettings } from '../../src/store/settings';
import { pickPhoto } from '../../src/services/images';
import { useBusy } from '../../src/lib/hooks';

const BREEDS: Record<string, string[]> = {
  cow: ['Jersey cross', 'HF cross', 'Gir', 'Sahiwal', 'Kangayam', 'Umblachery', 'Red Sindhi', 'Country (Nattu maadu)'],
  buffalo: ['Murrah', 'Mehsana', 'Jaffarabadi', 'Nili-Ravi', 'Local'],
  goat: ['Kodi Aadu', 'Salem Black', 'Boer cross', 'Tellicherry', 'Jamunapari', 'Sirohi', 'Local'],
  sheep: ['Mecheri', 'Vembur', 'Ramnad White', 'Kilakarsal', 'Nellore', 'Local'],
  poultry: ['Nattu Kozhi (country)', 'Giriraja', 'Aseel', 'White Leghorn', 'Cobb broiler', 'Ross broiler', 'Japanese quail', 'Duck'],
  dog: ['Indian Pariah', 'Rajapalayam', 'Kombai', 'Labrador', 'German Shepherd', 'Other'],
  other: [],
};

const toDisp = (cm: number | null | undefined, unit: 'cm' | 'in') =>
  cm == null ? '' : String(unit === 'in' ? Math.round(cmToIn(cm) * 10) / 10 : cm);

export default function AnimalForm() {
  const t = useT();
  const r = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { lengthUnit } = useSettings();
  const { busy, run } = useBusy();
  const [herds, setHerds] = useState<DbRow[]>([]);
  const [f, setF] = useState<Record<string, any>>({
    nickname: '', tag_id: '', species: 'cow', breed: '', category: 'milking', sex: 'female', size: 'medium',
    dob: '', head_count: '1', herd_id: '', girth: '', height: '', length: '', weight: '', purchase_price: '', notes: '', photo_uri: '',
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    (async () => {
      setHerds(await list('herds', { orderBy: 'name' }));
      if (!id) {
        // suggest next tag id: NP-001 ...
        const c = await raw<{ c: number }>(`SELECT COUNT(*) AS c FROM animals`);
        setF(p => ({ ...p, tag_id: `NP-${String((c[0]?.c ?? 0) + 1).padStart(3, '0')}` }));
        return;
      }
      const a = await getById<DbRow>('animals', id);
      if (!a) return;
      setF({
        nickname: a.nickname, tag_id: a.tag_id ?? '', species: a.species, breed: a.breed ?? '', category: a.category ?? '',
        sex: a.sex ?? 'female', size: a.size ?? 'medium', dob: a.dob ?? '', head_count: String(a.head_count ?? 1), herd_id: a.herd_id ?? '',
        girth: toDisp(a.girth_cm, lengthUnit), height: toDisp(a.height_cm, lengthUnit), length: toDisp(a.body_length_cm, lengthUnit),
        weight: a.weight_source === 'manual' && a.weight_kg ? String(a.weight_kg) : '',
        purchase_price: a.purchase_price ? String(a.purchase_price) : '', notes: a.notes ?? '', photo_uri: a.photo_uri ?? '',
      });
    })();
  }, [id, lengthUnit]);

  const toCm = (s: string) => { const n = toNum(s, NaN); return Number.isFinite(n) && n > 0 ? (lengthUnit === 'in' ? inToCm(n) : n) : null; };
  const est = estimateWeightKg({ species: f.species, girthCm: toCm(f.girth), heightCm: toCm(f.height), bodyLengthCm: toCm(f.length) });
  const sp = f.species as SpeciesKey;

  const changeSpecies = (v: string) => {
    set('species', v);
    set('category', CATEGORIES[v as SpeciesKey]?.[0]?.key ?? '');
    if (v === 'poultry') set('sex', 'female');
  };

  const photo = async (src: 'camera' | 'library') => {
    const u = await pickPhoto(src);
    if (u) set('photo_uri', u);
    else toast(t('Photo'), t('Could not get a photo. Allow camera / gallery permission.'));
  };

  const save = () => run(async () => {
    if (!f.nickname.trim()) return toast(t('Name needed'), t('Please enter a nickname.'));
    const tag = f.tag_id.trim();
    if (tag) {
      const dup = await raw<{ id: string }>(`SELECT id FROM animals WHERE tag_id = ? AND deleted_at IS NULL AND id != ?`, [tag, id ?? '']);
      if (dup.length) return toast(t('Tag already used'), t('Another animal already has this tag ID.'));
    }
    const heads = Math.max(1, Math.floor(toNum(f.head_count, 1)));
    const manual = toNum(f.weight, 0);
    const weight_kg = manual > 0 ? manual : est?.kg ?? null;
    const row = {
      nickname: f.nickname.trim(), tag_id: tag || null, species: f.species, breed: f.breed, category: f.category,
      sex: f.sex, size: f.size, dob: f.dob || null, head_count: sp === 'poultry' ? heads : 1, herd_id: f.herd_id || null,
      girth_cm: toCm(f.girth), height_cm: toCm(f.height), body_length_cm: toCm(f.length),
      weight_kg, weight_source: manual > 0 ? 'manual' : est ? 'estimated' : null,
      photo_uri: f.photo_uri || null, purchase_price: toNum(f.purchase_price, 0) || null, notes: f.notes,
    };
    if (id) await update('animals', id, row); else await insert('animals', { ...row, status: 'active' });
    r.back();
  });

  const showMeasure = ['cow', 'buffalo', 'goat', 'sheep'].includes(f.species);
  const u = lengthUnit;

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{id ? t('Edit animal') : t('Add animal')}</Title>
      <Card>
        <Row gap={S.md} style={{ marginBottom: S.md }}>
          <View style={{ width: 84, height: 84, borderRadius: 12, backgroundColor: C.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {f.photo_uri ? <Image source={{ uri: f.photo_uri }} style={{ width: 84, height: 84 }} /> : <Txt v="small">{t('Photo')}</Txt>}
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <Btn small v="secondary" icon="camera" title={t('Camera')} onPress={() => photo('camera')} />
            <Btn small v="ghost" icon="image" title={t('Gallery')} onPress={() => photo('library')} />
          </View>
        </Row>
        <Field label={t('Nickname')} value={f.nickname} onChangeText={v => set('nickname', v)} autoCapitalize="words" />
        <Field label={t('Tag ID / QR code')} value={f.tag_id} onChangeText={v => set('tag_id', v)} autoCapitalize="none" />
        <Chips label={t('Species')} value={f.species} onChange={changeSpecies} options={SPECIES.map(s => ({ value: s.key, label: s.label, icon: s.icon }))} />
        <PickerField label={t('Breed')} value={f.breed} onChange={v => set('breed', v)} allowEmpty
          options={(BREEDS[f.species] ?? []).map(b => ({ value: b, label: b }))} />
        <Field label={t('Or type breed')} value={f.breed} onChangeText={v => set('breed', v)} />
        <Chips label={t('Category')} value={f.category} onChange={v => set('category', v)} options={(CATEGORIES[sp] ?? []).map(c => ({ value: c.key, label: c.label }))} />
        {sp !== 'poultry' ? (
          <Chips label={t('Sex')} value={f.sex} onChange={v => set('sex', v)} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
        ) : (
          <NumField label={t('Number of birds in this flock')} value={f.head_count} onChangeText={v => set('head_count', v)} />
        )}
        <Chips label={t('Size')} value={f.size} onChange={v => set('size', v)} options={SIZES.map(s => ({ value: s.key, label: s.label }))} />
        <DateField label={t('Date of birth (approx.)')} value={f.dob} onChange={v => set('dob', v)} clearable />
        <PickerField label={t('Herd / group')} value={f.herd_id} onChange={v => set('herd_id', v)} allowEmpty options={herds.map(h => ({ value: h.id, label: h.name }))} />
      </Card>

      {showMeasure ? (
        <Card style={{ marginTop: S.md }}>
          <Txt v="h2">{t('Body measurements')}</Txt>
          <Txt v="small" style={{ marginBottom: S.sm }}>
            {t('Use a tape. Girth = round the chest just behind the front legs. Height = ground to top of shoulder.')}
          </Txt>
          <Row gap={S.md}>
            <View style={{ flex: 1 }}><NumField label={t('Girth / width')} value={f.girth} onChangeText={v => set('girth', v)} suffix={u} /></View>
            <View style={{ flex: 1 }}><NumField label={t('Height')} value={f.height} onChangeText={v => set('height', v)} suffix={u} /></View>
          </Row>
          <NumField label={t('Body length (optional, more accurate)')} value={f.length} onChangeText={v => set('length', v)} suffix={u} />
          {est ? (
            <Card tone="ok">
              <KV k={t('Estimated weight')} v={`${est.kg} kg`} bold />
              <Txt v="small">{est.method === 'girth-length' ? t('From girth and body length') : t('From girth and height (add body length for better accuracy)')}</Txt>
            </Card>
          ) : null}
          <Spacer h={S.md} />
          <NumField label={t('Real weight if you have a scale (kg)')} value={f.weight} onChangeText={v => set('weight', v)} suffix="kg" />
        </Card>
      ) : (
        <Card style={{ marginTop: S.md }}>
          <NumField label={sp === 'poultry' ? t('Average weight per bird (kg)') : t('Weight (kg)')} value={f.weight} onChangeText={v => set('weight', v)} suffix="kg" />
        </Card>
      )}

      <Card style={{ marginTop: S.md }}>
        <NumField label={t('Purchase price (₹)')} value={f.purchase_price} onChangeText={v => set('purchase_price', v)} />
        <Field label={t('Notes')} value={f.notes} onChangeText={v => set('notes', v)} multiline />
      </Card>
    </Screen>
  );
}
