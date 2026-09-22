import { HISTORY_REF_CEILING, orderHistory } from '../data/history';
import { CATEGORIES, DISHES } from '../data/menu';
import { SEED_REVIEWS } from '../data/reviews';
import { DEMO_PIN, STAFF } from '../data/staff';
import { formatMoney, percentOf, recomputeTotals, sumLines } from '../domain/money';
import {
  ITEM_STATUS_LABEL,
  STATUS_LABEL,
  billableItems,
  canCancelOrder,
  deriveOrderStatus,
  nextItemStatus,
} from '../domain/orderStatus';
import { ROLE_LABEL, can } from '../domain/permissions';
import type { Permission } from '../domain/permissions';
import type {
  AuditAction,
  AuditEntry,
  DiningTable,
  Dish,
  ItemStatus,
  Menu,
  MenuCategory,
  Minor,
  Order,
  OrderItem,
  OrderStatus,
  Restaurant,
  Review,
  StaffMember,
} from '../domain/types';
import type { Store } from './store';
import {
  ApiError,
  latency,
  menuOf,
  newQrToken,
  readStore,
  restaurantOf,
  tablesOf,
  uid,
  withEditableMenu,
  withEditableTables,
  writeStore,
} from './store';

/**
 * The restaurant half of `/api/v1/...`.
 *
 * It writes to the same store the diner client reads, which is the whole
 * point: taking a dish off the menu here has to stop an order there. Every
 * mutation checks the actor's role (§50) and leaves an audit entry (§51),
 * because those are server responsibilities and this file is the server.
 */

/* ── Authorisation ─────────────────────────────────────────────────── */

function authorize(actor: StaffMember, permission: Permission): void {
  if (!can(actor.role, permission))
    throw new ApiError(403, `A ${ROLE_LABEL[actor.role].toLowerCase()} account cannot do that.`);
}

export async function signIn(email: string, pin: string): Promise<StaffMember> {
  await latency();
  const member = STAFF.find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
  if (!member || pin.trim() !== DEMO_PIN) throw new ApiError(401, 'That email and PIN do not match an account.');
  return member;
}

export function staffDirectory(): StaffMember[] {
  return STAFF;
}

/* ── Audit trail ───────────────────────────────────────────────────── */

const AUDIT_LIMIT = 400;

function record(
  store: Store,
  actor: StaffMember,
  action: AuditAction,
  subject: string,
  detail: string,
): Store {
  const entry: AuditEntry = {
    id: uid('aud'),
    restaurantId: actor.restaurantId,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    subject,
    detail,
    at: new Date().toISOString(),
  };
  return { ...store, audit: [entry, ...store.audit].slice(0, AUDIT_LIMIT) };
}

export async function listAudit(actor: StaffMember, limit = 80): Promise<AuditEntry[]> {
  authorize(actor, 'audit:view');
  return readStore().audit.slice(0, limit);
}

/* ── The live queue ────────────────────────────────────────────────── */

/**
 * A shift already in progress, so the queue is not an empty page on first
 * open. Seeded once and then persisted, because staff have to be able to move
 * these tickets — a re-generated ticket would forget it had been accepted.
 */
/**
 * What each seeded item's status should be for a given seeded order-level
 * status, so a shift ticket reads correctly on first paint even before
 * `deriveOrderStatus` re-derives it. PREPARING and READY seed a partially-
 * through ticket rather than a uniform one, to show off per-item progress
 * from the moment the demo loads.
 */
function seedItemStatus(orderStatus: OrderStatus, index: number, count: number): ItemStatus {
  switch (orderStatus) {
    case 'PREPARING':
      return index === 0 ? 'PREPARING' : 'PENDING';
    case 'READY':
      return index === count - 1 && count > 1 ? 'READY' : 'SERVED';
    case 'COMPLETED':
      return 'SERVED';
    default:
      return 'PENDING';
  }
}

