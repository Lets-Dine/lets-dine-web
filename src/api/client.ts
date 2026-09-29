import { TABLE } from '../data/menu';
import { SEED_REVIEWS } from '../data/reviews';
import { ACCEPT_DELAY_SECONDS, ITEM_TIMELINE_SECONDS } from '../domain/config';
import { percentOf, recomputeTotals, sumLines } from '../domain/money';
import { canCancelItem, deriveOrderStatusForType, reviewEligibility, statusIndex } from '../domain/orderStatus';
import type {
  CartLine,
  Customer,
  DiningSession,
  DiningTable,
  Dish,
  DishStats,
  DishVariant,
  ItemStatus,
  Menu,
  Order,
  OrderItem,
  Payment,
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
   poll `GET /orders/:id` and get the same shape back. Acceptance is still
   one whole-order timer; once accepted, each item advances on its own
   staggered timer so a multi-item order shows genuine partial progress. */

const ITEM_STATUS_ORDER: ItemStatus[] = ['PENDING', 'PREPARING', 'READY', 'SERVED'];

function itemStatusIndex(status: ItemStatus): number {
  return ITEM_STATUS_ORDER.indexOf(status);
}

/** So the second dish doesn't pop the instant the first one does. */
const ITEM_STAGGER_SECONDS = 4;

function projectItemStatuses(order: Order): Order {
  if (order.cancelledAt) return order;

  let acceptedAt = order.acceptedAt;
  if (!acceptedAt) {
    const sinceCreated = (Date.now() - new Date(order.createdAt).getTime()) / 1000;
    if (sinceCreated < ACCEPT_DELAY_SECONDS) return order;
    acceptedAt = new Date(new Date(order.createdAt).getTime() + ACCEPT_DELAY_SECONDS * 1000).toISOString();
  }

  const now = new Date().toISOString();
  let changed = acceptedAt !== order.acceptedAt;
  const acceptedMs = new Date(acceptedAt).getTime();
  const items = order.items.map((item, index) => {
    if (item.status === 'CANCELLED' || item.status === 'SERVED') return item;
    const elapsed = (Date.now() - acceptedMs) / 1000 - index * ITEM_STAGGER_SECONDS;
    let next: ItemStatus = 'PENDING';
    for (const key of ITEM_STATUS_ORDER.slice(1)) {
      const at = ITEM_TIMELINE_SECONDS[key as keyof typeof ITEM_TIMELINE_SECONDS];
      if (elapsed >= at) next = key;
    }
    if (itemStatusIndex(next) <= itemStatusIndex(item.status)) return item;
    changed = true;
    return { ...item, status: next, statusUpdatedAt: now };
  });

  if (!changed) return order;
  const status = deriveOrderStatusForType({ acceptedAt, cancelledAt: order.cancelledAt, items }, order.orderType);
  return {
    ...order,
    acceptedAt,
    items,
    status,
    updatedAt: now,
    completedAt: status === 'COMPLETED' ? now : order.completedAt,
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
    const next = projectItemStatuses(o);
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
    customerId: null,
    anonymousSessionToken: newSessionToken(),
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    endedAt: null,
  };

  writeStore({ ...store, sessions: { ...store.sessions, [key]: session } });
  localStorage.setItem(localKey, session.anonymousSessionToken);
  return { restaurant, table, session };
}

export interface StartDeliverySessionInput {
  restaurantSlug: string;
  phone: string;
  name?: string;
  address?: string;
  note?: string;
}

export interface DeliverySessionResult {
  table: null;
  session: DiningSession;
  customer: Customer;
}

/**
 * The delivery equivalent of `resolveQr` — no table, no QR, just a phone
 * number. `Customer` is upserted by `(restaurantId, phone)` exactly like the
 * real backend, so a repeat number comes back with its saved name/address.
 */
export async function startDeliverySession({
  restaurantSlug,
  phone,
  name,
  address,
  note,
}: StartDeliverySessionInput): Promise<DeliverySessionResult> {
  await latency();
  const store = readStore();
  const restaurant = restaurantOf(store);
  if (restaurantSlug !== restaurant.slug) throw new ApiError(404, 'That restaurant does not exist.');

  const cleanPhone = phone.trim();
  if (!cleanPhone) throw new ApiError(400, 'Enter a phone number.');

  const existing = store.customers.find((c) => c.restaurantId === restaurant.id && c.phone === cleanPhone);
  const customer: Customer = existing
    ? {
        ...existing,
        name: name?.trim() || existing.name,
        defaultAddress: address?.trim() || existing.defaultAddress,
        defaultNote: note?.trim() || existing.defaultNote,
      }
    : {
        id: uid('cus'),
        restaurantId: restaurant.id,
        phone: cleanPhone,
        name: name?.trim() || 'Guest',
        defaultAddress: address?.trim() || null,
        defaultNote: note?.trim() || null,
      };
  const customers = existing ? store.customers.map((c) => (c === existing ? customer : c)) : [...store.customers, customer];

  const session: DiningSession = {
    id: uid('ses'),
    restaurantId: restaurant.id,
    tableId: null,
    customerId: customer.id,
    anonymousSessionToken: newSessionToken(),
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    endedAt: null,
  };

  writeStore({
    ...store,
    customers,
    sessions: { ...store.sessions, [`${restaurant.id}:delivery:${cleanPhone}`]: session },
  });
  localStorage.setItem(deliverySessionLocalKey(restaurantSlug), session.id);
  return { table: null, session, customer };
}

const deliverySessionLocalKey = (slug: string) => `myfood.mock-session.delivery.${slug}`;

/**
 * A page reload has no phone number to re-key on, only whatever session id
 * this browser already stored — mirrors `live.resumeDeliverySession`'s
 * localStorage-token resume, so the two transports behave the same way.
 */
export async function resumeDeliverySession(restaurantSlug: string): Promise<DeliverySessionResult | null> {
  const store = readStore();
  const restaurant = restaurantOf(store);
  if (restaurantSlug !== restaurant.slug) return null;
  const sessionId = localStorage.getItem(deliverySessionLocalKey(restaurantSlug));
  if (!sessionId) return null;
  const session = Object.values(store.sessions).find((s) => s.id === sessionId);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
  const customer = store.customers.find((c) => c.id === session.customerId);
  if (!customer) return null;
  return { table: null, session, customer };
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
  const { categories, dishes, addOns } = menuOf(store);
  return {
    restaurant,
    categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    // An archived dish keeps its order history but leaves the menu entirely.
    dishes: dishes.filter((d) => !d.isArchived).map((d) => hydrateDish(d, store)),
    addOns: addOns.filter((a) => !a.isArchived),
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

/**
 * Read-only: does this table still hold the very session we're carrying —
 * not ended by staff, not replaced by the next party, not simply expired?
 * Side-effect-free, so it is safe to poll (`RestaurantLayout.tsx` does,
 * standing in for the live transport's socket push). Mirrors what the real
 * backend's `DinerSessionGuard` checks on every diner request.
 */
export async function isSessionOpen(session: DiningSession): Promise<boolean> {
  const store = readStore();
  // Looked up by id rather than a reconstructed key: a dine-in session lives under
  // `${restaurantId}:${tableId}`, a delivery one under `${restaurantId}:delivery:${phone}`.
  const current = Object.values(store.sessions).find((s) => s.id === session.id);
  return Boolean(current && Date.parse(current.expiresAt) > Date.now());
}

export interface CreateOrderInput {
  session: DiningSession;
  lines: CartLine[];
  idempotencyKey: string;
  /** Delivery only — editable per order, prefilled from the customer's saved defaults. */
  deliveryAddress?: string;
  deliveryNote?: string;
}

export async function createOrder({ session, lines, idempotencyKey, deliveryAddress, deliveryNote }: CreateOrderInput): Promise<Order> {
  await latency();
  const store = readStore();

  // Retrying a submission must never create a second order.
  const seen = store.idempotency[idempotencyKey];
  if (seen) {
    const prior = store.orders.find((o) => o.id === seen);
    if (prior) return prior;
  }

  if (lines.length === 0) throw new ApiError(400, 'Your cart is empty.');

  // Mirrors the live backend's `DinerSessionGuard`: a table staff has
  // closed out (or a session that has simply expired) cannot order again.
  if (!(await isSessionOpen(session))) {
    throw new ApiError(401, 'This table has been closed out. Ask a server if you would like to order more.');
  }

  // Prices and availability are read from the server's own menu, never the client's.
  const restaurant = restaurantOf(store);
  const isDelivery = session.tableId === null;
  const table = session.tableId ? tablesOf(store).find((t) => t.id === session.tableId) : null;
  const customer = isDelivery ? store.customers.find((c) => c.id === session.customerId) : undefined;
  const menu = menuOf(store);

  const addOnById = new Map(menu.addOns.map((a) => [a.id, a]));
  const now = new Date().toISOString();
  const items: OrderItem[] = lines.map((line) => {
    const dish = menu.dishes.find((d) => d.id === line.dishId);
    if (!dish || dish.isArchived) throw new ApiError(400, 'One of those dishes is no longer on the menu.');
    if (!dish.isAvailable) throw new ApiError(409, `${dish.name} just went off the menu.`);
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 30)
      throw new ApiError(400, 'Invalid quantity.');

    // Add-ons, like the dish itself, are re-resolved and re-priced here — a
    // client-sent price or an add-on id that isn't actually linked to this
    // dish is never trusted.
    const addOns = (line.addOnIds ?? []).map((addOnId) => {
      const addOn = addOnById.get(addOnId);
      if (!addOn || !dish.addOnIds.includes(addOnId) || addOn.isArchived || !addOn.isAvailable)
        throw new ApiError(400, `One of the add-ons for ${dish.name} is no longer available.`);
      return { addOnId: addOn.id, nameSnapshot: addOn.name, price: addOn.price };
    });

    // The chosen variant is re-resolved and re-priced here too, same rule as
    // the dish and its add-ons — never trust a client-sent price or name.
    const activeVariants = dish.variants.filter((v) => !v.isArchived);
    let variant: DishVariant | null = null;
    if (line.variantId) {
      variant = activeVariants.find((v) => v.id === line.variantId && v.isAvailable) ?? null;
      if (!variant) throw new ApiError(400, `The selected option for ${dish.name} is no longer available.`);
    } else if (activeVariants.length > 0) {
      throw new ApiError(400, `Choose an option for ${dish.name}.`);
    }

    return {
      id: uid('itm'),
      dishId: dish.id,
      dishNameSnapshot: dish.name,
      imageUrlSnapshot: dish.imageUrl,
      unitPrice: (variant ? variant.price : dish.price) + addOns.reduce((sum, a) => sum + a.price, 0),
      quantity: line.quantity,
      notes: line.note.slice(0, 140),
      status: 'PENDING',
      statusUpdatedAt: now,
      addOns,
      variantId: variant?.id ?? null,
      variantNameSnapshot: variant?.name ?? null,
      variantPriceSnapshot: variant?.price ?? null,
    };
  });

  const subtotal = sumLines(items);
  const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
  const deliveryFee = isDelivery ? (restaurant.deliveryFeeAmount ?? 0) : 0;
  const { store: numbered, reference } = takeReference(store);

  const order: Order = {
    id: uid('ord'),
    reference,
    restaurantId: session.restaurantId,
    orderType: isDelivery ? 'DELIVERY' : 'DINE_IN',
    tableId: session.tableId,
    tableName: table?.name ?? null,
    sessionId: session.id,
    customerId: isDelivery ? session.customerId : null,
    status: 'PENDING',
    acceptedAt: null,
    cancelledAt: null,
    items,
    subtotal,
    serviceCharge,
    tax,
    deliveryFee,
    discount: 0,
    total: subtotal + serviceCharge + tax + deliveryFee,
    currency: restaurant.currency,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    reviewedDishIds: [],
    deliveryAddress: isDelivery ? deliveryAddress?.trim() || customer?.defaultAddress || null : null,
    deliveryPhone: isDelivery ? (customer?.phone ?? null) : null,
    deliveryCustomerName: isDelivery ? (customer?.name ?? null) : null,
    deliveryNote: isDelivery ? deliveryNote?.trim() || null : null,
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

/** Once staff settle the table, this is the receipt — `null` while nothing has been charged yet. */
export async function getSessionPayment(sessionId: string): Promise<Payment | null> {
  const store = readStore();
  return (
    store.payments
      .filter((p) => p.sessionId === sessionId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
  );
}

export async function cancelOrder(orderId: string): Promise<Order> {
  await latency();
  const store = persistProjection(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'Order not found.');
  if (statusIndex(order.status) > statusIndex('PENDING'))
    throw new ApiError(409, 'The kitchen has already started this order.');
  const now = new Date().toISOString();
  const cancelled: Order = { ...order, status: 'CANCELLED', cancelledAt: now, updatedAt: now };
  writeStore({ ...store, orders: store.orders.map((o) => (o.id === orderId ? cancelled : o)) });
  return cancelled;
}

/** The diner cancelling a single dish, before the kitchen has started it — the rest of the order is untouched. */
export async function cancelOrderItem(orderId: string, itemId: string): Promise<Order> {
  await latency();
  const store = persistProjection(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'Order not found.');
  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw new ApiError(404, 'That item is no longer on this order.');
  if (!canCancelItem(item)) throw new ApiError(409, 'The kitchen has already started this item.');

  const now = new Date().toISOString();
  const items = order.items.map((i) => (i.id === itemId ? { ...i, status: 'CANCELLED' as const, statusUpdatedAt: now } : i));
  const next = { ...order, items, updatedAt: now };
  next.status = deriveOrderStatusForType(next, order.orderType);
  const cancelled = recomputeTotals(next, restaurantOf(store));
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

/** The single home for this rule is `domain/orderStatus.ts` — shared with the UI and mirrored server-side. */
export { reviewEligibility };

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
