import { HISTORY_REF_CEILING, orderHistory } from '../data/history';
import { SEED_REVIEWS } from '../data/reviews';
import { DEMO_PIN } from '../data/staff';
import type { OrderComparison, Period, RevenueComparison, RevenueTrend, TopSellingDish, TrendPeriod } from '../domain/adminMetrics';
import { buildRevenueTrend, dishPerformance, periodReport } from '../domain/adminMetrics';
import { formatMoney, percentOf, recomputeTotals, sumLines } from '../domain/money';
import {
  ITEM_STATUS_LABEL,
  STATUS_LABEL,
  billableItems,
  canCancelOrder,
  deriveOrderStatus,
  deriveOrderStatusForType,
  nextItemStatus,
} from '../domain/orderStatus';
import { ROLE_LABEL, can } from '../domain/permissions';
import type { Permission } from '../domain/permissions';
import type {
  AddOn,
  AuditAction,
  AuditEntry,
  DietaryType,
  DiningSession,
  DiningTable,
  Dish,
  DishVariant,
  Floor,
  ItemStatus,
  Menu,
  MenuCategory,
  Minor,
  Order,
  OrderItem,
  OrderStatus,
  Payment,
  PaymentMethod,
  Restaurant,
  Review,
  StaffMember,
  StaffRole,
} from '../domain/types';
import type { Store } from './store';
import {
  ApiError,
  floorsOf,
  latency,
  menuOf,
  newQrToken,
  newSessionToken,
  readStore,
  restaurantOf,
  staffOf,
  tablesOf,
  takeReference,
  uid,
  withEditableFloors,
  withEditableMenu,
  withEditableStaff,
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
  const member = staffOf(readStore()).find((s) => s.email.toLowerCase() === email.trim().toLowerCase());
  if (!member || pin.trim() !== DEMO_PIN) throw new ApiError(401, 'That email and PIN do not match an account.');
  return member;
}

export function staffDirectory(): StaffMember[] {
  return staffOf(readStore());
}

/* ── Staff ─────────────────────────────────────────────────────────── */