function seedQueue(store: Store): Store {
  if (store.seededQueue) return store;

  const now = Date.now();
  const restaurant = restaurantOf(store);
  const tables = tablesOf(store).filter((t) => t.isActive);
  const menu = menuOf(store).dishes.filter((d) => !d.isArchived && d.isAvailable);
  const popular = [...menu].sort((a, b) => b.stats.orders30d - a.stats.orders30d);

  // [minutes ago, status, table index, dish indices]
  const shift: [number, OrderStatus, number, number[]][] = [
    [82, 'COMPLETED', 3, [0, 5, 11]],
    [64, 'CANCELLED', 7, [2, 9]],
    [41, 'COMPLETED', 1, [1, 4]],
    [26, 'READY', 6, [0, 3, 8]],
    [19, 'PREPARING', 9, [2, 7, 12, 1]],
    [13, 'PREPARING', 2, [5]],
    [8, 'ACCEPTED', 10, [1, 6, 0]],
    [4, 'PENDING', 4, [3, 2]],
    [1, 'PENDING', 12, [0, 1, 10, 4]],
  ];

  let ref = Math.max(store.nextRef, HISTORY_REF_CEILING);
  const orders: Order[] = shift.map(([minutesAgo, status, tableIndex, dishIndices], i) => {
    const table = tables[tableIndex % tables.length];
    const placed = new Date(now - minutesAgo * 60_000);
    const items: OrderItem[] = dishIndices.map((dishIndex, line) => {
      const dish = popular[dishIndex % popular.length];
      return {
        id: `itm_seed${i}_${line}`,
        dishId: dish.id,
        dishNameSnapshot: dish.name,
        imageUrlSnapshot: dish.imageUrl,
        unitPrice: dish.price,
        quantity: line === 0 && dishIndices.length > 2 ? 2 : 1,
        notes: line === 1 && i % 3 === 0 ? 'No onion please' : '',
        status: seedItemStatus(status, line, dishIndices.length),
        statusUpdatedAt: placed.toISOString(),
      };
    });

    const acceptedAt = status === 'PENDING' ? null : placed.toISOString();
    const cancelledAt = status === 'CANCELLED' ? new Date(placed.getTime() + 3 * 60_000).toISOString() : null;
    const subtotal = sumLines(billableItems(items));
    const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
    const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
    const derived = deriveOrderStatus({ acceptedAt, cancelledAt, items });

    return {
      id: `ord_seed${i}`,
      reference: `#${++ref}`,
      restaurantId: restaurant.id,
      tableId: table.id,
      tableName: table.name,
      // Not one of this browser's dining sessions, so the demo kitchen leaves
      // these alone — they move when staff move them.
      sessionId: `ses_floor${i}`,
      status: derived,
      acceptedAt,
      cancelledAt,
      items,
      subtotal,
      serviceCharge,
      tax,
      discount: 0,
      total: subtotal + serviceCharge + tax,
      currency: restaurant.currency,
      createdAt: placed.toISOString(),
      updatedAt: placed.toISOString(),
      completedAt: derived === 'COMPLETED' ? new Date(placed.getTime() + 22 * 60_000).toISOString() : null,
      reviewedDishIds: [],
    };
  });

  const next: Store = { ...store, orders: [...store.orders, ...orders], nextRef: ref, seededQueue: true };
  writeStore(next);
  return next;
}

/** Store orders only — the tickets staff can still act on. */
export async function listQueue(actor: StaffMember): Promise<Order[]> {
  authorize(actor, 'orders:view');
  const store = seedQueue(readStore());
  return [...store.orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Every order a table's current visit has placed, settled or not — what the payment sheet bills against. */
export async function fetchOrdersBySession(actor: StaffMember, sessionId: string): Promise<Order[]> {
  authorize(actor, 'orders:view');
  const store = seedQueue(readStore());
  return store.orders.filter((o) => o.sessionId === sessionId).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** Queue plus the ninety days behind it, for reporting rather than working. */
export async function allOrders(actor: StaffMember): Promise<Order[]> {
  authorize(actor, 'orders:view');
  const store = seedQueue(readStore());
  return [...orderHistory(), ...store.orders];
}

/** The one remaining whole-order transition: accept. Everything after that follows the items. */
export async function acceptOrder(actor: StaffMember, orderId: string, expected: 'PENDING'): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');

  // Two tablets on the same pass will both press Accept. The second one loses.
  if (order.status !== expected)
    throw new ApiError(409, `${order.reference} already moved to ${STATUS_LABEL[order.status].toLowerCase()}.`);

  const now = new Date().toISOString();
  const acceptedAt = now;
  const updated: Order = {
    ...order,
    status: deriveOrderStatus({ acceptedAt, cancelledAt: order.cancelledAt, items: order.items }),
    acceptedAt,
    updatedAt: now,
  };

  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)) },
      actor,
      'order_status_changed',
      `Order ${order.reference}`,
      `${STATUS_LABEL[order.status]} → ${STATUS_LABEL[updated.status]}`,
    ),
  );
  return updated;
}

/** Advances one item's own progress through the kitchen, independent of its siblings. */
export async function advanceOrderItem(
  actor: StaffMember,
  orderId: string,
  itemId: string,
  expected: ItemStatus,
): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');
  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw new ApiError(404, 'That item is no longer on this order.');

  // Two tablets on the same pass will both press the same button. The second one loses.
  if (item.status !== expected)
    throw new ApiError(409, `${item.dishNameSnapshot} already moved to ${ITEM_STATUS_LABEL[item.status].toLowerCase()}.`);

  const to = nextItemStatus(item.status);
  if (!to) throw new ApiError(409, `${item.dishNameSnapshot} is already finished.`);

  const now = new Date().toISOString();
  const items = order.items.map((i) => (i.id === itemId ? { ...i, status: to, statusUpdatedAt: now } : i));
  const updated: Order = {
    ...order,
    items,
    status: deriveOrderStatus({ acceptedAt: order.acceptedAt, cancelledAt: order.cancelledAt, items }),
    updatedAt: now,
    completedAt:
      deriveOrderStatus({ acceptedAt: order.acceptedAt, cancelledAt: order.cancelledAt, items }) === 'COMPLETED'
        ? now
        : order.completedAt,
  };

  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)) },
      actor,
      'order_status_changed',
      `Order ${order.reference}`,
      `${item.dishNameSnapshot} — ${ITEM_STATUS_LABEL[item.status]} → ${ITEM_STATUS_LABEL[to]}`,
    ),
  );
  return updated;
}

