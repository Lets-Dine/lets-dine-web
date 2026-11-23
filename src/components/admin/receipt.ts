import { recordPrint } from '../../api/staff';
import { amountInWords } from '../../domain/amountInWords';
import { formatMoney } from '../../domain/money';
import { toMiti } from '../../domain/nepaliDate';
import type { Payment, PaymentMethod, PaymentRefund } from '../../domain/types';
import { buildReceiptSlip } from '../../printing/escpos';
import { printRaw, targetOf } from '../../printing/qz';
import { askReceiptPrinter, getState } from '../../printing/store';

/**
 * The one paper artifact the till produces — a settle-table charge (Tables.tsx)
 * and a re-print from the ledger (Payments.tsx) are the same document, so
 * both build it from here rather than keeping their own copy of the markup.
 *
 * With a recorded `Payment` it is the IRD invoice (numbered, dated, buyer and VAT shown, "Copy of Original" after the first
 * print). Without one — the bill shown before payment, or a bill from before numbering — it says it is not a tax invoice.
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
  /** How it was really paid when `method` alone would mislead: "Cash + QR" for a split bill, "On credit — unpaid" for a credit sale. */
  label?: string;
  takenBy: string | null;
}

/** What the receipt header needs to know about the restaurant. */
export interface ReceiptRestaurant {
  name: string;
  /** Registered name. Omitted or equal to `name` = the heading alone is enough. */
  legalName?: string | null;
  vatPanNumber?: string | null;
  /** Registered for VAT; without it nothing here is a tax invoice, whatever the tax rate. */
  vatRegistered?: boolean;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Everything a receipt shows, resolved once so the browser page and the ESC/POS slip say the same thing. */
export interface ReceiptBody {
  table: { name: string; capacity?: number };
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  restaurant: ReceiptRestaurant;
  payment?: ReceiptPayment;
  paidBy: string;
  legalName: string;
  vatPan?: string;
  /** Heads the PAN line: "VAT/PAN" for a VAT-registered restaurant, "PAN" for one that is not. */
  vatRegistered?: boolean;
  customerName?: string;
  doc: ReceiptDoc;
}

/** What makes the paper an invoice, resolved once so both renderers print the same words. */
export interface ReceiptDoc {
  /** "TAX INVOICE", "ABBREVIATED TAX INVOICE", "INVOICE", "CREDIT NOTE" or "BILL". */
  title: string;
  /** "2083/84-41", or undefined for a bill that has no number. */
  number?: string;
  /** What the number is called: "Invoice no.", "Bill no." (not a tax invoice) or "Credit note no.". */
  numberLabel?: string;
  issuedAt?: Date;
  /** The BS date ("2083-08-08"); omitted outside the range we can convert reliably. */
  miti?: string;
  /** The total in words, as IRD invoices carry it; NPR only. */
  words?: string;
  /** "COPY OF ORIGINAL (2)" on a reprint. */
  copyLabel?: string;
  /** A credit note names the invoice it reverses. */
  against?: string;
  buyerName?: string;
  buyerPan?: string;
  /** What VAT was charged on, and at what rate; omitted when no VAT was charged. */
  taxable?: number;
  taxLabel: string;
  /** What the total holds beyond subtotal, service and VAT (a delivery fee): the bill carries no column for it, so it is the remainder. */
  otherCharges?: number;
  /** Printed under the totals, e.g. "This is not a tax invoice." */
  notice?: string;
}

/** VAT-registered means the flag is on and there is a PAN to print: the number is what makes it checkable. */
const isVatRegistered = (r: ReceiptRestaurant) => !!r.vatRegistered && !!r.vatPanNumber?.trim();

const percent = (rate: number) => `${Math.round(rate * 10000) / 100}%`;

/** The words on an invoice for a recorded payment: tax invoice only when VAT was charged by a VAT-registered seller. */
export function invoiceDoc(p: Payment, restaurant: ReceiptRestaurant, totals: ReceiptTotals, printCount: number): ReceiptDoc {
  const registered = isVatRegistered(restaurant);
  const charged = (p.taxRate ?? 0) > 0 && registered;
  const buyer = p.buyerName?.trim() ? { buyerName: p.buyerName.trim(), buyerPan: p.buyerPan?.trim() || undefined } : {};
  return {
    // Only a VAT-registered seller may call it a tax invoice; anyone else's numbered bill says plainly that it is not one.
    title: !registered ? 'BILL' : !charged ? 'INVOICE' : buyer.buyerPan ? 'TAX INVOICE' : 'ABBREVIATED TAX INVOICE',
    notice: registered ? undefined : 'This is not a tax invoice.',
    numberLabel: registered ? 'Invoice no.' : 'Bill no.',
    number: `${p.fiscalYear}-${p.invoiceNumber}`,
    issuedAt: new Date(p.createdAt),
    miti: toMiti(new Date(p.createdAt)) ?? undefined,
    words: amountInWords(totals.total, totals.currency) ?? undefined,
    copyLabel: printCount > 1 ? `COPY OF ORIGINAL (${printCount})` : undefined,
    ...buyer,
    taxable: charged ? totals.subtotal - totals.discount + totals.serviceCharge : undefined,
    taxLabel: charged ? `VAT ${percent(p.taxRate ?? 0)}` : 'Tax',
    otherCharges: Math.max(0, totals.total - (totals.subtotal - totals.discount + totals.serviceCharge + totals.tax)) || undefined,
  };
}

/** A refund is a credit note: the amount handed back, with the VAT in it, against the invoice it reverses. */
export function creditNoteDoc(p: Payment, refund: PaymentRefund, restaurant: ReceiptRestaurant): { doc: ReceiptDoc; totals: ReceiptTotals } {
  const charged = (p.taxRate ?? 0) > 0 && isVatRegistered(restaurant);
  const tax = refund.taxReversed ?? 0;
  const buyer = p.buyerName?.trim() ? { buyerName: p.buyerName.trim(), buyerPan: p.buyerPan?.trim() || undefined } : {};
  return {
    doc: {
      title: 'CREDIT NOTE',
      numberLabel: 'Credit note no.',
      number: `${refund.fiscalYear}-${refund.creditNoteNumber}`,
      issuedAt: new Date(refund.createdAt),
      miti: toMiti(new Date(refund.createdAt)) ?? undefined,
      words: amountInWords(refund.amount, p.currency) ?? undefined,
      against: `${p.fiscalYear}-${p.invoiceNumber}`,
      ...buyer,
      taxable: charged ? refund.amount - tax : undefined,
      taxLabel: charged ? `VAT ${percent(p.taxRate ?? 0)}` : 'Tax',
    },
    totals: { currency: p.currency, subtotal: refund.amount - tax, serviceCharge: 0, tax, discount: 0, total: refund.amount },
  };
}

const billDoc = (): ReceiptDoc => ({ title: 'BILL', taxLabel: 'Tax', notice: 'This is not a tax invoice. Please collect the original bill from the counter.' });

/** The first print of an invoice is the original; if the print log cannot be reached, assume it is not, since a copy must never pass as the original. */
async function countPrint(paymentId: string): Promise<number> {
  try {
    return await recordPrint(paymentId);
  } catch {
    return 2;
  }
}

function buildBody(
  table: { name: string; capacity?: number },
  lines: ReceiptLine[],
  totals: ReceiptTotals,
  restaurant: ReceiptRestaurant,
  doc: ReceiptDoc,
  payment?: ReceiptPayment,
  customerName?: string | null,
): ReceiptBody {
  const name = restaurant.name;
  const registered = restaurant.legalName?.trim() ?? '';
  return {
    table,
    lines,
    totals,
    restaurant,
    payment,
    paidBy: payment ? (payment.label ?? (payment.method === 'CASH' ? 'Cash' : payment.method === 'QR' ? 'QR' : 'Card')) : '',
    legalName: registered && registered.toLowerCase() !== name.trim().toLowerCase() ? registered : '',
    vatPan: restaurant.vatPanNumber?.trim() || undefined,
    vatRegistered: isVatRegistered(restaurant),
    customerName: customerName?.trim() || undefined,
    doc,
  };
}

const openSheet = () => window.open('', '_blank', 'width=420,height=640');

/**
 * Prints on the chosen printer, or in the browser. `make` builds the body from the print count, which is logged only once the
 * cashier has actually chosen to print (closing the picker prints nothing and must not turn the original into a "copy").
 * Resolves false only when pop-ups were blocked.
 *
 * The browser window is opened before anything is awaited: logging the print is a network call, and a window opened after
 * it no longer counts as the click's doing, so the pop-up blocker would swallow the receipt.
 */
async function output(make: (printCount: number) => Promise<ReceiptBody> | ReceiptBody, paymentId?: string): Promise<boolean> {
  const asking = getState().agentOn;
  let sheet = asking ? null : openSheet();
  if (!asking && !sheet) return false;
  const choice = asking ? await askReceiptPrinter() : 'browser';
  if (choice === null) return true; // closed the picker: nothing to print
  if (choice === 'browser' && !sheet) {
    sheet = openSheet();
    if (!sheet) return false;
  }
  const body = await make(paymentId ? await countPrint(paymentId) : 0);
  if (choice !== 'browser') {
    try {
      await printRaw(targetOf(choice), buildReceiptSlip(body, choice.paper));
      return true;
    } catch {
      /* printer or QZ Tray unreachable: the browser dialog still gets the guest their receipt */
    }
    sheet = openSheet();
    if (!sheet) return false;
  }
  return printInBrowser(body, sheet as Window);
}

/**
 * When this PC is set to print, asks which configured printer (or the browser) to use; with it off, goes straight
 * to the browser's print dialog, which is also the fallback if the chosen printer fails. Resolves false only when the
 * browser path was needed and pop-ups are blocked.
 *
 * Pass the recorded `invoice` to print it as the IRD invoice; this logs the print, so only call it when paper is about to come out.
 */
export async function printReceipt(
  table: { name: string; capacity?: number },
  lines: ReceiptLine[],
  totals: ReceiptTotals,
  restaurant: ReceiptRestaurant,
  payment?: ReceiptPayment,
  customerName?: string | null,
  invoice?: Payment | null,
): Promise<boolean> {
  const numbered = invoice && invoice.invoiceNumber != null && invoice.fiscalYear ? invoice : null;
  return output(
    (count) => buildBody(table, lines, totals, restaurant, numbered ? invoiceDoc(numbered, restaurant, totals, count) : billDoc(), payment, customerName),
    numbered?.id,
  );
}

/** Prints the credit note a refund is, against the invoice it reverses. A refund from before numbering has none to print. */
export async function printCreditNote(
  table: { name: string },
  invoice: Payment,
  refund: PaymentRefund,
  restaurant: ReceiptRestaurant,
): Promise<boolean> {
  if (refund.creditNoteNumber == null || !refund.fiscalYear) return true;
  const { doc, totals } = creditNoteDoc(invoice, refund, restaurant);
  const lines = [{ dishNameSnapshot: refund.reason ? `Refund - ${refund.reason}` : 'Refund', quantity: 1, total: refund.amount }];
  return output(() => buildBody(table, lines, totals, restaurant, doc, undefined, invoice.customerName));
}

const issued = (d: Date) => d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function printInBrowser(body: ReceiptBody, sheet: Window): boolean {
  const { table, lines, totals, restaurant, payment, customerName, doc } = body;
  const restaurantName = restaurant.name;
  const { legalName, vatPan, vatRegistered } = body;
  const { currency, subtotal, serviceCharge, tax, discount, total } = totals;
  const rows = lines
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.dishNameSnapshot)}</td><td class="num">${i.quantity}</td><td class="num"><b>${formatMoney(i.total, currency)}</b></td></tr>`,
    )
    .join('');
  const line = (label: string, value: string) => `<div class="row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
  const docRows =
    (doc.number ? line(doc.numberLabel ?? 'Invoice no.', doc.number) : '') +
    (doc.against ? line('Against invoice', doc.against) : '') +
    (doc.issuedAt ? line('Date', issued(doc.issuedAt)) : '') +
    (doc.miti ? line('Miti (BS)', doc.miti) : '') +
    (doc.buyerName ? line('Buyer', doc.buyerName) : '') +
    (doc.buyerPan ? line('Buyer PAN', doc.buyerPan) : '');
  const customer = doc.buyerName ? '' : customerName?.trim();
  const customerRow = customer ? line('Customer', customer) : '';
  const paymentRows = payment
    ? line('Paid by', payment.label ?? (payment.method === 'CASH' ? 'Cash' : payment.method === 'QR' ? 'QR' : 'Card')) +
      (payment.takenBy ? line('Served by', payment.takenBy) : '') +
      `<div class="rule"></div>`
    : '';

  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(doc.title)} ${escapeHtml(doc.number ?? table.name)}</title>
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
    .title { margin: 10px 0 0; font-size: 14px; font-weight: 900; letter-spacing: .06em; }
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
      ${legalName ? `<p style="margin:4px 0 0;font-size:13px;font-weight:700">${escapeHtml(legalName)}</p>` : ''}
      ${vatPan ? `<p class="muted" style="margin:4px 0 0">${vatRegistered ? 'VAT/PAN' : 'PAN'}: ${escapeHtml(vatPan)}</p>` : ''}
      <p class="title">${escapeHtml(doc.title)}</p>
      ${doc.copyLabel ? `<p class="notice" style="margin-top:4px">${escapeHtml(doc.copyLabel)}</p>` : ''}
      <p class="muted" style="margin:6px 0 0">${escapeHtml(table.name)}${table.capacity ? ` · ${table.capacity} seats` : ''}</p>
    </div>
    <div class="rule"></div>
    ${docRows}
    ${customerRow}
    ${paymentRows}
    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rule"></div>
    <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal, currency)}</span></div>
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>−${formatMoney(discount, currency)}</span></div>` : ''}
    ${serviceCharge > 0 || doc.title !== 'CREDIT NOTE' ? `<div class="row"><span>Service</span><span>${formatMoney(serviceCharge, currency)}</span></div>` : ''}
    ${doc.otherCharges ? `<div class="row"><span>Delivery fee</span><span>${formatMoney(doc.otherCharges, currency)}</span></div>` : ''}
    ${doc.taxable !== undefined ? `<div class="row"><span>Taxable amount</span><span>${formatMoney(doc.taxable, currency)}</span></div>` : ''}
    <div class="row"><span>${escapeHtml(doc.taxLabel)}</span><span>${formatMoney(tax, currency)}</span></div>
    <div class="row" style="align-items:baseline"><span style="font-size:16px;font-weight:900">Total</span><span class="total">${formatMoney(total, currency)}</span></div>
    ${doc.words ? `<p class="muted" style="margin:0 0 8px">In words: ${escapeHtml(doc.words)}</p>` : ''}
    <div class="rule"></div>
    ${doc.notice ? `<p class="center notice">${escapeHtml(doc.notice)}</p>` : ''}
    <p class="center muted">Thank you${doc.issuedAt ? '' : ` · ${new Date().toLocaleString()}`}</p>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}
