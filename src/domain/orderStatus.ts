import type { ItemStatus, Order, OrderItem, OrderStatus } from './types';

/**
 * The single home for order/item status logic — lookup tables, transition
 * rules and the order-status derivation — shared by the mock transport
 * (`api/admin.ts`, `api/client.ts`), the live transport (`api/live-admin.ts`,
 * `api/live.ts`) and every UI that needs to render or act on status,
 * regardless of which transport is active.
 */

/* ── Order-level (whole-order actions only — accept and cancel) ────── */

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** The one remaining manual order-level transition — everything else now follows the items. */
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'ACCEPTED',
};

export const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Accept',
};

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[status] ?? null;
}

/**
 * Whole-order cancel is only available before the kitchen has touched
 * anything — once a single item has left PENDING, cancelling the rest of the
 * ticket would waste food/work already in progress on that item. Staff still
 * has per-item cancel for whatever is left PENDING (`canCancelItem`).
 */
export function canCancelOrder(order: Pick<Order, 'status' | 'items'>): boolean {
  if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') return false;
  return order.items.every((i) => i.status === 'PENDING' || i.status === 'CANCELLED');
}

export const STATUS_ORDER: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED'];

export function statusIndex(status: OrderStatus): number {
  return STATUS_ORDER.indexOf(status);
}

/* ── Item-level (what actually moves through the kitchen) ──────────── */

export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = {
  PENDING: 'Pending',
  PREPARING: 'Preparing',
  READY: 'Ready',
  SERVED: 'Served',
  CANCELLED: 'Cancelled',
};

const ITEM_NEXT_STATUS: Partial<Record<ItemStatus, ItemStatus>> = {
  PENDING: 'PREPARING',
  PREPARING: 'READY',
  READY: 'SERVED',
};

export const ITEM_ADVANCE_LABEL: Partial<Record<ItemStatus, string>> = {
  PENDING: 'Start',
  PREPARING: 'Ready',
  READY: 'Served',
};

export function nextItemStatus(status: ItemStatus): ItemStatus | null {
  return ITEM_NEXT_STATUS[status] ?? null;
}

/** Diner-cancellable only before the kitchen has started it. */
export function canCancelItem(item: Pick<OrderItem, 'status'>): boolean {
  return item.status === 'PENDING';
}

/** Items actually on the bill — an individually-cancelled line is never charged. */
export function billableItems(items: OrderItem[]): OrderItem[] {
  return items.filter((i) => i.status !== 'CANCELLED');
}

/**
 * `Order.status` is computed from its items (plus `acceptedAt`/`cancelledAt`),
 * never assigned directly — every mutation that touches an order or one of
 * its items must finish by calling this and persisting the result. Mirrors
 * the server-side derivation exactly (`lets-dine-backend`'s
 * `order-status.util.ts`) so the two never drift.
 */
export function deriveOrderStatus(order: Pick<Order, 'acceptedAt' | 'cancelledAt' | 'items'>): OrderStatus {
  if (order.cancelledAt) return 'CANCELLED';
  if (!order.acceptedAt) return 'PENDING';

  const live = billableItems(order.items);
  if (live.length === 0) return 'CANCELLED';
  if (live.every((i) => i.status === 'SERVED')) return 'COMPLETED';
  if (live.every((i) => i.status === 'READY' || i.status === 'SERVED')) return 'READY';
  if (live.some((i) => i.status !== 'PENDING')) return 'PREPARING';
  return 'ACCEPTED';
}

/** How many of an order's live items have reached each side of "ready", for a one-line summary. */
export function itemStatusSummary(order: Order): { total: number; ready: number } {
  const live = billableItems(order.items);
  const ready = live.filter((i) => i.status === 'READY' || i.status === 'SERVED').length;
  return { total: live.length, ready };
}

/* ── Diner-facing copy ──────────────────────────────────────────────── */

/** Still moving through the kitchen — the diner should be able to find these. */
export const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'];

export function isOpenOrder(status: OrderStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export const DINER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Placed',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const DINER_STATUS_HINT: Record<OrderStatus, string> = {
  PENDING: 'Sent to the kitchen',
  ACCEPTED: 'They have your order',
  PREPARING: 'On the grill',
  READY: 'Coming to your table',
  COMPLETED: 'Enjoy your meal',
  CANCELLED: 'Nothing was sent to the kitchen',
};

