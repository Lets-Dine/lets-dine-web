import type { AddOnDraft, DishDraft, DishVariantDraft, SettingsPatch, StaffDraft, UploadSignature, UploadTarget } from './admin';
import type { BranchPerformance, OrderComparison, Period, RevenueComparison, TopSellingDish } from '../domain/adminMetrics';
import { nextItemStatus } from '../domain/orderStatus';
import type {
  AddOn,
  AuditAction,
  AuditEntry,
  Branch,
  BranchHours,
  BranchRef,
  DietaryType,
  DiningTable,
  Dish,
  DishStats,
  DishVariant,
  Floor,
  ItemStatus,
  Menu,
  MenuCategory,
  Order,
  OrderStatus,
  Payment,
  PaymentMethod,
  Restaurant,
  StaffMember,
  StaffRole,
} from '../domain/types';
import { ApiError } from './store';
import { apiRequest } from './http';
import type { Paginated } from './http';
import { getSocket, joinRoom } from './socket';

/**
 * The manager-facing half of the real API, wired up so far: signing in, and
 * running the category list, the menu board, the order pass, the table
 * roster, billing and settings (`/auth/staff/*`, `/restaurant/categories`,
 * `/restaurant/dishes`, `/restaurant/orders`, `/restaurant/profile`,
 * `/restaurant/tables`, `/restaurant/payments`).
 * Reviews and the analytics history (`allOrders`) still come from
 * `admin.ts` — they have not been moved across yet.
 *
 * The mutation endpoints (create/update/archive/restore/reorder) return the
 * bare dish, without the stats block only `fetchAll`/`fetchById` compute — but
 * every screen that calls one of them reloads the whole menu afterward rather
 * than rendering the mutation's own response, so these resolve to `void`
 * rather than reconstructing a `Dish` with stats they don't have.
 */

const TOKEN_KEY = 'letsDine.staff.token.v1';

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

export function authHeaders(): Record<string, string> {
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
  /** The branch the token is scoped to, and every branch this person may switch to. */
  branchId: string;
  branches: BranchRef[];
}

interface ApiBranch extends BranchRef {
  restaurantId: string;
  address: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  serviceChargeRate: number | null;
  taxRate: number | null;
  deliveryFeeAmount: number | null;
  isActive: boolean;
  hours?: BranchHours[];
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
  deliveryFeeAmount?: number | null;
}

interface ApiCategory {
  id: string;
  restaurantId: string;
  name: string;
  emoji: string;
  sortOrder: number;
}

interface ApiDishVariant {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
  isArchived: boolean;
  sortOrder: number;
  spiceLevel: number;
  dietaryType: DietaryType;
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
  dietaryType: DietaryType;
  stats: DishStats;
  addOnIds: string[];
  variants: ApiDishVariant[];
}

interface ApiAddOn {
  id: string;
  restaurantId: string;
  name: string;
  price: number;
  isAvailable: boolean;
  isArchived: boolean;
  sortOrder: number;
}

interface ApiOrderItemAddOn {
  addOnId: string;
  nameSnapshot: string;
  price: number;
}

interface ApiOrderItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  imageUrlSnapshot: string | null;
  unitPrice: number;
  quantity: number;
  notes: string;
  status: ItemStatus;
  statusUpdatedAt: string;
  addOns?: ApiOrderItemAddOn[];
  variantId?: string | null;
  variantNameSnapshot?: string | null;
  variantPriceSnapshot?: number | null;
}

