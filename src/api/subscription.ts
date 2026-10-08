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
  /** `immediately` for a trial; `on_payment` for an upgrade on a paid period; `next_period` for a downgrade, which waits for the paid period to end. */
  effective: 'immediately' | 'next_period' | 'on_payment';
  subscription: Subscription;
  /** `on_payment`: the prorated upgrade invoice, which must be paid before the new plan starts. */
  invoice?: Invoice;
}

export function changePlan(planKey: string, interval?: BillingInterval): Promise<ChangePlanResult> {
  return apiRequest<ChangePlanResult>(`${BASE}/change-plan`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ planKey, ...(interval ? { interval } : null) }),
  });
}

export interface EsewaCheckout {
  url: string;
  fields: Record<string, string>;
}

export function startEsewa(invoiceId: string): Promise<EsewaCheckout> {
  return apiRequest<EsewaCheckout>(`${BASE}/invoices/${invoiceId}/esewa`, { method: 'POST', headers: authHeaders() });
}

/** `data` is the base64 blob eSewa puts on the return URL; the API checks it with eSewa before settling. */
export function confirmEsewa(data: string): Promise<Invoice> {
  return apiRequest<Invoice>(`${BASE}/esewa/verify`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ data }) });
}

/** eSewa takes a form POST, not a link — so build one and send the payer there. */
export function redirectToEsewa({ url, fields }: EsewaCheckout): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}

/** The API's own keys for "your plan is why this was refused" — the app turns each into a way to the plan page. */
export const PLAN_ERROR_KEYS = ['PLAN_LIMIT_REACHED', 'FEATURE_LOCKED', 'SUBSCRIPTION_RESTRICTED'] as const;

export const isPlanError = (error: unknown): boolean => error instanceof ApiError && PLAN_ERROR_KEYS.some((key) => key === error.key);
export const isSuspension = (error: unknown): boolean => error instanceof ApiError && error.key === 'SUBSCRIPTION_SUSPENDED';
export const isFeatureLocked = (error: unknown): boolean => error instanceof ApiError && error.key === 'FEATURE_LOCKED';