export async function rejectOrder(actor: StaffMember, orderId: string, reason: string): Promise<Order> {
  authorize(actor, 'orders:cancel');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');
  if (!canCancelOrder(order)) throw new ApiError(409, 'That order has already left the kitchen.');

  const now = new Date().toISOString();
  const updated: Order = { ...order, status: 'CANCELLED', cancelledAt: now, updatedAt: now };
  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)) },
      actor,
      'order_cancelled',
      `Order ${order.reference}`,
      reason.trim() ? `Cancelled — ${reason.trim()}` : 'Cancelled',
    ),
  );
  return updated;
}

/** A table is "in use" while any of its orders are still open. */
const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];

export function isTableOpen(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/**
 * The till: close every open order on a table in one motion once the guest
 * has paid. There is no separate ledger — an order's status *is* its
 * payment state — so settling is just fast-forwarding the whole table to
 * `COMPLETED` at once, the way a single order would get there ticket by
 * ticket.
 */
export async function settleTable(actor: StaffMember, tableId: string): Promise<Order[]> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const table = tablesOf(store).find((t) => t.id === tableId);
  if (!table) throw new ApiError(404, 'That table no longer exists.');

  const open = store.orders.filter((o) => o.tableId === tableId && isTableOpen(o.status));
  if (open.length === 0) throw new ApiError(409, `${table.name} has no open orders to settle.`);

  const now = new Date().toISOString();
  const openIds = new Set(open.map((o) => o.id));
  const settled = store.orders.map((o) => (openIds.has(o.id) ? forceCompleteOrder(o, now) : o));
  const total = open.reduce((sum, o) => sum + o.total, 0);
  const currency = restaurantOf(store).currency;

  writeStore(
    record(
      { ...store, orders: settled },
      actor,
      'table_settled',
      table.name,
      `${open.length} order${open.length === 1 ? '' : 's'} settled — ${formatMoney(total, currency)}`,
    ),
  );
  return settled.filter((o) => o.tableId === tableId);
}

/**
 * The real till: snapshots what's still open into a completed charge and
 * closes those orders out, mirroring the shape of the live API's payment
 * record even though this mock has nowhere to persist the record itself.
 * Ending the session in the same motion also cancels anything left on it
 * that never made it into this charge, rather than orphaning it.
 */
/**
 * The till. Identified by the session being paid off, not the table — all
 * that's checked up front is that the session still exists. Which dishes and
 * how many is the cashier's call (read off the bill after any corrections),
 * so it comes from the request rather than being re-derived from whatever
 * the underlying orders currently say; prices still always come from the
 * menu, never the client. Ending the visit in the same motion marks every
 * order still open on the session completed, whether or not it matched a
 * line on this particular charge.
 */
export async function completePayment(
  actor: StaffMember,
  sessionId: string,
  items: { dishId: string; quantity: number }[],
  endSession: boolean,
): Promise<void> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const session = Object.values(store.sessions).find((s) => s.id === sessionId);
  if (!session) throw new ApiError(404, 'This dining session no longer exists.');
  if (items.length === 0) throw new ApiError(400, 'Add at least one item to charge for.');

  const dishes = menuOf(store).dishes;
  const restaurant = restaurantOf(store);
  const lines = items.map(({ dishId, quantity }) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) throw new ApiError(404, 'One of these dishes is no longer on the menu.');
    return { unitPrice: dish.price, quantity };
  });
  const subtotal = sumLines(lines);
  const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
  const total = subtotal + serviceCharge + tax;

  let next = record(
    store,
    actor,
    'payment_completed',
    `Session ${sessionId}`,
    `Charged ${formatMoney(total, restaurant.currency)}`,
  );

  if (endSession) {
    const now = new Date().toISOString();
    const orders = next.orders.map((o) =>
      o.sessionId === sessionId && isTableOpen(o.status) ? forceCompleteOrder(o, now) : o,
    );
    const sessions = { ...next.sessions };
    delete sessions[`${session.restaurantId}:${session.tableId}`];

    next = record({ ...next, orders, sessions }, actor, 'table_session_ended', `Session ${sessionId}`, 'Session ended');
  }

  writeStore(next);
}

/**
 * Settling/payment force a table's orders closed regardless of kitchen
 * progress — "completed" there means paid, not cooked. Every live item is
 * marked served (rather than leaving `status` inconsistent with its items)
 * so `deriveOrderStatus` still lands on COMPLETED afterward.
 */