interface ApiDiningTable {
  id: string;
  restaurantId: string;
  name: string;
  qrToken: string;
  capacity: number;
  currentSessionId: string | null;
  currentSession?: { anonymousSessionToken: string } | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ApiStaffMember {
  id: string;
  restaurantId: string;
  role: StaffRole;
  isActive: boolean;
  name: string;
  email: string;
  branchIds?: string[];
}

interface ApiAuditLog {
  id: string;
  restaurantId: string;
  actorId: string;
  actorName: string;
  actorRole: StaffRole;
  action: AuditAction;
  subject: string;
  detail: string;
  createdAt: string;
}

interface ApiOrder {
  id: string;
  reference: string;
  restaurantId: string;
  orderType: Order['orderType'];
  tableId: string | null;
  tableName: string | null;
  sessionId: string;
  customerId?: string | null;
  status: OrderStatus;
  acceptedAt: string | null;
  cancelledAt: string | null;
  paidAt?: string | null;
  items: ApiOrderItem[];
  subtotal: number;
  serviceCharge: number;
  tax: number;
  deliveryFee?: number | null;
  discount: number;
  total: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  reviewedDishIds: string[];
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  deliveryCustomerName?: string | null;
  deliveryNote?: string | null;
  floorVisitorName?: string | null;
  floorName?: string | null;
}

interface ApiPaymentItem {
  id: string;
  dishId: string;
  dishNameSnapshot: string;
  unitPrice: number;
  quantity: number;
}

interface ApiPayment {
  id: string;
  restaurantId: string;
  sessionId: string;
  tableId: string | null;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  discount: number;
  total: number;
  method: PaymentMethod;
  currency: string;
  createdAt: string;
  createdBy: string | null;
  createdByName: string | null;
  items: ApiPaymentItem[];
}

/* ── Mappers ───────────────────────────────────────────────────── */

function toStaff(profile: ApiAuthProfile): StaffMember {
  return {
    id: profile.memberId,
    restaurantId: profile.restaurantId,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    branchId: profile.branchId,
    branches: profile.branches,
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
    deliveryFeeAmount: api.deliveryFeeAmount ?? null,
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

function toDishVariant(api: ApiDishVariant, currency: string): DishVariant {
  return {
    id: api.id,
    name: api.name,
    price: api.price,
    currency,
    isAvailable: api.isAvailable,
    isArchived: api.isArchived,
    sortOrder: api.sortOrder,
    spiceLevel: api.spiceLevel as DishVariant['spiceLevel'],
    dietaryType: api.dietaryType,
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
    dietaryType: api.dietaryType,
    stats: api.stats,
    addOnIds: api.addOnIds ?? [],
    variants: (api.variants ?? []).map((v) => toDishVariant(v, currency)),
  };
}

function toAddOn(api: ApiAddOn, currency: string): AddOn {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    name: api.name,
    price: api.price,
    currency,
    isAvailable: api.isAvailable,
    isArchived: api.isArchived,
    sortOrder: api.sortOrder,
  };
}

function toStaffMember(api: ApiStaffMember): StaffMember {
  return { id: api.id, restaurantId: api.restaurantId, name: api.name, email: api.email, role: api.role, branchIds: api.branchIds ?? [] };
}

function toTable(api: ApiDiningTable): DiningTable {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    name: api.name,
    qrToken: api.qrToken,
    capacity: api.capacity,
    currentSessionId: api.currentSessionId,
    currentSessionToken: api.currentSession?.anonymousSessionToken ?? null,
    isActive: api.isActive,
    sortOrder: api.sortOrder,
    createdAt: api.createdAt,
  };
}

function toAuditEntry(api: ApiAuditLog): AuditEntry {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    actorId: api.actorId,
    actorName: api.actorName,
    actorRole: api.actorRole,
    action: api.action,
    subject: api.subject,
    detail: api.detail,
    at: api.createdAt,
  };
}

function toOrder(api: ApiOrder): Order {
  return {
    id: api.id,
    reference: api.reference,
    restaurantId: api.restaurantId,
    orderType: api.orderType,
    tableId: api.tableId,
    tableName: api.tableName,
    sessionId: api.sessionId,
    customerId: api.customerId ?? null,
    status: api.status,
    acceptedAt: api.acceptedAt,
    cancelledAt: api.cancelledAt,
    paidAt: api.paidAt ?? null,
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
      addOns: (item.addOns ?? []).map((a) => ({ addOnId: a.addOnId, nameSnapshot: a.nameSnapshot, price: a.price })),
      variantId: item.variantId ?? null,
      variantNameSnapshot: item.variantNameSnapshot ?? null,
      variantPriceSnapshot: item.variantPriceSnapshot ?? null,
    })),
    subtotal: api.subtotal,
    serviceCharge: api.serviceCharge,
    tax: api.tax,
    deliveryFee: api.deliveryFee ?? 0,
    discount: api.discount,
    total: api.total,
    currency: api.currency,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    completedAt: api.completedAt,
    reviewedDishIds: api.reviewedDishIds,
    deliveryAddress: api.deliveryAddress ?? null,
    deliveryPhone: api.deliveryPhone ?? null,
    deliveryCustomerName: api.deliveryCustomerName ?? null,
    deliveryNote: api.deliveryNote ?? null,
    floorVisitorName: api.floorVisitorName ?? null,
    floorName: api.floorName ?? null,
  };
}

