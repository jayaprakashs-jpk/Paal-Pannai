// Generates simple placeholder app art (replace with your real logo before Play Store release).
// Run: node scripts/gen-assets.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x / w, y / h);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const GREEN = [27, 94, 32, 255], WHITE = [255, 255, 255, 255], AMBER = [249, 168, 37, 255], CLEAR = [0, 0, 0, 0], SOFT = [230, 242, 230, 255];
// sun over a field: amber sun, white hill, green sky
const art = (bg) => (u, v) => {
  if (Math.hypot(u - 0.5, v - 0.40) < 0.17) return AMBER;
  // rounded hill: a big circle clipped to the lower half
  const hd = Math.hypot((u - 0.5) * 1.0, (v - 1.02) * 1.0);
  if (hd < 0.4 && v < 0.86) return WHITE;
  if (hd < 0.4) return SOFT;
  return bg;
};
mkdirSync('assets', { recursive: true });
writeFileSync('assets/icon.png', png(1024, 1024, art(GREEN)));
writeFileSync('assets/adaptive-icon.png', png(1024, 1024, (u, v) => {
  // keep art inside the 66% safe zone
  const su = (u - 0.5) / 0.66 + 0.5, sv = (v - 0.5) / 0.66 + 0.5;
  if (su < 0 || su > 1 || sv < 0 || sv > 1) return CLEAR;
  const c = art(CLEAR)(su, sv);
  return c;
}));
writeFileSync('assets/splash.png', png(1024, 1024, (u, v) => {
  const su = (u - 0.5) / 0.5 + 0.5, sv = (v - 0.5) / 0.5 + 0.5;
  if (su < 0 || su > 1 || sv < 0 || sv > 1) return GREEN;
  return art(GREEN)(su, sv);
}));
console.log('assets written');