export interface StaffDraft {
  name: string;
  email: string;
  /**
   * Collected so the form matches the live backend, which authenticates each
   * staff member by their own PIN. The mock has no per-member PIN store —
   * every demo account, seeded or added here, signs in with `DEMO_PIN` — so
   * this is validated for shape and then dropped.
   */
  pin: string;
  role: StaffRole;
  /** Live backend only: the branches a manager/staff member is pinned to. The offline demo has no branches. */
  branchIds?: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listStaff(actor: StaffMember): Promise<StaffMember[]> {
  authorize(actor, 'settings:view');
  const roster = [...staffOf(readStore())];
  const rank: Record<StaffRole, number> = { OWNER: 0, MANAGER: 1, STAFF: 2 };
  return roster.sort((a, b) => rank[a.role] - rank[b.role] || a.name.localeCompare(b.name));
}

export async function createStaffMember(actor: StaffMember, draft: StaffDraft): Promise<StaffMember> {
  authorize(actor, 'settings:edit');
  await latency();

  const name = draft.name.trim();
  const email = draft.email.trim().toLowerCase();
  if (name.length < 2) throw new ApiError(400, 'A name is required.');
  if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address.');

  const base = withEditableStaff(readStore());
  if (base.staff.some((s) => s.email.toLowerCase() === email)) throw new ApiError(409, 'This person is already on the team.');

  const member: StaffMember = { id: uid('stf'), restaurantId: actor.restaurantId, name, email, role: draft.role };

  writeStore(
    record(
      { ...base, staff: [...base.staff, member] },
      actor,
      'staff_invited',
      member.name,
      `Added as ${ROLE_LABEL[member.role]}`,
    ),
  );
  return member;
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

export async function listAudit(actor: StaffMember, limit = 80, offset = 0): Promise<{ rows: AuditEntry[]; count: number }> {
  authorize(actor, 'audit:view');
  const audit = readStore().audit;
  return { rows: audit.slice(offset, offset + limit), count: audit.length };
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
    case 'UNPAID':
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
        addOns: [],
        variantId: null,
        variantNameSnapshot: null,
        variantPriceSnapshot: null,
      };
    });

    const acceptedAt = status === 'PENDING' ? null : placed.toISOString();
    const cancelledAt = status === 'CANCELLED' ? new Date(placed.getTime() + 3 * 60_000).toISOString() : null;
    const paidAt = status === 'COMPLETED' ? new Date(placed.getTime() + 22 * 60_000).toISOString() : null;
    const subtotal = sumLines(billableItems(items));
    const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
    const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
    const derived = deriveOrderStatus({ acceptedAt, cancelledAt, paidAt, floorName: null, items });

    return {
      id: `ord_seed${i}`,
      reference: `#${++ref}`,
      restaurantId: restaurant.id,
      // The demo shift is dine-in only — a real restaurant's seeded floor has no delivery tickets.
      orderType: 'DINE_IN',
      tableId: table.id,
      tableName: table.name,
      // Not one of this browser's dining sessions, so the demo kitchen leaves
      // these alone — they move when staff move them.
      sessionId: `ses_floor${i}`,
      customerId: null,
      status: derived,
      acceptedAt,
      cancelledAt,
      paidAt,
      items,
      subtotal,
      serviceCharge,
      tax,
      deliveryFee: 0,
      discount: 0,
      total: subtotal + serviceCharge + tax,
      currency: restaurant.currency,
      createdAt: placed.toISOString(),
      updatedAt: placed.toISOString(),
      completedAt: paidAt,
      reviewedDishIds: [],
      deliveryAddress: null,
      deliveryPhone: null,
      deliveryCustomerName: null,
      deliveryNote: null,
      floorVisitorName: null,
      floorName: null,
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

/** §31 — the same revenue-vs-prior-period comparison `GET /restaurant/analytics/revenue` answers live. */
export async function fetchRevenueComparison(actor: StaffMember, period: Period): Promise<RevenueComparison> {
  authorize(actor, 'analytics:view');
  const store = seedQueue(readStore());
  const report = periodReport([...orderHistory(), ...store.orders], period);
  const differencePercentage =
    report.revenueChange === null ? (report.current.revenue > 0 ? 100 : 0) : Number((report.revenueChange * 100).toFixed(2));
  return { current: report.current.revenue, previous: report.previous.revenue, differencePercentage };
}

/** §31 — the same slot-by-slot trend `GET /restaurant/analytics/revenue/trend` answers live. */
export async function fetchRevenueTrend(actor: StaffMember, period: TrendPeriod): Promise<RevenueTrend> {
  authorize(actor, 'analytics:view');
  const store = seedQueue(readStore());
  return buildRevenueTrend([...orderHistory(), ...store.orders], period);
}

/** §31 — the same order-count-vs-prior-period comparison `GET /restaurant/analytics/orders` answers live. */
export async function fetchOrderComparison(actor: StaffMember, period: Period): Promise<OrderComparison> {
  authorize(actor, 'analytics:view');
  const store = seedQueue(readStore());
  const report = periodReport([...orderHistory(), ...store.orders], period);
  const differencePercentage =
    report.orderChange === null ? (report.current.orders > 0 ? 100 : 0) : Number((report.orderChange * 100).toFixed(2));
  return { current: report.current.orders, previous: report.previous.orders, differencePercentage };
}

const DAY_MS = 86_400_000;

/** §31 — the same paid-dishes ranking `GET /restaurant/analytics/top-dishes` answers live. */
export async function fetchTopSellingDishes(actor: StaffMember, startDate?: string, endDate?: string): Promise<TopSellingDish[]> {
  authorize(actor, 'analytics:view');
  const store = seedQueue(readStore());
  const orders = [...orderHistory(), ...store.orders];
  const from = startDate ? Date.parse(startDate) : 0;
  const to = startDate ? Date.parse(endDate ?? startDate) + DAY_MS : Date.now();

  return dishPerformance(orders, menuOf(store).dishes, from, to)
    .filter((d) => d.units > 0)
    .sort((a, b) => b.units - a.units)
    .map((d) => ({ dishId: d.dishId, dishName: d.name, orderCount: d.units, totalAmount: d.revenue }));
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
    status: deriveOrderStatusForType(
      { acceptedAt, cancelledAt: order.cancelledAt, paidAt: order.paidAt, floorName: order.floorName, items: order.items },
      order.orderType,
    ),
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

  const to = nextItemStatus(item.status, order.orderType);
  if (!to) throw new ApiError(409, `${item.dishNameSnapshot} is already finished.`);

  const now = new Date().toISOString();
  const items = order.items.map((i) => (i.id === itemId ? { ...i, status: to, statusUpdatedAt: now } : i));
  const derivedStatus = deriveOrderStatusForType(
    { acceptedAt: order.acceptedAt, cancelledAt: order.cancelledAt, paidAt: order.paidAt, floorName: order.floorName, items },
    order.orderType,
  );
  const updated: Order = {
    ...order,
    items,
    status: derivedStatus,
    updatedAt: now,
    completedAt: derivedStatus === 'COMPLETED' ? now : order.completedAt,
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

/** Delivery-only: hands the ticket from the kitchen to whoever is taking it out — the one manual step between the pass and the door. */
export async function advanceDeliveryOrder(actor: StaffMember, orderId: string, expected: 'READY'): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');
  if (order.orderType !== 'DELIVERY') throw new ApiError(409, 'Only a delivery order can go out for delivery.');
  if (order.status !== expected)
    throw new ApiError(409, `${order.reference} already moved to ${STATUS_LABEL[order.status].toLowerCase()}.`);

  const now = new Date().toISOString();
  const updated: Order = { ...order, status: 'OUT_FOR_DELIVERY', updatedAt: now };
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

/**
 * Delivery's equivalent of settling a table — there's no tab to batch, just
 * this one order's own bill, charged the moment it's handed over. Same
 * "status is the payment state" rule as dine-in, just per-order instead of
 * per-table (§ `settleTable`).
 */
export async function settleDeliveryOrder(actor: StaffMember, orderId: string, method: PaymentMethod = 'CASH'): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');
  if (order.orderType !== 'DELIVERY') throw new ApiError(409, 'Only a delivery order can be settled this way.');
  if (order.status !== 'OUT_FOR_DELIVERY')
    throw new ApiError(409, `${order.reference} must be out for delivery before it can be marked delivered.`);

  const now = new Date().toISOString();
  // The driver takes every plated line at once — no item goes SERVED on its own
  // for a delivery order (see `nextItemStatus`), so this is where they catch up.
  const items = order.items.map((i) => (i.status === 'READY' ? { ...i, status: 'SERVED' as ItemStatus, statusUpdatedAt: now } : i));
  const updated: Order = { ...order, items, status: 'COMPLETED', paidAt: now, updatedAt: now, completedAt: now };
  const restaurant = restaurantOf(store);
  const payment: Payment = {
    id: uid('pay'),
    restaurantId: order.restaurantId,
    sessionId: order.sessionId,
    tableId: null,
    subtotal: order.subtotal,
    serviceCharge: order.serviceCharge,
    tax: order.tax,
    discount: order.discount,
    total: order.total,
    method,
    currency: order.currency,
    createdAt: now,
    createdBy: actor.id,
    createdByName: actor.name,
    items: order.items.map((i) => ({ id: uid('payi'), dishId: i.dishId, dishNameSnapshot: i.dishNameSnapshot, unitPrice: i.unitPrice, quantity: i.quantity })),
  };

  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)), payments: [payment, ...store.payments] },
      actor,
      'payment_completed',
      `Order ${order.reference}`,
      `Delivered — charged ${formatMoney(payment.total, restaurant.currency)} via ${method.toLowerCase()}`,
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
  // §20/§27 — a whole-order cancel voids every line the kitchen hasn't already served; a served
  // dish is food already delivered and stays on the bill regardless of the ticket's fate. In
  // practice `canCancelOrder` above already means every line here is still PENDING.
  const items: OrderItem[] = order.items.map((i) =>
    i.status === 'SERVED' || i.status === 'CANCELLED' ? i : { ...i, status: 'CANCELLED' as ItemStatus, statusUpdatedAt: now },
  );
  const updated: Order = recomputeTotals(
    { ...order, items, status: 'CANCELLED', cancelledAt: now, updatedAt: now },
    restaurantOf(store),
  );
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

