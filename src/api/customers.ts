import { addCustomer, listCustomers as sampleCustomers, toListItem } from '../data/customers';
import type { NewCustomer } from '../data/customers';
import type { CustomerListItem, CustomerSegment } from '../domain/types';
import { IS_LIVE_API, apiRequest } from './http';
import type { Paginated } from './http';
import { authHeaders } from './live-admin';

export type CustomerSort = 'lastVisit' | 'visits' | 'spend' | 'name';

export interface CustomerQuery {
  q?: string;
  segment?: Exclude<CustomerSegment, 'occasional'>;
  sortBy?: CustomerSort;
  offset?: number;
  limit?: number;
}

/**
 * Only the list has an endpoint so far. Adding, editing and removing a customer — and everything
 * the profile sheet shows beyond the list row — still run against the in-browser sample data,
 * which the live backend has no route for yet, so the screen hides those controls when live.
 */
export const CUSTOMER_WRITES = !IS_LIVE_API;

/** One page of customers, filtered and sorted server-side. */
export async function listCustomers(query: CustomerQuery = {}): Promise<Paginated<CustomerListItem>> {
  const { q, segment, sortBy = 'lastVisit', offset = 0, limit = 20 } = query;

  if (IS_LIVE_API) {
    const params = new URLSearchParams({ sortBy, offset: String(offset), limit: String(limit) });
    if (q?.trim()) params.set('q', q.trim());
    if (segment) params.set('segment', segment);
    return apiRequest<Paginated<CustomerListItem>>(`/restaurant/customers?${params.toString()}`, { headers: authHeaders() });
  }

  // Offline demo: the same filtering, sorting and paging, done over the sample roster.
  const needle = q?.trim().toLowerCase() ?? '';
  const digits = needle.replace(/\D/g, '');
  const rows = sampleCustomers()
    .map(toListItem)
    .filter((r) => !segment || r.segment === segment)
    .filter((r) => !needle || r.name.toLowerCase().includes(needle) || (digits && r.phone.replace(/\D/g, '').includes(digits)));
  const compare: Record<CustomerSort, (a: CustomerListItem, b: CustomerListItem) => number> = {
    lastVisit: (a, b) => Date.parse(b.lastVisitAt ?? '1970-01-01') - Date.parse(a.lastVisitAt ?? '1970-01-01'),
    visits: (a, b) => b.visits - a.visits,
    spend: (a, b) => b.spend - a.spend,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  rows.sort(compare[sortBy]);
  return { rows: rows.slice(offset, offset + limit), count: rows.length };
}

/**
 * One customer's list row. The live backend has no get-by-id yet, so page through the list until
 * they turn up (ponytail: swap for GET /restaurant/customers/:id when it exists).
 */
export async function fetchCustomer(id: string): Promise<CustomerListItem | null> {
  for (let offset = 0, count = 1; offset < count && offset < 500; offset += 100) {
    const page = await listCustomers({ offset, limit: 100 });
    count = page.count;
    const hit = page.rows.find((r) => r.id === id);
    if (hit) return hit;
  }
  return null;
}

export const createCustomer = (input: NewCustomer) => addCustomer(input);

/** What a customer's points are worth and what they may be spent on — live backend only; the offline demo has no points. */
export interface CustomerLoyalty {
  customerId: string;
  /** Who the balance belongs to — lets a bill name its customer when its orders only carry an id. */
  name: string;
  balance: number;
  program: { enabled: boolean; spendPerPoint: number; redeemValue: number; maxRedeemPct: number; reviewBonus: number };
}

export async function fetchCustomerLoyalty(customerId: string): Promise<CustomerLoyalty | null> {
  if (!IS_LIVE_API) return null;
  const res = await apiRequest<{ customer: { id: string; name: string }; balance: number; program: CustomerLoyalty['program'] }>(
    `/restaurant/customers/${encodeURIComponent(customerId)}/loyalty?limit=1`,
    { headers: authHeaders() },
  );
  return { customerId: res.customer.id, name: res.customer.name, balance: res.balance, program: res.program };
}

export type LoyaltyEntryType = 'EARN' | 'REDEEM' | 'REVIEW_BONUS' | 'ADJUST' | 'EXPIRE' | 'REVERSAL';

export interface LoyaltyEntry {
  id: string;
  type: LoyaltyEntryType;
  /** Signed: spending is negative. */
  points: number;
  note: string;
  createdAt: string;
  createdByName: string | null;
}

export type LoyaltyProgram = CustomerLoyalty['program'];

/** A customer's balance, the rules it is spent under, and the latest ledger lines. Live backend only. */
export async function fetchLoyaltyLedger(customerId: string, limit = 10): Promise<{ balance: number; program: LoyaltyProgram; entries: { rows: LoyaltyEntry[]; count: number } }> {
  return apiRequest(`/restaurant/customers/${encodeURIComponent(customerId)}/loyalty?limit=${limit}`, { headers: authHeaders() });
}

/** Gives or takes points by hand. `note` is the only record of why. Refused if it would go below zero. */
export async function adjustLoyalty(customerId: string, points: number, note: string): Promise<{ balance: number }> {
  return apiRequest(`/restaurant/customers/${encodeURIComponent(customerId)}/loyalty/adjust`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ points, note }),
  });
}

export async function fetchLoyaltyProgram(): Promise<LoyaltyProgram> {
  return apiRequest<LoyaltyProgram>('/restaurant/loyalty/program', { headers: authHeaders() });
}

export async function saveLoyaltyProgram(program: LoyaltyProgram): Promise<LoyaltyProgram> {
  return apiRequest<LoyaltyProgram>('/restaurant/loyalty/program', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(program) });
}
