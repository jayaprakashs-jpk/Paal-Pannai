import qrcode from 'qrcode-generator';

export const QR_PREFIX = 'NP1:';

/** Ear-tag payload. Short and versioned so future formats can coexist. */
export const tagPayload = (animalId: string): string => `${QR_PREFIX}${animalId}`;

export function parseTagPayload(text: string): string | null {
  const t = text.trim();
  return t.startsWith(QR_PREFIX) ? t.slice(QR_PREFIX.length) : null;
}

export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  const m: boolean[][] = [];
  for (let r = 0; r < n; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  return m;
}

/** GIF data URL for embedding in printable HTML (PDF labels). */
export function qrDataUrl(value: string, cell = 6): string {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  return qr.createDataURL(cell, 4);
}