/** A table is "in use" while any of its orders are still open — including one that's fully
 *  served and just waiting on the till, since the table isn't free until that's settled too. */
const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'UNPAID'];

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
 * The till. Identified by the session being paid off, not the table — all
 * that's checked up front is that the session still exists. Which dishes and
 * how many is the cashier's call (read off the bill after any corrections),
 * so it comes from the request rather than being re-derived from whatever
 * the underlying orders currently say; prices still always come from the
 * menu, never the client. Ending the visit in the same motion marks every
 * order still open on the session completed, whether or not it matched a
 * line on this particular charge. Mirrors the live API's payment record —
 * same shape, same `payments:discount` gate — so the Payments screen works
 * identically with or without a real backend behind it.
 */
export async function completePayment(
  actor: StaffMember,
  sessionId: string,
  items: { dishId: string; quantity: number }[],
  method: PaymentMethod,
  discount: number,
  endSession: boolean,
): Promise<Payment> {
  authorize(actor, 'orders:advance');
  if (discount > 0) authorize(actor, 'payments:discount');
  await latency();
  const store = seedQueue(readStore());
  const session = Object.values(store.sessions).find((s) => s.id === sessionId);
  if (!session) throw new ApiError(404, 'This dining session no longer exists.');
  if (items.length === 0) throw new ApiError(400, 'Add at least one item to charge for.');

  const dishes = menuOf(store).dishes;
  const restaurant = restaurantOf(store);
  const paymentItems = items.map(({ dishId, quantity }) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) throw new ApiError(404, 'One of these dishes is no longer on the menu.');
    return { dishId: dish.id, dishNameSnapshot: dish.name, unitPrice: dish.price, quantity };
  });
  const subtotal = sumLines(paymentItems);
  const discountedSubtotal = subtotal - discount;
  const serviceCharge = percentOf(discountedSubtotal, restaurant.serviceChargeRate);
  const tax = percentOf(discountedSubtotal + serviceCharge, restaurant.taxRate);
  const total = discountedSubtotal + serviceCharge + tax;
  if (total < 0) throw new ApiError(409, "The discount can't be more than the bill.");

  const payment: Payment = {
    id: uid('pay'),
    restaurantId: actor.restaurantId,
    sessionId: session.id,
    tableId: session.tableId,
    subtotal,
    serviceCharge,
    tax,
    discount,
    total,
    method,
    currency: restaurant.currency,
    createdAt: new Date().toISOString(),
    createdBy: actor.id,
    createdByName: actor.name,
    items: paymentItems.map((item) => ({ id: uid('payi'), ...item })),
  };

  let next = record(
    { ...store, payments: [payment, ...store.payments] },
    actor,
    'payment_completed',
    `Session ${sessionId}`,
    `Charged ${formatMoney(total, restaurant.currency)} via ${method}${discount > 0 ? ` (${formatMoney(discount, restaurant.currency)} discount)` : ''}`,
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
  return payment;
}

