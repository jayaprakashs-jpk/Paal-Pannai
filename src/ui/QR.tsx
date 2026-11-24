import React, { useMemo } from 'react';
import { View } from 'react-native';
import { qrMatrix } from '../lib/qr';

/** Pure-View QR renderer (no SVG dependency). Quiet zone included. */
export function QR({ value, size = 220 }: { value: string; size?: number }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const quiet = 2;
  const total = m.length + quiet * 2;
  const cell = Math.floor(size / total);
  const px = cell * total;
  return (
    <View style={{ width: px, height: px, backgroundColor: '#fff', padding: quiet * cell }}>
      {m.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', height: cell }}>
          {row.map((on, c) => (
            <View key={c} style={{ width: cell, height: cell, backgroundColor: on ? '#000' : '#fff' }} />
          ))}
        </View>
      ))}
    </View>
  );
}
