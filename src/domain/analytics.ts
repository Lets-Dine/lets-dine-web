/**
 * The product metric that matters most is the Dish Decision Rate: how often
 * opening a dish page leads to adding it to the cart. That only means anything
 * if the funnel is instrumented from the first screen, so it is wired in here
 * from day one and kept deliberately trivial to swap for a real sink.
 */
export type AnalyticsEvent =
  | 'menu_viewed'
  | 'dish_detail_viewed'
  | 'dish_added_to_cart'
  | 'cart_viewed'
  | 'order_placed'
  | 'order_completed'
  | 'review_submitted';

const KEY = 'myfood.analytics.v1';

type Counts = Partial<Record<AnalyticsEvent, number>>;

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  try {
    const counts = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Counts;
    counts[event] = (counts[event] ?? 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(counts));
  } catch {
    /* analytics must never break the diner's flow */
  }
  if (import.meta.env?.DEV) console.debug('[analytics]', event, props);
}

export function funnel(): { dishDecisionRate: number | null; counts: Counts } {
  let counts: Counts = {};
  try {
    counts = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Counts;
  } catch {
    /* ignore */
  }
  const views = counts.dish_detail_viewed ?? 0;
  const adds = counts.dish_added_to_cart ?? 0;
  return { dishDecisionRate: views > 0 ? adds / views : null, counts };
}