function forceCompleteOrder(order: Order, now: string): Order {
  const acceptedAt = order.acceptedAt ?? now;
  const items = order.items.map((i) => (i.status === 'CANCELLED' ? i : { ...i, status: 'SERVED' as ItemStatus, statusUpdatedAt: now }));
  return {
    ...order,
    acceptedAt,
    items,
    status: deriveOrderStatus({ acceptedAt, cancelledAt: order.cancelledAt, items }),
    updatedAt: now,
    completedAt: now,
  };
}

/**
 * Staff can still adjust a tab from the payment sheet — a guest asked for one
 * more plate, or a mistake needs correcting after the bill was already taken.
 * It always lands on the table's most recent order, whatever that order's
 * status.
 */
export async function addOrderItem(actor: StaffMember, tableId: string, dishId: string): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const table = tablesOf(store).find((t) => t.id === tableId);
  if (!table) throw new ApiError(404, 'That table no longer exists.');

  const order = store.orders
    .filter((o) => o.tableId === tableId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!order) throw new ApiError(409, `${table.name} has no order to add to.`);

  const dish = menuOf(store).dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is no longer on the menu.');

  const now = new Date().toISOString();
  // Merging into an already-started line would silently mark the new unit as
  // already cooked, so a second helping only merges while the existing line
  // is still untouched — otherwise it's a fresh line, its own ticket.
  const existing = order.items.find((i) => i.dishId === dishId && i.status === 'PENDING');
  const items: OrderItem[] = existing
    ? order.items.map((i) => (i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i))
    : [
        ...order.items,
        {
          id: uid('itm'),
          dishId: dish.id,
          dishNameSnapshot: dish.name,
          imageUrlSnapshot: dish.imageUrl,
          unitPrice: dish.price,
          quantity: 1,
          notes: '',
          status: 'PENDING',
          statusUpdatedAt: now,
        },
      ];

  const next = { ...order, items, updatedAt: now };
  next.status = deriveOrderStatus(next);
  const updated = recomputeTotals(next, restaurantOf(store));
  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === order.id ? updated : o)) },
      actor,
      'order_item_added' as AuditAction,
      `Order ${order.reference}`,
      `+1 ${dish.name}`,
    ),
  );
  return updated;
}

/** Drops a line entirely, or takes one off — whichever the quantity allows. Works on any order, settled or not. */
export async function removeOrderItem(actor: StaffMember, orderId: string, itemId: string): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');

  const item = order.items.find((i) => i.id === itemId);
  if (!item) throw new ApiError(404, 'That item is no longer on the bill.');

  const items =
    item.quantity > 1
      ? order.items.map((i) => (i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i))
      : order.items.filter((i) => i.id !== itemId);

  const next = { ...order, items, updatedAt: new Date().toISOString() };
  next.status = deriveOrderStatus(next);
  const updated = recomputeTotals(next, restaurantOf(store));
  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)) },
      actor,
      'order_item_removed' as AuditAction,
      `Order ${order.reference}`,
      `-1 ${item.dishNameSnapshot}`,
    ),
  );
  return updated;
}

/* ── Menu ──────────────────────────────────────────────────────────── */

/** Unlike the diner's menu, this one includes archived dishes. */
export async function adminMenu(actor: StaffMember): Promise<Menu> {
  authorize(actor, 'menu:view');
  const store = readStore();
  const { categories, dishes } = menuOf(store);
  return {
    restaurant: restaurantOf(store),
    categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    dishes: [...dishes].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export interface DishDraft {
  name: string;
  description: string;
  categoryId: string;
  price: Minor;
  imageUrl: string | null;
  isVeg: boolean;
  spiceLevel: 0 | 1 | 2 | 3;
  isAvailable: boolean;
  isFeatured: boolean;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function validateDraft(draft: DishDraft, categories: MenuCategory[]): void {
  if (draft.name.trim().length < 2) throw new ApiError(400, 'A dish needs a name.');
  if (!Number.isInteger(draft.price) || draft.price < 0) throw new ApiError(400, 'Price must be a whole amount.');
  if (draft.price > 10_000_00) throw new ApiError(400, 'That price looks like a typo.');
  if (!categories.some((c) => c.id === draft.categoryId)) throw new ApiError(400, 'Pick a category for this dish.');
}

export async function createDish(actor: StaffMember, draft: DishDraft): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  validateDraft(draft, base.menu.categories);

  const restaurant = restaurantOf(base);
  const sortOrder = Math.max(-1, ...base.menu.dishes.map((d) => d.sortOrder)) + 1;
  const dish: Dish = {
    id: uid('dsh'),
    restaurantId: restaurant.id,
    categoryId: draft.categoryId,
    name: draft.name.trim(),
    slug: slugify(draft.name),
    description: draft.description.trim(),
    imageUrl: draft.imageUrl,
    price: draft.price,
    currency: restaurant.currency,
    isAvailable: draft.isAvailable,
    isArchived: false,
    isFeatured: draft.isFeatured,
    sortOrder,
    spiceLevel: draft.spiceLevel,
    isVeg: draft.isVeg,
    stats: {
      ratingCount: 0,
      avgRating: null,
      taste: null,
      portion: null,
      value: null,
      recommendRate: null,
      distribution: [0, 0, 0, 0, 0],
      orders30d: 0,
      ordersPrev30d: 0,
      topTags: [],
    },
  };

  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: [...base.menu.dishes, dish] } },
      actor,
      'dish_created',
      dish.name,
      `Added to the menu at ${formatPrice(dish.price, restaurant)}`,
    ),
  );
  return dish;
}

