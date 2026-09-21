import { TABLE } from '../data/menu';
import { SEED_REVIEWS } from '../data/reviews';
import { ORDER_TIMELINE_SECONDS } from '../domain/config';
import { percentOf, sumLines } from '../domain/money';
import type {
  CartLine,
  DiningSession,
  DiningTable,
  Dish,
  DishStats,
  Menu,
  Order,
  OrderItem,
  OrderStatus,
  Restaurant,
  Review,
} from '../domain/types';
import type { Store } from './store';
import {
  ApiError,
  latency,
  menuOf,
  newSessionToken,
  randomId,
  readStore,
  restaurantOf,
  takeReference,
  tablesOf,
  uid,
  writeStore,
} from './store';

/**
 * In-browser stand-in for `/api/v1/...`. Every rule the real server must own —
 * price lookup, total calculation, review eligibility, idempotency — is
 * enforced here rather than in the components, so swapping this module for
 * `fetch` calls is the only change the UI needs.
 */

export { ApiError, randomId };

const DEMO_TABLE_ID = TABLE.id;

/* ── Stats aggregation ─────────────────────────────────────────────
   Seed aggregates plus anything this diner has since submitted, so a
   freshly written review visibly moves the dish's numbers.            */

function mergeStats(base: DishStats, mine: Review[]): DishStats {
  if (mine.length === 0) return base;
  const n = mine.length;
  const count = base.ratingCount + n;
  const avg = (num: number | null, add: number) => ((num ?? 0) * base.ratingCount + add) / count;
  const sum = (pick: (r: Review) => number) => mine.reduce((t, r) => t + pick(r), 0);

  const distribution = [...base.distribution] as DishStats['distribution'];
  for (const r of mine) {
    const bucket = Math.min(4, Math.max(0, Math.round(r.overall) - 1));
    distribution[bucket] += 1;
  }

  const baseAgain = (base.recommendRate ?? 0) * base.ratingCount;
  const mineAgain = mine.filter((r) => r.wouldOrderAgain).length;

  return {
    ...base,
    ratingCount: count,
    avgRating: Number(avg(base.avgRating, sum((r) => r.overall)).toFixed(2)),
    taste: Number(avg(base.taste, sum((r) => r.taste)).toFixed(2)),
    portion: Number(avg(base.portion, sum((r) => r.portion)).toFixed(2)),
    value: Number(avg(base.value, sum((r) => r.value)).toFixed(2)),
    recommendRate: (baseAgain + mineAgain) / count,
    distribution,
  };
}

function hydrateDish(dish: Dish, store: Store): Dish {
  const mine = store.reviews.filter((r) => r.dishId === dish.id);
  const orderedByMe = store.orders
    .filter((o) => o.status !== 'CANCELLED')
    .flatMap((o) => o.items)
    .filter((i) => i.dishId === dish.id)
    .reduce((n, i) => n + i.quantity, 0);
  const stats = mergeStats(dish.stats, mine);
  return {
    ...dish,
    stats: { ...stats, orders30d: stats.orders30d + orderedByMe },
  };
}

/* ── Order status pipeline ─────────────────────────────────────────
   The demo kitchen advances an order on a timer. The real client will
   poll `GET /orders/:id` and get the same shape back.                 */

const STATUS_ORDER: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

export function statusIndex(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status);
}

function projectStatus(order: Order): Order {
  if (order.status === 'CANCELLED') return order;
  const elapsed = (Date.now() - new Date(order.createdAt).getTime()) / 1000;
  let status: OrderStatus = 'PENDING';
  for (const key of STATUS_ORDER.slice(1)) {
    const at = ORDER_TIMELINE_SECONDS[key as keyof typeof ORDER_TIMELINE_SECONDS];
    if (elapsed >= at) status = key;
  }
  if (statusIndex(status) <= statusIndex(order.status)) return order;
  return {
    ...order,
    status,
    updatedAt: new Date().toISOString(),
    completedAt: status === 'COMPLETED' ? new Date().toISOString() : order.completedAt,
  };
}

function persistProjection(store: Store): Store {
  if (!store.autoKitchen) return store;
  // Only orders this browser actually placed are on the timer. Orders sitting
  // on the restaurant's queue are the staff's to move, or the demo kitchen
  // would keep completing tickets nobody has cooked.
  const mine = new Set(Object.values(store.sessions).map((s) => s.id));
  let changed = false;
  const orders = store.orders.map((o) => {
    if (!mine.has(o.sessionId)) return o;
    const next = projectStatus(o);
    if (next !== o) changed = true;
    return next;
  });
  if (!changed) return store;
  const next = { ...store, orders };
  writeStore(next);
  return next;
}