/**
 * A floor order's own bill, settled on its own (§16b — see `FloorDetail`). Unlike `completePayment`,
 * this never touches another order on the same session: a floor session can carry more than one
 * round before anyone pays, and paying for one of them must not silently fast-forward the others
 * to paid-and-complete too. Which dishes and how many is the cashier's call, same as a table's tab
 * (read off the bill after any corrections) rather than re-derived from whatever the order's own
 * items currently say — prices still always come from the menu, never the client.
 */
export async function completeOrderPayment(
  actor: StaffMember,
  orderId: string,
  items: { dishId: string; quantity: number }[],
  method: PaymentMethod,
  discount: number,
): Promise<Payment> {
  authorize(actor, 'orders:advance');
  if (discount > 0) authorize(actor, 'payments:discount');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');
  if (!order.floorName) throw new ApiError(409, 'Only a floor order can be paid on its own like this.');
  if (order.status === 'CANCELLED') throw new ApiError(409, 'That order was cancelled — there is nothing to charge.');
  if (order.paidAt) throw new ApiError(409, `${order.reference} is already paid.`);
  if (items.length === 0) throw new ApiError(400, 'Add at least one item to charge for.');

  const dishes = menuOf(store).dishes;
  const restaurant = restaurantOf(store);
  const paymentItems = items.map(({ dishId, quantity }) => {
    const dish = dishes.find((d) => d.id === dishId);
    if (!dish) throw new ApiError(404, 'One of these dishes is no longer on the menu.');
    return { dishId: dish.id, dishNameSnapshot: dish.name, unitPrice: dish.price, quantity };
  });
  const subtotal = sumLines(paymentItems);
  const discountedSubtotal = subtotal - discount;
  const serviceCharge = percentOf(discountedSubtotal, restaurant.serviceChargeRate);
  const tax = percentOf(discountedSubtotal + serviceCharge, restaurant.taxRate);
  const total = discountedSubtotal + serviceCharge + tax;
  if (total < 0) throw new ApiError(409, "The discount can't be more than the bill.");

  const now = new Date().toISOString();
  const payment: Payment = {
    id: uid('pay'),
    restaurantId: order.restaurantId,
    sessionId: order.sessionId,
    tableId: order.tableId,
    subtotal,
    serviceCharge,
    tax,
    discount,
    total,
    method,
    currency: restaurant.currency,
    createdAt: now,
    createdBy: actor.id,
    createdByName: actor.name,
    items: paymentItems.map((item) => ({ id: uid('payi'), ...item })),
  };

  const status = deriveOrderStatus({
    acceptedAt: order.acceptedAt,
    cancelledAt: order.cancelledAt,
    paidAt: now,
    floorName: order.floorName,
    items: order.items,
  });
  const updated: Order = {
    ...order,
    paidAt: now,
    updatedAt: now,
    status,
    completedAt: status === 'COMPLETED' ? now : order.completedAt,
  };

  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)), payments: [payment, ...store.payments] },
      actor,
      'payment_completed',
      `Order ${order.reference}`,
      `Charged ${formatMoney(total, restaurant.currency)} via ${method.toLowerCase()}${discount > 0 ? ` (${formatMoney(discount, restaurant.currency)} discount)` : ''}`,
    ),
  );
  return payment;
}

/** Every payment this restaurant has taken, most recent first — what the Payments screen lists. */
export async function listPayments(
  actor: StaffMember,
  offset: number = 0,
  limit: number = 200,
  query: { tableId?: string; from?: string; to?: string } = {},
): Promise<{ rows: Payment[]; count: number }> {
  authorize(actor, 'payments:view');
  await latency();
  const store = readStore();
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  const filtered = store.payments.filter((p) => {
    if (query.tableId && p.tableId !== query.tableId) return false;
    const at = Date.parse(p.createdAt);
    if (from !== null && at < from) return false;
    if (to !== null && at > to) return false;
    return true;
  });
  return { rows: filtered.slice(offset, offset + limit), count: filtered.length };
}

