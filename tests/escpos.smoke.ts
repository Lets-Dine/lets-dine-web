import assert from 'node:assert/strict';
import type { KitchenTicket } from '../src/api/kitchen';
import { ascii, buildJobSlip, buildSlip, COLUMNS, wrap } from '../src/printing/escpos';

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
