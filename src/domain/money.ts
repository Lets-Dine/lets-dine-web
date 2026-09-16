import type { Minor } from './types';

/**
 * All arithmetic happens in integer minor units. Formatting is the only
 * place a decimal point is ever introduced.
 */

const SYMBOLS: Record<string, string> = { NPR: 'Rs.', INR: '₹', USD: '$', EUR: '€' };

export function symbolFor(currency: string): string {
  return SYMBOLS[currency] ?? currency;
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
