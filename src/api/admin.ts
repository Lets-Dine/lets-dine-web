import { HISTORY_REF_CEILING, orderHistory } from '../data/history';
import { CATEGORIES, DISHES } from '../data/menu';
import { SEED_REVIEWS } from '../data/reviews';
import { DEMO_PIN, STAFF } from '../data/staff';
import { percentOf, sumLines } from '../domain/money';
import { ROLE_LABEL, can } from '../domain/permissions';
import type { Permission } from '../domain/permissions';
import type {
  AuditAction,
  AuditEntry,
  DiningTable,
  Dish,
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
      };
    });

    const placed = new Date(now - minutesAgo * 60_000);
    const subtotal = sumLines(items);
    const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
    const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);

    return {
      id: `ord_seed${i}`,
      reference: `#${++ref}`,
      restaurantId: restaurant.id,
      tableId: table.id,
      tableName: table.name,
      // Not one of this browser's dining sessions, so the demo kitchen leaves
      // these alone — they move when staff move them.
      sessionId: `ses_floor${i}`,
      status,
      items,
      subtotal,
      serviceCharge,
      tax,
      discount: 0,
      total: subtotal + serviceCharge + tax,
      currency: restaurant.currency,
      createdAt: placed.toISOString(),
      updatedAt: placed.toISOString(),
      completedAt: status === 'COMPLETED' ? new Date(placed.getTime() + 22 * 60_000).toISOString() : null,
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

/** Queue plus the ninety days behind it, for reporting rather than working. */
export async function allOrders(actor: StaffMember): Promise<Order[]> {
  authorize(actor, 'orders:view');
  const store = seedQueue(readStore());
  return [...orderHistory(), ...store.orders];
}

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'COMPLETED',
};

export const ADVANCE_LABEL: Partial<Record<OrderStatus, string>> = {
  PENDING: 'Accept',
  ACCEPTED: 'Start preparing',
  PREPARING: 'Mark ready',
  READY: 'Complete',
};

export function nextStatus(status: OrderStatus): OrderStatus | null {
  return NEXT_STATUS[status] ?? null;
}

/** Staff can still pull a ticket before it is plated; after that it is food. */
export function canCancel(status: OrderStatus): boolean {
  return status === 'PENDING' || status === 'ACCEPTED' || status === 'PREPARING';
}

export async function advanceOrder(actor: StaffMember, orderId: string, expected: OrderStatus): Promise<Order> {
  authorize(actor, 'orders:advance');
  await latency();
  const store = seedQueue(readStore());
  const order = store.orders.find((o) => o.id === orderId);
  if (!order) throw new ApiError(404, 'That order is no longer on the queue.');

  // Two tablets on the same pass will both press Accept. The second one loses.
  if (order.status !== expected)
    throw new ApiError(409, `${order.reference} already moved to ${STATUS_LABEL[order.status].toLowerCase()}.`);

  const to = nextStatus(order.status);
  if (!to) throw new ApiError(409, `${order.reference} is already finished.`);

  const now = new Date().toISOString();
  const updated: Order = {
    ...order,
    status: to,
    updatedAt: now,
    completedAt: to === 'COMPLETED' ? now : order.completedAt,
  };

  writeStore(
    record(
      { ...store, orders: store.orders.map((o) => (o.id === orderId ? updated : o)) },
      actor,
      'order_status_changed',
      `Order ${order.reference}`,
      `${STATUS_LABEL[order.status]} → ${STATUS_LABEL[to]}`,
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
  if (!canCancel(order.status)) throw new ApiError(409, 'That order has already left the kitchen.');

  const updated: Order = { ...order, status: 'CANCELLED', updatedAt: new Date().toISOString() };
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

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'New',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

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

export async function listTables(actor: StaffMember): Promise<DiningTable[]> {
  authorize(actor, 'tables:view');
  return [...tablesOf(readStore())].sort((a, b) => a.sortOrder - b.sortOrder);
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
  return after;
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
  return after;
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
  return after;
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