function toPayment(api: ApiPayment): Payment {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    sessionId: api.sessionId,
    tableId: api.tableId,
    subtotal: api.subtotal,
    serviceCharge: api.serviceCharge,
    tax: api.tax,
    discount: api.discount,
    total: api.total,
    method: api.method,
    currency: api.currency,
    createdAt: api.createdAt,
    createdBy: api.createdBy,
    createdByName: api.createdByName,
    items: api.items.map((item) => ({
      id: item.id,
      dishId: item.dishId,
      dishNameSnapshot: item.dishNameSnapshot,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    })),
  };
}

/* ── Auth ──────────────────────────────────────────────────────── */

export async function signIn(email: string, pin: string, branchId?: string): Promise<StaffMember> {
  const session = await apiRequest<ApiAuthSession>('/auth/staff/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email: email.trim(), pin: pin.trim(), ...(branchId && { branchId }) }),
  });
  storeToken(session.accessToken);
  return toStaff(session.profile);
}

/**
 * Moves this session to another branch the member may work in. The server re-reads access from
 * the database and mints a fresh token, so the old one stops carrying that branch's scope.
 */
export async function switchBranch(branchId: string): Promise<{ branchId: string; branches: BranchRef[] }> {
  const result = await apiRequest<{ accessToken: string; branchId: string; branches: BranchRef[] }>('/auth/staff/switch-branch', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ branchId }),
  });
  storeToken(result.accessToken);
  return { branchId: result.branchId, branches: result.branches };
}

/**
 * The branches this person may work in, read fresh. The list captured at sign-in goes stale the moment
 * an owner adds, renames or disables a branch, and the switcher is built from it.
 */
export async function fetchBranchAccess(): Promise<{ branchId: string; branches: BranchRef[] }> {
  const profile = await apiRequest<ApiAuthProfile>('/auth/me', { headers: authHeaders() });
  return { branchId: profile.branchId, branches: profile.branches };
}

/* ── Branches ──────────────────────────────────────────────────── */

export interface BranchDraft {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  /** Ratios, or null to inherit the restaurant's. */
  serviceChargeRate: number | null;
  taxRate: number | null;
  /** Minor units, or null to inherit. */
  deliveryFeeAmount: number | null;
  /** On create only: start this branch's menu as a copy of another branch's. Without it the menu starts empty. */
  copyMenuFrom?: string;
}

function toBranch(api: ApiBranch): Branch {
  return { ...api };
}

function branchBody(draft: Partial<BranchDraft>): Record<string, unknown> {
  return {
    ...(draft.name !== undefined && { name: draft.name.trim() }),
    ...(draft.address !== undefined && { address: draft.address.trim() }),
    ...(draft.phone !== undefined && { phone: draft.phone.trim() || null }),
    ...(draft.timezone !== undefined && { timezone: draft.timezone.trim() }),
    ...(draft.serviceChargeRate !== undefined && { serviceChargeRate: draft.serviceChargeRate }),
    ...(draft.taxRate !== undefined && { taxRate: draft.taxRate }),
    ...(draft.deliveryFeeAmount !== undefined && { deliveryFeeAmount: draft.deliveryFeeAmount }),
    ...(draft.copyMenuFrom && { copyMenuFrom: draft.copyMenuFrom }),
  };
}

export async function listBranches(): Promise<Branch[]> {
  const page = await apiRequest<Paginated<ApiBranch>>('/restaurant/branches?limit=0', { headers: authHeaders() });
  return page.rows.map(toBranch);
}

/** One branch with its weekly schedule. */
export async function fetchBranch(id: string): Promise<Branch> {
  return toBranch(await apiRequest<ApiBranch>(`/restaurant/branches/${id}`, { headers: authHeaders() }));
}

export async function createBranch(draft: BranchDraft): Promise<Branch> {
  return toBranch(
    await apiRequest<ApiBranch>('/restaurant/branches', { method: 'POST', headers: authHeaders(), body: JSON.stringify(branchBody(draft)) }),
  );
}

