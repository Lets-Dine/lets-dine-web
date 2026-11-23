import assert from 'node:assert/strict';
import type { KitchenTicket } from '../src/api/kitchen';
import { amountInWords } from '../src/domain/amountInWords';
import { toMiti } from '../src/domain/nepaliDate';
import { ascii, buildJobSlip, buildReceiptSlip, buildSlip, COLUMNS, wrap } from '../src/printing/escpos';

assert.equal(ascii('2× Momo – “hot”'), '2x Momo - "hot"');
assert.equal(ascii('मोमो'), '????'); // unprintable becomes "?", never a stray byte
assert.equal(ascii('Café'), 'Cafe');

assert.deepEqual(wrap('aaaa bbbb cccc', 9), ['aaaa bbbb', 'cccc']);
assert.deepEqual(wrap('abcdefghijkl', 5), ['abcde', 'fghij', 'kl']); // longer than the paper: hard break

const ticket = (qtyDelta: number): KitchenTicket => ({
  id: 't',
  station: 'KITCHEN',
  number: 12,
  createdAt: '2026-10-27T10:00:00Z',
  acknowledgedAt: null,
  order: { reference: '#1518', orderType: 'DINE_IN', tableName: 'Table 4', floorName: null, floorVisitorName: null },
  lines: [{ id: 'l', qtyDelta, dishNameSnapshot: 'Chicken Momo', variantNameSnapshot: 'Steamed', addOnNames: ['Extra sauce'], notes: 'no onion' }],
});

const text = (b: Uint8Array) => Buffer.from(b).toString('latin1');
const slip = buildSlip(ticket(2), '80mm');
assert.ok(text(slip).includes('KOT #12') && text(slip).includes('2x Chicken Momo') && text(slip).includes('>> no onion'));
assert.deepEqual([...slip.slice(0, 2)], [0x1b, 0x40]); // starts with ESC @ (init)
assert.deepEqual([...slip.slice(-4)], [0x1d, 0x56, 0x42, 0x03]); // ends with the cut
assert.ok(!text(slip).includes('CANCELLED'));

const voided = text(buildSlip({ ...ticket(-2), station: 'BAR' }, '58mm'));
assert.ok(voided.includes('CANCELLED - STOP MAKING') && voided.includes('VOID -2x Chicken Momo'));
// No printable line may exceed the paper's columns, or the printer wraps it mid-word.
for (const paper of ['80mm', '58mm'] as const) {
  for (const line of text(buildSlip(ticket(2), paper)).split('\n')) {
    const printable = line.replace(/[\x00-\x1f]|[\x1d\x1b]./g, '');
    assert.ok(printable.length <= COLUMNS[paper] + 8, `line too long for ${paper}: ${printable}`);
  }
}
// A full-KOT slip carries every station's ticket on one paper, in sections.
const bar: KitchenTicket = { ...ticket(1), id: 'u', station: 'BAR', number: 13, lines: [{ id: 'm', qtyDelta: 1, dishNameSnapshot: 'Mango Lassi', variantNameSnapshot: null, addOnNames: [], notes: '' }] };
const full = text(buildJobSlip([ticket(2), bar], '80mm'));
assert.ok(full.includes('FULL ORDER') && full.includes('KOT #12') && full.includes('BOT #13') && full.includes('Mango Lassi') && full.includes('Chicken Momo'));
assert.equal(text(buildJobSlip([ticket(2)], '80mm')), text(buildSlip(ticket(2), '80mm'))); // one ticket is just its own slip
console.log('escpos: ok');

const receipt = text(
  buildReceiptSlip({
    table: { name: 'Table 4' },
    lines: [{ dishNameSnapshot: 'Chicken Momo', quantity: 2, total: 40000 }],
    totals: { currency: 'NPR', subtotal: 40000, serviceCharge: 0, tax: 0, discount: 0, total: 40000 },
    restaurant: { name: 'Cafe' },
    paidBy: '',
    legalName: '',
    doc: { title: 'BILL', taxLabel: 'Tax', notice: 'This is not a tax invoice.' },
  }),
);
assert.ok(receipt.includes('2x Chicken Momo') && receipt.includes('Rs. 400') && receipt.includes('TOTAL'));
assert.ok(receipt.includes('BILL') && receipt.includes('This is not a tax invoice.') && !receipt.includes('Invoice no.'));

