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

export interface ProfitLoss {
  range: { from: string; to: string };
  /** Sales net of tax, less refunds. */
  revenue: Minor;
  sales: Minor;
  refunds: Minor;
  /** Collected on the bills; passes through to the tax office, never revenue. */
  tax: Minor;
  /** What left the shelves: opening stock + purchases − stock sent away − closing stock. */
  cogs: Minor;
  stockOpening: Minor;
  stockPurchases: Minor;
  stockOut: Minor;
  stockClosing: Minor;
  /** Ingredients with stock or purchases and no price on record. */
  unpricedItems: number;
  /** Already inside `cogs`. */
  waste: Minor;
  wasteUnpricedCount: number;
  grossProfit: Minor;
  expenses: { category: string; amount: Minor }[];
  operatingExpenses: Minor;
  netProfit: Minor;
  netMargin: number | null;
}

/** One branch, `from` inclusive and `to` exclusive (ISO instants). */
export const fetchProfitLoss = (range: { from: string; to: string; branchId: string }) =>
  apiRequest<ProfitLoss>(`/restaurant/analytics/profit-loss?${qs(range)}`, { headers: authHeaders() });

export interface PaymentsSummary {
  count: number;
  sold: Minor;
  collected: Minor;
  refunded: Minor;
  owed: Minor;
}

/** Totals over every sale the filters match — the Sales page's figures, not a sum of the page it has loaded. */
export const fetchPaymentsSummary = (query: { from?: string; to?: string; paymentStatus?: PaymentStatus; method?: PaymentMethod; customerId?: string }) =>
  apiRequest<PaymentsSummary>(`/restaurant/payments/summary?${qs(query)}`, { headers: authHeaders() });

export type Recurrence = 'WEEKLY' | 'MONTHLY';

/** A cost that comes round on a schedule. It never posts itself: each due date waits to be posted or skipped. */
export interface RecurringExpense {
  id: string;
  category: string;
  amount: Minor;
  method: PaymentMethod;
  note: string;
  frequency: Recurrence;
  /** Monthly: day of the month 1–31. Weekly: 0 Sunday – 6 Saturday. */
  dueDay: number;
  /** `YYYY-MM-DD` days throughout. */
  startsOn: string;
  isActive: boolean;
  /** Dates up to today still waiting, oldest first. */
  due: string[];
  next: string | null;
}

export interface RecurringDraft {
  category: string;
  amount: Minor;
  method: PaymentMethod;
  note: string;
  frequency: Recurrence;
  dueDay: number;
  startsOn?: string;
}

const RECURRING = '/restaurant/recurring-expenses';

export const fetchRecurringExpenses = () => apiRequest<RecurringExpense[]>(RECURRING, { headers: authHeaders() });

export const addRecurringExpense = (draft: RecurringDraft) =>
  apiRequest<RecurringExpense>(RECURRING, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

/** Changes apply from the next due date; what was already posted or skipped stays as it was. */
export const updateRecurringExpense = (id: string, patch: Partial<Omit<RecurringDraft, 'startsOn'>> & { isActive?: boolean }) =>
  apiRequest<RecurringExpense>(`${RECURRING}/${id}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(patch) });

export const deleteRecurringExpense = (id: string) => apiRequest<null>(`${RECURRING}/${id}`, { method: 'DELETE', headers: authHeaders() });

/** Handles the oldest waiting date: `post` writes it to the cash book now, `skip` moves past it, `skip-all` clears every date waiting. */
export const settleRecurringExpense = (id: string, dueOn: string, action: 'post' | 'skip' | 'skip-all') =>
  apiRequest<RecurringExpense>(`${RECURRING}/${id}/settle`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ dueOn, action }) });
