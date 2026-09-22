import { DISHES, RESTAURANT, TABLES } from './menu';
import { percentOf, sumLines } from '../domain/money';
import type { Order, OrderItem } from '../domain/types';

/**
 * Trading history for the dashboard.
 *
 * A restaurant that opened this morning has nothing to analyse, so the last
 * ninety days are reconstructed from the same dish statistics the diner side
 * merchandises on: a dish with 480 orders in the trailing month gets roughly
 * 480 orders here, and one that doubled its volume shows that shape week over
 * week. Analytics and the menu therefore tell the same story instead of two
 * unrelated ones.
 *
 * Deterministic, and derived from the calendar day rather than the clock, so
 * the numbers hold still while a manager reads them. Never persisted — this is
 * the immovable past, and only today's orders are written to the store.
 */

const HISTORY_DAYS = 90;
const DAY_MS = 86_400_000;

/** Reference numbers below this belong to history; live orders continue above. */
export const HISTORY_REF_CEILING = 9000;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)];
}

/** Weekends are busier, and Monday is a graveyard. */
const DAY_WEIGHT = [0.82, 0.7, 0.8, 0.88, 1.05, 1.4, 1.35];

const NOTES = [
  '',
  '',
  '',
  '',
  '',
  'No onion please',
  'Extra spicy',
  'Less oil',
  'Pack it to go',
  'Serve with the mains',
  'One plate, two spoons',
];

interface Weighted {
  dishId: string;
  name: string;
  imageUrl: string | null;
  price: number;
  /** Share of the menu's volume in the trailing month… */
  recent: number;
  /** …and in the month before it, so trends have a real shape. */
  previous: number;
}

const CATALOGUE: Weighted[] = DISHES.map((d) => ({
  dishId: d.id,
  name: d.name,
  imageUrl: d.imageUrl,
  price: d.price,
  recent: d.stats.orders30d,
  previous: d.stats.ordersPrev30d,
}));

const TOTAL_RECENT = CATALOGUE.reduce((n, d) => n + d.recent, 0);
const TOTAL_PREVIOUS = CATALOGUE.reduce((n, d) => n + d.previous, 0);

/** Average dish-units per order, used to turn dish volume into order volume. */
const UNITS_PER_ORDER = 3.1;

/**
 * Weights slide from "two months ago" to "this month" across the window, so a
 * dish whose velocity is climbing gets its climb rather than a step change.
 */
function weightsFor(daysAgo: number): number[] {
  const recency = Math.min(1, Math.max(0, (HISTORY_DAYS - daysAgo) / HISTORY_DAYS));
  return CATALOGUE.map((d) => {
    const past = TOTAL_PREVIOUS > 0 ? d.previous / TOTAL_PREVIOUS : 0;
    const now = TOTAL_RECENT > 0 ? d.recent / TOTAL_RECENT : 0;
    return past + (now - past) * recency;
  });
}

function sample(rand: () => number, weights: number[]): Weighted {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return CATALOGUE[i];
  }
  return CATALOGUE[CATALOGUE.length - 1];
}

/** Lunch service, then the dinner rush that actually pays the rent. */
function serviceTime(rand: () => number): { hour: number; minute: number } {
  const dinner = rand() < 0.62;
  const hour = dinner ? 18 + Math.floor(rand() * 4) : 11 + Math.floor(rand() * 4);
  return { hour, minute: Math.floor(rand() * 60) };
}

function buildDay(daysAgo: number, dayStart: number): Order[] {
  const dayIndex = Math.floor(dayStart / DAY_MS);
  const rand = mulberry32(dayIndex * 2654435761);
  const weekday = new Date(dayStart).getDay();

  const dailyUnits = (TOTAL_RECENT / 30) * DAY_WEIGHT[weekday] * (0.85 + rand() * 0.3);
  const orderCount = Math.max(1, Math.round(dailyUnits / UNITS_PER_ORDER));
  const weights = weightsFor(daysAgo);
  const activeTables = TABLES.filter((t) => t.isActive);

  const orders: Order[] = [];
  for (let i = 0; i < orderCount; i++) {
    const lineCount = 1 + Math.floor(rand() * rand() * 4.6);
    const chosen = new Map<string, { dish: Weighted; quantity: number; notes: string }>();
    for (let l = 0; l < lineCount; l++) {
      const dish = sample(rand, weights);
      const existing = chosen.get(dish.dishId);
      if (existing) existing.quantity += 1;
      else chosen.set(dish.dishId, { dish, quantity: 1 + (rand() < 0.22 ? 1 : 0), notes: pick(rand, NOTES) });
    }

    const { hour, minute } = serviceTime(rand);
    const placed = new Date(dayStart + hour * 3600_000 + minute * 60_000);
    const cancelled = rand() < 0.035;
    // History is always closed one way or the other — every surviving item on a
    // completed visit made it to the table; a cancelled visit never started.
    const items: OrderItem[] = [...chosen.values()].map(({ dish, quantity, notes }, index) => ({
      id: `itm_h${dayIndex}_${i}_${index}`,
      dishId: dish.dishId,
      dishNameSnapshot: dish.name,
      imageUrlSnapshot: dish.imageUrl,
      unitPrice: dish.price,
      quantity,
      notes,
      status: cancelled ? 'CANCELLED' : 'SERVED',
      statusUpdatedAt: placed.toISOString(),
    }));

    const subtotal = sumLines(items);
    const serviceCharge = percentOf(subtotal, RESTAURANT.serviceChargeRate);
    const tax = percentOf(subtotal + serviceCharge, RESTAURANT.taxRate);
    const table = pick(rand, activeTables);
    const completedAt = new Date(placed.getTime() + (14 + rand() * 46) * 60_000);

    orders.push({
      id: `ord_h${dayIndex}_${i}`,
      reference: '',
      restaurantId: RESTAURANT.id,
      tableId: table.id,
      tableName: table.name,
      sessionId: `ses_h${dayIndex}_${i}`,
      status: cancelled ? 'CANCELLED' : 'COMPLETED',
      acceptedAt: cancelled ? null : placed.toISOString(),
      cancelledAt: cancelled ? placed.toISOString() : null,
      items,
      subtotal,
      serviceCharge,
      tax,
      discount: 0,
      total: subtotal + serviceCharge + tax,
      currency: RESTAURANT.currency,
      createdAt: placed.toISOString(),
      updatedAt: completedAt.toISOString(),
      completedAt: cancelled ? null : completedAt.toISOString(),
      reviewedDishIds: [],
    });
  }
  return orders;
}

let cache: { key: number; orders: Order[] } | null = null;

/** Every completed and cancelled order from the last ninety days, oldest first. */
export function orderHistory(now: number = Date.now()): Order[] {
  const today = Math.floor(now / DAY_MS);
  if (cache && cache.key === today) return cache.orders;

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  const days: Order[][] = [];
  for (let daysAgo = HISTORY_DAYS; daysAgo >= 1; daysAgo--) {
    days.push(buildDay(daysAgo, midnight.getTime() - daysAgo * DAY_MS));
  }

  // Number them last, so references run in the order the kitchen saw them and
  // end just below the band reserved for orders placed from now on.
  const total = days.reduce((n, d) => n + d.length, 0);
  let ref = HISTORY_REF_CEILING - total;
  const orders: Order[] = [];
  for (const day of days) {
    for (const order of day) orders.push({ ...order, reference: `#${ref++}` });
  }

  cache = { key: today, orders };
  return orders;
}
