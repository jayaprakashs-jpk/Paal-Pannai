import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Banner, Btn, Card, KV, Loading, Row, Screen, SectionTitle, Txt, S, C, Icon, Badge } from '../src/ui';
import { Title } from '../src/ui/Title';
import { useT } from '../src/i18n';
import { alertsFor, refreshWeather, speciesFlags } from '../src/services/weatherAlerts';
import { WeatherData, cachedWeather } from '../src/services/weather';
import { cattleStress } from '../src/lib/weather';
import { fmtDate } from '../src/lib/dates';
import { WeatherAlert } from '../src/lib/weather';

export default function Weather() {
  const t = useT();
  const [w, setW] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');
  const [ageMin, setAgeMin] = useState(0);

  const load = useCallback(async (force: boolean) => {
    setBusy(true); setErr('');
    const c = await cachedWeather();
    if (c) { setW(c); setAlerts(alertsFor(c, await speciesFlags())); }
    const res = await refreshWeather({ force, maxAgeH: force ? 0 : 1 });
    if (res.data) { setW(res.data); setAlerts(alertsFor(res.data, await speciesFlags())); setAgeMin(Math.round((Date.now() - Date.parse(res.data.fetchedAt)) / 60000)); }
    if (res.error) setErr(res.error === 'offline' ? t('Offline. Showing the last weather saved on your phone.') : res.error === 'no_location' ? t('Set your farm location in Farm profile or allow GPS.') : t('Could not refresh weather.'));
    setBusy(false);
  }, [t]);
  useEffect(() => { load(false); }, [load]);

  const stress = w ? cattleStress(w.now.tempC, w.now.humidity) : null;
  const sevTone = (s: string) => (s === 'danger' ? 'danger' : s === 'warning' ? 'warn' : 'info') as 'danger' | 'warn' | 'info';

  return (
    <Screen>
      <Title>{t('Weather & heat alerts')}</Title>
      {err ? <Banner tone="warn" text={err} /> : null}
      {busy && !w ? <Loading /> : null}
      {w ? (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between' }}>
              <View>
                <Txt v="big">{Math.round(w.now.tempC)}°C</Txt>
                <Txt v="small">{t('Feels like')} {Math.round(w.now.apparentC)}°C · {t('Humidity')} {Math.round(w.now.humidity)}%</Txt>
              </View>
              <Icon name={w.forecast.rainProbPct >= 60 ? 'weather-pouring' : w.now.tempC >= 33 ? 'weather-sunny-alert' : 'weather-partly-cloudy'} size={54} color={C.primary} />
            </Row>
            {stress ? <KV k={t('Cow heat index (THI)')} v={`${stress.thi}`} bold color={stress.level === 'ok' ? C.ok : stress.level === 'watch' ? C.warn : C.danger} /> : null}
            <KV k={t('Rain chance next 24h')} v={`${Math.round(w.forecast.rainProbPct)}% · ${w.forecast.rainMm.toFixed(1)} mm`} />
            <KV k={t('Hottest next 24h')} v={`${Math.round(w.forecast.maxTempC)}°C`} />
            {ageMin > 0 ? <Txt v="small">{t('Updated {m} min ago', { m: ageMin })}</Txt> : null}
          </Card>

          <SectionTitle>{t('Alerts for your animals')}</SectionTitle>
          {alerts.length === 0 ? <Card tone="ok"><Txt>{t('No weather risk right now.')}</Txt></Card> : alerts.map(a => (
            <Card key={a.id} tone={sevTone(a.severity)} style={{ marginBottom: S.sm }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt style={{ fontWeight: '700', flex: 1 }}>{t(a.message.replace(/\(.*\)/, '').trim())}</Txt>
                <Badge tone={sevTone(a.severity)} text={t(a.severity === 'danger' ? 'Danger' : a.severity === 'warning' ? 'Warning' : 'Watch')} />
              </Row>
              {a.tips.map((tip, i) => <Txt key={i} v="small" style={{ color: C.text }}>• {t(tip)}</Txt>)}
            </Card>
          ))}

          <SectionTitle>{t('Next 3 days')}</SectionTitle>
          {w.days.map(d => (
            <Card key={d.date} style={{ marginBottom: 6 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt style={{ fontWeight: '700' }}>{fmtDate(d.date)}</Txt>
                <Txt>{Math.round(d.minC)}° / {Math.round(d.maxC)}°C</Txt>
                <Txt v="small">{Math.round(d.rainProb)}% · {d.rainMm.toFixed(1)} mm</Txt>
              </Row>
            </Card>
          ))}
        </>
      ) : null}
      <View style={{ height: S.md }} />
      <Btn icon="refresh" title={t('Refresh')} onPress={() => load(true)} loading={busy} />
    </Screen>
  );
}