export async function getPayment(actor: StaffMember, paymentId: string): Promise<Payment> {
  authorize(actor, 'payments:view');
  await latency();
  const payment = readStore().payments.find((p) => p.id === paymentId);
  if (!payment) throw new ApiError(404, 'This payment no longer exists.');
  return payment;
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
  const paidAt = order.paidAt ?? now;
  return {
    ...order,
    acceptedAt,
    items,
    paidAt,
    status: deriveOrderStatus({ acceptedAt, cancelledAt: order.cancelledAt, paidAt, floorName: order.floorName, items }),
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

  // A table's id outlives any one visit, and a visit's orders outlive being settled — so the
  // table's latest order by timestamp alone can be a stranger's already-ended visit, or this
  // visit's own ticket from before it was paid up. Only an order that's both *this* open visit's
  // and still open itself is worth landing on; anything else means a fresh order starts instead,
  // the same way a diner's own next round does after their last one is settled.
  const session = store.sessions[`${table.restaurantId}:${table.id}`];
  const sessionOpen = Boolean(session && Date.parse(session.expiresAt) > Date.now());
  const latest = store.orders
    .filter((o) => o.tableId === tableId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  let base = store;
  let order = sessionOpen && latest?.sessionId === session.id && isTableOpen(latest.status) ? latest : undefined;

  // A table staff just seated (§ startTableSession) has an open visit but nobody has
  // ordered yet — there is no order to land on, so the first dish starts one, the same
  // way a diner's own first checkout would.
  if (!order) {
    if (!sessionOpen)
      throw new ApiError(409, `${table.name} has no open visit — seat the table before adding an order.`);

    const startedAt = new Date().toISOString();
    const { store: numbered, reference } = takeReference(base);
    order = {
      id: uid('ord'),
      reference,
      restaurantId: table.restaurantId,
      // Staff can only land a payment-sheet addition on a table's own order — never a delivery one.
      orderType: 'DINE_IN',
      tableId: table.id,
      tableName: table.name,
      sessionId: session.id,
      customerId: null,
      status: 'PENDING',
      acceptedAt: null,
      cancelledAt: null,
      paidAt: null,
      items: [],
      subtotal: 0,
      serviceCharge: 0,
      tax: 0,
      deliveryFee: 0,
      discount: 0,
      total: 0,
      currency: restaurantOf(base).currency,
      createdAt: startedAt,
      updatedAt: startedAt,
      completedAt: null,
      reviewedDishIds: [],
      deliveryAddress: null,
      deliveryPhone: null,
      deliveryCustomerName: null,
      deliveryNote: null,
      floorVisitorName: null,
      floorName: null,
    };
    base = { ...numbered, orders: [...numbered.orders, order] };
  }

  const dish = menuOf(base).dishes.find((d) => d.id === dishId);
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
          addOns: [],
          variantId: null,
          variantNameSnapshot: null,
          variantPriceSnapshot: null,
        },
      ];

  const next = { ...order, items, updatedAt: now };
  next.status = deriveOrderStatus(next);
  const updated = recomputeTotals(next, restaurantOf(base));
  writeStore(
    record(
      { ...base, orders: base.orders.map((o) => (o.id === order.id ? updated : o)) },
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
  const { categories, dishes, addOns } = menuOf(store);
  return {
    restaurant: restaurantOf(store),
    categories: [...categories].sort((a, b) => a.sortOrder - b.sortOrder),
    dishes: [...dishes].sort((a, b) => a.sortOrder - b.sortOrder),
    addOns: [...addOns].sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export interface DishDraft {
  name: string;
  description: string;
  categoryId: string;
  price: Minor;
  imageUrl: string | null;
  dietaryType: DietaryType;
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
    dietaryType: draft.dietaryType,
    addOnIds: [],
    variants: [],
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
    dietaryType: patch.dietaryType ?? before.dietaryType,
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
    after.dietaryType !== before.dietaryType ||
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

/* ── Add-ons ───────────────────────────────────────────────────────── */

export interface AddOnDraft {
  name: string;
  price: Minor;
  isAvailable: boolean;
}

function validateAddOnDraft(draft: AddOnDraft): void {
  if (draft.name.trim().length < 2) throw new ApiError(400, 'An add-on needs a name.');
  if (!Number.isInteger(draft.price) || draft.price < 0) throw new ApiError(400, 'Price must be a whole amount.');
  if (draft.price > 10_000_00) throw new ApiError(400, 'That price looks like a typo.');
}

export async function createAddOn(actor: StaffMember, draft: AddOnDraft): Promise<AddOn> {
  authorize(actor, 'menu:edit');
  await latency();
  validateAddOnDraft(draft);
  const base = withEditableMenu(readStore());
  const restaurant = restaurantOf(base);

  const addOn: AddOn = {
    id: uid('adn'),
    restaurantId: restaurant.id,
    name: draft.name.trim(),
    price: draft.price,
    currency: restaurant.currency,
    isAvailable: draft.isAvailable,
    isArchived: false,
    sortOrder: Math.max(-1, ...base.menu.addOns.map((a) => a.sortOrder)) + 1,
  };

  writeStore(
    record(
      { ...base, menu: { ...base.menu, addOns: [...base.menu.addOns, addOn] } },
      actor,
      'addon_created',
      addOn.name,
      `Added at ${formatPrice(addOn.price, restaurant)}`,
    ),
  );
  return addOn;
}

export async function updateAddOn(actor: StaffMember, addOnId: string, patch: Partial<AddOnDraft>): Promise<AddOn> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const before = base.menu.addOns.find((a) => a.id === addOnId);
  if (!before) throw new ApiError(404, 'That add-on no longer exists.');

  const draft: AddOnDraft = {
    name: patch.name ?? before.name,
    price: patch.price ?? before.price,
    isAvailable: patch.isAvailable ?? before.isAvailable,
  };
  validateAddOnDraft(draft);

  const after: AddOn = { ...before, name: draft.name.trim(), price: draft.price, isAvailable: draft.isAvailable };
  const restaurant = restaurantOf(base);
  const detail =
    after.price !== before.price
      ? `${formatPrice(before.price, restaurant)} → ${formatPrice(after.price, restaurant)}`
      : after.isAvailable !== before.isAvailable
        ? after.isAvailable
          ? 'Back on the menu'
          : 'Marked unavailable'
        : 'Details edited';

  writeStore(
    record(
      { ...base, menu: { ...base.menu, addOns: base.menu.addOns.map((a) => (a.id === addOnId ? after : a)) } },
      actor,
      'addon_updated',
      after.name,
      detail,
    ),
  );
  return after;
}

/** Same rule as a dish (§28): an add-on already on a past order is archived, never deleted. */
export async function setAddOnArchived(actor: StaffMember, addOnId: string, archived: boolean): Promise<AddOn> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const addOn = base.menu.addOns.find((a) => a.id === addOnId);
  if (!addOn) throw new ApiError(404, 'That add-on no longer exists.');

  const after: AddOn = { ...addOn, isArchived: archived };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, addOns: base.menu.addOns.map((a) => (a.id === addOnId ? after : a)) } },
      actor,
      archived ? 'addon_archived' : 'addon_restored',
      addOn.name,
      archived ? 'Archived — no longer linkable, kept in order history' : 'Restored',
    ),
  );
  return after;
}