function formatPrice(minor: Minor, restaurant: Restaurant): string {
  return `${restaurant.currency} ${(minor / 100).toFixed(2)}`;
}

export async function updateDish(actor: StaffMember, dishId: string, patch: Partial<DishDraft>): Promise<Dish> {
  authorize(actor, 'menu:edit');
  if (patch.price !== undefined) authorize(actor, 'menu:price');
  await latency();

  const base = withEditableMenu(readStore());
  const before = base.menu.dishes.find((d) => d.id === dishId);
  if (!before) throw new ApiError(404, 'That dish is not on the menu.');

  const draft: DishDraft = {
    name: patch.name ?? before.name,
    description: patch.description ?? before.description,
    categoryId: patch.categoryId ?? before.categoryId,
    price: patch.price ?? before.price,
    imageUrl: patch.imageUrl !== undefined ? patch.imageUrl : before.imageUrl,
    isVeg: patch.isVeg ?? before.isVeg,
    spiceLevel: patch.spiceLevel ?? before.spiceLevel,
    isAvailable: patch.isAvailable ?? before.isAvailable,
    isFeatured: patch.isFeatured ?? before.isFeatured,
  };
  validateDraft(draft, base.menu.categories);

  const after: Dish = {
    ...before,
    ...draft,
    name: draft.name.trim(),
    slug: slugify(draft.name),
    description: draft.description.trim(),
  };

  // Price and availability are logged on their own — those are the two changes
  // a restaurant is ever asked to explain.
  let store: Store = { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? after : d)) } };
  const restaurant = restaurantOf(store);

  if (after.price !== before.price)
    store = record(
      store,
      actor,
      'price_changed',
      after.name,
      `${formatPrice(before.price, restaurant)} → ${formatPrice(after.price, restaurant)}`,
    );
  if (after.isAvailable !== before.isAvailable)
    store = record(
      store,
      actor,
      'availability_changed',
      after.name,
      after.isAvailable ? 'Back on the menu' : 'Marked unavailable',
    );
  if (after.isFeatured !== before.isFeatured)
    store = record(store, actor, 'dish_featured', after.name, after.isFeatured ? 'Made a staff pick' : 'No longer a staff pick');

  const otherChange =
    after.name !== before.name ||
    after.description !== before.description ||
    after.categoryId !== before.categoryId ||
    after.imageUrl !== before.imageUrl ||
    after.isVeg !== before.isVeg ||
    after.spiceLevel !== before.spiceLevel;
  if (otherChange) store = record(store, actor, 'dish_updated', after.name, 'Details edited');

  writeStore(store);
  return after;
}

/** §28: a dish that has ever been ordered is archived, never deleted. */
export async function setDishArchived(actor: StaffMember, dishId: string, archived: boolean): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');

  const after: Dish = { ...dish, isArchived: archived };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? after : d)) } },
      actor,
      archived ? 'dish_archived' : 'dish_restored',
      dish.name,
      archived ? 'Archived — hidden from diners, kept in order history' : 'Restored to the menu',
    ),
  );
  return after;
}

/** Moves a dish one place within its own category. */
export async function moveDish(actor: StaffMember, dishId: string, direction: -1 | 1): Promise<void> {
  authorize(actor, 'menu:edit');
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');

  const siblings = base.menu.dishes
    .filter((d) => d.categoryId === dish.categoryId && !d.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((d) => d.id === dishId);
  const swapWith = siblings[index + direction];
  if (!swapWith) return;

  const dishes = base.menu.dishes.map((d) => {
    if (d.id === dish.id) return { ...d, sortOrder: swapWith.sortOrder };
    if (d.id === swapWith.id) return { ...d, sortOrder: dish.sortOrder };
    return d;
  });

  writeStore(
    record({ ...base, menu: { ...base.menu, dishes } }, actor, 'dish_reordered', dish.name, `Moved ${direction < 0 ? 'up' : 'down'}`),
  );
}

/* ── Categories ────────────────────────────────────────────────────── */

export async function createCategory(actor: StaffMember, name: string, emoji: string): Promise<MenuCategory> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  if (name.trim().length < 2) throw new ApiError(400, 'A category needs a name.');

  const category: MenuCategory = {
    id: uid('cat'),
    restaurantId: actor.restaurantId,
    name: name.trim(),
    emoji: emoji.trim() || '🍽️',
    sortOrder: Math.max(0, ...base.menu.categories.map((c) => c.sortOrder)) + 1,
  };

  writeStore(
    record(
      { ...base, menu: { ...base.menu, categories: [...base.menu.categories, category] } },
      actor,
      'category_created',
      category.name,
      'Category added',
    ),
  );
  return category;
}

