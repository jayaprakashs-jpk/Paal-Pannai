import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Btn, Screen, Txt, S, C } from '../src/ui';
import { Title } from '../src/ui/Title';
import { useT } from '../src/i18n';
import { parseTagPayload } from '../src/lib/qr';
import { first, getById } from '../src/db/repo';

export default function QrScan() {
  const t = useT();
  const r = useRouter();
  const [perm, ask] = useCameraPermissions();
  const [msg, setMsg] = useState('');
  const busy = useRef(false);

  const onScan = async ({ data }: { data: string }) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const id = parseTagPayload(data);
      let animal = id ? await getById('animals', id) : null;
      // also accept a plain printed tag number
      if (!animal) animal = await first('animals', { where: 'tag_id = ?', params: [data.trim()] });
      if (animal) { r.replace(`/animal/${animal.id}`); return; }
      setMsg(t('No animal found for this code on this phone.'));
    } finally {
      setTimeout(() => { busy.current = false; }, 1500);
    }
  };

  if (!perm) return <Screen><Title>{t('Scan QR')}</Title></Screen>;
  if (!perm.granted) {
    return (
      <Screen>
        <Title>{t('Scan QR')}</Title>
        <Txt style={{ marginBottom: S.md }}>{t('Camera permission is needed to scan ear-tag QR codes.')}</Txt>
        <Btn title={t('Allow camera')} onPress={ask} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Title>{t('Scan QR')}</Title>
      <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39'] }}
        onBarcodeScanned={onScan} />
      <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
        <Txt color={C.white} style={{ backgroundColor: '#0008', padding: 10, borderRadius: 10 }}>{msg || t('Point the camera at the ear-tag QR')}</Txt>
      </View>
    </View>
  );
}
