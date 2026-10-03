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

export const createCustomer = (input: NewCustomer) => addCustomer(input);
