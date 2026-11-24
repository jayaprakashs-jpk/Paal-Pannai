import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Banner, Btn, Card, Chips, Row, Screen, SectionTitle, Toggle, Txt, S, C, Icon } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { getFarm, raw } from '../../src/db/repo';
import { checkEligibility, EligibilityResult, FarmFacts, relevantSchemes } from '../../src/data/schemes';
import { loadSchemes } from '../../src/services/schemes';
import { statusLabel } from '../../src/lib/labels';

export default function Schemes() {
  const t = useT();
  const r = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const { data } = useLoad(async () => {
    const farm = await getFarm();
    const sp = await raw<{ species: string }>(`SELECT DISTINCT species FROM animals WHERE status='active' AND deleted_at IS NULL`);
    const cnt = await raw<{ c: number }>(`SELECT COALESCE(SUM(COALESCE(head_count,1)),0) AS c FROM animals WHERE status='active' AND deleted_at IS NULL`);
    const schemes = await loadSchemes();
    const facts: FarmFacts = {
      state: farm?.state, farmer_category: farm?.farmer_category, is_woman: !!farm?.is_woman, is_sc_st: !!farm?.is_sc_st,
      land_acres: farm?.land_acres, species: sp.map(x => x.species), herd_size: cnt[0]?.c ?? 0,
    };
    return { facts, results: checkEligibility(relevantSchemes(schemes, farm?.state), facts) };
  }, { facts: null as FarmFacts | null, results: [] as EligibilityResult[] }, []);

  const shown = data.results.filter(x => filter === 'all' || x.status === filter);
  const tone = (s: string) => (s === 'eligible' ? 'ok' : s === 'maybe' ? 'warn' : 'muted') as 'ok' | 'warn' | 'muted';

  return (
    <Screen>
      <Title>{t('Government free schemes')}</Title>
      <Banner tone="warn" text={t('This list is a guide. Rules and subsidy amounts change. Always confirm at your Veterinary Dispensary or Animal Husbandry office before you apply.')} />
      {data.facts ? (
        <Card>
          <Txt v="label" style={{ marginBottom: 4 }}>{t('Matched using your farm profile')}</Txt>
          <Txt v="small">{[data.facts.state, data.facts.farmer_category, data.facts.is_woman ? t('woman') : null, data.facts.is_sc_st ? 'SC/ST' : null,
            `${data.facts.herd_size} ${t('animals')}`, data.facts.species.join(', ')].filter(Boolean).join(' · ')}</Txt>
          <Row style={{ marginTop: S.sm }}><Btn small v="secondary" icon="pencil" title={t('Edit profile')} onPress={() => r.push('/profile')} /></Row>
        </Card>
      ) : null}
      <View style={{ height: S.md }} />
      <Chips value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'eligible', label: 'Eligible' }, { value: 'maybe', label: 'Maybe' }, { value: 'not_eligible', label: 'Not eligible' }]} />
      {shown.map(x => (
        <Card key={x.scheme.id} style={{ marginBottom: S.sm }} tone={x.status === 'eligible' ? 'ok' : undefined} onPress={() => setOpen(open === x.scheme.id ? null : x.scheme.id)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt style={{ fontWeight: '700', flex: 1 }}>{t(x.scheme.name)}</Txt>
            <Badge tone={tone(x.status)} text={t(x.status === 'eligible' ? 'Eligible' : x.status === 'maybe' ? 'Maybe' : 'Not eligible')} />
          </Row>
          <Txt v="small">{t(statusLabel(x.scheme.level))} · {t(statusLabel(x.scheme.category))}</Txt>
          {open === x.scheme.id ? (
            <View style={{ marginTop: S.sm }}>
              <Txt style={{ fontWeight: '700' }}>{t('What you get')}</Txt>
              <Txt>{t(x.scheme.benefit)}</Txt>
              <Txt style={{ fontWeight: '700', marginTop: 8 }}>{t('How to apply')}</Txt>
              <Txt>{t(x.scheme.how)}</Txt>
              {x.failed.length ? (
                <>
                  <Txt style={{ fontWeight: '700', marginTop: 8 }} color={C.warn}>{t('Why not eligible')}</Txt>
                  {x.failed.map((h, i) => <Txt key={i} v="small">• {t(h)}</Txt>)}
                </>
              ) : null}
              {x.status === 'maybe' ? <Txt v="small" color={C.warn} style={{ marginTop: 8 }}>{t('Fill your farm profile fully to get a clear answer.')}</Txt> : null}
              {!x.scheme.verified ? <Txt v="small" style={{ marginTop: 8 }}>{t('Not yet checked against the latest government order.')}</Txt> : null}
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
