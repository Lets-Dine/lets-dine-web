/** Money is always an integer count of minor units (paisa). Never a float. */
export type Minor = number;

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'OUT_FOR_DELIVERY'
  /** §16b, floor orders only: every live item is served but nobody has paid yet — see `Order.paidAt`. */
  | 'UNPAID'
  | 'COMPLETED'
  | 'CANCELLED';

/** Dine-in is table-scoped and QR-triggered; delivery has no table and is dispatched by staff. */
export type OrderType = 'DINE_IN' | 'DELIVERY';

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
  /** Square mark shown beside the name. Empty string = none. */
  logoUrl: string;
  currency: string;
  timezone: string;
  avgRating: number | null;
  ratingCount: number;
  /** Restaurant-level fee configuration — never hardcoded in the UI. */
  serviceChargeRate: number;
  taxRate: number;
  /** Flat, owner-configurable delivery fee in minor units. `null`/`0` = no fee. */
  deliveryFeeAmount: number | null;
  /** VAT/PAN registration number printed on receipts. `null` = none on file. */
  vatPanNumber: string | null;
  /** Whether starting a dish takes its recipe off stock. A branch or a dish can override it. Live backend only. */
  autoConsumeStock?: boolean;
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

/** §16b: one QR for a whole floor — any scan starts its own independent session, with no
 *  `currentSessionId` singleton to join or lock against, unlike `DiningTable`. */
export interface Floor {
  id: string;
  restaurantId: string;
  name: string;
  /** Opaque, printed on the floor's shared QR. Rotating it invalidates every printed code. */
  qrToken: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

/** The few fields of a branch a signed-in member needs to pick one and label the screen. */
export interface BranchRef {
  id: string;
  name: string;
  slug: string;
  isDefault: boolean;
}

/** One opening range. `dayOfWeek` is 0 (Sunday) – 6; times are `HH:mm` in the branch's own timezone, "24:00" closing at midnight. */
export interface BranchHours {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
}

/** A restaurant's location, as its owner manages it. A null fee/rate means "inherit the restaurant's". */
export interface Branch extends BranchRef {
  restaurantId: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  serviceChargeRate: number | null;
  taxRate: number | null;
  deliveryFeeAmount: number | null;
  /** `null` = follow the restaurant. */
  autoConsumeStock?: boolean | null;
  isActive: boolean;
  /** Present only on a single-branch read — an empty schedule means "always open". */
  hours?: BranchHours[];
}

/** What a diner may know about a branch: where it is and whether it is open right now. */
export interface PublicBranch extends BranchRef {
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  isOpenNow: boolean;
  hours: BranchHours[];
}

export interface DiningSession {
  id: string;
  restaurantId: string;
  /** The branch this visit is at. Absent only in the offline demo, which has no branches. */
  branchId?: string;
  /** Null for a delivery or floor session — there is no single table. */
  tableId: string | null;
  anonymousSessionToken: string;
  startedAt: string;
  expiresAt: string;
  /** Set once staff clears the table (or a payment settles it) — null while the visit is still open. */
  endedAt: string | null;
  /** Set for a delivery session, upserted server-side by phone. A floor order's own `Customer` is attached to the order instead, captured at order time. */
  customerId: string | null;
  /** §16b: set for a floor session — the shared floor QR it was scanned from. */
  floorId: string | null;
  /** Legacy — floor sessions used to collect this up front; identity is now captured per order instead (see `Order.floorVisitorName`). */
  floorVisitorName: string | null;
}

/** A lightweight, per-restaurant repeat-customer record, keyed by phone — upserted for delivery or a floor order (§16b). */
export interface Customer {
  id: string;
  restaurantId: string;
  phone: string;
  name: string;
  defaultAddress: string | null;
  defaultNote: string | null;
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
  /** `null` = follow the branch. */
  autoConsumeStock?: boolean | null;
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

/** One line of a bill: the dish, and the size and extras it was ordered with. Priced on the server, never sent with a price. */
export interface BillLine {
  dishId: string;
  variantId?: string | null;
  addOnIds?: string[];
  quantity: number;
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
  /** Null for a settled delivery order — nothing to batch by table. */
  tableId: string | null;
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
  /** The paying customer, when the settled orders were placed under one. */
  customerName: string | null;
  items: PaymentItem[];
}

export interface Order {
  id: string;
  reference: string;
  restaurantId: string;
  /** DINE_IN vs. DELIVERY — everything table/address-shaped branches on this. */
  orderType: OrderType;
  /** Null for a delivery order. */
  tableId: string | null;
  /** Null for a delivery order. */
  tableName: string | null;
  sessionId: string;
  /** The repeat-customer record it was placed under, if any — a delivery order's own, or a dine-in order's (table or floor, §16b, given at order time). */
  customerId: string | null;
  /** The linked customer's name/phone — the live per-session read only; lets a table session show who it is locked to. */
  customerName?: string | null;
  customerPhone?: string | null;
  /** Computed from `items` (plus `acceptedAt`/`cancelledAt`) — never assigned directly. See `domain/orderStatus.ts`. */
  status: OrderStatus;
  /** Set once, the one remaining whole-order transition. Items stay PENDING until each is started individually. */
  acceptedAt: string | null;
  /** Set only by a whole-order cancel (staff, and only while every item is still PENDING). */
  cancelledAt: string | null;
  /** §16b: floor orders only — set once that order's own bill is settled, the one thing that
   *  turns a fully-served ticket from `UNPAID` into `COMPLETED`. Always null for a table or
   *  delivery order, neither of which pass through `UNPAID` on the way to `COMPLETED`. */
  paidAt: string | null;
  items: OrderItem[];
  subtotal: Minor;
  serviceCharge: Minor;
  tax: Minor;
  /** Part of `total` — always 0 for a dine-in order. */
  deliveryFee: Minor;
  discount: Minor;
  total: Minor;
  currency: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewedDishIds: string[];
  /** Snapshotted at order time — only meaningful for a delivery order. */
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  deliveryCustomerName: string | null;
  deliveryNote: string | null;
  /** §16b: floor orders only — which cabin/room/spot on the floor to bring this order to, typed in at checkout and snapshotted here. */
  floorVisitorName: string | null;
  /** §16b: floor orders only — the floor's own name (e.g. "3rd Floor"), joined in read-side from the session; not stored on the order itself. */
  floorName: string | null;
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
  /** The branch this session is working in. Absent only in the offline demo. */
  branchId?: string;
  /** Branches this person may switch to — drives the branch switcher. */
  branches?: BranchRef[];
  /** For a roster entry: the branches a manager/staff member is pinned to (empty for an owner, who reaches all). */
  branchIds?: string[];
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
  | 'floor_created'
  | 'floor_renamed'
  | 'floor_disabled'
  | 'floor_enabled'
  | 'branch_created'
  | 'branch_updated'
  | 'branch_disabled'
  | 'branch_enabled'
  | 'branch_hours_updated'
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
  | 'staff_deactivated'
  | 'staff_branches_changed'
  | 'ledger_reopened'
  | 'stock_taken'
  | 'stock_transferred';

export type CustomerSegment = 'new' | 'regular' | 'lapsed' | 'occasional';

/** One row of the Customers list — identity plus figures derived from the customer's payments at the active branch. */
export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  segment: CustomerSegment;
  visits: number;
  /** Their latest payment; null if they haven't paid yet. */
  lastVisitAt: string | null;
  spend: Minor;
  joinedAt: string;
  /** Whether they paid in each of the last ten weeks, oldest first. */
  visitWeeks: boolean[];
}
