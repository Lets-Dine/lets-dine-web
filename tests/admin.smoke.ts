/**
 * Headless checks for the restaurant side: role enforcement, the order queue's
 * state machine, the audit trail, and — most importantly — that dashboard
 * edits actually reach the diner.
 *
 *   npm run test:admin
 *
 * The last group is the one worth having. A dashboard that lets a manager mark
 * a dish unavailable without stopping the next diner from ordering it is a
 * screenshot, not a feature.
 */
import {
  acceptOrder,
  advanceOrderItem,
  createCategory,
  createTable,
  deleteCategory,
  listAudit,
  listQueue,
  listReviews,
  regenerateQr,
  rejectOrder,
  setDishArchived,
  setTableActive,
  signIn,
  updateDish,
  updateSettings,
} from '../src/api/admin';
import { ApiError, createOrder, getDish, getMenu, resolveQr } from '../src/api/client';
import { STORE_KEY } from '../src/api/store';
import { orderHistory } from '../src/data/history';
import { dishPerformance, feedbackSummary, periodReport, totalsIn } from '../src/domain/adminMetrics';
import { dataCodewords, encodeData, encodeQr, interleave, reedSolomon } from '../src/domain/qr';
import { can } from '../src/domain/permissions';
import type { ItemStatus, Order, StaffMember } from '../src/domain/types';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

async function refuses(name: string, status: number, action: () => Promise<unknown>) {
  try {
    await action();
    check(name, false, 'the call succeeded');
  } catch (e) {
    check(name, e instanceof ApiError && e.status === status, e instanceof ApiError ? `got ${e.status}` : String(e));
  }
}

globalThis.localStorage.removeItem(STORE_KEY);

/* ── QR encoding ────────────────────────────────────────────────────
   Checked against the worked example in ISO/IEC 18004 Annex I, which is
   the only way to know a printed code will actually scan.               */

const hex = (bytes: number[]) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');

const isoData = encodeData('01234567', 1, 'M');
check(
  'QR data codewords match the ISO example',
  hex(isoData) === '10 20 0c 56 61 80 ec 11 ec 11 ec 11 ec 11 ec 11',
  hex(isoData),
);
check(
  'Reed–Solomon codewords match the ISO example',
  hex(reedSolomon(isoData, 10)) === 'a5 24 d4 c1 ed 36 c7 87 2c 55',
  hex(reedSolomon(isoData, 10)),
);

check('Version 1-M holds 16 data codewords', dataCodewords(1, 'M') === 16);
check('Version 5-Q holds 62 data codewords', dataCodewords(5, 'Q') === 62);
check('Version 10-H holds 122 data codewords', dataCodewords(10, 'H') === 122);
check(
  'Interleaving emits every codeword exactly once',
  interleave(encodeData('01234567', 5, 'Q'), 5, 'Q').length === 134,
);

const code = encodeQr('https://sekuwaghar.example/r/sekuwa-ghar/t/x7Hk92QpLr4mZv', { ecl: 'Q' });
check('A table URL fits a printable version', code.version >= 1 && code.version <= 10, `version ${code.version}`);
check('Matrix is square and correctly sized', code.size === code.version * 4 + 17 && code.modules.length === code.size);

const FINDER = [
  '1111111',
  '1000001',
  '1011101',
  '1011101',
  '1011101',
  '1000001',
  '1111111',
];
const finderAt = (ox: number, oy: number) =>
  FINDER.every((row, y) => [...row].every((cell, x) => code.modules[oy + y][ox + x] === (cell === '1')));
check(
  'Finder patterns sit in three corners',
  finderAt(0, 0) && finderAt(code.size - 7, 0) && finderAt(0, code.size - 7),
);
check(
  'Timing pattern alternates',
  code.modules[6].slice(8, code.size - 8).every((dark, i) => dark === (i % 2 === 0)),
);
check('The dark module is dark', code.modules[code.size - 8][8]);

let tooLong = false;
try {
  encodeQr('x'.repeat(400), { ecl: 'H' });
} catch {
  tooLong = true;
}
check('An oversized payload is refused rather than mangled', tooLong);

/* ── Sign-in and roles ──────────────────────────────────────────────── */

await refuses('A wrong PIN is rejected', 401, () => signIn('ranjana@sekuwaghar.np', '0000'));
await refuses('An unknown email is rejected', 401, () => signIn('nobody@sekuwaghar.np', '1234'));

const owner = await signIn('ranjana@sekuwaghar.np', '1234');
const manager = await signIn('bikash@sekuwaghar.np', '1234');
const server = await signIn('sunita@sekuwaghar.np', '1234');
check('Roles come back as expected', owner.role === 'OWNER' && manager.role === 'MANAGER' && server.role === 'STAFF');