export async function renameCategory(
  actor: StaffMember,
  categoryId: string,
  name: string,
  emoji: string,
): Promise<MenuCategory> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const before = base.menu.categories.find((c) => c.id === categoryId);
  if (!before) throw new ApiError(404, 'That category no longer exists.');
  if (name.trim().length < 2) throw new ApiError(400, 'A category needs a name.');

  const after: MenuCategory = { ...before, name: name.trim(), emoji: emoji.trim() || before.emoji };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, categories: base.menu.categories.map((c) => (c.id === categoryId ? after : c)) } },
      actor,
      'category_renamed',
      after.name,
      before.name === after.name ? 'Emoji changed' : `Renamed from ${before.name}`,
    ),
  );
  return after;
}

export async function deleteCategory(actor: StaffMember, categoryId: string): Promise<void> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const category = base.menu.categories.find((c) => c.id === categoryId);
  if (!category) throw new ApiError(404, 'That category no longer exists.');

  const occupants = base.menu.dishes.filter((d) => d.categoryId === categoryId && !d.isArchived);
  if (occupants.length > 0)
    throw new ApiError(409, `Move or archive the ${occupants.length} dish${occupants.length === 1 ? '' : 'es'} in ${category.name} first.`);

  writeStore(
    record(
      { ...base, menu: { ...base.menu, categories: base.menu.categories.filter((c) => c.id !== categoryId) } },
      actor,
      'category_deleted',
      category.name,
      'Category removed',
    ),
  );
}

export async function moveCategory(actor: StaffMember, categoryId: string, direction: -1 | 1): Promise<void> {
  authorize(actor, 'menu:edit');
  const base = withEditableMenu(readStore());
  const ordered = [...base.menu.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((c) => c.id === categoryId);
  if (index < 0) throw new ApiError(404, 'That category no longer exists.');
  const swapWith = ordered[index + direction];
  if (!swapWith) return;

  const current = ordered[index];
  const categories = base.menu.categories.map((c) => {
    if (c.id === current.id) return { ...c, sortOrder: swapWith.sortOrder };
    if (c.id === swapWith.id) return { ...c, sortOrder: current.sortOrder };
    return c;
  });

  writeStore(
    record(
      { ...base, menu: { ...base.menu, categories } },
      actor,
      'category_reordered',
      current.name,
      `Moved ${direction < 0 ? 'up' : 'down'}`,
    ),
  );
}

/* ── Tables and QR codes ───────────────────────────────────────────── */

/**
 * The mock keeps a session's existence in `store.sessions`, keyed by table
 * rather than stored on the table itself, so every read has to look it up
 * fresh — a table object can't just carry a stale `currentSessionId`.
 */
function withSessionId(store: Store, table: DiningTable): DiningTable {
  const session = store.sessions[`${table.restaurantId}:${table.id}`];
  const active = session && Date.parse(session.expiresAt) > Date.now();
  return {
    ...table,
    currentSessionId: active ? session.id : null,
    currentSessionToken: active ? session.anonymousSessionToken : null,
  };
}

export async function listTables(actor: StaffMember): Promise<DiningTable[]> {
  authorize(actor, 'tables:view');
  const store = readStore();
  return tablesOf(store)
    .map((t) => withSessionId(store, t))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createTable(actor: StaffMember, name: string, capacity: number): Promise<DiningTable> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableTables(readStore());
  if (name.trim().length < 1) throw new ApiError(400, 'A table needs a name.');
  if (base.tables.some((t) => t.name.toLowerCase() === name.trim().toLowerCase()))
    throw new ApiError(409, `There is already a ${name.trim()}.`);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) throw new ApiError(400, 'Seats must be 1–40.');

  const table: DiningTable = {
    id: uid('tbl'),
    restaurantId: actor.restaurantId,
    name: name.trim(),
    qrToken: newQrToken(),
    capacity,
    currentSessionId: null,
    currentSessionToken: null,
    isActive: true,
    sortOrder: Math.max(0, ...base.tables.map((t) => t.sortOrder)) + 1,
    createdAt: new Date().toISOString(),
  };

  writeStore(record({ ...base, tables: [...base.tables, table] }, actor, 'table_created', table.name, `${capacity} seats`));
  return table;
}

export async function updateTable(
  actor: StaffMember,
  tableId: string,
  patch: { name?: string; capacity?: number },
): Promise<DiningTable> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableTables(readStore());
  const before = base.tables.find((t) => t.id === tableId);
  if (!before) throw new ApiError(404, 'That table no longer exists.');

  const name = (patch.name ?? before.name).trim();
  const capacity = patch.capacity ?? before.capacity;
  if (name.length < 1) throw new ApiError(400, 'A table needs a name.');
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 40) throw new ApiError(400, 'Seats must be 1–40.');

  const after: DiningTable = { ...before, name, capacity };
  writeStore(
    record(
      { ...base, tables: base.tables.map((t) => (t.id === tableId ? after : t)) },
      actor,
      'table_renamed',
      after.name,
      before.name === after.name ? `Seats ${before.capacity} → ${capacity}` : `Renamed from ${before.name}`,
    ),
  );
  return withSessionId(base, after);
}

