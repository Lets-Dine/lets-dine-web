import type { Branch } from './types';

const pct = (rate: number) => `${+(rate * 100).toFixed(1)}%`;

/** One line on what a branch charges beyond the restaurant's own defaults. A null rate means "follows the restaurant". */
export function feeSummary(b: Pick<Branch, 'serviceChargeRate' | 'taxRate' | 'deliveryFeeAmount'>): string {
  const parts = [
    b.serviceChargeRate !== null && `${pct(b.serviceChargeRate)} service`,
    b.taxRate !== null && `${pct(b.taxRate)} tax`,
    b.deliveryFeeAmount !== null && 'own delivery fee',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : "Restaurant's fees";
}