/* ── Public diner endpoints ────────────────────────────────────────── */

export async function resolveQr(
  restaurantSlug: string,
  tableToken: string,
  joinToken?: string,
): Promise<{ restaurant: Restaurant; table: DiningTable; session: DiningSession }> {
  await latency();
  const store = readStore();
  const restaurant = restaurantOf(store);
  if (restaurantSlug !== restaurant.slug) throw new ApiError(404, 'That restaurant does not exist.');

  const table = tablesOf(store).find((t) => t.qrToken === tableToken);
  if (!table) throw new ApiError(404, 'This QR code is not valid for any table.');
  if (!table.isActive) throw new ApiError(409, `${table.name} is not seating right now. Please ask a server.`);

  const key = `${restaurant.id}:${table.id}`;
  const existing = store.sessions[key];
  const stillValid = existing && new Date(existing.expiresAt).getTime() > Date.now();
  const localKey = `myfood.mock-session.${restaurantSlug}.${tableToken}`;
  const storedToken = localStorage.getItem(localKey);

  if (stillValid) {
    if (storedToken === existing.anonymousSessionToken || joinToken === existing.anonymousSessionToken) {
      localStorage.setItem(localKey, existing.anonymousSessionToken);
      return { restaurant, table, session: existing };
    }
    if (joinToken) {
      throw new ApiError(
        409,
        "That session code does not match this table's active visit.",
        'DINING_SESSION_JOIN_MISMATCH',
      );
    }
    throw new ApiError(
      409,
      'This table already has an active visit. Ask someone at the table for the session code to join.',
      'DINING_SESSION_TABLE_OCCUPIED',
    );
  }

  const session: DiningSession = {
    id: uid('ses'),
    restaurantId: restaurant.id,
    tableId: table.id,
    anonymousSessionToken: newSessionToken(),
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
  };

  writeStore({ ...store, sessions: { ...store.sessions, [key]: session } });
  localStorage.setItem(localKey, session.anonymousSessionToken);
  return { restaurant, table, session };
}

/** No latency() here: the entry screen reads this before it can show anything. */
export async function getRestaurant(restaurantSlug: string): Promise<Restaurant> {
  const restaurant = restaurantOf(readStore());
  if (restaurantSlug !== restaurant.slug) throw new ApiError(404, 'That restaurant does not exist.');
  return restaurant;
}

export async function getMenu(restaurantSlug: string): Promise<Menu> {
  await latency();
  const store = readStore();
  const restaurant = restaurantOf(store);
  if (restaurantSlug !== restaurant.slug) throw new ApiError(404, 'Menu not found.');
  const { categories, dishes } = menuOf(store);
  return {
    restaurant,
    categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    // An archived dish keeps its order history but leaves the menu entirely.
    dishes: dishes.filter((d) => !d.isArchived).map((d) => hydrateDish(d, store)),
  };
}

export async function getDish(dishId: string): Promise<Dish> {
  await latency();
  const store = readStore();
  const dish = menuOf(store).dishes.find((d) => d.id === dishId);
  if (!dish || dish.isArchived) throw new ApiError(404, 'Dish not found.');
  return hydrateDish(dish, store);
}

