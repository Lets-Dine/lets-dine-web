import assert from 'node:assert/strict';
import type { DiningTable, Dish, Order, OrderItem } from '../src/domain/types';
import type { Focus } from '../src/domain/orderStatus';
import { matchDishes, tableService } from '../src/domain/posBoard';

const NOW = Date.parse('2026-11-10T20:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

const table = (id: string, sessionId: string | null): DiningTable => ({
  id,
  restaurantId: 'r',
  name: id,
  qrToken: id,
  capacity: 4,
  currentSessionId: sessionId,
  currentSessionToken: null,
  isActive: true,
  sortOrder: 0,
  createdAt: ago(600),
});

const item = (status: OrderItem['status']): OrderItem =>
  ({ id: `i-${status}-${Math.random()}`, status, quantity: 1, statusUpdatedAt: ago(1) }) as unknown as OrderItem;

const order = (id: string, sessionId: string, minutesAgo: number, total: number, items: OrderItem[], status = 'PREPARING'): Order =>
  ({ id, sessionId, createdAt: ago(minutesAgo), total, items, status }) as unknown as Order;

/* A visit is as old as its first order, not its latest round: a table seated an hour ago that has just ordered
   dessert has still been sitting there an hour, and the board is read to decide who has been waiting longest. */
{
  const starters = order('o1', 's1', 62, 1800, [item('SERVED')]);
  const dessert = order('o2', 's1', 2, 600, [item('PENDING'), item('PREPARING'), item('READY')]);
  const board = tableService([table('T1', 's1')], [starters, dessert], new Map(), NOW);
  const t1 = board.get('T1')!;
  assert.equal(t1.minutes, 62);
  assert.equal(t1.total, 2400);
  assert.equal(t1.coming, 2);
  assert.equal(t1.ready, 1);
  assert.equal(t1.urgent, null);
}

// Cancelled orders and cancelled lines are not owed, not coming, and not money.
{
  const live = order('o1', 's1', 10, 500, [item('PENDING'), item('CANCELLED')]);
  const scrapped = order('o2', 's1', 9, 900, [item('PENDING')], 'CANCELLED');
  const t1 = tableService([table('T1', 's1')], [live, scrapped], new Map(), NOW).get('T1')!;
  assert.equal(t1.total, 500);
  assert.equal(t1.coming, 1);
}

// The worst flag on any of the visit's orders is the one the card wears.
{
  const flags = new Map<string, Focus>([
    ['o1', { level: 'warn', reason: 'late', rank: 1 }],
    ['o2', { level: 'critical', reason: 'very late', rank: 3 }],
  ]);
  const orders = [order('o1', 's1', 20, 100, [item('PENDING')]), order('o2', 's1', 18, 100, [item('PENDING')])];
  assert.equal(tableService([table('T1', 's1')], orders, flags, NOW).get('T1')!.urgent, 'critical');
}

// A free table, and a seated one with nothing ordered yet, say nothing on the board rather than NaN minutes.
{
  const board = tableService([table('T1', null), table('T2', 's2')], [], new Map(), NOW);
  assert.equal(board.has('T1'), false);
  assert.equal(board.has('T2'), false);
}

/* ── The terminal's menu search ─────────────────────────────────────────────── */

const dish = (id: string, name: string, categoryId: string): Dish => ({ id, name, categoryId }) as unknown as Dish;
const MENU = [
  dish('d1', 'Aloo Dum', 'c1'),
  dish('d2', 'Coke', 'c2'),
  dish('d3', 'Diet Coke', 'c2'),
  dish('d4', 'Chicken Momo', 'c1'),
];

// A name that starts with what was typed outranks one that merely contains it: "coke" is Coke, not Diet Coke.
assert.deepEqual(
  matchDishes(MENU, 'coke', null).map((d) => d.id),
  ['d2', 'd3'],
);

// Search reaches across the whole menu — at the pass you type the dish, not its category first.
assert.deepEqual(
  matchDishes(MENU, 'coke', 'c1').map((d) => d.id),
  ['d2', 'd3'],
);

// With nothing typed, a chosen category is the whole list.
assert.deepEqual(
  matchDishes(MENU, '', 'c2').map((d) => d.id),
  ['d2', 'd3'],
);

/* Why the terminal keeps the search after a dish goes on, rather than emptying it.
   The cursor is an index into this list, so a list that survives the keystroke keeps the cursor honest: Enter, Enter
   buys two Cokes, and the arrow key next door reaches Diet Coke. Were the box emptied instead, the same two Enters
   would buy a Coke and then row 0 of the whole menu — a dish nobody asked for, off a key pressed on purpose. */
{
  const searching = matchDishes(MENU, 'coke', null);
  assert.deepEqual(searching, matchDishes(MENU, 'coke', null), 'the list is stable across repeated adds');
  assert.equal(searching[0].id, 'd2', 'Enter again buys another Coke');
  assert.equal(searching[1].id, 'd3', 'the arrow key reaches Diet Coke without retyping');
  assert.notEqual(matchDishes(MENU, '', null)[0].id, searching[0].id, 'emptying the box would move row 0 onto another dish');
}

console.log('posboard smoke ok');
