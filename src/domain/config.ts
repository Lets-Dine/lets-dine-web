/**
 * Business thresholds live here, not scattered through the UI. Swapping the
 * merchandising rules should never require touching a component.
 */
export const MERCH = {
  /** Bayesian prior strength — how many "average" votes a dish starts with. */
  confidenceWeight: 12,
  /** Below this, we show a rating but never rank on it. */
  minRatingsToRank: 5,
  /** Below this, we do not claim a recommendation rate at all. */
  minRatingsForRecommendRate: 5,

  loved: { minRating: 4.4, minRatings: 20, limit: 6 },
  popular: { minOrders30d: 140 },
  trending: { minVelocityRatio: 1.35, minOrders30d: 40, limit: 6 },
  hiddenGem: { minRating: 4.5, minRatings: 8, maxOrders30d: 70, limit: 4 },
  goodValue: { minRating: 4.2, minRatings: 8, limit: 4 },
} as const;

/** How the MVP weighs a dish for ranking. Deliberately replaceable. */
export const RANK_WEIGHTS = {
  rating: 0.5,
  popularity: 0.25,
  recommendation: 0.15,
  trend: 0.1,
} as const;

/** Simulated kitchen timings for the demo order pipeline, in seconds. */
export const ORDER_TIMELINE_SECONDS = {
  ACCEPTED: 6,
  PREPARING: 16,
  READY: 46,
  COMPLETED: 70,
} as const;

/** Wait after the kitchen marks served before nudging for a rating. */
export const REVIEW_REMIND_MS = 90_000;

export const REVIEW_TAGS = [
  'Delicious',
  'Spicy',
  'Mild',
  'Crispy',
  'Juicy',
  'Fresh',
  'Large portion',
  'Small portion',
  'Good value',
  'Expensive',
  'Great presentation',
  'Kid friendly',
] as const;