export async function updateBranch(id: string, patch: Partial<BranchDraft> & { isActive?: boolean }): Promise<Branch> {
  const { isActive, ...rest } = patch;
  return toBranch(
    await apiRequest<ApiBranch>(`/restaurant/branches/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ ...branchBody(rest), ...(isActive !== undefined && { isActive }) }),
    }),
  );
}

/** Replaces the whole weekly schedule. An empty list means "always open". */
export async function setBranchHours(id: string, hours: BranchHours[]): Promise<BranchHours[]> {
  return apiRequest<BranchHours[]>(`/restaurant/branches/${id}/hours`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ hours }),
  });
}

/* ── Branch menus ──────────────────────────────────────────────── */

/** What a copy moved across, for the confirmation message. */
export interface MenuCopyResult {
  categories: number;
  dishes: number;
  variants: number;
  addOns: number;
}

/**
 * Starts a branch's menu as a copy of another's. Only into an empty menu, and a one-off: the two menus are
 * independent afterwards, so a later change at one never reaches the other.
 */
export async function copyBranchMenu(toBranchId: string, fromBranchId: string): Promise<MenuCopyResult> {
  return apiRequest<MenuCopyResult>(`/restaurant/branches/${toBranchId}/copy-menu`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ fromBranchId }),
  });
}

/* ── Staff ─────────────────────────────────────────────────────── */

export async function listStaff(): Promise<StaffMember[]> {
  const page = await apiRequest<Paginated<ApiStaffMember>>('/restaurant/staff?limit=0', {
    headers: authHeaders(),
  });
  return page.rows.filter((row) => row.isActive).map(toStaffMember);
}

export async function createStaffMember(draft: StaffDraft): Promise<StaffMember> {
  const member = await apiRequest<ApiStaffMember>('/restaurant/staff', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      name: draft.name.trim(),
      email: draft.email.trim(),
      pin: draft.pin.trim(),
      role: draft.role,
      // An owner reaches every branch; anyone else is pinned. Omitted, the server uses the creator's branch.
      ...(draft.role !== 'OWNER' && draft.branchIds?.length && { branchIds: draft.branchIds }),
    }),
  });
  return toStaffMember(member);
}

/** Replaces which branches a manager/staff member works at. */
export async function updateStaffBranches(id: string, branchIds: string[]): Promise<StaffMember> {
  return toStaffMember(
    await apiRequest<ApiStaffMember>(`/restaurant/staff/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ branchIds }) }),
  );
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

/** Archived add-ons included, same reason as `fetchDishes`. */
async function fetchAddOns(): Promise<ApiAddOn[]> {
  const page = await apiRequest<Paginated<ApiAddOn>>('/restaurant/add-ons?limit=0', {
    headers: authHeaders(),
  });
  return page.rows;
}

export async function adminMenu(): Promise<Menu> {
  const [restaurant, categories, dishes, addOns] = await Promise.all([
    apiRequest<ApiRestaurant>('/restaurant/profile', { headers: authHeaders() }),
    fetchCategories(),
    fetchDishes(),
    fetchAddOns(),
  ]);
  const mapped = toRestaurant(restaurant);
  return {
    restaurant: mapped,
    categories,
    dishes: dishes.map((dish) => toDish(dish, mapped.currency)).sort((a, b) => a.sortOrder - b.sortOrder),
    addOns: addOns.map((addOn) => toAddOn(addOn, mapped.currency)).sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export async function updateSettings(patch: SettingsPatch): Promise<Restaurant> {
  const restaurant = await apiRequest<ApiRestaurant>('/restaurant/profile', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return toRestaurant(restaurant);
}

/** A signed, time-boxed permission slip for the UI to upload straight to Cloudinary — no file ever touches our server. */
export async function getUploadSignature(target: UploadTarget): Promise<UploadSignature> {
  return apiRequest<UploadSignature>('/restaurant/uploads/signature', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ target }),
  });
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
  if (draft.dietaryType !== undefined) body.dietaryType = draft.dietaryType;
  if (draft.spiceLevel !== undefined) body.spiceLevel = draft.spiceLevel;
  if (draft.isAvailable !== undefined) body.isAvailable = draft.isAvailable;
  if (draft.isFeatured !== undefined) body.isFeatured = draft.isFeatured;
  return body;
}

export async function createDish(draft: DishDraft): Promise<{ id: string }> {
  const created = await apiRequest<ApiDish>('/restaurant/dishes', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(dishBody(draft)),
  });
  return { id: created.id };
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

/* ── Add-ons ───────────────────────────────────────────────────── */

function addOnBody(draft: Partial<AddOnDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.price !== undefined) body.price = draft.price;
  if (draft.isAvailable !== undefined) body.isAvailable = draft.isAvailable;
  return body;
}

