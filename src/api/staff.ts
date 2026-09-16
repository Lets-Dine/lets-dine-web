import type { Menu, MenuCategory, Order, OrderStatus, StaffMember } from '../domain/types';
import * as mock from './admin';
import type { DishDraft } from './admin';
import { IS_LIVE_API } from './http';
import * as live from './live-admin';

/**
 * The manager-facing reads/writes that have a real backend behind them so
 * far: signing in, and running the category list, the menu board and the
 * order pass. Screens import from here so neither the mock nor the live
 * implementation has to know about the other.
 *
 * Tables, reviews and settings still come from `admin.ts` directly; they have
 * not been moved across yet. So does `allOrders` (the 90-day history behind
 * Dashboard/Analytics) — the live queue below deliberately reads only the
 * recent slice a pass needs, not a full reporting history.
 */

export function signIn(email: string, pin: string): Promise<StaffMember> {
  return IS_LIVE_API ? live.signIn(email, pin) : mock.signIn(email, pin);
}

/** Clears whatever credential the active source holds. Safe to call from either mode. */
export function signOut(): void {
  live.signOut();
}

export function adminMenu(actor: StaffMember): Promise<Menu> {
  return IS_LIVE_API ? live.adminMenu() : mock.adminMenu(actor);
}

export function createCategory(actor: StaffMember, name: string, emoji: string): Promise<MenuCategory> {
  return IS_LIVE_API ? live.createCategory(name, emoji) : mock.createCategory(actor, name, emoji);
}

export function renameCategory(actor: StaffMember, categoryId: string, name: string, emoji: string): Promise<MenuCategory> {
  return IS_LIVE_API ? live.renameCategory(categoryId, name, emoji) : mock.renameCategory(actor, categoryId, name, emoji);
}

export function deleteCategory(actor: StaffMember, categoryId: string): Promise<void> {
  return IS_LIVE_API ? live.deleteCategory(categoryId) : mock.deleteCategory(actor, categoryId);
}

export function moveCategory(actor: StaffMember, categoryId: string, direction: -1 | 1): Promise<void> {
  return IS_LIVE_API ? live.moveCategory(categoryId, direction) : mock.moveCategory(actor, categoryId, direction);
}

export function createDish(actor: StaffMember, draft: DishDraft) {
  return IS_LIVE_API ? live.createDish(draft) : mock.createDish(actor, draft);
}

export function updateDish(actor: StaffMember, dishId: string, patch: Partial<DishDraft>) {
  return IS_LIVE_API ? live.updateDish(dishId, patch) : mock.updateDish(actor, dishId, patch);
}

export function setDishArchived(actor: StaffMember, dishId: string, archived: boolean) {
  return IS_LIVE_API ? live.setDishArchived(dishId, archived) : mock.setDishArchived(actor, dishId, archived);
}

export function moveDish(actor: StaffMember, dishId: string, direction: -1 | 1) {
  return IS_LIVE_API ? live.moveDish(dishId, direction) : mock.moveDish(actor, dishId, direction);
}

export function listQueue(actor: StaffMember): Promise<Order[]> {
  return IS_LIVE_API ? live.listQueue() : mock.listQueue(actor);
}

export function advanceOrder(actor: StaffMember, orderId: string, expected: OrderStatus): Promise<Order> {
  return IS_LIVE_API ? live.advanceOrder(orderId, expected) : mock.advanceOrder(actor, orderId, expected);
}

export function rejectOrder(actor: StaffMember, orderId: string, reason: string): Promise<Order> {
  return IS_LIVE_API ? live.rejectOrder(orderId, reason) : mock.rejectOrder(actor, orderId, reason);
}

/** No-op in mock mode — `AdminLayout.tsx` falls back to its own polling interval when this does nothing. */
export function subscribeToQueue(onCreated: (order: Order) => void, onUpdated: (order: Order) => void, onResync: () => void): () => void {
  if (!IS_LIVE_API) return () => {};
  return live.subscribeToQueue(onCreated, onUpdated, onResync);
}
