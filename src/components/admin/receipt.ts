import { formatMoney } from '../../domain/money';
import type { PaymentMethod } from '../../domain/types';

/**
 * The one paper artifact the till produces — a settle-table charge (Tables.tsx)
 * and a re-print from the ledger (Payments.tsx) are the same document, so
 * both build it from here rather than keeping their own copy of the markup.
 * It is a guest copy, not an IRD tax invoice.
 */

export interface ReceiptLine {
  dishNameSnapshot: string;
  quantity: number;
  total: number;
}

export interface ReceiptTotals {
  currency: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
}

/** Omitted for the pre-payment bill preview — nothing has actually been charged yet. */
export interface ReceiptPayment {
  method: PaymentMethod;
  takenBy: string | null;
}

/** What the receipt header needs to know about the restaurant. */
export interface ReceiptRestaurant {
  name: string;
  vatPanNumber?: string | null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

export function printReceipt(
  table: { name: string; capacity?: number },
  lines: ReceiptLine[],
  totals: ReceiptTotals,
  restaurant: ReceiptRestaurant,
  payment?: ReceiptPayment,
  customerName?: string | null,
): boolean {
  const sheet = window.open('', '_blank', 'width=420,height=640');
  if (!sheet) return false;

  const restaurantName = restaurant.name;
  const vatPan = restaurant.vatPanNumber?.trim();
  const { currency, subtotal, serviceCharge, tax, discount, total } = totals;
  const rows = lines
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.dishNameSnapshot)}</td><td class="num">${i.quantity}</td><td class="num"><b>${formatMoney(i.total, currency)}</b></td></tr>`,
    )
    .join('');
  const customer = customerName?.trim();
  const customerRow = customer ? `<div class="row"><span>Customer</span><span>${escapeHtml(customer)}</span></div>` : '';
  const paymentRows = payment
    ? `<div class="row"><span>Paid by</span><span>${payment.method === 'CASH' ? 'Cash' : 'Card'}</span></div>` +
      (payment.takenBy ? `<div class="row"><span>Served by</span><span>${escapeHtml(payment.takenBy)}</span></div>` : '') +
      `<div class="rule"></div>`
    : '';

  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(table.name)} receipt</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { width: 320px; margin: 0 auto; }
    .center { text-align: center; }
    .muted { color: #6a5a45; font-size: 11px; }
    .rule { border-top: 1px dashed rgba(33,26,17,.35); margin: 12px 0; }
    .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 6px 0; }
    .items { width: 100%; border-collapse: collapse; font-size: 12px; }
    .items th { padding-bottom: 6px; border-bottom: 1px dashed rgba(33,26,17,.35); text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #6a5a45; }
    .items td { padding: 6px 0; vertical-align: top; overflow-wrap: anywhere; }
    .items th.num, .items td.num { text-align: right; white-space: nowrap; padding-left: 10px; }
    .total { font-weight: 900; font-size: 20px; }
    .notice { margin: 0 0 8px; font-size: 11px; font-weight: 700; line-height: 1.4; }
    @page { margin: 0; }
    @media print {
      body { padding: 0; }
      .sheet { width: 100%; max-width: 100mm; margin: 0; padding: 0 2mm; }
      .rule { border-top-color: #000; }
      .muted, .items th { color: #000; }
    }
  </style></head><body>
  <div class="sheet">
    <div class="center">
      <h1 style="font-size:22px;margin:0">${escapeHtml(restaurantName)}</h1>
      ${vatPan ? `<p class="muted" style="margin:4px 0 0">VAT/PAN: ${escapeHtml(vatPan)}</p>` : ''}
      <p class="muted" style="margin:6px 0 0">${escapeHtml(table.name)}${table.capacity ? ` · ${table.capacity} seats` : ''}</p>
    </div>
    <div class="rule"></div>
    ${customerRow}
    ${paymentRows}
    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rule"></div>
    <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal, currency)}</span></div>
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>−${formatMoney(discount, currency)}</span></div>` : ''}
    <div class="row"><span>Service</span><span>${formatMoney(serviceCharge, currency)}</span></div>
    <div class="row"><span>Tax</span><span>${formatMoney(tax, currency)}</span></div>
    <div class="row" style="align-items:baseline"><span style="font-size:16px;font-weight:900">Total</span><span class="total">${formatMoney(total, currency)}</span></div>
    <div class="rule"></div>
    <p class="center notice">This is not a tax invoice. Please collect the original bill from the counter.</p>
    <p class="center muted">Thank you · ${new Date().toLocaleString()}</p>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}