export function dinerStatusToast(status: OrderStatus): { message: string; icon: string } {
  switch (status) {
    case 'ACCEPTED':
      return { message: 'Restaurant accepted your order', icon: '✓' };
    case 'PREPARING':
      return { message: 'Kitchen is preparing your order', icon: '🔥' };
    case 'READY':
      return { message: 'Your order is ready', icon: '🔔' };
    case 'COMPLETED':
      return { message: 'Enjoy your meal', icon: '✓' };
    case 'CANCELLED':
      return { message: 'Your order was cancelled', icon: '✕' };
    default:
      return { message: `Order ${DINER_STATUS_LABEL[status].toLowerCase()}`, icon: '✓' };
  }
}

/** A lighter nudge for one dish, so a multi-item order doesn't go quiet until every last item converges. */
export function dinerItemStatusToast(item: OrderItem): { message: string; icon: string } | null {
  switch (item.status) {
    case 'PREPARING':
      return { message: `${item.dishNameSnapshot} is on the grill`, icon: '🔥' };
    case 'READY':
      return { message: `${item.dishNameSnapshot} is ready`, icon: '🔔' };
    case 'SERVED':
      return { message: `${item.dishNameSnapshot} is out`, icon: '✓' };
    default:
      return null;
  }
}

/**
 * §10, diner-facing — mirrors the server rule behind `POST /reviews`
 * (the backend's `Order.isReviewable`, enforced in `CreateDishReviewUsecase`).
 * A dish earns the right to be rated the moment it is actually served, not
 * once the rest of the table's order finishes — a starter that arrived
 * twenty minutes ago shouldn't wait on dessert. A whole-order cancel takes
 * that right away outright, whatever any surviving item says.
 */
export function reviewEligibility(order: Order, dishId: string): { ok: boolean; reason?: string } {
  if (order.status === 'CANCELLED') return { ok: false, reason: 'This order was cancelled.' };
  if (!order.items.some((i) => i.dishId === dishId)) return { ok: false, reason: 'That dish was not in this order.' };
  if (order.reviewedDishIds.includes(dishId)) return { ok: false, reason: 'You have already rated this dish.' };
  if (!order.items.some((i) => i.dishId === dishId && i.status === 'SERVED')) {
    return { ok: false, reason: 'You can rate a dish once it has been served.' };
  }
  return { ok: true };
}

/** Every item a diner can rate right now: served, and not yet rated on this order. */
export function reviewableItems(order: Order): OrderItem[] {
  return order.items.filter((item) => reviewEligibility(order, item.dishId).ok);
}

export function needsReview(order: Order): boolean {
  return reviewableItems(order).length > 0;
}

/**
 * Newest open ticket, with food that's actually ready jumping the line;
 * next, an open order that already has something served and waiting on a
 * rating — that's an action item even while the rest of the table's order
 * keeps cooking. After that, any other open ticket, then a finished order
 * still owed a rating.
 */
export function followOrder(orders: Order[]): Order | null {
  const open = orders.filter((o) => isOpenOrder(o.status));
  return open.find((o) => o.status === 'READY') ?? open.find(needsReview) ?? open[0] ?? orders.find(needsReview) ?? null;
}

/* ── What needs a human right now ───────────────────────────────────
   A pass at seven on a Friday is twenty tickets deep and nobody has time
   to read them. These rules turn "read every card" into "look at the ones
   that are lit": each is a clock that has run too long somewhere a human
   was supposed to act. Thresholds are minutes, and every one of them is a
   moment where food or a diner is already waiting.                      */

export const FOCUS_MINUTES = {
  /** A new ticket nobody has accepted. */
  accept: 5,
  /** Accepted, but not one item has been started. */
  start: 4,
  /** A single dish that has been on the grill this long. */
  prep: 18,
  /** Plated food sitting on the pass, going cold. */
  serve: 5,
} as const;

/** `warn` is "look at this next"; `critical` is "look at this now" — twice the patience spent. */
export type FocusLevel = 'warn' | 'critical';

export interface Focus {
  level: FocusLevel;
  /** One line, already phrased for a person standing at the pass. */
  reason: string;
  /** Higher sorts first. Lets a lane put the loudest ticket at the top without re-deriving why. */
  rank: number;
}

export function minutesSince(iso: string, now: number = Date.now()): number {
  return Math.floor((now - Date.parse(iso)) / 60_000);
}

/** Past the threshold is a warning; past twice it, nobody is coming — escalate. */
function level(minutes: number, threshold: number): FocusLevel | null {
  if (minutes >= threshold * 2) return 'critical';
  if (minutes >= threshold) return 'warn';
  return null;
}

function focus(minutes: number, threshold: number, reason: (m: number) => string): Focus | null {
  const found = level(minutes, threshold);
  return found ? { level: found, reason: reason(minutes), rank: minutes / threshold } : null;
}

/**
 * Why one dish is asking for attention, independent of its ticket — the row
 * is where the fix actually happens, so the row carries its own flag.
 */
