import type { CreateOrderInput } from './client';
import type { ReviewDraft } from './client';
import type { CartLine, DiningSession, DiningTable, Dish, DishStats, Menu, MenuCategory, Order, Restaurant, Review } from '../domain/types';
import { apiRequest } from './http';
import type { Paginated } from './http';
import { getSocket, joinRoom } from './socket';

/**
 * The diner-facing half of the real API (`/api/v1/public/*` plus `/orders`),
 * mapped onto the domain types the screens already speak.
 *
 * There is still no diner-facing whole-order cancel (only staff at
 * `/restaurant/orders/:id/cancel` can void an entire ticket) — but diners can
 * cancel a single not-yet-started item via `cancelOrderItem`, below.
 *
 * Two shapes differ from the wire and are reconciled in the mappers below:
 * currency lives on the restaurant rather than the dish, and the server also
 * computes merchandising badges, which the app currently derives itself in
 * `domain/metrics.ts`.
 */

export const SESSION_TOKEN_HEADER = 'x-session-token';

/* ── Wire shapes ───────────────────────────────────────────────── */

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
  avgRating?: number | null;
  ratingCount?: number;
}

interface ApiTable {
  id: string;
  restaurantId: string;
  currentSessionId: string | null;
  name: string;
  qrToken: string;
  capacity: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

interface ApiSession {
  id: string;
  restaurantId: string;
  tableId: string;
  anonymousSessionToken: string;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
}

interface ApiResolvedSession {
  session: ApiSession;
  table: ApiTable;
}

function toResolvedSession(api: ApiResolvedSession): ResolvedSession {
  return {
    table: toTable(api.table),
    session: toSession(api.session),
  };
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

interface ApiMenu {
  restaurant: ApiRestaurant;
  categories: ApiCategory[];
  dishes: ApiDish[];
}

interface ApiReview {
  id: string;
  dishId: string;
  orderId: string;
  overall: number;
  taste: number;
  portion: number;
  value: number;
  wouldOrderAgain: boolean;
  comment: string;
  tags: string[];
  createdAt: string;
}

interface ApiOrderItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  imageUrlSnapshot: string | null;
  unitPrice: number;
  quantity: number;
  notes: string;
  status: Order['items'][number]['status'];
  statusUpdatedAt: string;
}

interface ApiOrder {
  id: string;
  reference: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  status: Order['status'];
  acceptedAt: string | null;
  cancelledAt: string | null;
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

function toRestaurant(api: ApiRestaurant): Restaurant {
  return {
    id: api.id,
    name: api.name,
    slug: api.slug,
    tagline: api.tagline,
    description: api.description,
    // The menu screen falls back to a plain surface when a restaurant has no cover.
    coverImageUrl: api.coverImageUrl ?? '',
    currency: api.currency,
    timezone: api.timezone,
    avgRating: api.avgRating ?? null,
    ratingCount: api.ratingCount ?? 0,
    serviceChargeRate: api.serviceChargeRate,
    taxRate: api.taxRate,
  };
}

function toTable(api: ApiTable): DiningTable {
  return {
    id: api.id,
    currentSessionId: api.currentSessionId,
    currentSessionToken: null,
    restaurantId: api.restaurantId,
    name: api.name,
    qrToken: api.qrToken,
    capacity: api.capacity,
    isActive: api.isActive,
    sortOrder: api.sortOrder,
    createdAt: api.createdAt,
  };
}

function toSession(api: ApiSession): DiningSession {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    tableId: api.tableId,
    anonymousSessionToken: api.anonymousSessionToken,
    startedAt: api.startedAt,
    expiresAt: api.expiresAt,
    endedAt: api.endedAt,
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

function toReview(api: ApiReview): Review {
  return {
    id: api.id,
    dishId: api.dishId,
    orderId: api.orderId,
    overall: api.overall,
    taste: api.taste,
    portion: api.portion,
    value: api.value,
    wouldOrderAgain: api.wouldOrderAgain,
    comment: api.comment,
    tags: api.tags,
    createdAt: api.createdAt,
    verified: true,
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
    acceptedAt: api.acceptedAt,
    cancelledAt: api.cancelledAt,
    items: api.items.map((item) => ({
      id: item.id,
      dishId: item.dishId,
      dishNameSnapshot: item.dishNameSnapshot,
      imageUrlSnapshot: item.imageUrlSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      notes: item.notes,
      status: item.status,
      statusUpdatedAt: item.statusUpdatedAt,
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

/* ── Table session ─────────────────────────────────────────────
   The session token is the diner's whole identity, so it is kept per
   restaurant+table: reopening the tab mid-meal resumes the same visit
   instead of opening a second one.                                    */

const sessionKey = (slug: string, tableToken: string) => `myfood.session.${slug}.${tableToken}`;

interface StoredSession {
  token: string;
  expiresAt: string;
}

function readStoredToken(slug: string, tableToken: string): string | null {
  try {
    const raw = localStorage.getItem(sessionKey(slug, tableToken));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredSession;
    return new Date(stored.expiresAt).getTime() > Date.now() ? stored.token : null;
  } catch {
    return null;
  }
}

function storeToken(slug: string, tableToken: string, session: ApiSession): void {
  try {
    const stored: StoredSession = { token: session.anonymousSessionToken, expiresAt: session.expiresAt };
    localStorage.setItem(sessionKey(slug, tableToken), JSON.stringify(stored));
  } catch {
    /* storage full or blocked — the session then lasts only this page load */
  }
}

function forgetToken(slug: string, tableToken: string): void {
  try {
    localStorage.removeItem(sessionKey(slug, tableToken));
  } catch {
    /* nothing to clean up */
  }
}

/** The header ordering and reviewing will need once they are wired up too. */
export function sessionToken(slug: string, tableToken: string): string | null {
  return readStoredToken(slug, tableToken);
}

/* ── Endpoints ─────────────────────────────────────────────────── */

interface ResolvedSession {
  table: DiningTable;
  session: DiningSession;
}

/**
 * Two callers racing here (React StrictMode's dev double-effect is the usual
 * culprit, two tabs opened at once is the real-world one) must not each open
 * their own session — both would call `resolveQr` finding no stored token yet,
 * `POST` a session of their own, and only one of those tokens survives in
 * `localStorage`. Whichever caller's component state ends up holding the
 * orphaned one would then place an order the other session's token can never
 * fetch back. Keyed on the pending session itself, not the request, so both
 * callers share the one in-flight resolution instead of racing.
 */
const pendingSessions = new Map<string, Promise<ResolvedSession>>();

export function resolveQr(restaurantSlug: string, tableToken: string): Promise<ResolvedSession> {
  const key = `${restaurantSlug}:${tableToken}`;
  const pending = pendingSessions.get(key);
  if (pending) return pending;

  const resolved = resolveQrUncached(restaurantSlug, tableToken).finally(() => pendingSessions.delete(key));
  pendingSessions.set(key, resolved);
  return resolved;
}

async function resolveQrUncached(restaurantSlug: string, tableToken: string): Promise<ResolvedSession> {
  const existing = readStoredToken(restaurantSlug, tableToken);

  if (existing) {
    try {
      const resumed = await apiRequest<ApiResolvedSession>('/public/sessions/current', {
        headers: { [SESSION_TOKEN_HEADER]: existing },
      });
      return toResolvedSession(resumed);
    } catch {
      // Ended, expired or wiped server-side: open a fresh one below.
      forgetToken(restaurantSlug, tableToken);
    }
  }

  const opened = await apiRequest<ApiResolvedSession>('/public/sessions', {
    method: 'POST',
    body: JSON.stringify({ restaurantSlug, tableToken }),
  });

  storeToken(restaurantSlug, tableToken, opened.session);

  return toResolvedSession(opened);
}

export async function joinTableSession(
  restaurantSlug: string,
  tableToken: string,
  joinToken: string,
): Promise<ResolvedSession> {
  const joined = await apiRequest<ApiResolvedSession>('/public/sessions', {
    method: 'POST',
    body: JSON.stringify({ restaurantSlug, tableToken, joinSessionId: joinToken }),
  });
  storeToken(restaurantSlug, tableToken, joined.session);
  return toResolvedSession(joined);
}

/**
 * The QR entry screen's target. There is deliberately no public endpoint that
 * hands out table tokens — the token is what makes a printed code a credential
 * (§53) — so against a real backend it comes from the environment. Null when it
 * has not been configured, which the screen says out loud rather than sending
 * the diner to a dead table.
 */
export function demoEntry(): { slug: string; tableToken: string } | null {
  const slug = import.meta.env?.VITE_DEMO_SLUG;
  const tableToken = import.meta.env?.VITE_DEMO_TABLE_TOKEN;
  return slug && tableToken ? { slug, tableToken } : null;
}

/** Rating aggregates only come with the menu, so this one reports none. */
export async function getRestaurant(restaurantSlug: string): Promise<Restaurant> {
  return toRestaurant(await apiRequest<ApiRestaurant>(`/public/restaurants/${encodeURIComponent(restaurantSlug)}`));
}

export async function getMenu(restaurantSlug: string): Promise<Menu> {
  const menu = await apiRequest<ApiMenu>(`/public/restaurants/${encodeURIComponent(restaurantSlug)}/menu`);
  const restaurant = toRestaurant(menu.restaurant);

  return {
    restaurant,
    categories: [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder).map(toCategory),
    // Archived dishes never reach this endpoint; unavailable ones do, because
    // "sold out" is information a diner wants.
    dishes: menu.dishes.map((dish) => toDish(dish, restaurant.currency)),
  };
}

/** Currency comes from the menu the diner is already looking at. */
export async function getDish(dishId: string, currency: string): Promise<Dish> {
  const dish = await apiRequest<ApiDish>(`/public/dishes/${encodeURIComponent(dishId)}`);
  return toDish(dish, currency);
}

const REVIEW_PAGE_SIZE = 50;

export async function getDishReviews(dishId: string): Promise<Review[]> {
  const page = await apiRequest<Paginated<ApiReview>>(
    `/public/dishes/${encodeURIComponent(dishId)}/reviews?limit=${REVIEW_PAGE_SIZE}&sortBy=createdAt&sortOrder=desc`,
  );
  return page.rows.map(toReview);
}

export async function submitReviews(orderId: string, sessionToken: string, drafts: ReviewDraft[]): Promise<Order> {
  for (const draft of drafts) {
    await apiRequest('/reviews', {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: sessionToken },
      body: JSON.stringify({
        orderId,
        dishId: draft.dishId,
        overall: draft.overall,
        taste: draft.taste,
        portion: draft.portion,
        value: draft.value,
        wouldOrderAgain: draft.wouldOrderAgain,
        comment: draft.comment.trim() || undefined,
        tags: draft.tags.length ? draft.tags : undefined,
      }),
    });
  }
  return getOrder(orderId, sessionToken);
}

/* ── Orders ────────────────────────────────────────────────────── */

export async function createOrder({ session, lines, idempotencyKey }: CreateOrderInput): Promise<Order> {
  const order = await apiRequest<ApiOrder>('/orders', {
    method: 'POST',
    headers: {
      [SESSION_TOKEN_HEADER]: session.anonymousSessionToken,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      lines: lines.map((line: CartLine) => ({ dishId: line.dishId, quantity: line.quantity, note: line.note })),
    }),
  });
  return toOrder(order);
}

/** The diner's own session token authorises this — never an account. */
export async function getOrder(orderId: string, sessionToken: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(`/orders/${encodeURIComponent(orderId)}`, {
    headers: { [SESSION_TOKEN_HEADER]: sessionToken },
  });
  return toOrder(order);
}

/** The diner cancelling one not-yet-started dish — the diner's own session token authorises this, never an account. */
export async function cancelOrderItem(orderId: string, itemId: string, sessionToken: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(
    `/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/cancel`,
    {
      method: 'POST',
      headers: { [SESSION_TOKEN_HEADER]: sessionToken },
    },
  );
  return toOrder(order);
}

/** §21 — every order this table has placed this visit. Scoped server-side to the session behind the token. */
export async function getSessionOrders(sessionToken: string): Promise<Order[]> {
  const page = await apiRequest<Paginated<ApiOrder>>('/orders?limit=0', {
    headers: { [SESSION_TOKEN_HEADER]: sessionToken },
  });
  return page.rows.map(toOrder);
}

/**
 * §38 — visit-level realtime feed, replacing the status-screen poll. The
 * server only pushes changes, so `onResync` (fired on every join, including
 * the first) is the caller's cue to fetch the current state once over HTTP —
 * covering both the initial load and anything missed while disconnected.
 */
export function subscribeToOrder(orderId: string, sessionToken: string, onUpdate: (order: Order) => void, onResync: () => void): () => void {
  const socket = getSocket();
  const handleUpdate = (api: ApiOrder) => {
    if (api.id === orderId) onUpdate(toOrder(api));
  };
  socket.on('order.updated', handleUpdate);

  const leaveRoom = joinRoom('subscribe:order', { orderId, sessionToken }, onResync);

  return () => {
    socket.off('order.updated', handleUpdate);
    leaveRoom();
  };
}

/**
 * Read-only recheck of a session already in hand — never opens a new one.
 * `/public/sessions/current` throws once a session has ended or expired, so
 * that alone is the signal; used both for `subscribeToSessionEnd`'s own
 * reconnect catch-up below and, in mock mode, the plain poll that stands in
 * for it (see `RestaurantLayout.tsx`).
 */
export async function isSessionOpen(session: DiningSession): Promise<boolean> {
  try {
    await apiRequest<ApiResolvedSession>('/public/sessions/current', {
      headers: { [SESSION_TOKEN_HEADER]: session.anonymousSessionToken },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * §22/§38 — the one channel that reaches a diner whether or not they have an
 * order open yet: staff can close a table out from under someone who is
 * still just browsing the menu. `onResync` re-checks over HTTP on every
 * (re)join, covering anything missed while disconnected — the same
 * discipline `subscribeToOrder` follows above.
 */
export function subscribeToSessionEnd(session: DiningSession, onEnded: () => void): () => void {
  const socket = getSocket();
  const handleEnded = () => onEnded();
  socket.on('session.ended', handleEnded);

  const leaveRoom = joinRoom('subscribe:session', { sessionToken: session.anonymousSessionToken }, () => {
    void isSessionOpen(session).then((open) => {
      if (!open) onEnded();
    });
  });

  return () => {
    socket.off('session.ended', handleEnded);
    leaveRoom();
  };
}
