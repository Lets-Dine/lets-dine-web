import { MERCH } from './config';
import type { Dish, Minor, Order } from './types';

/**
 * §31. Everything the restaurant side reports is computed here from orders and
 * dish statistics, so a number on a tile and the same number in a table cannot
 * drift apart. Cancelled orders never count as revenue.
 */

/** One branch's slice of the restaurant's results — what an owner reads to compare locations. */
export interface BranchPerformance {
  branchId: string;
  branchName: string;
  orders: number;
  completed: number;
  cancelled: number;
  grossRevenue: number;
  averageOrderValue: number;
}

export type Period = 'today' | 'week' | 'month';

export const PERIOD_LABEL: Record<Period, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
};

/**
 * `GET /restaurant/analytics/revenue?period=...` — settled-payment revenue for
 * the period so far against the whole of the one before it (today vs. all of
 * yesterday, not just the hours so far). `current`/`previous` are minor units;
 * `differencePercentage` is already a percent (12.34 means +12.34%), not the
 * fraction `changeRatio` below returns.
 */
export interface RevenueComparison {
  current: Minor;
  previous: Minor;
  differencePercentage: number;
}

export type TrendPeriod = 'week' | 'month' | 'year';

/**
 * `GET /restaurant/analytics/revenue/trend?period=...` — settled revenue slot by slot (a day for a
 * week or month, a month for a year) beside the same slot of the period before. `date` is the
 * restaurant-local day ("2026-01-14") or, for a year, month ("2026-01"). `current` is null for a slot
 * that hasn't happened yet; `previous` is null where the earlier period has no such slot (the 31st).
 * `differencePercentage` is a percent, measured against `previousToDate`, not all of `previousTotal`.
 */
export interface RevenueTrendPoint {
  index: number;
  date: string;
  current: Minor | null;
  previousDate: string | null;
  previous: Minor | null;
}

export interface RevenueTrend {
  period: TrendPeriod;
  granularity: 'day' | 'month';
  currentTotal: Minor;
  previousTotal: Minor;
  previousToDate: Minor;
  differencePercentage: number;
  points: RevenueTrendPoint[];
}

/**
 * The offline twin of the trend endpoint, in the browser's own timezone. Same layout rules as the
 * backend: Sunday-start weeks, one slot per day for a week or month, one per month for a year.
 */
