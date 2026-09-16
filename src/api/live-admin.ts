import { nextStatus } from './admin';
import type { DishDraft } from './admin';
import type { Dish, DishStats, Menu, MenuCategory, Order, OrderStatus, Restaurant, StaffMember, StaffRole } from '../domain/types';
import { ApiError } from './store';
import { apiRequest } from './http';
import type { Paginated } from './http';
import { getSocket, joinRoom } from './socket';

/**
 * The manager-facing half of the real API, wired up so far: signing in, and
 * running the category list, the menu board and the order pass
 * (`/auth/staff/*`, `/restaurant/categories`, `/restaurant/dishes`,
 * `/restaurant/orders`, `/restaurant/profile`). Tables, reviews, settings and
 * the analytics history (`allOrders`) still come from `admin.ts` — they have
 * not been moved across yet.
 *
 * The mutation endpoints (create/update/archive/restore/reorder) return the
 * bare dish, without the stats block only `fetchAll`/`fetchById` compute — but
 * every screen that calls one of them reloads the whole menu afterward rather
 * than rendering the mutation's own response, so these resolve to `void`
 * rather than reconstructing a `Dish` with stats they don't have.
 */

const TOKEN_KEY = 'myfood.staff.token.v1';

function storeToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* a private-mode browser still gets to work this shift, just not past a reload */
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Called from sign-out regardless of source, so a stale token never outlives its session. */
export function signOut(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clean up */
  }
}

function authHeaders(): Record<string, string> {
  const token = readToken();
  if (!token) throw new ApiError(401, 'Your session has ended. Please sign in again.');
  return { authorization: `Bearer ${token}` };
}

/* ── Wire shapes ───────────────────────────────────────────────── */

interface ApiAuthProfile {
  id: string;
  name: string;
  email: string;
  memberId: string;
  restaurantId: string;
  role: StaffRole;
}

interface ApiAuthSession {
  accessToken: string;
  profile: ApiAuthProfile;
}

interface ApiRestaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  coverImageUrl: string | null;
  currency: string;
  timezone: string;
  serviceChargeRate: number;
  taxRate: number;
}

interface ApiCategory {
  id: string;
  restaurantId: string;
  name: string;
  emoji: string;
  sortOrder: number;
}

interface ApiDish {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  price: number;
  isAvailable: boolean;
  isArchived: boolean;
  isFeatured: boolean;
  sortOrder: number;
  spiceLevel: number;
  isVeg: boolean;
  stats: DishStats;
}

interface ApiOrderItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  imageUrlSnapshot: string | null;
  unitPrice: number;
  quantity: number;
  notes: string;
}

interface ApiOrder {
  id: string;
  reference: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  status: OrderStatus;
  items: ApiOrderItem[];
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewedDishIds: string[];
}

/* ── Mappers ───────────────────────────────────────────────────── */

function toStaff(profile: ApiAuthProfile): StaffMember {
  return {
    id: profile.memberId,
    restaurantId: profile.restaurantId,
    name: profile.name,
    email: profile.email,
    role: profile.role,
  };
}

function toRestaurant(api: ApiRestaurant): Restaurant {
  return {
    id: api.id,
    name: api.name,
    slug: api.slug,
    tagline: api.tagline,
    description: api.description,
    coverImageUrl: api.coverImageUrl ?? '',
    currency: api.currency,
    timezone: api.timezone,
    // The staff profile endpoint does not carry rating aggregates.
    avgRating: null,
    ratingCount: 0,
    serviceChargeRate: api.serviceChargeRate,
    taxRate: api.taxRate,
  };
}

function toCategory(api: ApiCategory): MenuCategory {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    name: api.name,
    emoji: api.emoji,
    sortOrder: api.sortOrder,
  };
}

function toDish(api: ApiDish, currency: string): Dish {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    categoryId: api.categoryId,
    name: api.name,
    slug: api.slug,
    description: api.description,
    imageUrl: api.imageUrl,
    price: api.price,
    currency,
    isAvailable: api.isAvailable,
    isArchived: api.isArchived,
    isFeatured: api.isFeatured,
    sortOrder: api.sortOrder,
    spiceLevel: api.spiceLevel as Dish['spiceLevel'],
    isVeg: api.isVeg,
    stats: api.stats,
  };
}