/** Replaces the whole set of add-ons linked to a dish in one motion. */
export async function setDishAddOns(actor: StaffMember, dishId: string, addOnIds: string[]): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');

  const ids = [...new Set(addOnIds)];
  const known = new Set(base.menu.addOns.map((a) => a.id));
  if (!ids.every((id) => known.has(id))) throw new ApiError(400, 'One of those add-ons no longer exists.');

  const after: Dish = { ...dish, addOnIds: ids };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? after : d)) } },
      actor,
      'dish_add_ons_updated',
      dish.name,
      ids.length === 0 ? 'No add-ons linked' : `${ids.length} add-on${ids.length === 1 ? '' : 's'} linked`,
    ),
  );
  return after;
}

/* ── Dish variants ─────────────────────────────────────────────────── */

/**
 * Owned by the one dish being edited, not a restaurant-wide catalog like
 * `AddOn` — so unlike `setDishAddOns` there is no bulk "replace the set"
 * method, just ordinary per-row create/update/archive.
 */
export interface DishVariantDraft {
  name: string;
  price: Minor;
  isAvailable: boolean;
  dietaryType: DietaryType;
  spiceLevel: 0 | 1 | 2 | 3;
}

function validateVariantDraft(draft: DishVariantDraft): void {
  if (draft.name.trim().length < 1) throw new ApiError(400, 'A variant needs a name.');
  if (!Number.isInteger(draft.price) || draft.price < 0) throw new ApiError(400, 'Price must be a whole amount.');
  if (draft.price > 10_000_00) throw new ApiError(400, 'That price looks like a typo.');
}

export async function createDishVariant(actor: StaffMember, dishId: string, draft: DishVariantDraft): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  validateVariantDraft(draft);
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');

  const variant: DishVariant = {
    id: uid('var'),
    name: draft.name.trim(),
    price: draft.price,
    currency: dish.currency,
    isAvailable: draft.isAvailable,
    isArchived: false,
    sortOrder: Math.max(-1, ...dish.variants.map((v) => v.sortOrder)) + 1,
    dietaryType: draft.dietaryType,
    spiceLevel: draft.spiceLevel,
  };
  const after: Dish = { ...dish, variants: [...dish.variants, variant] };

  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? after : d)) } },
      actor,
      'dish_variant_created',
      `${dish.name} — ${variant.name}`,
      `Added at ${formatPrice(variant.price, restaurantOf(base))}`,
    ),
  );
  return after;
}

export async function updateDishVariant(
  actor: StaffMember,
  dishId: string,
  variantId: string,
  patch: Partial<DishVariantDraft>,
): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');
  const before = dish.variants.find((v) => v.id === variantId);
  if (!before) throw new ApiError(404, 'That variant no longer exists.');

  const draft: DishVariantDraft = {
    name: patch.name ?? before.name,
    price: patch.price ?? before.price,
    isAvailable: patch.isAvailable ?? before.isAvailable,
    dietaryType: patch.dietaryType ?? before.dietaryType,
    spiceLevel: patch.spiceLevel ?? before.spiceLevel,
  };
  validateVariantDraft(draft);

  const after: DishVariant = {
    ...before,
    name: draft.name.trim(),
    price: draft.price,
    isAvailable: draft.isAvailable,
    dietaryType: draft.dietaryType,
    spiceLevel: draft.spiceLevel,
  };
  const restaurant = restaurantOf(base);
  const detail =
    after.price !== before.price
      ? `${formatPrice(before.price, restaurant)} → ${formatPrice(after.price, restaurant)}`
      : after.isAvailable !== before.isAvailable
        ? after.isAvailable
          ? 'Back on the menu'
          : 'Marked unavailable'
        : 'Details edited';

  const afterDish: Dish = { ...dish, variants: dish.variants.map((v) => (v.id === variantId ? after : v)) };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? afterDish : d)) } },
      actor,
      'dish_variant_updated',
      `${dish.name} — ${after.name}`,
      detail,
    ),
  );
  return afterDish;
}

