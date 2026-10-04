import type { Invoice, BillingInterval, Plan, Subscription, Usage } from '../domain/subscription';
import { IS_LIVE_API, apiRequest } from './http';
import type { Paginated } from './http';
import { authHeaders } from './live-admin';
import { ApiError } from './store';

/**
 * A restaurant's own plan: what it is on, how much of it is used, and — for an
 * owner — the invoices and the plan switch. It exists only on the live backend;
 * the offline demo has no billing to show, so every plan screen is gated on this.
 */
export const SUBSCRIPTION_ENABLED = IS_LIVE_API;

const BASE = '/restaurant/billing';

export function fetchSubscription(): Promise<Subscription> {
  return apiRequest<Subscription>(`${BASE}/subscription`, { headers: authHeaders() });
}

export function fetchUsage(): Promise<Usage> {
  return apiRequest<Usage>(`${BASE}/usage`, { headers: authHeaders() });
}

/** The plans an owner may switch to on their own, cheapest first. */
export function fetchPlans(): Promise<Plan[]> {
  return apiRequest<Plan[]>(`${BASE}/plans`, { headers: authHeaders() });
}

export async function fetchInvoices(limit = 12): Promise<Invoice[]> {
  const page = await apiRequest<Paginated<Invoice>>(`${BASE}/invoices?limit=${limit}`, { headers: authHeaders() });
  return page.rows;
}

export interface ChangePlanResult {
  /** `immediately` for a trial or an upgrade; `next_period` for a downgrade, which waits for the paid period to end. */
  effective: 'immediately' | 'next_period';
  subscription: Subscription;
}

export function changePlan(planKey: string, interval?: BillingInterval): Promise<ChangePlanResult> {
  return apiRequest<ChangePlanResult>(`${BASE}/change-plan`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ planKey, ...(interval ? { interval } : null) }),
  });
}

/** The API's own keys for "your plan is why this was refused" — the app turns each into a way to the plan page. */
export const PLAN_ERROR_KEYS = ['PLAN_LIMIT_REACHED', 'FEATURE_LOCKED', 'SUBSCRIPTION_RESTRICTED'] as const;

export const isPlanError = (error: unknown): boolean => error instanceof ApiError && PLAN_ERROR_KEYS.some((key) => key === error.key);
export const isSuspension = (error: unknown): boolean => error instanceof ApiError && error.key === 'SUBSCRIPTION_SUSPENDED';
export const isFeatureLocked = (error: unknown): boolean => error instanceof ApiError && error.key === 'FEATURE_LOCKED';
