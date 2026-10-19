import type { Minor } from '../domain/types';
import { apiRequest } from './http';
import { authHeaders } from './live-admin';

/** One dish's paid sales over a range, plus its units over the equal-length window just before. */
export interface DishSales {
  dishId: string;
  dishName: string;
  orderCount: number;
  totalAmount: Minor;
  previousCount: number | null;
}

const DAY = 86_400_000;

/** The last `days` calendar days, today included — the backend compares against the `days` before that. */
export const fetchDishSales = (days: number) => {
  const now = Date.now();
  const params = new URLSearchParams({ startDate: new Date(now - (days - 1) * DAY).toISOString(), endDate: new Date(now).toISOString() });
  return apiRequest<DishSales[]>(`/restaurant/analytics/top-dishes?${params.toString()}`, { headers: authHeaders() });
};

/** Below this many sales across both windows, a percentage is noise (2 → 4 is "+100%"). */
export const MIN_SALES_TO_JUDGE = 8;
/** A move smaller than this reads as steady. */
const STEADY_BAND = 0.1;

export type Trend =
  | { kind: 'up' | 'down'; pct: number; delta: number }
  | { kind: 'new' | 'steady' | 'quiet'; delta: number };

export function trendOf(units: number, previous: number | null): Trend {
  const delta = units - (previous ?? 0);
  if (previous === null || units + previous < MIN_SALES_TO_JUDGE) return { kind: 'quiet', delta };
  if (previous === 0) return { kind: 'new', delta };
  const pct = delta / previous;
  if (Math.abs(pct) < STEADY_BAND) return { kind: 'steady', delta };
  return { kind: pct > 0 ? 'up' : 'down', pct, delta };
}
