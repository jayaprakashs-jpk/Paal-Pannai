import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Btn, Card, Screen, Txt, S, toast } from '../../src/ui';
import { Title } from '../../src/ui/Title';
import { QR } from '../../src/ui/QR';
import { useT } from '../../src/i18n';
import { useLoad } from '../../src/lib/hooks';
import { getById, Row as DbRow } from '../../src/db/repo';
import { qrDataUrl, tagPayload } from '../../src/lib/qr';
import { sharePdf } from '../../src/services/share';

export default function AnimalQr() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: a } = useLoad(() => getById<DbRow>('animals', id), null, [id]);
  if (!a) return <Screen><Title>{t('QR tag')}</Title></Screen>;

  const payload = tagPayload(a.id);
  const label = async () => {
    const html = `<html><body style="font-family:sans-serif;text-align:center;padding:24px">
      <div style="display:inline-block;border:2px dashed #888;padding:16px;border-radius:12px">
        <img src="${qrDataUrl(payload, 6)}" width="260" height="260"/>
        <h2 style="margin:8px 0 0">${String(a.nickname).replace(/</g, '&lt;')}</h2>
        <div style="font-size:18px">${String(a.tag_id ?? '').replace(/</g, '&lt;')}</div>
        <div style="color:#666;font-size:12px">Nammoor Pannai</div>
      </div></body></html>`;
    try { await sharePdf(html, `${a.nickname} tag`); } catch (e: any) { toast(t('Could not create PDF'), String(e?.message ?? e)); }
  };

  return (
    <Screen>
      <Title>{t('QR tag')}</Title>
      <Card style={{ alignItems: 'center' }}>
        <QR value={payload} size={260} />
        <Txt v="h2" style={{ marginTop: S.md }}>{a.nickname}</Txt>
        <Txt v="small">{a.tag_id}</Txt>
      </Card>
      <View style={{ height: S.md }} />
      <Btn icon="printer" title={t('Print / share tag label (PDF)')} onPress={label} />
      <Txt v="small" style={{ marginTop: S.md }}>{t('Print on a waterproof sticker or laminate it and tie it to the ear tag. Scan it with the QR scanner to open this animal.')}</Txt>
    </Screen>
  );
}