export async function createAddOn(draft: AddOnDraft): Promise<void> {
  await apiRequest<ApiAddOn>('/restaurant/add-ons', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(addOnBody(draft)),
  });
}

export async function updateAddOn(addOnId: string, patch: Partial<AddOnDraft>): Promise<void> {
  await apiRequest<ApiAddOn>(`/restaurant/add-ons/${encodeURIComponent(addOnId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(addOnBody(patch)),
  });
}

export async function setAddOnArchived(addOnId: string, archived: boolean): Promise<void> {
  await apiRequest<ApiAddOn>(`/restaurant/add-ons/${encodeURIComponent(addOnId)}/${archived ? 'archive' : 'restore'}`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function setDishAddOns(dishId: string, addOnIds: string[]): Promise<void> {
  await apiRequest<ApiDish>(`/restaurant/dishes/${encodeURIComponent(dishId)}/add-ons`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ addOnIds }),
  });
}

/* ── Dish variants ─────────────────────────────────────────────── */

function dishVariantBody(draft: Partial<DishVariantDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (draft.name !== undefined) body.name = draft.name.trim();
  if (draft.price !== undefined) body.price = draft.price;
  if (draft.isAvailable !== undefined) body.isAvailable = draft.isAvailable;
  if (draft.dietaryType !== undefined) body.dietaryType = draft.dietaryType;
  if (draft.spiceLevel !== undefined) body.spiceLevel = draft.spiceLevel;
  return body;
}

export async function createDishVariant(dishId: string, draft: DishVariantDraft): Promise<void> {
  await apiRequest<ApiDishVariant>(`/restaurant/dishes/${encodeURIComponent(dishId)}/variants`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(dishVariantBody(draft)),
  });
}

export async function updateDishVariant(dishId: string, variantId: string, patch: Partial<DishVariantDraft>): Promise<void> {
  await apiRequest<ApiDishVariant>(
    `/restaurant/dishes/${encodeURIComponent(dishId)}/variants/${encodeURIComponent(variantId)}`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify(dishVariantBody(patch)),
    },
  );
}

export async function setDishVariantArchived(dishId: string, variantId: string, archived: boolean): Promise<void> {
  await apiRequest<ApiDishVariant>(
    `/restaurant/dishes/${encodeURIComponent(dishId)}/variants/${encodeURIComponent(variantId)}/${archived ? 'archive' : 'restore'}`,
    { method: 'POST', headers: authHeaders() },
  );
}

/* ── Tables ────────────────────────────────────────────────────── */

export async function listTables(): Promise<DiningTable[]> {
  const page = await apiRequest<Paginated<ApiDiningTable>>('/restaurant/tables?limit=0', {
    headers: authHeaders(),
  });
  return page.rows.map(toTable).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createTable(name: string, capacity: number): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>('/restaurant/tables', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name.trim(), capacity }),
  });
  return toTable(table);
}

export async function updateTable(tableId: string, patch: { name?: string; capacity?: number }): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>(`/restaurant/tables/${encodeURIComponent(tableId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return toTable(table);
}

export async function setTableActive(tableId: string, active: boolean): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>(`/restaurant/tables/${encodeURIComponent(tableId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ isActive: active }),
  });
  return toTable(table);
}

export async function regenerateQr(tableId: string): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>(`/restaurant/tables/${encodeURIComponent(tableId)}/qr`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return toTable(table);
}

/** Seats a table on the diner's behalf — the same visit a QR scan would have opened. */
export async function startTableSession(tableId: string): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>(`/restaurant/tables/${encodeURIComponent(tableId)}/start-session`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return toTable(table);
}

/** Clears the table's active visit so the next QR scan starts a fresh one. */
export async function endTableSession(tableId: string): Promise<DiningTable> {
  const table = await apiRequest<ApiDiningTable>(`/restaurant/tables/${encodeURIComponent(tableId)}/end-session`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return toTable(table);
}

/* ── Floors ────────────────────────────────────────────────────── */

interface ApiFloor {
  id: string;
  restaurantId: string;
  name: string;
  qrToken: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

function toFloor(api: ApiFloor): Floor {
  return {
    id: api.id,
    restaurantId: api.restaurantId,
    name: api.name,
    qrToken: api.qrToken,
    isActive: api.isActive,
    sortOrder: api.sortOrder,
    createdAt: api.createdAt,
  };
}

export async function listFloors(): Promise<Floor[]> {
  const page = await apiRequest<Paginated<ApiFloor>>('/restaurant/floors?limit=0', {
    headers: authHeaders(),
  });
  return page.rows.map(toFloor).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function createFloor(name: string): Promise<Floor> {
  const floor = await apiRequest<ApiFloor>('/restaurant/floors', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: name.trim() }),
  });
  return toFloor(floor);
}

export async function updateFloor(floorId: string, patch: { name?: string }): Promise<Floor> {
  const floor = await apiRequest<ApiFloor>(`/restaurant/floors/${encodeURIComponent(floorId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  return toFloor(floor);
}

export async function setFloorActive(floorId: string, active: boolean): Promise<Floor> {
  const floor = await apiRequest<ApiFloor>(`/restaurant/floors/${encodeURIComponent(floorId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ isActive: active }),
  });
  return toFloor(floor);
}

export async function regenerateFloorQr(floorId: string): Promise<Floor> {
  const floor = await apiRequest<ApiFloor>(`/restaurant/floors/${encodeURIComponent(floorId)}/qr`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return toFloor(floor);
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

/** Every order a table's current visit has placed, settled or not — what the payment sheet bills against. */
export async function fetchOrdersBySession(sessionId: string): Promise<Order[]> {
  const orders = await apiRequest<ApiOrder[]>(`/restaurant/orders/session/${encodeURIComponent(sessionId)}`, {
    headers: authHeaders(),
  });
  return orders.map(toOrder);
}

/** Always lands on the table's most recent order, whatever its status — a correction after settling works the same as one mid-service. */
export async function addOrderItem(tableId: string, dishId: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(`/restaurant/orders/table/${encodeURIComponent(tableId)}/items`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ dishId }),
  });
  return toOrder(order);
}

export async function removeOrderItem(orderId: string, itemId: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(
    `/restaurant/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  return toOrder(order);
}

export async function settleTable(tableId: string): Promise<Order[]> {
  const orders = await apiRequest<ApiOrder[]>(`/restaurant/orders/table/${encodeURIComponent(tableId)}/settle`, {
    method: 'POST',
    headers: authHeaders(),
  });
  return orders.map(toOrder);
}

/**
 * The till. Snapshots what's still open on this table into a payment record
 * and closes those orders out — optionally ending the visit in the same
 * motion, which also cancels anything on the session that never made it into
 * this charge.
 *
 * `orderId` scopes the charge to one floor order's own bill (§16b) instead of the whole
 * session's tab — only that order is marked paid, and `endSession` is ignored server-side
 * when it's set (see the backend's `CompletePaymentUsecase`).
 */
export async function completePayment(
  sessionId: string,
  items: { dishId: string; quantity: number }[],
  method: PaymentMethod,
  discount: number,
  endSession: boolean,
  orderId?: string,
): Promise<Payment> {
  const payment = await apiRequest<ApiPayment>('/restaurant/payments', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ sessionId, orderId, items, method, discount, endSession }),
  });
  return toPayment(payment);
}

/** One page of payments, most recent first — what the Payments screen lists, 20 at a time as it scrolls. */
export async function listPayments(
  offset = 0,
  limit = 20,
  query: { tableId?: string; from?: string; to?: string } = {},
): Promise<{ rows: Payment[]; count: number }> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  if (query.tableId) params.set('tableId', query.tableId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const page = await apiRequest<Paginated<ApiPayment>>(`/restaurant/payments?${params.toString()}`, {
    headers: authHeaders(),
  });
  return { rows: page.rows.map(toPayment), count: page.count };
}

export async function getPayment(paymentId: string): Promise<Payment> {
  const payment = await apiRequest<ApiPayment>(`/restaurant/payments/${encodeURIComponent(paymentId)}`, {
    headers: authHeaders(),
  });
  return toPayment(payment);
}

/** The one remaining whole-order transition: accept. Everything after that follows the items. */
export async function acceptOrder(orderId: string, expected: 'PENDING'): Promise<Order> {
  if (expected !== 'PENDING') throw new ApiError(409, 'This order has already been accepted.');

  const order = await apiRequest<ApiOrder>(`/restaurant/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'ACCEPTED' }),
  });
  return toOrder(order);
}

/** `expected` is the item's status the UI last saw; the actual next step is read off the same table the server enforces. */
export async function advanceOrderItem(orderId: string, itemId: string, expected: ItemStatus): Promise<Order> {
  const to = nextItemStatus(expected);
  if (!to) throw new ApiError(409, 'This item is already finished.');

  const order = await apiRequest<ApiOrder>(
    `/restaurant/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/status`,
    {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status: to }),
    },
  );
  return toOrder(order);
}

/** Delivery-only: `READY -> OUT_FOR_DELIVERY`, the same one-shot manual override `acceptOrder` uses for `PENDING -> ACCEPTED`. */
export async function advanceDeliveryOrder(orderId: string, expected: 'READY'): Promise<Order> {
  if (expected !== 'READY') throw new ApiError(409, 'This order is not ready to go out yet.');

  const order = await apiRequest<ApiOrder>(`/restaurant/orders/${encodeURIComponent(orderId)}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ status: 'OUT_FOR_DELIVERY' }),
  });
  return toOrder(order);
}

