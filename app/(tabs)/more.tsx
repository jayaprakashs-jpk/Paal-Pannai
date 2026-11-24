import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, ListItem, SectionTitle } from '../../src/ui';
import { useT } from '../../src/i18n';
import { useSettings } from '../../src/store/settings';

export default function More() {
  const t = useT();
  const r = useRouter();
  const { role } = useSettings();
  const farmerLike = role === 'farmer' || role === 'agent';
  const go = (href: string) => () => r.push(href as any);
  return (
    <Screen>
      {farmerLike ? (
        <>
          <SectionTitle>{t('Farm care')}</SectionTitle>
          <ListItem icon="grain" title={t('Feed & maize calculator')} subtitle={t('Daily Theevanam and Makkachola Maavu')} onPress={go('/care/feed')} />
          <ListItem icon="bell-ring" title={t('Reminders')} subtitle={t('Feeding, water and medicine alarms')} onPress={go('/care/reminders')} />
          <ListItem icon="map-marker-path" title={t('Location & pasture alerts')} subtitle={t('Pin shed or grazing area')} onPress={go('/care/location')} />
          <ListItem icon="heart-pulse" title={t('Breeding & heat cycle')} subtitle={t('Paruvam, Oosi, conception check')} onPress={go('/breeding')} />
          <ListItem icon="doctor" title={t('Vets & semen dealers')} subtitle={t('Directory and booking')} onPress={go('/breeding/providers')} />
          <ListItem icon="egg" title={t('Poultry: eggs & hatching')} onPress={go('/breeding/poultry')} />

          <SectionTitle>{t('Milk business')}</SectionTitle>
          <ListItem icon="domain" title={t('Buyers & companies')} subtitle={t('Rates, agents, Aavin society')} onPress={go('/milk/buyers')} />
          <ListItem icon="scale-balance" title={t('Compare rates')} subtitle={t('Who pays the most? Society vs private')} onPress={go('/milk/compare')} />
          <ListItem icon="history" title={t('Milk history')} onPress={go('/milk/history')} />
          <ListItem icon="receipt-text" title={t('Bills & payments')} onPress={go('/billing')} />
          <ListItem icon="help-circle" title={t('Missing amount queries')} onPress={go('/billing/queries')} />
          <ListItem icon="camera-document" title={t('AI notebook scanner')} subtitle={t('Photo of paper book to rows')} onPress={go('/scan')} />

          <SectionTitle>{t('Money')}</SectionTitle>
          <ListItem icon="chart-line" title={t('Profit & loss')} onPress={go('/finance')} />
          <ListItem icon="cash-minus" title={t('Expenses')} onPress={go('/finance/expenses')} />
          <ListItem icon="bank" title={t('Government free schemes')} subtitle={t('Check what you can get')} onPress={go('/finance/schemes')} />

          <SectionTitle>{t('Delivery')}</SectionTitle>
          <ListItem icon="moped" title={t('My home delivery')} subtitle={t('Radius, customers, partners')} onPress={go('/delivery/farmer')} />
        </>
      ) : null}

      {role === 'customer' ? (
        <ListItem icon="map-marker-radius" title={t('Farms near me')} onPress={go('/delivery/customer')} />
      ) : null}
      {role === 'delivery_partner' ? (
        <ListItem icon="moped" title={t("Today's deliveries")} onPress={go('/delivery/partner')} />
      ) : null}

      <SectionTitle>{t('Tools')}</SectionTitle>
      <ListItem icon="account-circle" title={t('Farm profile')} subtitle={t('UPI, bank, location, scheme details')} onPress={go('/profile')} />
      <ListItem icon="weather-partly-rainy" title={t('Weather & heat alerts')} onPress={go('/weather')} />
      <ListItem icon="qrcode-scan" title={t('Scan ear-tag QR')} onPress={go('/qr')} />
      <ListItem icon="cog" title={t('Settings & sync')} onPress={go('/settings')} />
    </Screen>
  );
}
