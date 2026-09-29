import { billableItems } from './orderStatus';
import type { Dish, Minor, Order } from './types';

/**
 * All arithmetic happens in integer minor units. Formatting is the only
 * place a decimal point is ever introduced.
 */

const SYMBOLS: Record<string, string> = { NPR: 'Rs.', INR: '₹', USD: '$', EUR: '€' };

export function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? currency;
}

/** A varianted dish has no single price of its own — lowest to highest across every non-archived variant. */
export function dishPriceRange(dish: Pick<Dish, 'variants'>): { min: Minor; max: Minor } {
  const prices = dish.variants.filter((v) => !v.isArchived).map((v) => v.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export function formatMoney(minor: Minor, currency: string, opts?: { symbol?: boolean }): string {
  const showSymbol = opts?.symbol !== false;
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / 100);
  const cents = abs % 100;
  const grouped = major.toLocaleString('en-US');
  const body = cents === 0 ? grouped : `${grouped}.${String(cents).padStart(2, '0')}`;
  return `${negative ? '−' : ''}${showSymbol ? `${symbolFor(currency)} ` : ''}${body}`;
}

/** Percentage of an amount, rounded half-up to the nearest minor unit. */
export function percentOf(minor: Minor, rate: number): Minor {
  return Math.round(minor * rate);
}

export function sumLines(lines: { unitPrice: Minor; quantity: number }[]): Minor {
  return lines.reduce((total, line) => total + line.unitPrice * line.quantity, 0);
}

/**
 * Recomputes an order's totals from its items, excluding any that have been
 * individually cancelled — shared by the mock diner and staff transports so
 * a cancelled line never gets charged.
 */
export function recomputeTotals<
  T extends { items: Order['items']; subtotal: Minor; serviceCharge: Minor; tax: Minor; total: Minor; deliveryFee?: Minor },
>(order: T, restaurant: { serviceChargeRate: number; taxRate: number }): T {
  const subtotal = sumLines(billableItems(order.items));
  const serviceCharge = percentOf(subtotal, restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, restaurant.taxRate);
  const deliveryFee = order.deliveryFee ?? 0;
  return { ...order, subtotal, serviceCharge, tax, total: subtotal + serviceCharge + tax + deliveryFee };
}