/** Delivery's equivalent of settling a table — one order's own bill, charged the moment it's handed over. */
export async function settleDeliveryOrder(orderId: string): Promise<Order> {
  const order = await apiRequest<ApiOrder>(`/restaurant/orders/${encodeURIComponent(orderId)}/settle-delivery`, {
    method: 'POST',
    headers: authHeaders(),
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

/**
 * The floor's realtime feed — a table flips between free and occupied the
 * moment a diner's QR scan opens a session or a session ends (staff ending
 * it, or a payment settling with `endSession`), on whichever device notices
 * first. `onResync` fires on every (re)join, including the first, so the
 * caller can refetch the whole table list once over HTTP, covering the
 * initial load and anything missed while disconnected. A signed-out tab has
 * no token to authenticate with, so this is a no-op until the next sign-in.
 */
export function subscribeToTables(onUpdated: (table: DiningTable) => void, onResync: () => void): () => void {
  const token = readToken();
  if (!token) return () => {};

  const socket = getSocket();
  const handleUpdated = (api: ApiDiningTable) => onUpdated(toTable(api));
  socket.on('table.updated', handleUpdated);

  const leaveRoom = joinRoom('subscribe:tables', { token }, onResync);

  return () => {
    socket.off('table.updated', handleUpdated);
    leaveRoom();
  };
}

/* ── Audit log ─────────────────────────────────────────────────── */

/** §51 — every management action, most recent first, 80 at a time (or 20 as the audit log page scrolls). */
export async function listAudit(limit = 80, offset = 0): Promise<{ rows: AuditEntry[]; count: number }> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const page = await apiRequest<Paginated<ApiAuditLog>>(`/restaurant/audit-logs?${params.toString()}`, {
    headers: authHeaders(),
  });
  return { rows: page.rows.map(toAuditEntry), count: page.count };
}

/* ── Analytics ─────────────────────────────────────────────────── */

/** `&branchId=…` when narrowing to one branch. Without it an owner reads the whole restaurant; anyone else, the branches they are assigned to. */
function branchParam(branchId?: string): string {
  return branchId ? `&branchId=${encodeURIComponent(branchId)}` : '';
}

/** §31 — settled-payment revenue for the period against the whole of the one before it. */
export async function fetchRevenueComparison(period: Period, branchId?: string): Promise<RevenueComparison> {
  return apiRequest<RevenueComparison>(`/restaurant/analytics/revenue?period=${period}${branchParam(branchId)}`, {
    headers: authHeaders(),
  });
}

/** §31 — order count for the period against the whole of the one before it. */
export async function fetchOrderComparison(period: Period, branchId?: string): Promise<OrderComparison> {
  return apiRequest<OrderComparison>(`/restaurant/analytics/orders?period=${period}${branchParam(branchId)}`, {
    headers: authHeaders(),
  });
}

/** §31 — dishes actually paid for, ranked by units sold. No dates: everything to date. */
export async function fetchTopSellingDishes(startDate?: string, endDate?: string, branchId?: string): Promise<TopSellingDish[]> {
  const params = new URLSearchParams();
  if (branchId) params.set('branchId', branchId);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  const qs = params.toString();
  return apiRequest<TopSellingDish[]>(`/restaurant/analytics/top-dishes${qs ? `?${qs}` : ''}`, {
    headers: authHeaders(),
  });
}

/** One row per branch the caller may see, highest revenue first — the cross-branch comparison. */
export async function fetchBranchPerformance(from?: string, to?: string): Promise<BranchPerformance[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  return apiRequest<BranchPerformance[]>(`/restaurant/analytics/branches${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
}