/** Same rule as a dish/add-on (§28): a variant already on a past order is archived, never deleted. */
export async function setDishVariantArchived(
  actor: StaffMember,
  dishId: string,
  variantId: string,
  archived: boolean,
): Promise<Dish> {
  authorize(actor, 'menu:edit');
  await latency();
  const base = withEditableMenu(readStore());
  const dish = base.menu.dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, 'That dish is not on the menu.');
  const variant = dish.variants.find((v) => v.id === variantId);
  if (!variant) throw new ApiError(404, 'That variant no longer exists.');

  const after: DishVariant = { ...variant, isArchived: archived };
  const afterDish: Dish = { ...dish, variants: dish.variants.map((v) => (v.id === variantId ? after : v)) };
  writeStore(
    record(
      { ...base, menu: { ...base.menu, dishes: base.menu.dishes.map((d) => (d.id === dishId ? afterDish : d)) } },
      actor,
      archived ? 'dish_variant_archived' : 'dish_variant_restored',
      `${dish.name} — ${variant.name}`,
      archived ? 'Archived — no longer selectable, kept in order history' : 'Restored',
    ),
  );
  return afterDish;
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

/* ── Floors ────────────────────────────────────────────────────────────
   §16b: one QR per floor rather than per room — any scan starts its own
   independent session, so unlike a table there is no occupied/free state
   or session to manage here, just the floor itself and its printed code. */

export async function listFloors(actor: StaffMember): Promise<Floor[]> {
  authorize(actor, 'tables:view');
  const store = readStore();
  return [...floorsOf(store)].sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createFloor(actor: StaffMember, name: string): Promise<Floor> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableFloors(readStore());
  if (name.trim().length < 1) throw new ApiError(400, 'A floor needs a name.');
  if (base.floors.some((f) => f.name.toLowerCase() === name.trim().toLowerCase()))
    throw new ApiError(409, `There is already a ${name.trim()}.`);

  const floor: Floor = {
    id: uid('flr'),
    restaurantId: actor.restaurantId,
    name: name.trim(),
    qrToken: newQrToken(),
    isActive: true,
    sortOrder: Math.max(0, ...base.floors.map((f) => f.sortOrder)) + 1,
    createdAt: new Date().toISOString(),
  };

  writeStore(record({ ...base, floors: [...base.floors, floor] }, actor, 'floor_created', floor.name, ''));
  return floor;
}

export async function updateFloor(actor: StaffMember, floorId: string, patch: { name?: string }): Promise<Floor> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableFloors(readStore());
  const before = base.floors.find((f) => f.id === floorId);
  if (!before) throw new ApiError(404, 'That floor no longer exists.');

  const name = (patch.name ?? before.name).trim();
  if (name.length < 1) throw new ApiError(400, 'A floor needs a name.');

  const after: Floor = { ...before, name };
  writeStore(
    record(
      { ...base, floors: base.floors.map((f) => (f.id === floorId ? after : f)) },
      actor,
      'floor_renamed',
      after.name,
      `Renamed from ${before.name}`,
    ),
  );
  return after;
}

export async function setFloorActive(actor: StaffMember, floorId: string, active: boolean): Promise<Floor> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableFloors(readStore());
  const before = base.floors.find((f) => f.id === floorId);
  if (!before) throw new ApiError(404, 'That floor no longer exists.');

  const after: Floor = { ...before, isActive: active };
  writeStore(
    record(
      { ...base, floors: base.floors.map((f) => (f.id === floorId ? after : f)) },
      actor,
      active ? 'floor_enabled' : 'floor_disabled',
      after.name,
      active ? 'Taking orders again' : 'Disabled — its QR stops resolving',
    ),
  );
  return after;
}

