import type { RegisterRow } from '../api/live-admin';
import { toMiti } from './nepaliDate';

const csvCell = (v: string | number | null) => {
  const text = v === null ? '' : String(v);
  // Quotes and separators are escaped; a leading = + - @ would be run as a formula by a spreadsheet, so it is defused.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The register as CSV, money in whole currency units. Sales first, then returns, in the number order IRD expects them. */
export function registerCsv(register: { sales: RegisterRow[]; returns: RegisterRow[] }): string {
  const money = (minor: number) => (minor / 100).toFixed(2);
  const header = ['Register', 'Number', 'Against invoice', 'Date (AD)', 'Miti (BS)', 'Buyer', 'Buyer PAN', 'Total', 'Exempt', 'Taxable', 'VAT'];
  const rows = [
    ...register.sales.map((r) => ['Sales', ...cells(r, money)]),
    ...register.returns.map((r) => ['Sales return', ...cells(r, money)]),
  ];
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** The calendar day in Nepal: an invoice at 1am NPT is that day's, though it is still yesterday in UTC. */
const nepalDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

function cells(r: RegisterRow, money: (minor: number) => string) {
  return [r.number, r.against, nepalDay(r.issuedAt), toMiti(new Date(r.issuedAt)), r.buyerName, r.buyerPan, money(r.total), money(r.exempt), money(r.taxable), money(r.vat)];
}

export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