function toOrder(api: ApiOrder): Order {
  return {
    id: api.id,
    reference: api.reference,
    restaurantId: api.restaurantId,
    tableId: api.tableId,
    tableName: api.tableName,
    sessionId: api.sessionId,
    status: api.status,
    items: api.items.map((item) => ({
      id: item.id,
      dishId: item.dishId,
      dishNameSnapshot: item.dishNameSnapshot,
      imageUrlSnapshot: item.imageUrlSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
    })),
    subtotal: api.subtotal,
    serviceCharge: api.serviceCharge,
    tax: api.tax,
    discount: api.discount,
    total: api.total,
    currency: api.currency,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    completedAt: api.completedAt,
    reviewedDishIds: api.reviewedDishIds,
  };
}

/* ── Auth ──────────────────────────────────────────────────────── */

export async function signIn(email: string, pin: string): Promise<StaffMember> {
  const session = await apiRequest<ApiAuthSession>('/auth/staff/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), pin: pin.trim() }),
  });
  storeToken(session.accessToken);
  return toStaff(session.profile);
}

/* ── Menu ──────────────────────────────────────────────────────── */

const CATEGORY_ERROR = 'That category no longer exists.';
const DISH_ERROR = 'That dish is not on the menu.';

async function fetchCategories(): Promise<MenuCategory[]> {
  const page = await apiRequest<Paginated<ApiCategory>>('/restaurant/categories?limit=0', {
    headers: authHeaders(),
  });
  return page.rows.map(toCategory).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Archived dishes included — unlike the diner menu, the dashboard needs to see them too. */
async function fetchDishes(): Promise<ApiDish[]> {
  const page = await apiRequest<Paginated<ApiDish>>('/restaurant/dishes?limit=0', {
    headers: authHeaders(),
  });
  return page.rows;
}

export async function adminMenu(): Promise<Menu> {
  const [restaurant, categories, dishes] = await Promise.all([
    apiRequest<ApiRestaurant>('/restaurant/profile', { headers: authHeaders() }),
    fetchCategories(),
    fetchDishes(),
  ]);
  const mapped = toRestaurant(restaurant);
  return {
    restaurant: mapped,
    categories,
    dishes: dishes.map((dish) => toDish(dish, mapped.currency)).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function createCategory(name: string, emoji: string): Promise<MenuCategory> {
  // The backend defaults a bare sortOrder to 0, which would land a new category
  // at the front rather than the end — computed and sent explicitly instead.
  const existing = await fetchCategories();
  const sortOrder = Math.max(-1, ...existing.map((c) => c.sortOrder)) + 1;

  const category = await apiRequest<ApiCategory>('/restaurant/categories', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name.trim(), emoji: emoji.trim() || '🍽️', sortOrder }),
  });
  return toCategory(category);
}

export async function renameCategory(categoryId: string, name: string, emoji: string): Promise<MenuCategory> {
  const category = await apiRequest<ApiCategory>(`/restaurant/categories/${encodeURIComponent(categoryId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ name: name.trim(), ...(emoji.trim() ? { emoji: emoji.trim() } : null) }),
  });
  return toCategory(category);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await apiRequest<null>(`/restaurant/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

/** Swaps this category's sort position with its neighbour in the given direction. */
export async function moveCategory(categoryId: string, direction: -1 | 1): Promise<void> {
  const ordered = await fetchCategories();
  const index = ordered.findIndex((c) => c.id === categoryId);
  if (index < 0) throw new ApiError(404, CATEGORY_ERROR);
  const swapWith = ordered[index + direction];
  if (!swapWith) return;
  const current = ordered[index];

  await apiRequest<ApiCategory[]>('/restaurant/categories/reorder', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({
      items: [
        { id: current.id, sortOrder: swapWith.sortOrder },
        { id: swapWith.id, sortOrder: current.sortOrder },
      ],
    }),
  });
}

/* ── Dishes ────────────────────────────────────────────────────── */

function dishBody(draft: Partial<DishDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (draft.categoryId !== undefined) body.categoryId = draft.categoryId;
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.description !== undefined) body.description = draft.description.trim();
  if (draft.imageUrl !== undefined) body.imageUrl = draft.imageUrl;
  if (draft.price !== undefined) body.price = draft.price;
  if (draft.isVeg !== undefined) body.isVeg = draft.isVeg;
  if (draft.spiceLevel !== undefined) body.spiceLevel = draft.spiceLevel;
  if (draft.isAvailable !== undefined) body.isAvailable = draft.isAvailable;
  if (draft.isFeatured !== undefined) body.isFeatured = draft.isFeatured;
  return body;
}