export async function regenerateFloorQr(actor: StaffMember, floorId: string): Promise<Floor> {
  authorize(actor, 'tables:edit');
  await latency();
  const base = withEditableFloors(readStore());
  const before = base.floors.find((f) => f.id === floorId);
  if (!before) throw new ApiError(404, 'That floor no longer exists.');

  const after: Floor = { ...before, qrToken: newQrToken() };
  writeStore(
    record(
      { ...base, floors: base.floors.map((f) => (f.id === floorId ? after : f)) },
      actor,
      'qr_regenerated',
      after.name,
      'New token issued — the old printed code no longer works',
    ),
  );
  return after;
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
 *
 * Table orders only — ending a table's visit settles its tab as a whole regardless of any one
 * order's status, so a fully-served ticket here still lands on `COMPLETED` the way it always has.
 * `UNPAID` is floor-only (§16b) and never applies to what this closes.
 */
function closeOrderForSessionEnd(order: Order, restaurant: Restaurant, now: string): Order {
  const items: OrderItem[] = order.items.map((item) => {
    if (item.status === 'PENDING') return { ...item, status: 'CANCELLED' as ItemStatus, statusUpdatedAt: now };
    if (item.status === 'PREPARING' || item.status === 'READY') return { ...item, status: 'SERVED' as ItemStatus, statusUpdatedAt: now };
    return item;
  });

  const cancelledAt = order.acceptedAt ? order.cancelledAt : now;
  const status = deriveOrderStatus({ acceptedAt: order.acceptedAt, cancelledAt, paidAt: order.paidAt, floorName: order.floorName, items });
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
 * Seats a table the QR never got to: a diner who can't or won't scan for
 * themselves, so staff open the visit on their behalf instead, the same
 * session a scan would have started. Gated on `orders:advance` rather than
 * `tables:edit` — this is service, not table configuration, so any server
 * working the floor can do it, not only a manager.
 */
export async function startTableSession(actor: StaffMember, tableId: string): Promise<DiningTable> {
  authorize(actor, 'orders:advance');
  await latency();
  const base = seedQueue(readStore());
  const table = tablesOf(base).find((t) => t.id === tableId);
  if (!table) throw new ApiError(404, 'That table no longer exists.');
  if (!table.isActive) throw new ApiError(409, `${table.name} is not seating right now.`);

  const key = `${table.restaurantId}:${table.id}`;
  const existing = base.sessions[key];
  if (existing && Date.parse(existing.expiresAt) > Date.now())
    throw new ApiError(409, `${table.name} already has an open visit.`);

  const session: DiningSession = {
    id: uid('ses'),
    restaurantId: table.restaurantId,
    tableId: table.id,
    customerId: null,
    floorId: null,
    floorVisitorName: null,
    anonymousSessionToken: newSessionToken(),
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * 3600_000).toISOString(),
    endedAt: null,
  };

  writeStore(
    record(
      { ...base, sessions: { ...base.sessions, [key]: session } },
      actor,
      'table_session_started',
      table.name,
      'Seated by staff — no QR scan',
    ),
  );
  return { ...table, currentSessionId: session.id, currentSessionToken: session.anonymousSessionToken };
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
  /** `null`/`''` clears it back to the plain gradient fallback. */
  coverImageUrl?: string | null;
  serviceChargeRate?: number;
  taxRate?: number;
  /** Flat, minor-unit delivery fee. `null`/`0` means no fee. */
  deliveryFeeAmount?: number | null;
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

  const deliveryFee = patch.deliveryFeeAmount;
  if (deliveryFee !== undefined && deliveryFee !== null && (!Number.isInteger(deliveryFee) || deliveryFee < 0))
    throw new ApiError(400, 'Delivery fee must be a whole, non-negative amount.');

  const after: Restaurant = {
    ...before,
    name: patch.name?.trim() || before.name,
    tagline: patch.tagline?.trim() ?? before.tagline,
    description: patch.description?.trim() ?? before.description,
    coverImageUrl: patch.coverImageUrl !== undefined ? patch.coverImageUrl?.trim() || '' : before.coverImageUrl,
    serviceChargeRate: rate(patch.serviceChargeRate, 'Service charge') ?? before.serviceChargeRate,
    taxRate: rate(patch.taxRate, 'Tax') ?? before.taxRate,
    deliveryFeeAmount: deliveryFee !== undefined ? deliveryFee : before.deliveryFeeAmount,
  };

  const changes: string[] = [];
  if (after.name !== before.name) changes.push(`Name → ${after.name}`);
  if (after.tagline !== before.tagline) changes.push('Tagline edited');
  if (after.description !== before.description) changes.push('Description edited');
  if (after.coverImageUrl !== before.coverImageUrl) changes.push('Cover image changed');
  if (after.serviceChargeRate !== before.serviceChargeRate)
    changes.push(`Service charge ${percent(before.serviceChargeRate)} → ${percent(after.serviceChargeRate)}`);
  if (after.taxRate !== before.taxRate) changes.push(`Tax ${percent(before.taxRate)} → ${percent(after.taxRate)}`);
  if (after.deliveryFeeAmount !== before.deliveryFeeAmount)
    changes.push(`Delivery fee ${formatMoney(before.deliveryFeeAmount ?? 0, before.currency)} → ${formatMoney(after.deliveryFeeAmount ?? 0, after.currency)}`);

  // Only the editable fields are stored, so the seed data keeps owning
  // identity (slug, currency, timezone) and the review aggregates.
  let next: Store = {
    ...store,
    restaurantPatch: {
      name: after.name,
      tagline: after.tagline,
      description: after.description,
      coverImageUrl: after.coverImageUrl,
      serviceChargeRate: after.serviceChargeRate,
      taxRate: after.taxRate,
      deliveryFeeAmount: after.deliveryFeeAmount,
    },
  };
  if (changes.length > 0) next = record(next, actor, 'settings_updated', before.name, changes.join(' · '));
  writeStore(next);
  return after;
}

function percent(rate: number): string {
  return `${(rate * 100).toFixed((rate * 100) % 1 === 0 ? 0 : 1)}%`;
}

/* ── Uploads ───────────────────────────────────────────────────────── */

export type UploadTarget = 'dish' | 'restaurant-cover';

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/** The mock store has nowhere to put an uploaded file — paste a URL instead. */
export async function getUploadSignature(): Promise<UploadSignature> {
  throw new ApiError(400, 'Image upload needs a live backend. Paste an image URL instead.');
}
