import type { Minor, PaymentMethod } from '../domain/types';
import { IS_LIVE_API, apiRequest } from './http';
import type { Paginated } from './http';
import { authHeaders } from './live-admin';

/** Expenses and the cash-up. Live backend only — the offline demo keeps no books. */
export const LEDGER_ENABLED = IS_LIVE_API;

const BASE = '/restaurant/ledger';

export interface LedgerSummary {
  /** True until the branch records its opening float — the first close sets it. */
  needsOpening: boolean;
  periodStart: string | null;
  /** A real close already happened today — closing again is refused. */
  closedToday: boolean;
  /** The latest close is a real one, so an owner can take it back. */
  canReopen: boolean;
  opening: Minor;
  cashSales: Minor;
  cardSales: Minor;
  cashExpenses: Minor;
  cardExpenses: Minor;
  /** Money in that is not a sale. */
  cashIncome: Minor;
  cardIncome: Minor;
  /** Cash moved into the bank, and bank money moved into the drawer. */
  deposits: Minor;
  withdrawals: Minor;
  /** Bank (card / off-cash) balance at the start of the period, and what it should hold now. */
  bankOpening: Minor;
  bankExpected: Minor;
  /** What the drawer should hold right now. */
  closingExpected: Minor;
}

export type ExpenseKind = 'EXPENSE' | 'INCOME' | 'DEPOSIT' | 'WITHDRAWAL';

export interface Expense {
  id: string;
  kind: ExpenseKind;
  amount: Minor;
  method: PaymentMethod;
  category: string;
  note: string;
  createdAt: string;
  createdByName: string | null;
}

export interface CashClose extends Omit<LedgerSummary, 'needsOpening' | 'periodStart'> {
  id: string;
  closingCounted: Minor;
  bankCounted: Minor;
  bankVariance: Minor;
  /** Counted minus expected — negative means the drawer is short. */
  variance: Minor;
  note: string;
  closedAt: string;
  closedByName: string | null;
}

/** One line of the open period's tape, oldest first. */
export interface LedgerEntry {
  id: string;
  kind: 'opening' | 'sale' | 'income' | 'expense' | 'transfer';
  at: string;
  amount: Minor;
  method: PaymentMethod;
  /** How this line moved the drawer and the bank. */
  cashDelta: Minor;
  bankDelta: Minor;
  /** The dishes sold, the expense category, or "Day opened". */
  label: string;
  /** The table or delivery, or the expense note and who entered it. */
  detail: string;
}

export const fetchEntries = () => apiRequest<LedgerEntry[]>(`${BASE}/entries`, { headers: authHeaders() });

export const fetchLedger = () => apiRequest<LedgerSummary>(BASE, { headers: authHeaders() });

export const fetchCloses = (limit = 30) => apiRequest<Paginated<CashClose>>(`${BASE}/closes?limit=${limit}`, { headers: authHeaders() }).then((p) => p.rows);

export const fetchExpenses = () => apiRequest<Paginated<Expense>>(`${BASE}/expenses`, { headers: authHeaders() }).then((p) => p.rows);

export const addExpense = (draft: { kind: ExpenseKind; amount: Minor; method: PaymentMethod; category: string; note: string }) =>
  apiRequest<Expense>(`${BASE}/expenses`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export const deleteExpense = (id: string) => apiRequest<null>(`${BASE}/expenses/${id}`, { method: 'DELETE', headers: authHeaders() });

export const closeLedger = (closingCounted: Minor, bankCounted: Minor, note: string) =>
  apiRequest<CashClose>(`${BASE}/close`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ closingCounted, bankCounted, note }) });

/** Owner only: deletes the latest close, so everything recorded since folds back into that period. */
export const reopenLedger = () => apiRequest<CashClose>(`${BASE}/reopen`, { method: 'POST', headers: authHeaders() });
