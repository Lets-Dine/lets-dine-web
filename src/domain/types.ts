/** Money is always an integer count of minor units (paisa). Never a float. */
export type Minor = number;

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED';

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
  isVeg: boolean;
  stats: DishStats;
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
}

export interface OrderItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  imageUrlSnapshot: string | null;
  unitPrice: Minor;
  quantity: number;
  notes: string;
}

export interface Order {
  id: string;
  reference: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  sessionId: string;
  status: OrderStatus;
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
  | 'category_created'
  | 'category_renamed'
  | 'category_deleted'
  | 'category_reordered'
  | 'table_created'
  | 'table_renamed'
  | 'table_disabled'
  | 'table_enabled'
  | 'table_session_ended'
  | 'qr_regenerated'
  | 'order_status_changed'
  | 'order_cancelled'
  | 'order_item_added'
  | 'order_item_removed'
  | 'table_settled'
  | 'payment_completed'
  | 'settings_updated'
  | 'staff_invited'
  | 'staff_role_changed'
  | 'staff_deactivated';
