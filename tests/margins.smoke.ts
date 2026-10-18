import assert from 'node:assert/strict';
import { advise, targetMargin } from '../src/api/dishMargins';
import type { DishMargin } from '../src/api/dishMargins';

const money = (v: number) => `Rs ${v / 100}`;
const dish = (o: Partial<DishMargin>): DishMargin => ({
  dishId: 'd', name: 'Momo', price: 30000, units: 10, revenue: 300000, coverage: 1, cost: 200000, margin: 100000, marginPct: 1 / 3,
  recipeCost: null, ratingCount: 0, avgRating: null, recommendRate: null, ...o,
});

// Four ranked dishes: margins 20%, 40%, 60%, 80% -> target (median) 50%.
const rows = [0.2, 0.4, 0.6, 0.8].map((p) => dish({ marginPct: p }));
assert.equal(targetMargin(rows), 0.5);
assert.equal(targetMargin(rows.slice(0, 3)), null);

// Unit cost 200, price 300, target 50% -> wants 400 but the rise is capped at +25% -> Rs 375, margin 47%.
assert.match(advise(dish({}), 'plowhorse', 0.5, money)!, /raising the price to Rs 375 for about 47% margin\.$/);
// Unit cost 140, target 50% -> 280, which the Rs 300 price already beats -> nothing to suggest.
assert.equal(advise(dish({ cost: 140000 }), 'plowhorse', 0.5, money), null);
// Unit cost 160 -> wants 320, under the 375 cap -> Rs 320, margin 50%.
assert.match(advise(dish({ cost: 160000 }), 'plowhorse', 0.5, money)!, /Rs 320 for about 50% margin/);
// The reported case: price 390, 5 sold, absurd target 89% -> capped at 487.5 -> Rs 490, never Rs 2,585.
assert.match(advise(dish({ price: 39000, units: 5, cost: 142000 }), 'plowhorse', 0.89, money)!, /Rs 490/);
// Loved dishes say it should hold; rating needs 5 reviews to count.
assert.match(advise(dish({ avgRating: 4.6, ratingCount: 8 }), 'plowhorse', 0.5, money)!, /diners love it/);
assert.doesNotMatch(advise(dish({ avgRating: 4.6, ratingCount: 2 }), 'plowhorse', 0.5, money)!, /diners love it/);
// Lukewarm plowhorse: fix first, no price rise.
assert.match(advise(dish({ avgRating: 3, ratingCount: 9 }), 'plowhorse', 0.5, money)!, /improve it before raising/);
// Rounds up to the next Rs 5 step: unit cost 161 -> 322 -> 325.
assert.match(advise(dish({ cost: 161000 }), 'plowhorse', 0.5, money)!, /Rs 325/);
// Nothing to suggest if the price is already at or above the target, or cost/target unknown.
assert.equal(advise(dish({ price: 50000 }), 'plowhorse', 0.5, money), null); // already priced above the target
assert.equal(advise(dish({ cost: null }), 'plowhorse', 0.5, money), null);
assert.equal(advise(dish({}), 'plowhorse', null, money), null);
assert.equal(advise(dish({}), 'star', 0.5, money), null);
assert.match(advise(dish({ avgRating: 3, ratingCount: 9 }), 'dog', 0.5, money)!, /drop it\.$/);
console.log('margins smoke ok');
