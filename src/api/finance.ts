import type { Minor, Payment, PaymentMethod, PaymentStatus } from '../domain/types';
import { IS_LIVE_API, apiRequest } from './http';
import type { Paginated } from './http';
import { toPayment } from './live-admin';
import type { ApiPayment } from './live-admin';
import { authHeaders } from './live-admin';
import type { LedgerEntry } from './ledger';

/** Receivables, payables and the cash book over a window. Live backend only — the offline demo keeps no books. */
export const FINANCE_ENABLED = IS_LIVE_API;

export type TransactionType = 'SALE' | 'PURCHASE' | 'EXPENSE' | 'INCOME' | 'TRANSFER' | 'REFUND' | 'DELIVERY_FEE';

/** One financial activity, paid or not — a view over the sale, bill, expense or refund that caused it. */
export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  description: string;
  totalAmount: Minor;
  paidAmount: Minor;
  /** A receivable for a sale, a payable for a purchase. */
  outstandingAmount: Minor;
  paymentStatus: PaymentStatus;
  transactionDate: string;
  dueDate: string | null;
  counterparty: { kind: 'CUSTOMER' | 'SUPPLIER' | 'RIDER' | 'PARTNER'; id: string | null; name: string } | null;
  source: { type: 'PAYMENT' | 'STOCK_LOT' | 'EXPENSE' | 'PAYMENT_REFUND' | 'DELIVERY_RUN'; id: string };
  /** The sale this row belongs to: itself for a sale, the original sale for a refund. */
  saleId: string | null;
  refundedAmount: Minor;
  createdByName: string | null;
}

export interface TransactionSummary {
  receivables: { outstanding: Minor; overdue: Minor; count: number };
  payables: { outstanding: Minor; count: number };
  /** Delivery fees earned by riders and partners and not yet paid out. */
  courierFees: { outstanding: Minor; count: number };
}

export interface TransactionQuery {
  type?: TransactionType;
  paymentStatus?: PaymentStatus;
  category?: string;
  from?: string;
  to?: string;
  customerId?: string;
  supplier?: string;
  outstandingOnly?: boolean;
  limit?: number;
  offset?: number;
}

const qs = (query: object) =>
  new URLSearchParams(Object.entries(query).filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)])).toString();

export const fetchTransactions = (query: TransactionQuery = {}) =>
  apiRequest<Paginated<Transaction>>(`/restaurant/transactions?${qs(query)}`, { headers: authHeaders() });

export const fetchTransactionSummary = () => apiRequest<TransactionSummary>('/restaurant/transactions/summary', { headers: authHeaders() });

export interface CashBook {
  from: string;
  to: string;
  opening: { cash: Minor; bank: Minor };
  receipts: { cash: Minor; bank: Minor };
  payments: { cash: Minor; bank: Minor };
  transfers: { cashToBank: Minor; bankToCash: Minor };
  /** What a cash-up inside the window counted beyond what the books expected. */
  adjustment: { cash: Minor; bank: Minor };
  closing: { cash: Minor; bank: Minor };
  entries: LedgerEntry[];
}

/** `from` exclusive, `to` inclusive, at most 31 days — the same edges a close uses. */
export const fetchCashBook = (range: { from: string; to: string }) =>
  apiRequest<CashBook>(`/restaurant/ledger/book?${qs(range)}`, { headers: authHeaders() });

/**
 * Takes money against what a sale still owes. `idempotencyKey` is made once per attempt by the caller, so a
 * double-tap or a retry after a dropped response collects once.
 */
export const collectPayment = (paymentId: string, body: { amount: Minor; method: PaymentMethod; reference: string; idempotencyKey: string }) =>
  apiRequest<ApiPayment>(`/restaurant/payments/${encodeURIComponent(paymentId)}/collections`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }).then(toPayment);

export const refundPayment = (paymentId: string, body: { amount: Minor; method: PaymentMethod; reason: string; idempotencyKey: string }) =>
  apiRequest<ApiPayment>(`/restaurant/payments/${encodeURIComponent(paymentId)}/refunds`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }).then(toPayment);

export type { Payment };
