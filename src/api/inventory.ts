import type { Minor, PaymentMethod } from '../domain/types';
import { IS_LIVE_API, apiRequest } from './http';
import { authHeaders } from './live-admin';

/** Stock and recipes. Live backend only — the offline demo keeps no inventory. */
export const INVENTORY_ENABLED = IS_LIVE_API;

const BASE = '/restaurant/inventory';

/** Quantities are whole numbers of the ingredient's base unit — never a float. */
export interface Ingredient {
  id: string;
  name: string;
  /** Label for the base unit: g, ml or pcs. */
  unit: string;
  quantity: number;
  /** Low-stock line in base units; 0 = no warning. */
  parLevel: number;
}

export interface RecipeLine {
  ingredientId: string;
  /** Neither set = the dish's base recipe; one set = extra, only when that variant or add-on is picked. */
  variantId: string | null;
  addOnId: string | null;
  quantity: number;
}

export const isLow = (i: Ingredient) => i.parLevel > 0 && i.quantity <= i.parLevel;

export const fetchIngredients = () => apiRequest<Ingredient[]>(`${BASE}/ingredients`, { headers: authHeaders() });

/** `cost` is what the opening stock cost in total (minor units), 0 if unknown. It is not booked as an expense. */
export const addIngredient = (draft: { name: string; unit: string; quantity: number; parLevel: number; cost: Minor }) =>
  apiRequest<Ingredient>(`${BASE}/ingredients`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export const updateIngredient = (id: string, patch: Partial<Pick<Ingredient, 'name' | 'unit' | 'parLevel'>> & { isArchived?: boolean }) =>
  apiRequest<Ingredient>(`${BASE}/ingredients/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });

/** `receivedAt` (ISO) is for a delivery entered after the day it arrived; left out, it is now. */
export const receiveDelivery = (id: string, draft: { quantity: number; supplier: string; cost: Minor; method: PaymentMethod; receivedAt?: string }) =>
  apiRequest<Ingredient>(`${BASE}/ingredients/${id}/delivery`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

/** Takes an amount off stock by hand: for a dish, or (no `dishId`) for waste or a staff meal. `usedAt` (ISO) files it on an earlier day. */
export const consumeStock = (id: string, draft: { quantity: number; dishId?: string; note?: string; usedAt?: string }) =>
  apiRequest<Ingredient>(`${BASE}/ingredients/${id}/consume`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

/** `quantity` is what is now on the shelf; the server records the difference. */
export const adjustStock = (id: string, quantity: number, note: string) =>
  apiRequest<Ingredient>(`${BASE}/ingredients/${id}/adjust`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ quantity, note }) });

export const fetchRecipe = (dishId: string) => apiRequest<RecipeLine[]>(`${BASE}/dishes/${dishId}/recipe`, { headers: authHeaders() });

export const saveRecipe = (dishId: string, lines: RecipeLine[]) =>
  apiRequest<RecipeLine[]>(`${BASE}/dishes/${dishId}/recipe`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ lines }) });

export type StockState = 'out' | 'low' | 'ok';

export const stockState = (i: Ingredient): StockState => (i.quantity <= 0 ? 'out' : isLow(i) ? 'low' : 'ok');

/** Base units read badly at scale (12500 g) — show kg / L once it is a thousand or more. */
export function formatQty(quantity: number, unit: string): string {
  const big = unit === 'g' ? 'kg' : unit === 'ml' ? 'L' : null;
  if (big && Math.abs(quantity) >= 1000) return `${Number((quantity / 1000).toFixed(2))} ${big}`;
  return `${quantity} ${unit}`;
}

/** How reviews of the dishes one delivery went into compare with the same ingredient's other deliveries. */
export interface LotQuality {
  lotId: string;
  ingredientId: string;
  ingredientName: string;
  supplier: string | null;
  receivedAt: string;
  reviewCount: number;
  poorCount: number;
  /** 0–1. */
  poorRate: number;
  /** The poor rate across the ingredient's other lots. */
  baselineRate: number;
  flagged: boolean;
}

export const fetchQuality = (days: number) => apiRequest<LotQuality[]>(`${BASE}/quality?days=${days}`, { headers: authHeaders() });

/** One time the kitchen used an ingredient: when, for which dish, and how much came off the shelf. */
export interface UsageEntry {
  id: string;
  at: string;
  /** The dish it went into; null for use that was not for a dish (waste, a staff meal). */
  dishName: string | null;
  /** `order` when the kitchen started a dish, `manual` when someone recorded it. */
  source: 'order' | 'manual';
  /** Why, for manual use. */
  note: string;
  /** Null for manual use. */
  portions: number | null;
  quantity: number;
}

export interface UsagePage {
  items: UsageEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export const fetchIngredientUsage = (id: string, page: number, pageSize: number) =>
  apiRequest<UsagePage>(`${BASE}/ingredients/${id}/usage?page=${page}&pageSize=${pageSize}`, { headers: authHeaders() });

/** How one ingredient has moved lately, and where it was last bought. */
export interface IngredientSummary {
  days: number;
  stockIn: number;
  stockOut: number;
  lastMovement: { reason: 'DELIVERY' | 'ORDER' | 'MANUAL_USE' | 'ADJUSTMENT' | 'TRANSFER_OUT' | 'TRANSFER_IN'; delta: number; note: string; at: string } | null;
  lastPurchase: { supplier: string | null; cost: Minor | null; quantity: number; at: string } | null;
}

export const fetchIngredientSummary = (id: string) => apiRequest<IngredientSummary>(`${BASE}/ingredients/${id}/summary`, { headers: authHeaders() });

/** One delivery: when it arrived, from whom, how much, and what was paid. */
export interface Purchase {
  id: string;
  at: string;
  supplier: string | null;
  quantity: number;
  cost: Minor | null;
}

export const fetchPurchases = (id: string, limit: number) => apiRequest<Purchase[]>(`${BASE}/ingredients/${id}/purchases?limit=${limit}`, { headers: authHeaders() });

export interface BuyListItem {
  ingredientId: string;
  name: string;
  unit: string;
  onHand: number;
  parLevel: number;
  /** Expected use over the horizon, from the same weekdays of the last three weeks, recent ones counting more. */
  expectedUse: number;
  toBuy: number;
  /** Where it was last bought; null if no delivery ever named a supplier. */
  supplier: string | null;
  /** Minor units at the last purchase's price; null when unknown. */
  estimatedCost: Minor | null;
}

export const fetchBuyList = (days: number) => apiRequest<BuyListItem[]>(`${BASE}/buy-list?days=${days}`, { headers: authHeaders() });

/** One portion of a dish (or one of its variants) costed from the latest delivery prices. */
export interface DishMargin {
  dishId: string;
  name: string;
  variantName: string | null;
  price: Minor;
  /** Minor units to make one portion. Too low while `missing` is not empty. */
  cost: Minor;
  /** 0–1: (price − cost) / price. */
  margin: number;
  /** Ingredients with no known price yet. */
  missing: string[];
  drivers: { ingredientName: string; share: number; changeSincePrevious: number | null }[];
}

export const fetchMargins = () => apiRequest<DishMargin[]>(`${BASE}/margins`, { headers: authHeaders() });

const TARGET_KEY = 'lets-dine:margin-target';

/** The margin (percent) below which a dish is flagged. A per-device preference for now, not a branch setting. */
export function loadMarginTarget(): number {
  try {
    const n = Number(localStorage.getItem(TARGET_KEY));
    return Number.isFinite(n) && n >= 1 && n <= 95 ? n : 60;
  } catch {
    return 60;
  }
}

export function saveMarginTarget(percent: number): void {
  try {
    localStorage.setItem(TARGET_KEY, String(percent));
  } catch {
    // Private mode: the target just resets next visit.
  }
}

/** Fully priced dishes under the target — the only ones whose margin is real enough to flag. */
export const thinDishes = (rows: DishMargin[], targetPercent: number) => rows.filter((r) => r.missing.length === 0 && r.margin * 100 < targetPercent);

export interface CountSheetRow {
  ingredientId: string;
  name: string;
  unit: string;
}

export interface StockTakeResult extends CountSheetRow {
  /** What the system thought was on the shelf — only revealed once the count is in. */
  expected: number;
  counted: number;
  /** counted − expected: negative = missing. */
  difference: number;
  /** Minor units at the latest delivery price; null when unknown. */
  value: Minor | null;
}

/** Names and units only — the server never sends expected quantities for a blind count. */
export const fetchCountSheet = () => apiRequest<CountSheetRow[]>(`${BASE}/stock-take/sheet`, { headers: authHeaders() });

export const submitStockTake = (counts: { ingredientId: string; quantity: number }[]) =>
  apiRequest<StockTakeResult[]>(`${BASE}/stock-take`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ counts }) });

/** Moves stock to another branch of the same restaurant; the oldest deliveries travel with it. */
export const transferStock = (id: string, toBranchId: string, quantity: number) =>
  apiRequest<Ingredient>(`${BASE}/ingredients/${id}/transfer`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ toBranchId, quantity }) });
