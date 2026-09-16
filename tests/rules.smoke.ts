/**
 * Headless checks for the rules the blueprint calls critical: order totals,
 * price snapshots, idempotency, availability, and review eligibility.
 *
 *   npm run test:rules
 *
 * Runs against the mock API client with a localStorage shim, so it exercises
 * exactly the code the UI calls.
 */
import {
  ApiError,
  cancelOrder,
  createOrder,
  getDish,
  getMenu,
  getOrder,
  resolveQr,
  reviewEligibility,
  submitReviews,
} from '../src/api/client';
import { STORE_KEY } from '../src/api/store';
import { buildRankContext, buildSections } from '../src/domain/metrics';
import { formatMoney } from '../src/domain/money';

let failures = 0;
function check(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

const { table, session } = await resolveQr('sekuwa-ghar', 'x7Hk92QpLr4mZv');
check('QR resolves to the right table', table.name === 'Table 12');

let rejected = false;
try {
  await resolveQr('sekuwa-ghar', 'not-a-real-token');
} catch (e) {
  rejected = e instanceof ApiError && e.status === 404;
}
check('Invalid table token is rejected', rejected);

const menu = await getMenu('sekuwa-ghar');
check('Menu loads all dishes', menu.dishes.length === 26, `${menu.dishes.length} dishes`);
check('Categories are sorted', menu.categories.every((c, i, a) => i === 0 || a[i - 1].sortOrder <= c.sortOrder));

const ctx = buildRankContext(menu.dishes);
const sections = buildSections(menu.dishes, ctx);
console.log('\n  merchandising:');
for (const s of sections) console.log(`   ${s.emoji} ${s.title}: ${s.dishes.map((d) => d.name).join(', ')}`);

const loved = sections.find((s) => s.key === 'loved')!;
const chowmein = menu.dishes.find((d) => d.id === 'dsh_chowmein')!;
check('High-volume mediocre dish is not "most loved"', !loved.dishes.some((d) => d.id === chowmein.id));
const papaya = menu.dishes.find((d) => d.id === 'dsh_papaya')!;
check(
  'Tiny-sample 4.6 does not outrank big-sample 4.8',
  loved.dishes.findIndex((d) => d.id === 'dsh_chicken_sekuwa') <
    (loved.dishes.findIndex((d) => d.id === papaya.id) + 1 || 99),
);

const unrated = menu.dishes.find((d) => d.id === 'dsh_iced_tea')!;
check('Unrated dish has null rating, not zero', unrated.stats.avgRating === null && unrated.stats.ratingCount === 0);

// ── Ordering ────────────────────────────────────────────────────────
const sekuwa = menu.dishes.find((d) => d.id === 'dsh_chicken_sekuwa')!;
const momo = menu.dishes.find((d) => d.id === 'dsh_steam_momo')!;
const order = await createOrder({
  session,
  lines: [
    { dishId: sekuwa.id, quantity: 2, note: 'extra achar' },
    { dishId: momo.id, quantity: 1, note: '' },
  ],
  idempotencyKey: 'key-1',
});

const expectedSubtotal = 45000 * 2 + 28000;
const expectedService = Math.round(expectedSubtotal * 0.1);
const expectedTax = Math.round((expectedSubtotal + expectedService) * 0.13);
check('Server computes subtotal', order.subtotal === expectedSubtotal, formatMoney(order.subtotal, 'NPR'));
check('Server computes service charge', order.serviceCharge === expectedService);
check('Server computes VAT on subtotal + service', order.tax === expectedTax);
check('Total is integer minor units', Number.isInteger(order.total) && order.total === expectedSubtotal + expectedService + expectedTax, formatMoney(order.total, 'NPR'));
check('Order snapshots dish name and price', order.items[0].dishNameSnapshot === 'Chicken Sekuwa' && order.items[0].unitPrice === 45000);
check('Item note is preserved', order.items[0].notes === 'extra achar');

const retry = await createOrder({ session, lines: [{ dishId: sekuwa.id, quantity: 2, note: 'extra achar' }], idempotencyKey: 'key-1' });
check('Idempotency key prevents a duplicate order', retry.id === order.id);

let blocked = false;
try {
  await createOrder({ session, lines: [{ dishId: 'dsh_calamari', quantity: 1, note: '' }], idempotencyKey: 'key-2' });
} catch (e) {
  blocked = e instanceof ApiError && e.status === 409;
}
check('Unavailable dish cannot be ordered', blocked);

let badQty = false;
try {
  await createOrder({ session, lines: [{ dishId: momo.id, quantity: 0, note: '' }], idempotencyKey: 'key-3' });
} catch {
  badQty = true;
}
check('Invalid quantity is rejected', badQty);

// ── Review eligibility ──────────────────────────────────────────────
check('Cannot review before completion', !reviewEligibility(order, sekuwa.id).ok);

let tooEarly = false;
try {
  await submitReviews(order.id, [{ dishId: sekuwa.id, overall: 5, taste: 5, portion: 5, value: 5, wouldOrderAgain: true, comment: '', tags: [] }]);
} catch (e) {
  tooEarly = e instanceof ApiError && e.status === 403;
}
check('Server refuses reviews on an incomplete order', tooEarly);

// Fast-forward the demo kitchen past COMPLETED.
const raw = JSON.parse(globalThis.localStorage.getItem(STORE_KEY)!);
raw.orders = raw.orders.map((o: { id: string; createdAt: string }) =>
  o.id === order.id ? { ...o, createdAt: new Date(Date.now() - 600_000).toISOString() } : o,
);
globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(raw));

