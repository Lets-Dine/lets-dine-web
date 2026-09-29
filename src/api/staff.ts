import type { OrderComparison, Period, RevenueComparison } from '../domain/adminMetrics';
import type { AuditEntry, DiningTable, ItemStatus, Menu, MenuCategory, Order, Payment, PaymentMethod, Restaurant, StaffMember } from '../domain/types';
import * as mock from './admin';
import type { AddOnDraft, DishDraft, DishVariantDraft, SettingsPatch, StaffDraft } from './admin';
import { IS_LIVE_API } from './http';
import * as live from './live-admin';

export type { StaffDraft } from './admin';

/**
 * The manager-facing reads/writes that have a real backend behind them so
 * far: signing in, and running the category list, the menu board and the
 * order pass. Screens import from here so neither the mock nor the live
 * implementation has to know about the other.
 *
 * Reviews and settings still come from `admin.ts` directly; they have not
 * been moved across yet. So does `allOrders` (the 90-day history behind
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

/** §41 — the restaurant's own fee configuration and profile copy, never hardcoded in the app. */
export function updateSettings(actor: StaffMember, patch: SettingsPatch): Promise<Restaurant> {
  return IS_LIVE_API ? live.updateSettings(patch) : mock.updateSettings(actor, patch);
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

export function createAddOn(actor: StaffMember, draft: AddOnDraft) {
  return IS_LIVE_API ? live.createAddOn(draft) : mock.createAddOn(actor, draft);
}

export function updateAddOn(actor: StaffMember, addOnId: string, patch: Partial<AddOnDraft>) {
  return IS_LIVE_API ? live.updateAddOn(addOnId, patch) : mock.updateAddOn(actor, addOnId, patch);
}

export function setAddOnArchived(actor: StaffMember, addOnId: string, archived: boolean) {
  return IS_LIVE_API ? live.setAddOnArchived(addOnId, archived) : mock.setAddOnArchived(actor, addOnId, archived);
}

export function setDishAddOns(actor: StaffMember, dishId: string, addOnIds: string[]) {
  return IS_LIVE_API ? live.setDishAddOns(dishId, addOnIds) : mock.setDishAddOns(actor, dishId, addOnIds);
}

export function createDishVariant(actor: StaffMember, dishId: string, draft: DishVariantDraft) {
  return IS_LIVE_API ? live.createDishVariant(dishId, draft) : mock.createDishVariant(actor, dishId, draft);
}

export function updateDishVariant(actor: StaffMember, dishId: string, variantId: string, patch: Partial<DishVariantDraft>) {
  return IS_LIVE_API
    ? live.updateDishVariant(dishId, variantId, patch)
    : mock.updateDishVariant(actor, dishId, variantId, patch);
}

export function setDishVariantArchived(actor: StaffMember, dishId: string, variantId: string, archived: boolean) {
  return IS_LIVE_API
    ? live.setDishVariantArchived(dishId, variantId, archived)
    : mock.setDishVariantArchived(actor, dishId, variantId, archived);
}

export function listTables(actor: StaffMember): Promise<DiningTable[]> {
  return IS_LIVE_API ? live.listTables() : mock.listTables(actor);
}

export function createTable(actor: StaffMember, name: string, capacity: number): Promise<DiningTable> {
  return IS_LIVE_API ? live.createTable(name, capacity) : mock.createTable(actor, name, capacity);
}

export function updateTable(actor: StaffMember, tableId: string, patch: { name?: string; capacity?: number }): Promise<DiningTable> {
  return IS_LIVE_API ? live.updateTable(tableId, patch) : mock.updateTable(actor, tableId, patch);
}

export function setTableActive(actor: StaffMember, tableId: string, active: boolean): Promise<DiningTable> {
  return IS_LIVE_API ? live.setTableActive(tableId, active) : mock.setTableActive(actor, tableId, active);
}

export function regenerateQr(actor: StaffMember, tableId: string): Promise<DiningTable> {
  return IS_LIVE_API ? live.regenerateQr(tableId) : mock.regenerateQr(actor, tableId);
}

/** Seats a table on a diner's behalf — for a guest who can't or won't scan the QR themselves. */
export function startTableSession(actor: StaffMember, tableId: string): Promise<DiningTable> {
  return IS_LIVE_API ? live.startTableSession(tableId) : mock.startTableSession(actor, tableId);
}

export function endTableSession(actor: StaffMember, tableId: string): Promise<DiningTable> {
  return IS_LIVE_API ? live.endTableSession(tableId) : mock.endTableSession(actor, tableId);
}

export function listQueue(actor: StaffMember): Promise<Order[]> {
  return IS_LIVE_API ? live.listQueue() : mock.listQueue(actor);
}

export function fetchOrdersBySession(actor: StaffMember, sessionId: string): Promise<Order[]> {
  return IS_LIVE_API ? live.fetchOrdersBySession(sessionId) : mock.fetchOrdersBySession(actor, sessionId);
}

export function addOrderItem(actor: StaffMember, tableId: string, dishId: string): Promise<Order> {
  return IS_LIVE_API ? live.addOrderItem(tableId, dishId) : mock.addOrderItem(actor, tableId, dishId);
}

export function removeOrderItem(actor: StaffMember, orderId: string, itemId: string): Promise<Order> {
  return IS_LIVE_API ? live.removeOrderItem(orderId, itemId) : mock.removeOrderItem(actor, orderId, itemId);
}

export function settleTable(actor: StaffMember, tableId: string): Promise<Order[]> {
  return IS_LIVE_API ? live.settleTable(tableId) : mock.settleTable(actor, tableId);
}

export function completePayment(
  actor: StaffMember,
  sessionId: string,
  items: { dishId: string; quantity: number }[],
  method: PaymentMethod,
  discount: number,
  endSession: boolean,
): Promise<Payment> {
  return IS_LIVE_API
    ? live.completePayment(sessionId, items, method, discount, endSession)
    : mock.completePayment(actor, sessionId, items, method, discount, endSession);
}

export function listPayments(
  actor: StaffMember,
  offset?: number,
  limit?: number,
  query: { tableId?: string; from?: string; to?: string } = {},
): Promise<{ rows: Payment[]; count: number }> {
  return IS_LIVE_API ? live.listPayments(offset, limit, query) : mock.listPayments(actor, offset, limit, query);
}

export function getPayment(actor: StaffMember, paymentId: string): Promise<Payment> {
  return IS_LIVE_API ? live.getPayment(paymentId) : mock.getPayment(actor, paymentId);
}

export function acceptOrder(actor: StaffMember, orderId: string, expected: 'PENDING'): Promise<Order> {
  return IS_LIVE_API ? live.acceptOrder(orderId, expected) : mock.acceptOrder(actor, orderId, expected);
}

export function advanceOrderItem(actor: StaffMember, orderId: string, itemId: string, expected: ItemStatus): Promise<Order> {
  return IS_LIVE_API
    ? live.advanceOrderItem(orderId, itemId, expected)
    : mock.advanceOrderItem(actor, orderId, itemId, expected);
}

export function rejectOrder(actor: StaffMember, orderId: string, reason: string): Promise<Order> {
  return IS_LIVE_API ? live.rejectOrder(orderId, reason) : mock.rejectOrder(actor, orderId, reason);
}

/** Delivery-only: `READY -> OUT_FOR_DELIVERY`, the one manual hand-off between the kitchen and the door. */
export function advanceDeliveryOrder(actor: StaffMember, orderId: string, expected: 'READY'): Promise<Order> {
  return IS_LIVE_API ? live.advanceDeliveryOrder(orderId, expected) : mock.advanceDeliveryOrder(actor, orderId, expected);
}

/** Delivery's equivalent of settling a table — charges and completes this one order. */
export function settleDeliveryOrder(actor: StaffMember, orderId: string): Promise<Order> {
  return IS_LIVE_API ? live.settleDeliveryOrder(orderId) : mock.settleDeliveryOrder(actor, orderId);
}

/** No-op in mock mode — `AdminLayout.tsx` falls back to its own polling interval when this does nothing. */
export function subscribeToQueue(onCreated: (order: Order) => void, onUpdated: (order: Order) => void, onResync: () => void): () => void {
  if (!IS_LIVE_API) return () => {};
  return live.subscribeToQueue(onCreated, onUpdated, onResync);
}

/** No-op in mock mode — `Tables.tsx` falls back to its own polling interval when this does nothing. */
export function subscribeToTables(onUpdated: (table: DiningTable) => void, onResync: () => void): () => void {
  if (!IS_LIVE_API) return () => {};
  return live.subscribeToTables(onUpdated, onResync);
}

/** §51 — every management action, most recent first. */
export function listAudit(actor: StaffMember, limit = 80, offset = 0): Promise<{ rows: AuditEntry[]; count: number }> {
  return IS_LIVE_API ? live.listAudit(limit, offset) : mock.listAudit(actor, limit, offset);
}

/** §31 — settled-payment revenue for the period against the whole of the one before it. */
export function fetchRevenueComparison(actor: StaffMember, period: Period): Promise<RevenueComparison> {
  return IS_LIVE_API ? live.fetchRevenueComparison(period) : mock.fetchRevenueComparison(actor, period);
}

/** §31 — order count for the period against the whole of the one before it. */
export function fetchOrderComparison(actor: StaffMember, period: Period): Promise<OrderComparison> {
  return IS_LIVE_API ? live.fetchOrderComparison(period) : mock.fetchOrderComparison(actor, period);
}

/** §50 — the team roster, owner and manager down to whoever works the pass. */
export function listStaff(actor: StaffMember): Promise<StaffMember[]> {
  return IS_LIVE_API ? live.listStaff() : mock.listStaff(actor);
}

export function createStaffMember(actor: StaffMember, draft: StaffDraft): Promise<StaffMember> {
  return IS_LIVE_API ? live.createStaffMember(draft) : mock.createStaffMember(actor, draft);
}
