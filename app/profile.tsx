import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, Field, NumField, PickerField, Row, Screen, Toggle, Txt, toast, S } from '../src/ui';
import { Title } from '../src/ui/Title';
import { useT } from '../src/i18n';
import { getFarm, saveFarm } from '../src/db/repo';
import { INDIAN_STATES } from '../src/lib/constants';
import { getPosition } from '../src/services/location';
import { toNum } from '../src/lib/money';
import { useBusy } from '../src/lib/hooks';

export default function Profile() {
  const t = useT();
  const r = useRouter();
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({
    farm_name: '', owner_name: '', phone: '', state: 'Tamil Nadu', district: '', village: '', farmer_category: 'small',
    is_woman: false, is_sc_st: false, land_acres: '', lat: null, lng: null, upi_id: '', bank_holder: '', bank_account_no: '', bank_ifsc: '',
  });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  useEffect(() => { getFarm().then(x => x && setF({ ...f, ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v ?? (typeof f[k] === 'string' ? '' : f[k])])), land_acres: x.land_acres ? String(x.land_acres) : '' })); }, []);

  const save = () => run(async () => {
    if (f.upi_id && !/^[\w.\-]{2,}@[\w.\-]{2,}$/.test(f.upi_id.trim())) return toast(t('UPI ID'), t('UPI ID looks wrong. Example: name@okbank'));
    await saveFarm({
      farm_name: f.farm_name, owner_name: f.owner_name, phone: f.phone, state: f.state, district: f.district, village: f.village,
      farmer_category: f.farmer_category, is_woman: f.is_woman, is_sc_st: f.is_sc_st, land_acres: f.land_acres ? toNum(f.land_acres) : null,
      lat: f.lat, lng: f.lng, upi_id: f.upi_id.trim() || null, bank_holder: f.bank_holder, bank_account_no: f.bank_account_no, bank_ifsc: f.bank_ifsc.toUpperCase(),
    });
    r.back();
  });

  return (
    <Screen footer={<Btn title={t('Save')} onPress={save} loading={busy} />}>
      <Title>{t('Farm profile')}</Title>
      <Card>
        <Field label={t('Farm name')} value={f.farm_name} onChangeText={v => set('farm_name', v)} />
        <Field label={t('Your name')} value={f.owner_name} onChangeText={v => set('owner_name', v)} autoCapitalize="words" />
        <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
        <PickerField label={t('State')} options={INDIAN_STATES.map(s => ({ value: s, label: s }))} value={f.state} onChange={v => set('state', v)} />
        <Field label={t('District')} value={f.district} onChangeText={v => set('district', v)} />
        <Field label={t('Village / town')} value={f.village} onChangeText={v => set('village', v)} />
        <Row style={{ marginBottom: S.md }}>
          <Btn small v="secondary" icon="crosshairs-gps" title={f.lat ? t('Update farm location') : t('Set farm location')} onPress={async () => {
            const p = await getPosition();
            if (p) { set('lat', p.lat); set('lng', p.lng); } else toast(t('Location'), t('Could not get your location.'));
          }} />
        </Row>
        {f.lat ? <Txt v="small">{f.lat.toFixed(5)}, {f.lng.toFixed(5)}</Txt> : null}
      </Card>
      <Card style={{ marginTop: S.md }}>
        <Txt v="h2" style={{ marginBottom: S.sm }}>{t('Get paid online')}</Txt>
        <Field label={t('UPI ID')} value={f.upi_id} onChangeText={v => set('upi_id', v)} autoCapitalize="none" placeholder="name@okbank" />
        <Field label={t('Account holder name')} value={f.bank_holder} onChangeText={v => set('bank_holder', v)} />
        <Field label={t('Bank account number')} value={f.bank_account_no} onChangeText={v => set('bank_account_no', v)} keyboardType="numeric" />
        <Field label={t('IFSC')} value={f.bank_ifsc} onChangeText={v => set('bank_ifsc', v)} autoCapitalize="none" />
      </Card>
      <Card style={{ marginTop: S.md }}>
        <Txt v="h2" style={{ marginBottom: S.sm }}>{t('For government scheme matching')}</Txt>
        <Chips label={t('Farmer type')} value={f.farmer_category} onChange={v => set('farmer_category', v)}
          options={[{ value: 'landless', label: 'Landless' }, { value: 'marginal', label: 'Marginal (<2.5 acre)' }, { value: 'small', label: 'Small (2.5-5 acre)' }, { value: 'medium', label: 'Medium / large' }, { value: 'bpl', label: 'BPL family' }]} />
        <NumField label={t('Land (acres)')} value={f.land_acres} onChangeText={v => set('land_acres', v)} />
        <Toggle label={t('Woman farmer')} value={f.is_woman} onChange={v => set('is_woman', v)} />
        <Toggle label={t('SC / ST')} value={f.is_sc_st} onChange={v => set('is_sc_st', v)} />
      </Card>
    </Screen>
  );
}