const completed = await getOrder(order.id);
check('Order reaches COMPLETED on the timeline', completed.status === 'COMPLETED', completed.status);
check('Can review a purchased dish once completed', reviewEligibility(completed, sekuwa.id).ok);
check('Cannot review a dish that was not in the order', !reviewEligibility(completed, 'dsh_thakali').ok);

const before = await getDish(sekuwa.id);
const afterOrder = await submitReviews(completed.id, [
  { dishId: sekuwa.id, overall: 5, taste: 5, portion: 4, value: 5, wouldOrderAgain: true, comment: 'Smoky.', tags: ['Smoky'] },
]);
const after = await getDish(sekuwa.id);
check('Rating count increases after review', after.stats.ratingCount === before.stats.ratingCount + 1);
// One 5-star among 238 existing ratings must barely move the average — that is
// the whole point of aggregating rather than replacing.
const expectedAvg = Number((((before.stats.avgRating ?? 0) * before.stats.ratingCount + 5) / after.stats.ratingCount).toFixed(2));
check('Average is recomputed across all ratings', after.stats.avgRating === expectedAvg, `${before.stats.avgRating} -> ${after.stats.avgRating}`);
check('One vote cannot swing a large sample', Math.abs((after.stats.avgRating ?? 0) - (before.stats.avgRating ?? 0)) < 0.05);
check('Order records the reviewed dish', afterOrder.reviewedDishIds.includes(sekuwa.id));
check('Same dish cannot be reviewed twice for one order', !reviewEligibility(afterOrder, sekuwa.id).ok);

let dupe = false;
try {
  await submitReviews(completed.id, [{ dishId: sekuwa.id, overall: 1, taste: 1, portion: 1, value: 1, wouldOrderAgain: false, comment: '', tags: [] }]);
} catch {
  dupe = true;
}
check('Server rejects the duplicate review', dupe);

// ── Cancellation ────────────────────────────────────────────────────
const fresh = await createOrder({ session, lines: [{ dishId: momo.id, quantity: 1, note: '' }], idempotencyKey: 'key-4' });
const cancelled = await cancelOrder(fresh.id);
check('Pending order can be cancelled', cancelled.status === 'CANCELLED');

let lateCancel = false;
try {
  await cancelOrder(completed.id);
} catch (e) {
  lateCancel = e instanceof ApiError && e.status === 409;
}
check('Completed order cannot be cancelled', lateCancel);

// A dish with no ratings at all must go from null to a real average on first review.
const tea = await createOrder({ session, lines: [{ dishId: 'dsh_iced_tea', quantity: 1, note: '' }], idempotencyKey: 'key-5' });
const raw2 = JSON.parse(globalThis.localStorage.getItem(STORE_KEY)!);
raw2.orders = raw2.orders.map((o: { id: string; createdAt: string }) =>
  o.id === tea.id ? { ...o, createdAt: new Date(Date.now() - 600_000).toISOString() } : o,
);
globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(raw2));
const teaDone = await getOrder(tea.id);
await submitReviews(teaDone.id, [
  { dishId: 'dsh_iced_tea', overall: 4, taste: 4, portion: 4, value: 5, wouldOrderAgain: true, comment: 'Good.', tags: [] },
]);
const teaDish = await getDish('dsh_iced_tea');
check('First rating turns a null average into a real one', teaDish.stats.avgRating === 4 && teaDish.stats.ratingCount === 1);
check('Recommendation rate appears with the first review', teaDish.stats.recommendRate === 1);

check('Money formatting', formatMoney(45000, 'NPR') === 'Rs. 450' && formatMoney(123456, 'NPR') === 'Rs. 1,234.56', formatMoney(123456, 'NPR'));

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
