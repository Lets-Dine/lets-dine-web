import type { Minor } from '../domain/types';
import { apiRequest } from './http';
import { authHeaders } from './live-admin';

export type MarginSort = 'marginPct' | 'margin' | 'units' | 'name';

/** One dish's food-cost picture over a range. Food cost only: no labour, rent, discounts or tax. */
export interface DishMargin {
  dishId: string;
  name: string;
  price: Minor;
  units: number;
  revenue: Minor;
  /** Share (0..1) of sold units whose cost is fully known. */
  coverage: number;
  cost: Minor | null;
  margin: Minor | null;
  /** 0..1, over the costed units only. */
  marginPct: number | null;
  /** The base recipe at the latest purchase prices; null with no recipe or an unpriced ingredient. */
  recipeCost: Minor | null;
  /** Visible reviews, all-time rather than the chosen range. */
  ratingCount: number;
  avgRating: number | null;
  /** 0..1 would-order-again; null until there are enough reviews. */
  recommendRate: number | null;
}

export interface DishMargins {
  from: string;
  to: string;
  rows: DishMargin[];
}

export const fetchDishMargins = (range: { from?: Date; to?: Date; sortBy?: MarginSort } = {}) => {
  const params = new URLSearchParams({ sortBy: range.sortBy ?? 'marginPct' });
  if (range.from) params.set('from', range.from.toISOString());
  if (range.to) params.set('to', range.to.toISOString());
  return apiRequest<DishMargins>(`/restaurant/dish-margins?${params.toString()}`, { headers: authHeaders() });
};

/** Below this, a dish's margin rests on too few costed sales to rank it. */
export const MIN_COVERAGE = 0.8;

export type Group = 'star' | 'plowhorse' | 'puzzle' | 'dog';

export const GROUP_LABEL: Record<Group, { label: string; hint: string }> = {
  star: { label: 'Star', hint: 'Sells well and earns well — keep it front and centre.' },
  plowhorse: { label: 'Plowhorse', hint: 'Sells well but earns little — try a higher price or cheaper ingredients.' },
  puzzle: { label: 'Puzzle', hint: 'Earns well but sells little — promote it.' },
  dog: { label: 'Dog', hint: 'Sells little and earns little — consider dropping it.' },
};

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Sorts the dishes that have enough costed sales into the four groups, against the medians of those same dishes. Needs at least 4 to mean anything. */
export const rankable = (rows: DishMargin[]) => rows.filter((r) => r.units > 0 && r.marginPct !== null && r.coverage >= MIN_COVERAGE);

export function groupDishes(rows: DishMargin[]): Map<string, Group> {
  const ranked = rankable(rows);
  const out = new Map<string, Group>();
  if (ranked.length < 4) return out;
  const units = median(ranked.map((r) => r.units));
  const pct = median(ranked.map((r) => r.marginPct as number));
  for (const r of ranked) {
    const popular = r.units >= units;
    const rich = (r.marginPct as number) >= pct;
    out.set(r.dishId, popular ? (rich ? 'star' : 'plowhorse') : rich ? 'puzzle' : 'dog');
  }
  return out;
}

/** Mirrors the backend's MERCH.minRatingsToRank: fewer reviews than this and we show the rating but never act on it. */
export const MIN_RATINGS = 5;
const LOVED = 4.2;
const WEAK = 3.5;

const PRICE_STEP = 500; // Rs 5 in minor units
/** A price rise is only ever suggested in steps this small: a jump straight to the target margin isn't believable. */
const MAX_RISE = 0.25;

/** Enough reviews to judge, and diners are lukewarm. */
export const isLukewarm = (r: DishMargin) => r.avgRating !== null && r.ratingCount >= MIN_RATINGS && r.avgRating < WEAK;
const isLoved = (r: DishMargin) => r.avgRating !== null && r.ratingCount >= MIN_RATINGS && r.avgRating >= LOVED;

/** The margin the menu's middle dish earns: what a Plowhorse is nudged towards. Null when there are too few dishes to group. */
export const targetMargin = (rows: DishMargin[]): number | null => {
  const ranked = rankable(rows);
  return ranked.length < 4 ? null : median(ranked.map((r) => r.marginPct as number));
};

/**
 * One concrete next step per dish. Ratings decide the tone: a Plowhorse diners love can take a price rise, one they
 * don't should be fixed first. The price rise assumes volume holds, which only the owner can judge.
 */
export function advise(r: DishMargin, group: Group | undefined, target: number | null, money: (v: Minor) => string): string | null {
  if (!group) return null;
  const loved = isLoved(r);
  const lukewarm = isLukewarm(r);
  if (group === 'plowhorse') {
    if (lukewarm) return 'Sells well but diners are lukewarm — improve it before raising the price.';
    const costed = Math.round(r.units * r.coverage);
    if (target === null || r.cost === null || costed === 0 || target >= 1) return null;
    const unitCost = r.cost / costed;
    const wanted = Math.ceil(unitCost / (1 - target) / PRICE_STEP) * PRICE_STEP;
    const suggested = Math.min(wanted, Math.ceil((r.price * (1 + MAX_RISE)) / PRICE_STEP) * PRICE_STEP);
    if (suggested <= r.price) return null;
    const after = 1 - unitCost / suggested;
    return `Try raising the price to ${money(suggested)} for about ${Math.round(after * 100)}% margin${loved ? ' — diners love it, so it should hold' : ''}.`;
  }
  if (group === 'puzzle') return loved ? 'Proven good and under-ordered — feature it at the top of the menu.' : 'Earns well but sells little — feature it or have staff suggest it.';
  if (group === 'dog') return lukewarm ? 'Low-rated and low-earning — drop it.' : 'Sells little and earns little — rework the recipe or drop it.';
  if (group === 'star' && lukewarm) return 'Earns well but diners are lukewarm — fix it before it costs you.';
  return null;
}
