import React, { useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Banner, Btn, Card, Chips, Empty, Row, Screen, SectionTitle, Txt, confirm, toast, S, C } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { useT } from '../../src/i18n';
import { useBusy, useLoad } from '../../src/lib/hooks';
import { insert, list, remove, update, raw, Row as DbRow } from '../../src/db/repo';
import { captureImage, extractRows, ScanKind } from '../../src/services/ocr';
import { isCloudConfigured } from '../../src/services/supabase';
import { useSession } from '../../src/services/auth';
import NetInfo from '@react-native-community/netinfo';

export default function Scan() {
  const t = useT();
  const r = useRouter();
  const session = useSession();
  const { busy, run } = useBusy();
  const [kind, setKind] = useState<ScanKind>('milk_notebook');
  const [working, setWorking] = useState<string | null>(null);
  const { data, reload } = useLoad(() => list('scan_queue', { orderBy: 'created_at DESC', limit: 30 }), [] as DbRow[], []);

  const process = async (row: DbRow) => {
    setWorking(row.id);
    try {
      const net = await NetInfo.fetch();
      if (!net.isConnected) { toast(t('No internet'), t('Saved on your phone. Open this screen when you have internet and tap "Read now".')); return; }
      if (!session) { toast(t('Sign in'), t('The AI reader needs you to be signed in.')); r.push('/auth'); return; }
      await update('scan_queue', row.id, { status: 'processing', error: null });
      const tags = (await raw<{ tag_id: string | null; nickname: string }>(`SELECT tag_id, nickname FROM animals WHERE deleted_at IS NULL AND status='active'`))
        .flatMap(a => [a.nickname, a.tag_id].filter(Boolean) as string[]);
      const rows = await extractRows(row.image_uri, row.kind as ScanKind, tags);
      await update('scan_queue', row.id, { status: 'done', result: rows, error: null });
      await reload();
      if (rows.length === 0) toast(t('Nothing found'), t('No milk rows could be read. Try a closer, brighter photo.'));
      else r.push(`/scan/review?id=${row.id}`);
    } catch (e: any) {
      await update('scan_queue', row.id, { status: 'failed', error: String(e?.message ?? e) });
      await reload();
      toast(t('Could not read the page'), String(e?.message ?? e));
    } finally { setWorking(null); }
  };

  const capture = (src: 'camera' | 'library') => run(async () => {
    const uri = await captureImage(src);
    if (!uri) return toast(t('Photo'), t('No photo taken. Allow camera / gallery permission.'));
    const row = await insert<DbRow>('scan_queue', { image_uri: uri, kind, status: 'pending' });
    await reload();
    await process(row);
  });

  return (
    <Screen>
      <Title>{t('AI notebook scanner')}</Title>
      {!isCloudConfigured ? <Banner tone="warn" text={t('Cloud is not set up in this build, so the AI reader cannot run. Photos are still saved.')} /> : null}
      <Card>
        <Chips label={t('What are you scanning?')} value={kind} onChange={v => setKind(v as ScanKind)}
          options={[{ value: 'milk_notebook', label: 'Milk notebook' }, { value: 'society_slip', label: 'Society slip' }, { value: 'receipt', label: 'Paper receipt' }]} />
        <Row>
          <View style={{ flex: 1 }}><Btn icon="camera" title={t('Take photo')} onPress={() => capture('camera')} loading={busy} /></View>
          <View style={{ flex: 1 }}><Btn icon="image" v="secondary" title={t('From gallery')} onPress={() => capture('library')} disabled={busy} /></View>
        </Row>
        <Txt v="small" style={{ marginTop: S.sm }}>{t('Tips: good light, hold the phone flat above the page, one page at a time. You can take photos offline. They are read when you have internet. You always check the rows before saving.')}</Txt>
      </Card>

      <SectionTitle>{t('Your scans')}</SectionTitle>
      {data.length === 0 ? <Empty icon="camera-document" text={t('No scans yet')} /> : data.map(s => (
        <Card key={s.id} style={{ marginBottom: S.sm }}>
          <Row gap={S.md}>
            <Image source={{ uri: s.image_uri }} style={{ width: 64, height: 80, borderRadius: 8, backgroundColor: C.border }} />
            <View style={{ flex: 1 }}>
              <Row><Badge tone={s.status === 'saved' ? 'ok' : s.status === 'done' ? 'info' : s.status === 'failed' ? 'danger' : 'warn'}
                text={t(s.status === 'pending' ? 'Waiting' : s.status === 'processing' ? 'Reading...' : s.status === 'done' ? 'Ready to check' : s.status === 'saved' ? 'Saved' : 'Failed')} /></Row>
              <Txt v="small">{t(s.kind === 'milk_notebook' ? 'Milk notebook' : s.kind === 'society_slip' ? 'Society slip' : 'Paper receipt')}{Array.isArray(s.result) ? ` · ${s.result.length} ${t('rows')}` : ''}</Txt>
              {s.error ? <Txt v="small" color={C.danger} numberOfLines={2}>{s.error}</Txt> : null}
              <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
                {s.status === 'done' ? <Btn small title={t('Check & save')} onPress={() => r.push(`/scan/review?id=${s.id}`)} /> : null}
                {s.status === 'pending' || s.status === 'failed' ? <Btn small v="secondary" title={t('Read now')} onPress={() => process(s)} loading={working === s.id} /> : null}
                <Btn small v="ghost" icon="delete" title="" onPress={async () => { if (await confirm(t('Delete scan?'), '', t('Delete'), t('Cancel'), true)) { await remove('scan_queue', s.id); reload(); } }} />
              </Row>
            </View>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
