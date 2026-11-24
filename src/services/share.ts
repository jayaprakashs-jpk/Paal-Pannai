import { Linking, Alert } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { formatINR } from '../lib/money';
import { fmtDate } from '../lib/dates';
import { Row } from '../db/repo';

export function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const d = p.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export async function openWhatsApp(phone: string | null | undefined, text: string): Promise<void> {
  const n = normalizePhone(phone);
  const url = n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  try { await Linking.openURL(url); } catch { Alert.alert('WhatsApp', 'Could not open WhatsApp'); }
}

export async function callPhone(phone?: string | null) {
  if (!phone) return;
  try { await Linking.openURL(`tel:${phone.replace(/\s/g, '')}`); } catch { /* no dialer */ }
}

const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function billHtml(bill: Row, party: Row | null, farm: Row | null, payments: Row[]): string {
  const items: any[] = Array.isArray(bill.items) ? bill.items : [];
  const lines = items.map(i => `
    <tr><td>${esc(fmtDate(i.date))}</td><td>${esc(i.session === 'evening' ? 'Eve' : i.session === 'morning' ? 'Morn' : i.session)}</td>
    <td class="r">${esc(Number(i.litres).toFixed(2))}</td><td class="r">${i.fat ?? '-'}</td><td class="r">${i.snf ?? '-'}</td>
    <td class="r">${esc(Number(i.rate).toFixed(2))}</td><td class="r">${esc(formatINR(i.amount))}</td></tr>`).join('');
  const pays = payments.map(p => `<tr><td>${esc(fmtDate(p.paid_at))}</td><td>${esc(p.mode)}</td><td class="r">${esc(formatINR(p.amount))}</td></tr>`).join('');
  const due = Math.max(0, bill.total - bill.paid_amount);
  return `<html><head><meta charset="utf-8"/><style>
    body{font-family:sans-serif;padding:20px;color:#1C2B1E}
    h1{margin:0;color:#1B5E20}.muted{color:#5B6B5E;font-size:12px}
    table{width:100%;border-collapse:collapse;margin-top:10px}
    th,td{border-bottom:1px solid #ddd;padding:6px;font-size:12px;text-align:left}.r{text-align:right}
    th{background:#E6F2E6}.tot td{font-weight:bold;font-size:14px}
  </style></head><body>
  <h1>${esc(farm?.farm_name || 'Nammoor Pannai')}</h1>
  <div class="muted">${esc(farm?.owner_name || '')} ${esc(farm?.phone || '')} ${esc(farm?.village || '')}</div>
  <h3>Milk bill ${esc(bill.bill_no)}</h3>
  <div>To: <b>${esc(party?.name || '')}</b> ${esc(party?.phone || '')}</div>
  <div class="muted">Period: ${esc(fmtDate(bill.period_start))} to ${esc(fmtDate(bill.period_end))} (${esc(bill.cycle)})</div>
  <table><tr><th>Date</th><th>Time</th><th class="r">Litres</th><th class="r">Fat</th><th class="r">SNF</th><th class="r">Rate</th><th class="r">Amount</th></tr>${lines}</table>
  <table class="tot">
    <tr><td>Total litres</td><td class="r">${esc(Number(bill.total_litres).toFixed(2))} L</td></tr>
    <tr><td>Subtotal</td><td class="r">${esc(formatINR(bill.subtotal))}</td></tr>
    ${bill.deductions ? `<tr><td>Deductions</td><td class="r">-${esc(formatINR(bill.deductions))}</td></tr>` : ''}
    <tr><td>Bill total</td><td class="r">${esc(formatINR(bill.total))}</td></tr>
    <tr><td>Paid</td><td class="r">${esc(formatINR(bill.paid_amount))}</td></tr>
    <tr><td>Balance due</td><td class="r">${esc(formatINR(due))}</td></tr>
  </table>
  ${pays ? `<h4>Payments</h4><table><tr><th>Date</th><th>Mode</th><th class="r">Amount</th></tr>${pays}</table>` : ''}
  ${farm?.upi_id ? `<p class="muted">Pay by UPI: ${esc(farm.upi_id)}</p>` : ''}
  </body></html>`;
}

/** Makes a PDF and opens the share sheet (WhatsApp, Gmail, Drive...). */
export async function sharePdf(html: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
  } else {
    Alert.alert('PDF', `Saved: ${uri}`);
  }
}

export function billText(bill: Row, party: Row | null, farm: Row | null): string {
  const due = Math.max(0, bill.total - bill.paid_amount);
  return [
    `*${farm?.farm_name || 'Nammoor Pannai'}* - Milk bill ${bill.bill_no}`,
    `${party?.name || ''}`,
    `${fmtDate(bill.period_start)} to ${fmtDate(bill.period_end)}`,
    `Milk: ${Number(bill.total_litres).toFixed(2)} L`,
    `Total: ${formatINR(bill.total)}`,
    `Paid: ${formatINR(bill.paid_amount)}`,
    `Balance: ${formatINR(due)}`,
    farm?.upi_id ? `UPI: ${farm.upi_id}` : '',
  ].filter(Boolean).join('\n');
}