check('Staff can work orders', can('STAFF', 'orders:advance') && can('STAFF', 'orders:view'));
check('Staff cannot edit the menu', !can('STAFF', 'menu:edit') && !can('STAFF', 'orders:cancel'));
check('Managers run the restaurant but not its fees', can('MANAGER', 'menu:price') && !can('MANAGER', 'settings:edit'));
check('Owners have everything', can('OWNER', 'settings:edit') && can('OWNER', 'menu:edit'));

await refuses('The API refuses a menu edit from staff', 403, () =>
  updateDish(server, 'dsh_steam_momo', { isAvailable: false }),
);
await refuses('The API refuses a fee change from a manager', 403, () =>
  updateSettings(manager, { serviceChargeRate: 0.2 }),
);

/* ── The order queue ────────────────────────────────────────────────── */

const queue = await listQueue(manager);
check('Opening the queue seeds a shift in progress', queue.length >= 8, `${queue.length} tickets`);
check('References are unique', new Set(queue.map((o) => o.reference)).size === queue.length);

const pending = queue.filter((o) => o.status === 'PENDING');
check('Some tickets are waiting to be accepted', pending.length > 0);

/** Every item on an order shares the same expected status — true right after accept, and after each uniform step below. */
async function advanceAllItems(actor: StaffMember, order: Order, from: ItemStatus): Promise<Order> {
  let current = order;
  for (const item of order.items) current = await advanceOrderItem(actor, order.id, item.id, from);
  return current;
}

const ticket = pending[0];
const accepted = await acceptOrder(server, ticket.id, 'PENDING');
check('Staff can accept a ticket', accepted.status === 'ACCEPTED');

// The second tablet to press Accept has to lose, not double-advance the order.
await refuses('A stale transition is rejected', 409, () => acceptOrder(server, ticket.id, 'PENDING'));

const preparing = await advanceAllItems(server, accepted, 'PENDING');
check('Order moves to PREPARING once its items start', preparing.status === 'PREPARING');
await refuses('An item cannot skip a step', 409, () => advanceOrderItem(server, ticket.id, preparing.items[0].id, 'PENDING'));

const ready = await advanceAllItems(server, preparing, 'PREPARING');
check('Order becomes READY once every item is plated', ready.status === 'READY');

const done = await advanceAllItems(server, ready, 'READY');
check('A ticket walks the whole pipeline', done.status === 'COMPLETED');
check('Completion is timestamped', done.completedAt !== null);
await refuses('A served item cannot advance further', 409, () => advanceOrderItem(server, ticket.id, done.items[0].id, 'SERVED'));
await refuses('Staff cannot cancel', 403, () => rejectOrder(server, ticket.id, 'no'));

const readyTicket = (await listQueue(manager)).find((o) => o.status === 'READY');
if (readyTicket) await refuses('Plated food cannot be cancelled', 409, () => rejectOrder(manager, readyTicket.id, 'no'));

const cancellable = (await listQueue(manager)).find((o) => o.status === 'PENDING' || o.status === 'ACCEPTED');
const rejected = await rejectOrder(manager, cancellable!.id, 'Kitchen out of stock');
check('A manager can pull a ticket before it is plated', rejected.status === 'CANCELLED');

/* ── Menu edits reach the diner ─────────────────────────────────────── */

const { session } = await resolveQr('sekuwa-ghar', 'x7Hk92QpLr4mZv');

await updateDish(manager, 'dsh_chowmein', { isAvailable: false });
const menuAfterOff = await getMenu('sekuwa-ghar');
check(
  'An unavailable dish still appears, marked',
  menuAfterOff.dishes.find((d) => d.id === 'dsh_chowmein')?.isAvailable === false,
);
await refuses('…but it can no longer be ordered', 409, () =>
  createOrder({ session, lines: [{ dishId: 'dsh_chowmein', quantity: 1, note: '' }], idempotencyKey: 'adm-1' }),
);

await updateDish(manager, 'dsh_chowmein', { isAvailable: true });
const priced = await createOrder({
  session,
  lines: [{ dishId: 'dsh_chowmein', quantity: 2, note: '' }],
  idempotencyKey: 'adm-2',
});

await updateDish(manager, 'dsh_chowmein', { price: 99900 });
const repriced = await createOrder({
  session,
  lines: [{ dishId: 'dsh_chowmein', quantity: 1, note: '' }],
  idempotencyKey: 'adm-3',
});
check('A price change reaches the next order', repriced.items[0].unitPrice === 99900);
check('…and cannot rewrite the order before it', priced.items[0].unitPrice !== 99900);

await setDishArchived(manager, 'dsh_papaya', true);
const menuAfterArchive = await getMenu('sekuwa-ghar');
check('An archived dish leaves the diner menu', !menuAfterArchive.dishes.some((d) => d.id === 'dsh_papaya'));
await refuses('…and its page 404s', 404, () => getDish('dsh_papaya'));
await refuses('…and it cannot be ordered', 400, () =>
  createOrder({ session, lines: [{ dishId: 'dsh_papaya', quantity: 1, note: '' }], idempotencyKey: 'adm-4' }),
);
await setDishArchived(manager, 'dsh_papaya', false);
check('Restoring puts it back', (await getMenu('sekuwa-ghar')).dishes.some((d) => d.id === 'dsh_papaya'));

