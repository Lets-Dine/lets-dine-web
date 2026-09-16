import { MERCH, RANK_WEIGHTS } from './config';
import type { BadgeKind, Dish, DishStats } from './types';

/**
 * Bayesian-adjusted rating: a 5.0 from two diners must not outrank a 4.8 from
 * five hundred. Ranking never uses the raw average.
 */
export function confidenceScore(stats: DishStats, restaurantMean: number): number {
  const { avgRating, ratingCount } = stats;
  if (avgRating === null || ratingCount === 0) return restaurantMean * 0.9;
  const w = MERCH.confidenceWeight;
  return (restaurantMean * w + avgRating * ratingCount) / (w + ratingCount);
}

export function velocityRatio(stats: DishStats): number {
  if (stats.ordersPrev30d === 0) return stats.orders30d > 0 ? 2 : 1;
  return stats.orders30d / stats.ordersPrev30d;
}

/** 0..1 popularity, normalised against the busiest dish on the menu. */
function normalisedPopularity(stats: DishStats, maxOrders: number): number {
  if (maxOrders <= 0) return 0;
  return Math.min(1, stats.orders30d / maxOrders);
}

export interface RankContext {
  restaurantMean: number;
  maxOrders30d: number;
  maxPrice: number;
}

export function buildRankContext(dishes: Dish[]): RankContext {
  const rated = dishes.filter((d) => d.stats.avgRating !== null && d.stats.ratingCount > 0);
  const totalRatings = rated.reduce((n, d) => n + d.stats.ratingCount, 0);
  const restaurantMean =
    totalRatings > 0
      ? rated.reduce((sum, d) => sum + (d.stats.avgRating ?? 0) * d.stats.ratingCount, 0) / totalRatings
      : 4;
  return {
    restaurantMean,
    maxOrders30d: Math.max(0, ...dishes.map((d) => d.stats.orders30d)),
    maxPrice: Math.max(1, ...dishes.map((d) => d.price)),
  };
}

/** Simple weighted MVP score. Replace the formula, not the call sites. */
export function rankScore(dish: Dish, ctx: RankContext): number {
  const s = dish.stats;
  const rating = confidenceScore(s, ctx.restaurantMean) / 5;
  const popularity = normalisedPopularity(s, ctx.maxOrders30d);
  const recommendation = s.recommendRate ?? 0.5;
  const trend = Math.min(1, Math.max(0, (velocityRatio(s) - 0.8) / 1.2));
  return (
    rating * RANK_WEIGHTS.rating +
    popularity * RANK_WEIGHTS.popularity +
    recommendation * RANK_WEIGHTS.recommendation +
    trend * RANK_WEIGHTS.trend
  );
}

/** Value = confidence-adjusted rating per rupee, normalised across the menu. */
export function valueScore(dish: Dish, ctx: RankContext): number {
  return confidenceScore(dish.stats, ctx.restaurantMean) / (dish.price / ctx.maxPrice);
}

export function hasEnoughRatings(stats: DishStats): boolean {
  return stats.ratingCount >= MERCH.minRatingsToRank;
}

export function badgesFor(dish: Dish, ctx: RankContext): BadgeKind[] {
  const s = dish.stats;
  const out: BadgeKind[] = [];
  if (s.orders30d >= MERCH.popular.minOrders30d) out.push('popular');
  if (
    (s.avgRating ?? 0) >= MERCH.loved.minRating &&
    s.ratingCount >= MERCH.loved.minRatings &&
    !out.includes('popular')
  )
    out.push('loved');
  if (velocityRatio(s) >= MERCH.trending.minVelocityRatio && s.orders30d >= MERCH.trending.minOrders30d)
    out.push('trending');
  if (
    (s.avgRating ?? 0) >= MERCH.hiddenGem.minRating &&
    s.ratingCount >= MERCH.hiddenGem.minRatings &&
    s.orders30d <= MERCH.hiddenGem.maxOrders30d
  )
    out.push('gem');
  if (dish.isFeatured) out.push('pick');
  void ctx;
  return out;
}

export interface MerchSection {
  key: string;
  title: string;
  subtitle: string;
  emoji: string;
  dishes: Dish[];
}

/**
 * Merchandising sections are computed views over the menu, not stored entities.
 */
export function buildSections(dishes: Dish[], ctx: RankContext): MerchSection[] {
  const orderable = dishes.filter((d) => d.isAvailable);

  const loved = orderable
    .filter((d) => d.stats.ratingCount >= MERCH.loved.minRatings && (d.stats.avgRating ?? 0) >= MERCH.loved.minRating)
    .sort((a, b) => rankScore(b, ctx) - rankScore(a, ctx))
    .slice(0, MERCH.loved.limit);

  const trending = orderable
    .filter(
      (d) => velocityRatio(d.stats) >= MERCH.trending.minVelocityRatio && d.stats.orders30d >= MERCH.trending.minOrders30d,
    )
    .sort((a, b) => velocityRatio(b.stats) - velocityRatio(a.stats))
    .slice(0, MERCH.trending.limit);

  const gems = orderable
    .filter(
      (d) =>
        (d.stats.avgRating ?? 0) >= MERCH.hiddenGem.minRating &&
        d.stats.ratingCount >= MERCH.hiddenGem.minRatings &&
        d.stats.orders30d <= MERCH.hiddenGem.maxOrders30d,
    )
    .sort((a, b) => confidenceScore(b.stats, ctx.restaurantMean) - confidenceScore(a.stats, ctx.restaurantMean))
    .slice(0, MERCH.hiddenGem.limit);

  const value = orderable
    .filter((d) => d.stats.ratingCount >= MERCH.goodValue.minRatings && (d.stats.avgRating ?? 0) >= MERCH.goodValue.minRating)
    .sort((a, b) => valueScore(b, ctx) - valueScore(a, ctx))
    .slice(0, MERCH.goodValue.limit);

  return [
    {
      key: 'loved',
      title: 'Most loved here',
      subtitle: 'Highest rated by diners who actually ordered them',
      emoji: '🔥',
      dishes: loved,
    },
    { key: 'trending', title: 'Trending today', subtitle: 'Ordered a lot more than usual this week', emoji: '📈', dishes: trending },
    { key: 'gem', title: 'Hidden gems', subtitle: 'Loved by the few who tried them', emoji: '💎', dishes: gems },
    { key: 'value', title: 'Best value', subtitle: 'Great ratings for the price', emoji: '🪙', dishes: value },
  ].filter((s) => s.dishes.length > 0);
}