export function buildRevenueTrend(orders: Order[], period: TrendPeriod, now: Date = new Date()): RevenueTrend {
  const pad = (n: number) => String(n).padStart(2, '0');
  const monthKey = (y: number, m: number) => `${y}-${pad(m)}`;
  const dayKey = (d: Date) => `${monthKey(d.getFullYear(), d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

  const byDay = new Map<string, Minor>();
  const byMonth = new Map<string, Minor>();
  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const at = new Date(order.createdAt);
    byDay.set(dayKey(at), (byDay.get(dayKey(at)) ?? 0) + order.total);
    const mk = monthKey(at.getFullYear(), at.getMonth() + 1);
    byMonth.set(mk, (byMonth.get(mk) ?? 0) + order.total);
  }

  const year = now.getFullYear();
  const slots: { key: string; previousKey: string | null }[] = [];
  let todayIndex: number;
  let source = byDay;

  if (period === 'year') {
    source = byMonth;
    for (let m = 1; m <= 12; m++) slots.push({ key: monthKey(year, m), previousKey: monthKey(year - 1, m) });
    todayIndex = now.getMonth();
  } else {
    const today = new Date(year, now.getMonth(), now.getDate());
    const start = period === 'week' ? addDays(today, -today.getDay()) : new Date(year, now.getMonth(), 1);
    const prevStart = period === 'week' ? addDays(start, -7) : new Date(year, now.getMonth() - 1, 1);
    const length = period === 'week' ? 7 : daysIn(year, now.getMonth() + 1);
    const prevLength = period === 'week' ? 7 : daysIn(prevStart.getFullYear(), prevStart.getMonth() + 1);
    for (let i = 0; i < length; i++) {
      slots.push({ key: dayKey(addDays(start, i)), previousKey: i < prevLength ? dayKey(addDays(prevStart, i)) : null });
    }
    todayIndex = Math.round((today.getTime() - start.getTime()) / 86_400_000);
  }

  let currentTotal = 0;
  let previousTotal = 0;
  let previousToDate = 0;
  const points = slots.map((slot, index) => {
    const current = index > todayIndex ? null : (source.get(slot.key) ?? 0);
    const previous = slot.previousKey === null ? null : (source.get(slot.previousKey) ?? 0);
    currentTotal += current ?? 0;
    previousTotal += previous ?? 0;
    if (index <= todayIndex) previousToDate += previous ?? 0;
    return { index, date: slot.key, current, previousDate: slot.previousKey, previous };
  });

  const differencePercentage =
    previousToDate === 0 ? (currentTotal === 0 ? 0 : 100) : Number((((currentTotal - previousToDate) / previousToDate) * 100).toFixed(2));
  return { period, granularity: period === 'year' ? 'month' : 'day', currentTotal, previousTotal, previousToDate, differencePercentage, points };
}

/**
 * `GET /restaurant/analytics/orders?period=...` — order count for the period
 * so far against the whole of the one before it, same shape and boundaries as
 * `RevenueComparison`. `differencePercentage` is a percent, not a fraction.
 */
export interface OrderComparison {
  current: number;
  previous: number;
  differencePercentage: number;
}

/**
 * `GET /restaurant/analytics/top-dishes?startDate=...&endDate=...` — dishes
 * actually paid for, ranked by units sold. No dates: everything to date.
 * `startDate` only: that one day. Both: that inclusive range.
 */
export interface TopSellingDish {
  dishId: string;
  dishName: string;
  orderCount: number;
  totalAmount: Minor;
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Weeks start on Monday, which is how a restaurant counts them. */
function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const shift = (d.getDay() + 6) % 7;
  return d.getTime() - shift * DAY_MS;
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export interface Window {
  from: number;
  to: number;
  /** The equivalent window immediately before, for like-for-like comparison. */
  prevFrom: number;
  prevTo: number;
}

export function windowFor(period: Period, now: number = Date.now()): Window {
  if (period === 'today') {
    const from = startOfDay(now);
    return { from, to: now, prevFrom: from - DAY_MS, prevTo: now - DAY_MS };
  }
  if (period === 'week') {
    const from = startOfWeek(now);
    return { from, to: now, prevFrom: from - 7 * DAY_MS, prevTo: now - 7 * DAY_MS };
  }
  const from = startOfMonth(now);
  const prev = new Date(from);
  prev.setMonth(prev.getMonth() - 1);
  return { from, to: now, prevFrom: prev.getTime(), prevTo: from };
}

function within(order: Order, from: number, to: number): boolean {
  const at = Date.parse(order.createdAt);
  return at >= from && at <= to;
}

export function isRevenue(order: Order): boolean {
  return order.status !== 'CANCELLED';
}

export interface Totals {
  orders: number;
  revenue: Minor;
  cancelled: number;
  averageOrder: Minor;
  covers: number;
}

export function totalsIn(orders: Order[], from: number, to: number): Totals {
  let count = 0;
  let revenue = 0;
  let cancelled = 0;
  let covers = 0;
  for (const order of orders) {
    if (!within(order, from, to)) continue;
    if (!isRevenue(order)) {
      cancelled++;
      continue;
    }
    count++;
    revenue += order.total;
    for (const item of order.items) covers += item.quantity;
  }
  return { orders: count, revenue, cancelled, averageOrder: count ? Math.round(revenue / count) : 0, covers };
}

/** Positive means growth. Null when there is no prior figure to compare against. */
export function changeRatio(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return (current - previous) / previous;
}

export interface PeriodReport {
  period: Period;
  window: Window;
  current: Totals;
  previous: Totals;
  orderChange: number | null;
  revenueChange: number | null;
}

export function periodReport(orders: Order[], period: Period, now: number = Date.now()): PeriodReport {
  const w = windowFor(period, now);
  const current = totalsIn(orders, w.from, w.to);
  const previous = totalsIn(orders, w.prevFrom, w.prevTo);
  return {
    period,
    window: w,
    current,
    previous,
    orderChange: changeRatio(current.orders, previous.orders),
    revenueChange: changeRatio(current.revenue, previous.revenue),
  };
}

/* ── Dish performance ──────────────────────────────────────────────── */

export interface DishPerformance {
  dishId: string;
  name: string;
  units: number;
  orders: number;
  revenue: Minor;
  avgRating: number | null;
  ratingCount: number;
  recommendRate: number | null;
  isAvailable: boolean;
  isArchived: boolean;
}

export function dishPerformance(
  orders: Order[],
  dishes: Dish[],
  from: number,
  to: number,
): DishPerformance[] {
  const byId = new Map<string, DishPerformance>();
  for (const dish of dishes) {
    byId.set(dish.id, {
      dishId: dish.id,
      name: dish.name,
      units: 0,
      orders: 0,
      revenue: 0,
      avgRating: dish.stats.avgRating,
      ratingCount: dish.stats.ratingCount,
      recommendRate: dish.stats.recommendRate,
      isAvailable: dish.isAvailable,
      isArchived: dish.isArchived,
    });
  }

  for (const order of orders) {
    if (!isRevenue(order) || !within(order, from, to)) continue;
    for (const item of order.items) {
      let row = byId.get(item.dishId);
      if (!row) {
        // A dish can be archived after it sold; its history still counts.
        row = {
          dishId: item.dishId,
          name: item.dishNameSnapshot,
          units: 0,
          orders: 0,
          revenue: 0,
          avgRating: null,
          ratingCount: 0,
          recommendRate: null,
          isAvailable: false,
          isArchived: true,
        };
        byId.set(item.dishId, row);
      }
      row.units += item.quantity;
      row.orders += 1;
      row.revenue += item.unitPrice * item.quantity;
    }
  }

  return [...byId.values()];
}

/** Only dishes with enough ratings to say anything can win or lose on rating. */
export function rankedByRating(rows: DishPerformance[], direction: 'best' | 'worst'): DishPerformance[] {
  const rated = rows.filter((r) => r.ratingCount >= MERCH.minRatingsToRank && r.avgRating !== null && !r.isArchived);
  return [...rated].sort((a, b) =>
    direction === 'best' ? (b.avgRating ?? 0) - (a.avgRating ?? 0) : (a.avgRating ?? 0) - (b.avgRating ?? 0),
  );
}

export function rankedByReorder(rows: DishPerformance[]): DishPerformance[] {
  return rows
    .filter((r) => r.recommendRate !== null && r.ratingCount >= MERCH.minRatingsForRecommendRate && !r.isArchived)
    .sort((a, b) => (b.recommendRate ?? 0) - (a.recommendRate ?? 0));
}

/* ── Feedback ──────────────────────────────────────────────────────── */

export interface FeedbackSummary {
  restaurantRating: number | null;
  averageDishRating: number | null;
  reviewCount: number;
  recommendRate: number | null;
  ratedDishes: number;
  unratedDishes: number;
}

/** Weighted by rating count: one dish with 500 reviews outvotes one with 3. */
export function feedbackSummary(dishes: Dish[]): FeedbackSummary {
  const live = dishes.filter((d) => !d.isArchived);
  const rated = live.filter((d) => d.stats.ratingCount > 0 && d.stats.avgRating !== null);
  const reviewCount = rated.reduce((n, d) => n + d.stats.ratingCount, 0);
  const weighted = rated.reduce((sum, d) => sum + (d.stats.avgRating ?? 0) * d.stats.ratingCount, 0);
  const recommendable = rated.filter((d) => d.stats.recommendRate !== null);
  const recommendWeight = recommendable.reduce((n, d) => n + d.stats.ratingCount, 0);

  return {
    restaurantRating: reviewCount > 0 ? weighted / reviewCount : null,
    averageDishRating: rated.length > 0 ? rated.reduce((s, d) => s + (d.stats.avgRating ?? 0), 0) / rated.length : null,
    reviewCount,
    recommendRate:
      recommendWeight > 0
        ? recommendable.reduce((s, d) => s + (d.stats.recommendRate ?? 0) * d.stats.ratingCount, 0) / recommendWeight
        : null,
    ratedDishes: rated.length,
    unratedDishes: live.length - rated.length,
  };
}

/* ── Series ────────────────────────────────────────────────────────── */

export interface DayPoint {
  day: number;
  label: string;
  orders: number;
  revenue: Minor;
}

/** Daily revenue for the trailing `days`, oldest first, today included. */
export function dailySeries(orders: Order[], days: number, now: number = Date.now()): DayPoint[] {
  const today = startOfDay(now);
  const points: DayPoint[] = [];
  const index = new Map<number, DayPoint>();

  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY_MS;
    const point: DayPoint = {
      day,
      label: new Date(day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      orders: 0,
      revenue: 0,
    };
    points.push(point);
    index.set(day, point);
  }

  for (const order of orders) {
    if (!isRevenue(order)) continue;
    const point = index.get(startOfDay(Date.parse(order.createdAt)));
    if (!point) continue;
    point.orders += 1;
    point.revenue += order.total;
  }
  return points;
}

/** Orders by hour of day across the window — where the shifts actually are. */
export function hourlyLoad(orders: Order[], from: number, to: number): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const order of orders) {
    if (!isRevenue(order) || !within(order, from, to)) continue;
    hours[new Date(order.createdAt).getHours()] += 1;
  }
  return hours;
}