const invoice = text(
  buildReceiptSlip({
    table: { name: 'Table 4' },
    lines: [{ dishNameSnapshot: 'Chicken Momo', quantity: 2, total: 40000 }],
    totals: { currency: 'NPR', subtotal: 40000, serviceCharge: 0, tax: 5200, discount: 0, total: 45200 },
    restaurant: { name: 'Cafe' },
    paidBy: '',
    legalName: '',
    vatPan: '123456789',
    vatRegistered: true,
    doc: {
      title: 'TAX INVOICE',
      numberLabel: 'Invoice no.',
      number: '2083/84-41',
      issuedAt: new Date('2026-11-23T05:00:00Z'),
      copyLabel: 'COPY OF ORIGINAL (2)',
      buyerName: 'Himal Traders',
      buyerPan: '987654321',
      taxable: 40000,
      taxLabel: 'VAT 13%',
    },
  }),
);
for (const want of ['TAX INVOICE', 'Invoice no.', '2083/84-41', 'COPY OF ORIGINAL (2)', 'Himal Traders', '987654321', 'Taxable amount', 'VAT 13%']) {
  assert.ok(invoice.includes(want), `invoice slip is missing "${want}"`);
}
assert.ok(!invoice.includes('not a tax invoice'));
console.log('escpos receipts: ok');

assert.equal(amountInWords(123050, 'NPR'), 'Rs. One Thousand Two Hundred Thirty and Fifty Paisa Only');
assert.equal(amountInWords(12345600, 'NPR'), 'Rs. One Lakh Twenty Three Thousand Four Hundred Fifty Six Only');
assert.equal(amountInWords(1_000_000_000, 'NPR'), 'Rs. One Crore Only');
assert.equal(amountInWords(5, 'NPR'), 'Rs. Zero and Five Paisa Only');
assert.equal(amountInWords(100, 'USD'), null);
// Baisakh 1 2083 was 14 April 2026, Shrawan 1 2083 was 17 July 2026 (Hamro Patro); 1am NPT on Shrawan 1 is still 16 July in UTC.
assert.equal(toMiti(new Date('2026-04-14T06:00:00Z')), '2083-01-01');
assert.equal(toMiti(new Date('2026-07-16T20:00:00Z')), '2083-04-01');
assert.equal(toMiti(new Date('2026-07-16T17:00:00Z')), '2083-03-32');
assert.equal(toMiti(new Date('2024-01-01T00:00:00Z')), null);
assert.equal(toMiti(new Date('2031-08-01T00:00:00Z')), null);
console.log('miti and words: ok');

// A restaurant that is not VAT-registered: its numbered bill says so, and heads the PAN line "PAN".
const bill = text(
  buildReceiptSlip({
    table: { name: 'Table 4' },
    lines: [{ dishNameSnapshot: 'Chicken Momo', quantity: 2, total: 40000 }],
    totals: { currency: 'NPR', subtotal: 40000, serviceCharge: 0, tax: 0, discount: 0, total: 40000 },
    restaurant: { name: 'Cafe' },
    paidBy: '',
    legalName: '',
    vatPan: '123456789',
    vatRegistered: false,
    doc: { title: 'BILL', numberLabel: 'Bill no.', number: '2083/84-7', issuedAt: new Date('2026-11-23T05:00:00Z'), taxLabel: 'Tax', notice: 'This is not a tax invoice.' },
  }),
);
for (const want of ['PAN: 123456789', 'Bill no.', '2083/84-7', 'This is not a tax invoice.']) assert.ok(bill.includes(want), `bill slip is missing "${want}"`);
assert.ok(!bill.includes('VAT/PAN') && !bill.includes('Invoice no.') && !bill.includes('TAX INVOICE'));
console.log('non-vat bill: ok');