export async function createDish(draft: DishDraft): Promise<void> {
  await apiRequest<ApiDish>('/restaurant/dishes', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(dishBody(draft)),
  });
}

export async function updateDish(dishId: string, patch: Partial<DishDraft>): Promise<void> {
  await apiRequest<ApiDish>(`/restaurant/dishes/${encodeURIComponent(dishId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(dishBody(patch)),
  });
}

export async function setDishArchived(dishId: string, archived: boolean): Promise<void> {
  await apiRequest<ApiDish>(`/restaurant/dishes/${encodeURIComponent(dishId)}/${archived ? 'archive' : 'restore'}`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

/** Moves a dish one place within its own category, mirroring the mock's rule. */
export async function moveDish(dishId: string, direction: -1 | 1): Promise<void> {
  const dishes = await fetchDishes();
  const dish = dishes.find((d) => d.id === dishId);
  if (!dish) throw new ApiError(404, DISH_ERROR);

  const siblings = dishes
    .filter((d) => d.categoryId === dish.categoryId && !d.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((d) => d.id === dishId);
  const swapWith = siblings[index + direction];
  if (!swapWith) return;

  await apiRequest<ApiDish[]>('/restaurant/dishes/reorder', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({
      items: [
        { id: dish.id, sortOrder: swapWith.sortOrder },
        { id: swapWith.id, sortOrder: dish.sortOrder },
      ],
    }),
  });
}

/* ── Orders ────────────────────────────────────────────────────── */

/**
 * The pass polls this every few seconds, so it reads the most recent slice
 * rather than the whole order history — `allOrders` (still `admin.ts`,
 * reporting only) is the one that needs every order there has ever been.
 */
const QUEUE_LIMIT = 100;

export async function listQueue(): Promise<Order[]> {
  const page = await apiRequest<Paginated<ApiOrder>>(`/restaurant/orders?limit=${QUEUE_LIMIT}`, {
    headers: authHeaders(),
  });
  return page.rows.map(toOrder);
}

/** `expected` is the status the UI last saw; the actual next step is read off the same table the server enforces. */
export async function advanceOrder(orderId: string, expected: OrderStatus): Promise<Order> {
  const to = nextStatus(expected);
  if (!to) throw new ApiError(409, 'This order is already finished.');

  const order = await apiRequest<ApiOrder>(`/restaurant/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: to }),
  });
  return toOrder(order);
}

export async function rejectOrder(orderId: string, reason: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(`/restaurant/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return toOrder(order);
}

/**
 * §38 — the pass's realtime feed, replacing its 8-second poll. `onCreated`
 * fires for a brand-new ticket, `onUpdated` for a status change or
 * cancellation; `onResync` fires on every (re)join so the caller can refetch
 * the whole queue once over HTTP, covering the initial load and anything
 * missed while disconnected. A signed-out tab has no token to authenticate
 * with, so this is a no-op until the next sign-in.
 */
export function subscribeToQueue(onCreated: (order: Order) => void, onUpdated: (order: Order) => void, onResync: () => void): () => void {
  const token = readToken();
  if (!token) return () => {};

  const socket = getSocket();
  const handleCreated = (api: ApiOrder) => onCreated(toOrder(api));
  const handleUpdated = (api: ApiOrder) => onUpdated(toOrder(api));
  socket.on('order.created', handleCreated);
  socket.on('order.updated', handleUpdated);

  const leaveRoom = joinRoom('subscribe:queue', { token }, onResync);

  return () => {
    socket.off('order.created', handleCreated);
    socket.off('order.updated', handleUpdated);
    leaveRoom();
  };
}