export async function getDishReviews(dishId: string): Promise<Review[]> {
  await latency();
  const store = readStore();
  return [...store.reviews, ...SEED_REVIEWS]
    .filter((r) => r.dishId === dishId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ── Orders ────────────────────────────────────────────────────────── */

export interface CreateOrderInput {
  session: DiningSession;
  lines: CartLine[];
  idempotencyKey: string;
}

export async function createOrder({ session, lines, idempotencyKey }: CreateOrderInput): Promise<Order> {
  await latency();
  const store = readStore();

  // Retrying a submission must never create a second order.
  const seen = store.idempotency[idempotencyKey];
  if (seen) {
    const prior = store.orders.find((o) => o.id === seen);
    if (prior) return prior;
  }

  if (lines.length === 0) throw new ApiError(400, 'Your cart is empty.');

  // Prices and availability are read from the server's own menu, never the client's.
  const restaurant = restaurantOf(store);
  const table = tablesOf(store).find((t) => t.id === session.tableId);
  const menu = menuOf(store);

  const items: OrderItem[] = lines.map((line) => {
    const dish = menu.dishes.find((d) => d.id === line.dishId);
    if (!dish || dish.isArchived) throw new ApiError(400, 'One of those dishes is no longer on the menu.');
    if (!dish.isAvailable) throw new ApiError(409, `${dish.name} just went off the menu.`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 30)
      throw new ApiError(400, 'Invalid quantity.');
    return {
      id: uid('itm'),
      dishId: dish.id,
      dishNameSnapshot: dish.name,
      imageUrlSnapshot: dish.imageUrl,
      unitPrice: dish.price,
      quantity: line.quantity,
      notes: line.note.slice(0, 140),
    };
  });

  const subtotal = sumLines(items);
  const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
  const now = new Date().toISOString();
  const { store: numbered, reference } = takeReference(store);

  const order: Order = {
    id: uid('ord'),
    reference,
    restaurantId: session.restaurantId,
    tableId: session.tableId,
    tableName: table?.name ?? 'Table',
    sessionId: session.id,
    status: 'PENDING',
    items,
    subtotal,
    serviceCharge,
    tax,
    discount: 0,
    total: subtotal + serviceCharge + tax,
    currency: restaurant.currency,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    reviewedDishIds: [],
  };

  writeStore({
    ...numbered,
    orders: [...numbered.orders, order],
    idempotency: { ...numbered.idempotency, [idempotencyKey]: order.id },
  });
  return order;
}

export async function getOrder(orderId: string): Promise<Order> {
  await latency();
  const store = persistProjection(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'Order not found.');
  return order;
}

export async function getSessionOrders(sessionId: string): Promise<Order[]> {
  const store = persistProjection(readStore());
  return store.orders
    .filter((o) => o.sessionId === sessionId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function cancelOrder(orderId: string): Promise<Order> {
  await latency();
  const store = persistProjection(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'Order not found.');
  if (statusIndex(order.status) > statusIndex('PENDING'))
    throw new ApiError(409, 'The kitchen has already started this order.');
  const cancelled: Order = { ...order, status: 'CANCELLED', updatedAt: new Date().toISOString() };
  writeStore({ ...store, orders: store.orders.map((o) => (o.id === orderId ? cancelled : o)) });
  return cancelled;
}

/* ── Reviews ───────────────────────────────────────────────────────── */

export interface ReviewDraft {
  dishId: string;
  overall: number;
  taste: number;
  portion: number;
  value: number;
  wouldOrderAgain: boolean;
  comment: string;
  tags: string[];
}

/** Mirrors the server rule: a review requires an eligible completed purchase. */
export function reviewEligibility(order: Order, dishId: string): { ok: boolean; reason?: string } {
  if (order.status !== 'COMPLETED') return { ok: false, reason: 'You can rate dishes once the order is completed.' };
  if (!order.items.some((i) => i.dishId === dishId)) return { ok: false, reason: 'That dish was not in this order.' };
  if (order.reviewedDishIds.includes(dishId)) return { ok: false, reason: 'You have already rated this dish.' };
  return { ok: true };
}

export async function submitReviews(orderId: string, drafts: ReviewDraft[]): Promise<Order> {
  await latency();
  const store = persistProjection(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'Order not found.');

  const accepted: Review[] = [];
  for (const draft of drafts) {
    const { ok, reason } = reviewEligibility(order, draft.dishId);
    if (!ok) throw new ApiError(403, reason ?? 'Not eligible to review.');
    if (draft.overall < 1 || draft.overall > 5) throw new ApiError(400, 'Rating must be between 1 and 5.');
    accepted.push({
      id: uid('rvw'),
      dishId: draft.dishId,
      orderId,
      overall: draft.overall,
      taste: draft.taste || draft.overall,
      portion: draft.portion || draft.overall,
      value: draft.value || draft.overall,
      wouldOrderAgain: draft.wouldOrderAgain,
      comment: draft.comment.trim().slice(0, 500),
      tags: draft.tags.slice(0, 6),
      createdAt: new Date().toISOString(),
      verified: true,
    });
  }

  const updated: Order = {
    ...order,
    reviewedDishIds: [...order.reviewedDishIds, ...accepted.map((r) => r.dishId)],
    updatedAt: new Date().toISOString(),
  };

  writeStore({
    ...store,
    orders: store.orders.map((o) => (o.id === orderId ? updated : o)),
    reviews: [...accepted, ...store.reviews],
  });
  return updated;
}

/** Clears every namespaced key: orders, reviews, sessions, carts and analytics. */
export function resetDemoData(): void {
  const doomed = Object.keys(localStorage).filter((k) => k.startsWith('myfood.'));
  for (const key of doomed) localStorage.removeItem(key);
}

/**
 * Where the demo QR points. Prefers the table the printed card in the README
 * refers to, and falls back to whichever table is seating if a manager has
 * since disabled it.
 */
export function demoEntry(): { slug: string; tableToken: string } {
  const store = readStore();
  const tables = tablesOf(store);
  const table = tables.find((t) => t.id === DEMO_TABLE_ID && t.isActive) ?? tables.find((t) => t.isActive) ?? tables[0];
  return { slug: restaurantOf(store).slug, tableToken: table.qrToken };
}
