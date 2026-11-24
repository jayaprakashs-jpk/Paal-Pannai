import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Chips, Field, NumField, PickerField, Screen, Toggle, Txt, Row, Spacer, C, S, toast } from '../src/ui';
import { useT } from '../src/i18n';
import { Lang, Role, setSettings, useSettings } from '../src/store/settings';
import { ROLES, INDIAN_STATES } from '../src/lib/constants';
import { saveFarm } from '../src/db/repo';
import { getPosition, placeName } from '../src/services/location';
import { toNum } from '../src/lib/money';
import { useBusy } from '../src/lib/hooks';

export default function Onboarding() {
  const t = useT();
  const r = useRouter();
  const { lang, role } = useSettings();
  const [step, setStep] = useState(0);
  const { busy, run } = useBusy();
  const [f, setF] = useState({
    farm_name: '', owner_name: '', phone: '', state: 'Tamil Nadu', district: '', village: '',
    farmer_category: 'small', is_woman: false, is_sc_st: false, land_acres: '', lat: null as number | null, lng: null as number | null,
  });
  const set = (k: string, v: any) => setF(p => ({ ...p, [k]: v }));
  const farmerLike = role === 'farmer' || role === 'agent';

  const pin = () => run(async () => {
    const p = await getPosition();
    if (!p) return toast(t('Location'), t('Could not get your location. Turn on GPS and allow permission.'));
    set('lat', p.lat); set('lng', p.lng);
    if (!f.village) { const n = await placeName(p); if (n) set('village', n); }
  });

  const finish = () => run(async () => {
    if (!f.owner_name.trim()) return toast(t('Name needed'), t('Please enter your name.'));
    await saveFarm({
      farm_name: f.farm_name || null, owner_name: f.owner_name, phone: f.phone, state: f.state, district: f.district,
      village: f.village, farmer_category: f.farmer_category, is_woman: f.is_woman, is_sc_st: f.is_sc_st,
      land_acres: f.land_acres ? toNum(f.land_acres) : null, lat: f.lat, lng: f.lng,
    });
    await setSettings({ onboarded: true });
    r.replace('/(tabs)');
  });

  return (
    <Screen>
      <Spacer h={S.xl} />
      <Txt v="title" color={C.primary}>Nammoor Pannai</Txt>
      <Txt v="small">நம்மூர் பண்ணை</Txt>
      <Spacer />

      {step === 0 ? (
        <>
          <Card>
            <Txt v="h2" style={{ marginBottom: S.sm }}>{t('Choose language')} / மொழி</Txt>
            <Chips value={lang} onChange={v => setSettings({ lang: v as Lang })} translate={false}
              options={[{ value: 'en', label: 'English' }, { value: 'ta', label: 'தமிழ்' }]} />
            <Txt v="h2" style={{ marginBottom: S.sm }}>{t('I am a')}</Txt>
            <Chips value={role} onChange={v => setSettings({ role: v as Role })}
              options={ROLES.map(x => ({ value: x.key, label: x.label }))} />
          </Card>
          <Spacer />
          <Btn title={t('Next')} onPress={() => setStep(1)} />
        </>
      ) : (
        <>
          <Card>
            <Field label={t('Your name')} value={f.owner_name} onChangeText={v => set('owner_name', v)} autoCapitalize="words" />
            <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" maxLength={15} />
            {farmerLike ? <Field label={t('Farm name (optional)')} value={f.farm_name} onChangeText={v => set('farm_name', v)} /> : null}
            <PickerField label={t('State')} options={INDIAN_STATES.map(s => ({ value: s, label: s }))} value={f.state} onChange={v => set('state', v)} />
            <Field label={t('District')} value={f.district} onChangeText={v => set('district', v)} />
            <Field label={t('Village / town')} value={f.village} onChangeText={v => set('village', v)} />
            <Row style={{ marginBottom: S.md }}>
              <Btn small v="secondary" icon="crosshairs-gps" title={f.lat ? t('Location saved') : t('Use my location')} onPress={pin} loading={busy} />
            </Row>
          </Card>
          {farmerLike ? (
            <Card style={{ marginTop: S.md }}>
              <Txt v="h2" style={{ marginBottom: 4 }}>{t('For government scheme matching')}</Txt>
              <Txt v="small" style={{ marginBottom: S.sm }}>{t('Optional. Stays on your phone unless you sign in.')}</Txt>
              <Chips label={t('Farmer type')} value={f.farmer_category} onChange={v => set('farmer_category', v)}
                options={[
                  { value: 'landless', label: 'Landless' }, { value: 'marginal', label: 'Marginal (<2.5 acre)' },
                  { value: 'small', label: 'Small (2.5-5 acre)' }, { value: 'medium', label: 'Medium / large' }, { value: 'bpl', label: 'BPL family' },
                ]} />
              <NumField label={t('Land (acres)')} value={f.land_acres} onChangeText={v => set('land_acres', v)} />
              <Toggle label={t('Woman farmer')} value={f.is_woman} onChange={v => set('is_woman', v)} />
              <Toggle label={t('SC / ST')} value={f.is_sc_st} onChange={v => set('is_sc_st', v)} />
            </Card>
          ) : null}
          <Spacer />
          <Row>
            <View style={{ flex: 1 }}><Btn v="ghost" title={t('Back')} onPress={() => setStep(0)} /></View>
            <View style={{ flex: 2 }}><Btn title={t('Start')} onPress={finish} loading={busy} /></View>
          </Row>
        </>
      )}
    </Screen>
  );
}