export async function setTableActive(actor: StaffMember, tableId: string, active: boolean): Promise<DiningTable> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableTables(readStore());
  const before = base.tables.find((t) => t.id === tableId);
  if (!before) throw new ApiError(404, 'That table no longer exists.');

  const after: DiningTable = { ...before, isActive: active };
  writeStore(
    record(
      { ...base, tables: base.tables.map((t) => (t.id === tableId ? after : t)) },
      actor,
      active ? 'table_enabled' : 'table_disabled',
      after.name,
      active ? 'Seating again' : 'Disabled — its QR stops resolving',
    ),
  );
  return withSessionId(base, after);
}

/**
 * §53. The printed code carries an opaque token and nothing else, so rotating
 * it is a one-line change here — and immediately voids the printed card, which
 * is exactly what a restaurant wants after a token leaks.
 */
export async function regenerateQr(actor: StaffMember, tableId: string): Promise<DiningTable> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableTables(readStore());
  const before = base.tables.find((t) => t.id === tableId);
  if (!before) throw new ApiError(404, 'That table no longer exists.');

  const after: DiningTable = { ...before, qrToken: newQrToken() };
  const sessions = { ...base.sessions };
  delete sessions[`${before.restaurantId}:${before.id}`];

  writeStore(
    record(
      { ...base, sessions, tables: base.tables.map((t) => (t.id === tableId ? after : t)) },
      actor,
      'qr_regenerated',
      after.name,
      'New token issued — the old printed code no longer works',
    ),
  );
  return { ...after, currentSessionId: null };
}

/**
 * §20/§27 — ending a visit does not un-cook food, so this is not a blanket
 * "mark completed": a line the kitchen never started is dropped — and never
 * billed, the same rule any other item cancel already follows — while a line
 * already cooking or plated is treated as delivered, since the kitchen made
 * it and the visit is over. A ticket staff never even accepted has no
 * `acceptedAt` for `deriveOrderStatus` to key off, so this is the one place
 * that sets `cancelledAt` by hand rather than leaving it to read as still
 * PENDING forever. Mirrors the live backend's own `DiningSessionService.endSession`.
 */
function closeOrderForSessionEnd(order: Order, restaurant: Restaurant, now: string): Order {
  const items: OrderItem[] = order.items.map((item) => {
    if (item.status === 'PENDING') return { ...item, status: 'CANCELLED' as ItemStatus, statusUpdatedAt: now };
    if (item.status === 'PREPARING' || item.status === 'READY') return { ...item, status: 'SERVED' as ItemStatus, statusUpdatedAt: now };
    return item;
  });

  const cancelledAt = order.acceptedAt ? order.cancelledAt : now;
  const status = deriveOrderStatus({ acceptedAt: order.acceptedAt, cancelledAt, items });
  const settled = recomputeTotals({ ...order, items, cancelledAt, updatedAt: now }, restaurant);
  return { ...settled, status, completedAt: status === 'COMPLETED' ? now : null };
}

/** Ending a visit can close a ticket either way — never just a count of "completed". */
function closingSummary(closed: Order[]): string {
  const completed = closed.filter((o) => o.status === 'COMPLETED').length;
  const cancelled = closed.length - completed;
  if (cancelled === 0) return `${completed} order${completed === 1 ? '' : 's'} marked completed`;
  if (completed === 0) return `${cancelled} order${cancelled === 1 ? '' : 's'} cancelled — the kitchen never started them`;
  return `${completed} order${completed === 1 ? '' : 's'} completed, ${cancelled} cancelled`;
}

/**
 * Clears the table's active visit so the next QR scan starts a fresh one,
 * rather than joining whatever the last party left behind. Available
 * whenever a session is open — a manager may need this with no orders on
 * the table at all, not only after settling one.
 */
export async function endTableSession(actor: StaffMember, tableId: string): Promise<DiningTable> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = seedQueue(readStore());
  const table = tablesOf(base).find((t) => t.id === tableId);
  if (!table) throw new ApiError(404, 'That table no longer exists.');

  const key = `${table.restaurantId}:${table.id}`;
  const session = base.sessions[key];
  if (!session) throw new ApiError(409, `${table.name} has no active visit to end.`);

  const restaurant = restaurantOf(base);
  const now = new Date().toISOString();
  const closed: Order[] = [];
  const orders = base.orders.map((o) => {
    if (o.sessionId !== session.id || !isTableOpen(o.status)) return o;
    const settled = closeOrderForSessionEnd(o, restaurant, now);
    closed.push(settled);
    return settled;
  });

  const sessions = { ...base.sessions };
  delete sessions[key];

  const detail = closed.length > 0 ? `Table cleared — ${closingSummary(closed)}` : 'Table cleared for the next visit';
  writeStore(record({ ...base, sessions, orders }, actor, 'table_session_ended', table.name, detail));
  return { ...table, currentSessionId: null };
}

