/** Money is always an integer count of minor units (paisa). Never a float. */
export type Minor = number;

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

/** An item's own progress through the kitchen — independent of its siblings. */
export type ItemStatus = 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';

export type DietaryType = 'VEG' | 'NON_VEG' | 'VEGAN' | 'HALAL';

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  coverImageUrl: string;
  currency: string;
  timezone: string;
  avgRating: number | null;
  ratingCount: number;
  /** Restaurant-level fee configuration — never hardcoded in the UI. */
  serviceChargeRate: number;
  taxRate: number;
}

export interface DiningTable {
  id: string;
  restaurantId: string;
  name: string;
  /** Opaque, printed on the table. Rotating it invalidates every printed QR. */
  qrToken: string;
  capacity: number;
  /** The open dining session at this table right now, if any. */
  currentSessionId: string | null;
  /** The current session's join code, if the read included it. */
  currentSessionToken: string | null;
  /** §16: a disabled table stops resolving its QR. */
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface DiningSession {
  id: string;
  restaurantId: string;
  tableId: string;
  anonymousSessionToken: string;
  startedAt: string;
  expiresAt: string;
  /** Set once staff clears the table (or a payment settles it) — null while the visit is still open. */
  endedAt: string | null;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  emoji: string;
  sortOrder: number;
}

export interface DishTagCount {
  tag: string;
  count: number;
}

/** Aggregated, server-computed review metrics for a dish. */
export interface DishStats {
  ratingCount: number;
  avgRating: number | null;
  taste: number | null;
  portion: number | null;
  value: number | null;
  /** Would-order-again share, 0..1. Null until there is enough signal. */
  recommendRate: number | null;
  /** Count of 1..5 star reviews, index 0 = 1 star. */
  distribution: [number, number, number, number, number];
  /** Orders in the trailing window and the window before it. */
  orders30d: number;
  ordersPrev30d: number;
  topTags: DishTagCount[];
}

export interface Dish {
  id: string;
  restaurantId: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  price: Minor;
  currency: string;
  isAvailable: boolean;
  /** §28: dishes with order history are archived, never hard-deleted. */
  isArchived: boolean;
  isFeatured: boolean;
  sortOrder: number;
  spiceLevel: 0 | 1 | 2 | 3;
  dietaryType: DietaryType;
  stats: DishStats;
  /** Add-ons a diner can pick for this dish — ids into `Menu.addOns`. */
  addOnIds: string[];
  /**
   * Required, single-choice size/style options (e.g. Small/Medium/Large), embedded in
   * full — deliberately NOT the `addOnIds`/`Menu.addOns` pattern, because a variant has
   * no cross-dish reuse case ("Large" on one dish is a different price/thing than
   * "Large" on another). A dish with any non-archived variant requires a diner to pick
   * exactly one; a dish with none prices off `price` exactly as it does today.
   */
  variants: DishVariant[];
}

/** A required, single-choice size/style option that replaces `Dish.price`, e.g. "Large". */
export interface DishVariant {
  id: string;
  name: string;
  price: Minor;
  currency: string;
  isAvailable: boolean;
  isArchived: boolean;
  sortOrder: number;
  spiceLevel: 0 | 1 | 2 | 3;
  dietaryType: DietaryType;
}

/** A priced extra a diner can attach to a dish, e.g. "Extra cheese". */
export interface AddOn {
  id: string;
  restaurantId: string;
  name: string;
  price: Minor;
  currency: string;
  isAvailable: boolean;
  /** Add-ons already ordered are archived, never hard-deleted — same rule as a dish. */
  isArchived: boolean;
  sortOrder: number;
}

export interface Review {
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
  /** Every displayed review is tied to a completed order. */
  verified: true;
}

export interface CartLine {
  dishId: string;
  quantity: number;
  note: string;
  /** The chosen size/style, if the dish has any — part of the line's identity, same reasoning as `addOnIds`. */
  variantId: string | null;
  /** Add-on ids selected for this line — part of the line's identity, so a differently-customized order of the same dish is a separate line. */
  addOnIds: string[];
}

/** A snapshot of one add-on as it was when the order was placed — never re-read from the live catalog. */
export interface OrderItemAddOn {
  addOnId: string;
  nameSnapshot: string;
  price: Minor;
}

export interface OrderItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  imageUrlSnapshot: string | null;
  /** Dish (or variant) price plus every selected add-on's price, snapshotted together. */
  unitPrice: Minor;
  quantity: number;
  notes: string;
  status: ItemStatus;
  statusUpdatedAt: string;
  addOns: OrderItemAddOn[];
  variantId: string | null;
  variantNameSnapshot: string | null;
  variantPriceSnapshot: Minor | null;
}

