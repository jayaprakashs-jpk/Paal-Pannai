import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Btn, Card, Chips, DateField, Field, KV, NumField, Row, Screen, SectionTitle, Toggle, Txt, confirm, toast, Spacer, ListItem, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { getById, insert, list, remove, update, Row as DbRow } from '../../src/db/repo';
import { BUYER_KINDS } from '../../src/lib/constants';
import { today, fmtDate } from '../../src/lib/dates';
import { toNum, formatINR } from '../../src/lib/money';
import { ratePerLitre } from '../../src/lib/milk';
import { repriceUnpriced } from '../../src/services/milkRates';
import { callPhone, openWhatsApp } from '../../src/services/share';
import { useBusy } from '../../src/lib/hooks';

const blankRate = { effective_date: today(), milk_type: 'any', rate_type: 'flat', base_rate: '', std_fat: '3.5', std_snf: '8.5', fat_rate: '', snf_rate: '', min_rate: '', bonus_per_litre: '' };

export default function BuyerForm() {
  const t = useT();
  const r = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState<string | undefined>(params.id);
  const { busy, run } = useBusy();
  const [f, setF] = useState<any>({ name: '', kind: 'private_dairy', org: '', phone: '', address: '', upi_id: '', bank_account_no: '', bank_ifsc: '', notes: '', is_active: true });
  const [rates, setRates] = useState<DbRow[]>([]);
  const [nr, setNr] = useState<any>(blankRate);
  const [showRate, setShowRate] = useState(false);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const setR = (k: string, v: any) => setNr((p: any) => ({ ...p, [k]: v }));

  const load = async (bid: string) => {
    const b = await getById<DbRow>('buyers', bid);
    if (b) setF({ ...b, org: b.org ?? '', phone: b.phone ?? '', address: b.address ?? '', upi_id: b.upi_id ?? '', bank_account_no: b.bank_account_no ?? '', bank_ifsc: b.bank_ifsc ?? '', notes: b.notes ?? '' });
    setRates(await list('buyer_rates', { where: 'buyer_id = ?', params: [bid], orderBy: 'effective_date DESC' }));
  };
  useEffect(() => { if (id) load(id); }, [id]);

  const saveBuyer = () => run(async () => {
    if (!f.name.trim()) return toast(t('Name needed'), t('Please enter a name.'));
    const row = { name: f.name.trim(), kind: f.kind, org: f.org, phone: f.phone, address: f.address, upi_id: f.upi_id.trim(), bank_account_no: f.bank_account_no, bank_ifsc: f.bank_ifsc.toUpperCase(), notes: f.notes, is_active: f.is_active };
    if (id) await update('buyers', id, row);
    else { const b = await insert<DbRow>('buyers', row); setId(b.id); setShowRate(true); toast(t('Saved'), t('Now add the milk rate for this buyer.')); return; }
    r.back();
  });

  const saveRate = () => run(async () => {
    if (!id) return toast(t('Save buyer first'), t('Save the buyer, then add rates.'));
    const base = toNum(nr.base_rate, NaN);
    if (!Number.isFinite(base) || base <= 0 || base > 500) return toast(t('Rate'), t('Enter the base rate per litre.'));
    await insert('buyer_rates', {
      buyer_id: id, effective_date: nr.effective_date, milk_type: nr.milk_type, rate_type: nr.rate_type, base_rate: base,
      std_fat: toNum(nr.std_fat, 3.5), std_snf: toNum(nr.std_snf, 8.5), fat_rate: toNum(nr.fat_rate), snf_rate: toNum(nr.snf_rate),
      min_rate: toNum(nr.min_rate), bonus_per_litre: toNum(nr.bonus_per_litre),
    });
    const n = await repriceUnpriced(id);
    setShowRate(false); setNr(blankRate);
    await load(id);
    if (n) toast(t('Rate saved'), t('{n} earlier entries were priced.', { n }));
  });

  const society = f.kind === 'society';

  return (
    <Screen footer={<Btn title={id ? t('Save buyer') : t('Save and add rate')} onPress={saveBuyer} loading={busy} />}>
      <Title>{id ? f.name || t('Buyer') : t('New buyer')}</Title>
      <Card>
        <Chips label={t('Type')} value={f.kind} onChange={v => set('kind', v)} options={BUYER_KINDS.map(k => ({ value: k.key, label: k.label }))} />
        <Field label={t('Full name')} value={f.name} onChangeText={v => set('name', v)} autoCapitalize="words" />
        <Field label={t('Company / society name')} value={f.org} onChangeText={v => set('org', v)} />
        <Field label={t('Phone')} value={f.phone} onChangeText={v => set('phone', v)} keyboardType="phone-pad" />
        <Field label={t('Address')} value={f.address} onChangeText={v => set('address', v)} multiline />
        <Field label={t('UPI ID (for payments)')} value={f.upi_id} onChangeText={v => set('upi_id', v)} autoCapitalize="none" />
        <Field label={t('Bank account number')} value={f.bank_account_no} onChangeText={v => set('bank_account_no', v)} keyboardType="numeric" />
        <Field label={t('IFSC')} value={f.bank_ifsc} onChangeText={v => set('bank_ifsc', v)} autoCapitalize="none" />
        <Toggle label={t('Active buyer')} value={!!f.is_active} onChange={v => set('is_active', v)} />
        {id && f.phone ? (
          <Row style={{ flexWrap: 'wrap' }}>
            <Btn small v="secondary" icon="phone" title={t('Call')} onPress={() => callPhone(f.phone)} />
            <Btn small v="secondary" icon="whatsapp" title="WhatsApp" onPress={() => openWhatsApp(f.phone, '')} />
          </Row>
        ) : null}
      </Card>

      {id ? (
        <>
          <SectionTitle right={!showRate ? <Btn small icon="plus" title={t('Add rate')} onPress={() => setShowRate(true)} /> : undefined}>{t('Daily buying rates')}</SectionTitle>
          {showRate ? (
            <Card>
              <DateField label={t('Rate applies from')} value={nr.effective_date} onChange={v => setR('effective_date', v)} />
              <Chips label={t('Milk type')} value={nr.milk_type} onChange={v => setR('milk_type', v)} options={[{ value: 'any', label: 'All' }, { value: 'cow', label: 'Cow' }, { value: 'buffalo', label: 'Buffalo' }]} />
              <Chips label={t('How is price decided?')} value={nr.rate_type} onChange={v => setR('rate_type', v)} options={[{ value: 'flat', label: 'Flat per litre' }, { value: 'fat_snf', label: 'By Fat / SNF' }]} />
              <NumField label={nr.rate_type === 'flat' ? t('Rate per litre (₹)') : t('Base rate at standard fat/SNF (₹/L)')} value={nr.base_rate} onChangeText={v => setR('base_rate', v)} />
              {nr.rate_type === 'fat_snf' ? (
                <>
                  <Row gap={S.md}>
                    <View style={{ flex: 1 }}><NumField label={t('Standard fat %')} value={nr.std_fat} onChangeText={v => setR('std_fat', v)} /></View>
                    <View style={{ flex: 1 }}><NumField label={t('Standard SNF %')} value={nr.std_snf} onChangeText={v => setR('std_snf', v)} /></View>
                  </Row>
                  <NumField label={t('₹ per 1% fat above/below standard (per litre)')} value={nr.fat_rate} onChangeText={v => setR('fat_rate', v)} />
                  <NumField label={t('₹ per 1% SNF above/below standard (per litre)')} value={nr.snf_rate} onChangeText={v => setR('snf_rate', v)} />
                  <NumField label={t('Minimum rate (₹/L)')} value={nr.min_rate} onChangeText={v => setR('min_rate', v)} />
                  <Txt v="small" style={{ marginBottom: S.md }}>{t('If your rate card gives price per 0.1 of fat, multiply by 10 here.')}</Txt>
                </>
              ) : null}
              <NumField label={society ? t('Bonus / incentive per litre (₹)') : t('Bonus per litre (₹)')} value={nr.bonus_per_litre} onChangeText={v => setR('bonus_per_litre', v)} />
              {society ? (
                <Txt v="small" style={{ marginBottom: S.md }}>
                  {t('Society tip: usual standards are cow 3.5% fat / 8.5% SNF and buffalo 6.0% / 9.0%. Copy the real numbers from your society rate card. Add cattle-feed or other per-litre incentives as the bonus.')}
                </Txt>
              ) : null}
              <Row>
                <View style={{ flex: 1 }}><Btn v="ghost" title={t('Cancel')} onPress={() => setShowRate(false)} /></View>
                <View style={{ flex: 1 }}><Btn title={t('Save rate')} onPress={saveRate} loading={busy} /></View>
              </Row>
            </Card>
          ) : null}
          {rates.map(x => (
            <Card key={x.id} style={{ marginBottom: 6 }}>
              <KV k={`${fmtDate(x.effective_date)} · ${x.milk_type === 'any' ? t('All milk') : t(x.milk_type === 'cow' ? 'Cow' : 'Buffalo')}`}
                v={x.rate_type === 'flat' ? `${formatINR(x.base_rate)}/L` : `${formatINR(ratePerLitre(x as any, x.std_fat, x.std_snf))}/L @${x.std_fat}/${x.std_snf}`} bold />
              {x.bonus_per_litre ? <Txt v="small">{t('Includes bonus')} {formatINR(x.bonus_per_litre)}/L</Txt> : null}
              <Btn small v="ghost" title={t('Delete')} onPress={async () => { if (await confirm(t('Delete rate?'), '', t('Delete'), t('Cancel'), true)) { await remove('buyer_rates', x.id); await load(id); } }} />
            </Card>
          ))}
          <Spacer />
          <Btn v="danger" title={t('Delete buyer')} onPress={async () => {
            if (!(await confirm(t('Delete buyer?'), t('Past milk entries and bills stay.'), t('Delete'), t('Cancel'), true))) return;
            await remove('buyers', id); r.back();
          }} />
        </>
      ) : null}
    </Screen>
  );
}