export function itemFocus(item: OrderItem, order: Pick<Order, 'acceptedAt'>, now: number = Date.now()): Focus | null {
  if (item.status === 'CANCELLED' || item.status === 'SERVED') return null;
  const waited = minutesSince(item.statusUpdatedAt, now);

  if (item.status === 'READY') return focus(waited, FOCUS_MINUTES.serve, (m) => `plated ${m}m ago`);
  if (item.status === 'PREPARING') return focus(waited, FOCUS_MINUTES.prep, (m) => `${m}m on the grill`);
  // A PENDING item is only late once the ticket itself has been accepted.
  if (!order.acceptedAt) return null;
  return focus(minutesSince(order.acceptedAt, now), FOCUS_MINUTES.start, (m) => `not started, ${m}m in`);
}

/**
 * The ticket's own flag: the single most urgent thing true about it. Food
 * already cooked outranks food not yet started, because the first is
 * spoiling and the second is only late.
 */
export function orderFocus(order: Order, now: number = Date.now()): Focus | null {
  if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return null;

  const live = billableItems(order.items);
  const candidates: (Focus | null)[] = [];

  // 1. Cooked food sitting on the pass.
  const plated = live.filter((i) => i.status === 'READY');
  if (plated.length > 0) {
    const waited = Math.max(...plated.map((i) => minutesSince(i.statusUpdatedAt, now)));
    candidates.push(
      focus(waited, FOCUS_MINUTES.serve, (m) =>
        plated.length === live.length ? `Ready ${m}m ago — not served` : `${plated.length} plated ${m}m ago`,
      ),
    );
  }

  // 2. A ticket nobody has accepted.
  if (!order.acceptedAt) {
    candidates.push(focus(minutesSince(order.createdAt, now), FOCUS_MINUTES.accept, (m) => `Waiting ${m}m to be accepted`));
  } else if (live.every((i) => i.status === 'PENDING')) {
    // 3. Accepted, but the kitchen has not picked up a single dish.
    candidates.push(focus(minutesSince(order.acceptedAt, now), FOCUS_MINUTES.start, (m) => `Accepted ${m}m ago, nothing started`));
  }

  // 4. One dish holding the whole table up.
  const cooking = live.filter((i) => i.status === 'PREPARING');
  if (cooking.length > 0) {
    const slowest = cooking.reduce((a, b) => (Date.parse(a.statusUpdatedAt) <= Date.parse(b.statusUpdatedAt) ? a : b));
    candidates.push(
      focus(minutesSince(slowest.statusUpdatedAt, now), FOCUS_MINUTES.prep, (m) => `${slowest.dishNameSnapshot} — ${m}m on the grill`),
    );
  }

  const found = candidates.filter((c): c is Focus => c !== null);
  if (found.length === 0) return null;
  // Order of the list above is the tie-break: the earlier reason is the worse one.
  return found.reduce((worst, next) => (next.level === 'critical' && worst.level === 'warn' ? next : worst));
}

/** Where each live item has got to, for a one-glance progress bar. */
export function itemTally(order: Order): Record<ItemStatus, number> {
  const tally: Record<ItemStatus, number> = { PENDING: 0, PREPARING: 0, READY: 0, SERVED: 0, CANCELLED: 0 };
  for (const item of order.items) tally[item.status] += 1;
  return tally;
}

/**
 * Adding a dish always lands on the table's most recent order — that is what
 * the API does, and pretending otherwise would put food on the wrong ticket.
 * So only the newest ticket per table may offer it.
 */
export function newestOrderPerTable(orders: Order[]): Map<string, string> {
  const newest = new Map<string, Order>();
  for (const order of orders) {
    const held = newest.get(order.tableId);
    if (!held || Date.parse(order.createdAt) > Date.parse(held.createdAt)) newest.set(order.tableId, order);
  }
  return new Map([...newest].map(([tableId, order]) => [tableId, order.id]));
}

/**
 * Oldest first, except that anything overdue jumps the queue — a ticket that
 * is already late *is* the queue, whatever its age.
 */
export function byUrgencyThenAge(flags: Map<string, Focus>): (a: Order, b: Order) => number {
  const weight = (o: Order) => (flags.get(o.id)?.level === 'critical' ? 2 : flags.has(o.id) ? 1 : 0);
  return (a, b) => weight(b) - weight(a) || Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

/** Every ticket that is asking for a human, keyed by order id. */
export function focusMap(orders: Order[], now: number = Date.now()): Map<string, Focus> {
  const map = new Map<string, Focus>();
  for (const order of orders) {
    const found = orderFocus(order, now);
    if (found) map.set(order.id, found);
  }
  return map;
}