export type PaymentMethod = 'CASH' | 'CARD';

export interface PaymentItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  unitPrice: Minor;
  quantity: number;
}

/** A settled charge against a dining session — the record the till leaves behind once a table is paid. */
export interface Payment {
  id: string;
  restaurantId: string;
  sessionId: string;
  tableId: string;
  subtotal: Minor;
  serviceCharge: Minor;
  tax: Minor;
  discount: Minor;
  total: Minor;
  method: PaymentMethod;
  currency: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  items: PaymentItem[];
}

export interface Order {
  id: string;
  reference: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  /** Computed from `items` (plus `acceptedAt`/`cancelledAt`) — never assigned directly. See `domain/orderStatus.ts`. */
  status: OrderStatus;
  /** Set once, the one remaining whole-order transition. Items stay PENDING until each is started individually. */
  acceptedAt: string | null;
  /** Set only by a whole-order cancel (staff, and only while every item is still PENDING). */
  cancelledAt: string | null;
  items: OrderItem[];
  subtotal: Minor;
  serviceCharge: Minor;
  tax: Minor;
  discount: Minor;
  total: Minor;
  currency: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewedDishIds: string[];
}

export interface Menu {
  restaurant: Restaurant;
  categories: MenuCategory[];
  dishes: Dish[];
  addOns: AddOn[];
}

export type BadgeKind = 'popular' | 'loved' | 'trending' | 'gem' | 'value' | 'pick';

/* ── Restaurant side ────────────────────────────────────────────────
   Everything below is staff-facing. The diner app never imports it.  */

/** §50: OWNER has everything, MANAGER runs the restaurant, STAFF works orders. */
export type StaffRole = 'OWNER' | 'MANAGER' | 'STAFF';

export interface StaffMember {
  id: string;
  restaurantId: string;
  name: string;
  email: string;
  role: StaffRole;
}

/** §51: a management action worth being able to point at later. */
export interface AuditEntry {
  id: string;
  restaurantId: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: AuditAction;
  /** Human-readable target, e.g. "Chicken Sekuwa" or "Order #1023". */
  subject: string;
  /** What actually changed — before/after, already formatted for display. */
  detail: string;
  at: string;
}

export type AuditAction =
  | 'price_changed'
  | 'availability_changed'
  | 'dish_created'
  | 'dish_updated'
  | 'dish_archived'
  | 'dish_restored'
  | 'dish_featured'
  | 'dish_reordered'
  | 'dish_add_ons_updated'
  | 'dish_variant_created'
  | 'dish_variant_updated'
  | 'dish_variant_archived'
  | 'dish_variant_restored'
  | 'addon_created'
  | 'addon_updated'
  | 'addon_archived'
  | 'addon_restored'
  | 'category_created'
  | 'category_renamed'
  | 'category_deleted'
  | 'category_reordered'
  | 'table_created'
  | 'table_renamed'
  | 'table_disabled'
  | 'table_enabled'
  | 'table_session_started'
  | 'table_session_ended'
  | 'qr_regenerated'
  | 'order_status_changed'
  | 'order_cancelled'
  | 'order_item_added'
  | 'order_item_removed'
  | 'order_item_cancelled'
  | 'table_settled'
  | 'payment_completed'
  | 'settings_updated'
  | 'staff_invited'
  | 'staff_role_changed'
  | 'staff_deactivated';
