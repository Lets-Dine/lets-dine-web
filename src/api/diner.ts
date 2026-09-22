import type { CreateOrderInput, ReviewDraft } from './client';
import type { DiningSession, Dish, Menu, Order, Restaurant, Review } from '../domain/types';
import * as mock from './client';
import { IS_LIVE_API } from './http';
import * as live from './live';

/**
 * The public diner reads and ordering, from whichever source is configured:
 * the real backend when `VITE_API_URL` is set, the in-browser stand-in
 * otherwise. Screens import from here so neither one has to know which is
 * answering.
 *
 * Whole-order cancel stays mock-only (`OrderStatus.tsx` hides that control
 * live — only staff can void an entire ticket, per the server). Per-item
 * cancel is live-aware, below: a diner can still cancel one not-yet-started
 * dish either way. Reviews go through here and hit `POST /reviews` live.
 *
 * `subscribeToOrder` is used by the visit-level watcher so a diner who leaves
 * the status screen still hears every status change. Mock mode has no server
 * to push from, so that watcher polls `getSessionOrders` instead.
 */

/**
 * Where the QR entry screen's "Open the menu" leads. Live, that is the table
 * named in `.env`; on the stand-in it is the seeded demo table — never a mix of
 * the two, which would hand one source the other's table token.
 */
export function demoEntry(): { slug: string; tableToken: string } | null {
  return IS_LIVE_API ? live.demoEntry() : mock.demoEntry();
}

export function getRestaurant(restaurantSlug: string): Promise<Restaurant> {
  return IS_LIVE_API ? live.getRestaurant(restaurantSlug) : mock.getRestaurant(restaurantSlug);
}

export function resolveQr(restaurantSlug: string, tableToken: string) {
  return IS_LIVE_API ? live.resolveQr(restaurantSlug, tableToken) : mock.resolveQr(restaurantSlug, tableToken);
}

export function joinTableSession(restaurantSlug: string, tableToken: string, joinToken: string) {
  return IS_LIVE_API
    ? live.joinTableSession(restaurantSlug, tableToken, joinToken)
    : mock.resolveQr(restaurantSlug, tableToken, joinToken);
}

export function getMenu(restaurantSlug: string): Promise<Menu> {
  return IS_LIVE_API ? live.getMenu(restaurantSlug) : mock.getMenu(restaurantSlug);
}

/** `currency` is only needed live, where it lives on the restaurant, not the dish. */
export function getDish(dishId: string, currency: string): Promise<Dish> {
  return IS_LIVE_API ? live.getDish(dishId, currency) : mock.getDish(dishId);
}

export function getDishReviews(dishId: string): Promise<Review[]> {
  return IS_LIVE_API ? live.getDishReviews(dishId) : mock.getDishReviews(dishId);
}

export function createOrder(input: CreateOrderInput): Promise<Order> {
  return IS_LIVE_API ? live.createOrder(input) : mock.createOrder(input);
}

/** `sessionToken` is only used live — the mock reads its own local store instead. */
export function getOrder(orderId: string, sessionToken: string): Promise<Order> {
  return IS_LIVE_API ? live.getOrder(orderId, sessionToken) : mock.getOrder(orderId);
}

/** The diner cancelling a single not-yet-started dish. `sessionToken` is only used live. */
export function cancelOrderItem(orderId: string, itemId: string, sessionToken: string): Promise<Order> {
  return IS_LIVE_API ? live.cancelOrderItem(orderId, itemId, sessionToken) : mock.cancelOrderItem(orderId, itemId);
}

/** §21 — every order placed during this dining session, newest first. */
export function getSessionOrders(session: DiningSession): Promise<Order[]> {
  return IS_LIVE_API ? live.getSessionOrders(session.anonymousSessionToken) : mock.getSessionOrders(session.id);
}

/** `sessionToken` is only used live — the mock reads its own local store instead. */
export function submitReviews(orderId: string, drafts: ReviewDraft[], sessionToken: string) {
  return IS_LIVE_API ? live.submitReviews(orderId, sessionToken, drafts) : mock.submitReviews(orderId, drafts);
}

/** No-op in mock mode — the visit-level watcher falls back to polling session orders. */
export function subscribeToOrder(
  orderId: string,
  sessionToken: string,
  onUpdate: (order: Order) => void,
  onResync: () => void,
): () => void {
  if (!IS_LIVE_API) return () => {};
  return live.subscribeToOrder(orderId, sessionToken, onUpdate, onResync);
}

/** Read-only recheck of a session already in hand. Never opens a new one — see `RestaurantLayout.tsx`. */
export function isSessionOpen(session: DiningSession): Promise<boolean> {
  return IS_LIVE_API ? live.isSessionOpen(session) : mock.isSessionOpen(session);
}

/** No-op in mock mode — `RestaurantLayout.tsx` falls back to polling `isSessionOpen` when this does nothing. */
export function subscribeToSessionEnd(session: DiningSession, onEnded: () => void): () => void {
  if (!IS_LIVE_API) return () => {};
  return live.subscribeToSessionEnd(session, onEnded);
}
