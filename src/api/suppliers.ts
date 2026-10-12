import { formatMoney } from '../domain/money';
import type { Minor, PaymentMethod } from '../domain/types';
import { apiRequest } from './http';
import { authHeaders } from './live-admin';

const BASE = '/restaurant/suppliers';

interface DeliveryStats {
  deliveries: number;
  /** Minor units, only the deliveries that had a price. */
  spent: Minor;
  /** Minor units of `spent` bought on credit. */
  credit: Minor;
  lastDeliveryAt: string | null;
}

/** `id` is null for a name that only appears on deliveries typed in before suppliers were saved. */
export interface SupplierListItem extends DeliveryStats {
  id: string | null;
  name: string;
  phone: string;
  note: string;
  /** Minor units still owed for credit deliveries. */
  owed: Minor;
}

export interface SupplierDelivery {
  id: string;
  receivedAt: string;
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  cost: Minor | null;
  onCredit: boolean;
  /** What is left of this delivery (the most that can go back), and what returns from it have already refunded. */
  remaining: number;
  refunded: Minor;
}

export interface IngredientPrice {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  /** Minor units per base unit (g, ml, pcs). */
  latestUnitCost: number;
  /** Per base unit of the delivery before the latest; null with only one priced delivery. */
  previousUnitCost: number | null;
  previousAt: string | null;
  /** The cheapest other supplier's latest price for this ingredient, when it beats this one. */
  cheaper: { supplier: string; unitCost: number } | null;
  /** Percent against the previous priced delivery; null with only one. */
  changePercent: number | null;
}

export interface SupplierPayment {
  id: string;
  amount: Minor;
  method: PaymentMethod;
  note: string;
  createdAt: string;
}

export interface SupplierReturn {
  id: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  /** Minor units given back, and how much of that came off what is owed (the rest was money back). */
  amount: Minor;
  owedOffset: Minor;
  note: string;
  createdAt: string;
}

export type IssueKind = 'LATE' | 'SHORT' | 'QUALITY' | 'OTHER';

export interface SupplierIssue {
  id: string;
  kind: IssueKind;
  note: string;
  createdAt: string;
  createdByName: string | null;
}

export interface SupplierDetail extends SupplierListItem {
  /** The latest few; the rest come from `fetchSupplierDeliveries`. */
  deliveriesList: SupplierDelivery[];
  deliveriesTotal: number;
  prices: IngredientPrice[];
  pricesTotal: number;
  payments: SupplierPayment[];
  returns: SupplierReturn[];
  issues: SupplierIssue[];
  /** How many of each kind have ever been logged. */
  issueCounts: Record<IssueKind, number>;
}

export const fetchSuppliers = () => apiRequest<SupplierListItem[]>(BASE, { headers: authHeaders() });

export const fetchSupplier = (name: string) => apiRequest<SupplierDetail>(`${BASE}/detail?name=${encodeURIComponent(name)}`, { headers: authHeaders() });

export const addSupplier = (draft: { name: string; phone: string; note: string }) =>
  apiRequest<{ id: string }>(BASE, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

/** A supplier's name stays as first saved, because deliveries refer to it. */
export const updateSupplier = (id: string, patch: { phone?: string; note?: string; isArchived?: boolean }) =>
  apiRequest<{ id: string }>(`${BASE}/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });

/** Pays down what is owed, and the cash book records the money going out. More than is owed is refused. */
export const paySupplier = (draft: { supplier: string; amount: Minor; method: PaymentMethod; note?: string }) =>
  apiRequest<{ id: string }>(`${BASE}/payments`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export const logSupplierIssue = (draft: { supplier: string; kind: IssueKind; note?: string }) =>
  apiRequest<{ id: string }>(`${BASE}/issues`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export interface Page<T> {
  rows: T[];
  count: number;
}

const PAGE = 20;
const paged = (path: string, name: string, offset: number) => `${BASE}/${path}?name=${encodeURIComponent(name)}&offset=${offset}&limit=${PAGE}`;

export const fetchSupplierDeliveries = (name: string, offset: number) => apiRequest<Page<SupplierDelivery>>(paged('deliveries', name, offset), { headers: authHeaders() });

export const fetchSupplierPrices = (name: string, offset: number) => apiRequest<Page<IngredientPrice>>(paged('prices', name, offset), { headers: authHeaders() });

/** A price per kg / litre / piece, so "Rs 2,400 for 5 kg" reads as "Rs 480 per kg". `unitCost` is per base unit (g, ml, pcs). */
export function priceLabel(unitCost: number, unit: string, currency: string): string {
  const per = unit === 'g' ? { label: 'kg', factor: 1000 } : unit === 'ml' ? { label: 'L', factor: 1000 } : { label: unit, factor: 1 };
  return `${formatMoney(Math.round(unitCost * per.factor), currency)} per ${per.label}`;
}

/** Every ingredient price from this supplier, paging through all of them. */
export async function fetchAllSupplierPrices(name: string): Promise<IngredientPrice[]> {
  const out: IngredientPrice[] = [];
  for (;;) {
    const page = await fetchSupplierPrices(name, out.length);
    out.push(...page.rows);
    if (page.rows.length === 0 || out.length >= page.count) return out;
  }
}