/* ── Reviews ───────────────────────────────────────────────────────── */

export interface ReviewRow extends Review {
  dishName: string;
}

export interface ReviewFilter {
  dishId?: string;
  /** 1–5, exact star bucket. */
  stars?: number;
  sentiment?: 'positive' | 'negative';
  /** Days back from now. */
  since?: number;
}

/** Anything four and up is a compliment; three and below is a problem. */
const POSITIVE_FLOOR = 4;

export async function listReviews(actor: StaffMember, filter: ReviewFilter = {}): Promise<ReviewRow[]> {
  authorize(actor, 'reviews:view');
  await latency();
  const store = readStore();
  const names = new Map(menuOf(store).dishes.map((d) => [d.id, d.name] as const));
  const cutoff = filter.since ? Date.now() - filter.since * 86_400_000 : null;

  return [...store.reviews, ...SEED_REVIEWS]
    .filter((r) => {
      if (filter.dishId && r.dishId !== filter.dishId) return false;
      if (filter.stars && Math.round(r.overall) !== filter.stars) return false;
      if (filter.sentiment === 'positive' && r.overall < POSITIVE_FLOOR) return false;
      if (filter.sentiment === 'negative' && r.overall >= POSITIVE_FLOOR) return false;
      if (cutoff && Date.parse(r.createdAt) < cutoff) return false;
      return true;
    })
    .map((r) => ({ ...r, dishName: names.get(r.dishId) ?? 'Removed dish' }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ── Settings ──────────────────────────────────────────────────────── */

export interface SettingsPatch {
  name?: string;
  tagline?: string;
  description?: string;
  serviceChargeRate?: number;
  taxRate?: number;
}

export async function getSettings(actor: StaffMember): Promise<{ restaurant: Restaurant; autoKitchen: boolean }> {
  authorize(actor, 'settings:view');
  const store = readStore();
  return { restaurant: restaurantOf(store), autoKitchen: store.autoKitchen };
}

export async function updateSettings(actor: StaffMember, patch: SettingsPatch): Promise<Restaurant> {
  authorize(actor, 'settings:edit');
  await latency();
  const store = readStore();
  const before = restaurantOf(store);

  const rate = (value: number | undefined, label: string): number | undefined => {
    if (value === undefined) return undefined;
    if (!Number.isFinite(value) || value < 0 || value > 0.5) throw new ApiError(400, `${label} must be between 0% and 50%.`);
    return Math.round(value * 10_000) / 10_000;
  };

  const after: Restaurant = {
    ...before,
    name: patch.name?.trim() || before.name,
    tagline: patch.tagline?.trim() ?? before.tagline,
    description: patch.description?.trim() ?? before.description,
    serviceChargeRate: rate(patch.serviceChargeRate, 'Service charge') ?? before.serviceChargeRate,
    taxRate: rate(patch.taxRate, 'Tax') ?? before.taxRate,
  };

  const changes: string[] = [];
  if (after.name !== before.name) changes.push(`Name → ${after.name}`);
  if (after.tagline !== before.tagline) changes.push('Tagline edited');
  if (after.description !== before.description) changes.push('Description edited');
  if (after.serviceChargeRate !== before.serviceChargeRate)
    changes.push(`Service charge ${percent(before.serviceChargeRate)} → ${percent(after.serviceChargeRate)}`);
  if (after.taxRate !== before.taxRate) changes.push(`Tax ${percent(before.taxRate)} → ${percent(after.taxRate)}`);

  // Only the editable fields are stored, so the seed data keeps owning
  // identity (slug, currency, timezone) and the review aggregates.
  let next: Store = {
    ...store,
    restaurantPatch: {
      name: after.name,
      tagline: after.tagline,
      description: after.description,
      serviceChargeRate: after.serviceChargeRate,
      taxRate: after.taxRate,
    },
  };
  if (changes.length > 0) next = record(next, actor, 'settings_updated', before.name, changes.join(' · '));
  writeStore(next);
  return after;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed((rate * 100) % 1 === 0 ? 0 : 1)}%`;
}

/** The demo kitchen is a demo affordance, not a product feature — hence here. */
export async function setAutoKitchen(actor: StaffMember, on: boolean): Promise<boolean> {
  authorize(actor, 'settings:view');
  const store = readStore();
  writeStore({ ...store, autoKitchen: on });
  return on;
}

/** Puts the menu, tables and settings back to the seed data. Orders survive. */
export async function restoreSeedMenu(actor: StaffMember): Promise<void> {
  authorize(actor, 'settings:edit');
  await latency();
  const store = readStore();
  writeStore(
    record(
      { ...store, menu: null, tables: null, restaurantPatch: null },
      actor,
      'settings_updated',
      restaurantOf(store).name,
      `Menu, tables and settings reset to the ${CATEGORIES.length}-category, ${DISHES.length}-dish original`,
    ),
  );
}