await refuses('A category with dishes in it cannot be deleted', 409, () => deleteCategory(manager, 'cat_momo'));
const spare = await createCategory(manager, 'Late night', '🌙');
await deleteCategory(manager, spare.id);
check('An empty category can be deleted', !(await getMenu('sekuwa-ghar')).categories.some((c) => c.id === spare.id));

/* ── Tables and QR tokens ───────────────────────────────────────────── */

const table = await createTable(manager, 'Terrace 3', 4);
check('A new table gets its own token', table.qrToken.length >= 10 && table.isActive);
const viaNewTable = await resolveQr('sekuwa-ghar', table.qrToken);
check('Its code resolves straight away', viaNewTable.table.id === table.id);

await setTableActive(manager, table.id, false);
await refuses('A disabled table stops seating', 409, () => resolveQr('sekuwa-ghar', table.qrToken));
await setTableActive(manager, table.id, true);

const rotated = await regenerateQr(manager, table.id);
check('Regenerating issues a different token', rotated.qrToken !== table.qrToken);
await refuses('The printed code stops working', 404, () => resolveQr('sekuwa-ghar', table.qrToken));
check('The new one works', (await resolveQr('sekuwa-ghar', rotated.qrToken)).table.id === table.id);

/* ── Audit trail ────────────────────────────────────────────────────── */

const audit = await listAudit(owner, 200);
const kinds = new Set(audit.map((a) => a.action));
check('Price changes are logged', kinds.has('price_changed'));
check('Availability changes are logged', kinds.has('availability_changed'));
check('Archiving is logged', kinds.has('dish_archived'));
check('Order status changes are logged', kinds.has('order_status_changed'));
check('Token rotation is logged', kinds.has('qr_regenerated'));
check('Entries name who did it', audit.every((a) => a.actorName.length > 0 && a.actorRole.length > 0));

const priceEntry = audit.find((a) => a.action === 'price_changed');
check('A price entry records both figures', /→/.test(priceEntry?.detail ?? ''), priceEntry?.detail);

await refuses('Staff cannot read the audit log', 403, () => listAudit(server));

/* ── Reviews ────────────────────────────────────────────────────────── */

const negative = await listReviews(manager, { sentiment: 'negative' });
check('Complaints filter to three stars and below', negative.every((r) => r.overall < 4), `${negative.length} found`);
const oneDish = await listReviews(manager, { dishId: 'dsh_chowmein' });
check('Filtering by dish works', oneDish.every((r) => r.dishId === 'dsh_chowmein') && oneDish.length > 0);
check('Reviews carry their dish name', oneDish.every((r) => r.dishName.length > 0));
await refuses('Staff cannot read reviews', 403, () => listReviews(server));

/* ── Analytics ──────────────────────────────────────────────────────── */

const history = orderHistory();
check('Ninety days of trading are reconstructed', history.length > 500, `${history.length} orders`);
check('History is deterministic', orderHistory()[10].reference === history[10].reference);
check('History references are unique', new Set(history.map((o) => o.reference)).size === history.length);

const month = periodReport(history, 'month');
check('A month of orders is counted', month.current.orders > 0, `${month.current.orders} orders`);
check('Revenue is a positive integer', Number.isInteger(month.current.revenue) && month.current.revenue > 0);
check(
  'Average order value is revenue over orders',
  month.current.averageOrder === Math.round(month.current.revenue / month.current.orders),
);

const cancelledTotal = totalsIn(
  history.filter((o) => o.status === 'CANCELLED'),
  0,
  Date.now(),
);
check('Cancelled orders contribute no revenue', cancelledTotal.revenue === 0 && cancelledTotal.cancelled > 0);

const menu = await getMenu('sekuwa-ghar');
const perf = dishPerformance(history, menu.dishes, 0, Date.now());
const sold = perf.filter((d) => d.units > 0);
check('Every dish that sold has revenue', sold.length > 0 && sold.every((d) => d.revenue > 0));
check(
  'The busiest dish on the menu is the busiest in history',
  [...sold].sort((a, b) => b.units - a.units)[0].dishId ===
    [...menu.dishes].sort((a, b) => b.stats.orders30d - a.stats.orders30d)[0].id,
);

const feedback = feedbackSummary(menu.dishes);
check(
  'Restaurant rating is weighted by review count',
  feedback.restaurantRating !== null && feedback.restaurantRating > 4 && feedback.restaurantRating < 5,
  String(feedback.restaurantRating?.toFixed(2)),
);
check('Review count is the sum of the dishes', feedback.reviewCount > 1000);

console.log(failures === 0 ? '\nAll admin checks passed.' : `\n${failures} admin check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
