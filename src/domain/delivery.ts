import type { Minor } from './types';

/**
 * Delivery couriers and what they owe each other. Everything is branch-scoped and in integer
 * minor units.
 *
 * A courier is an account. Its balance is `cash held − fees earned`:
 *   positive → the courier holds the branch's cash (collected on delivery, not yet handed over)
 *   negative → the branch owes the courier (per-delivery fees not yet paid out)
 * A settlement moves the balance back toward zero in one transaction.
 */

export type PartnerFeeModel = 'FLAT' | 'PERCENT' | 'NONE';
export type RiderKind = 'STAFF' | 'FREELANCE';
export type RiderPayModel = 'SALARIED' | 'PER_DELIVERY';

export interface DeliveryPartner {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  contactPerson: string;
  note: string;
  feeModel: PartnerFeeModel;
  /** Minor units for FLAT; basis points for PERCENT (1200 = 12%). Unused for NONE. */
  feeValue: number;
  /** Whether the partner takes cash from the customer and remits it to the branch. */
  collectsCash: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Rider {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  kind: RiderKind;
  /** Set when the rider works for a partner — their money then settles through the partner. */
  partnerId: string | null;
  vehicle: string;
  note: string;
  payModel: RiderPayModel;
  /** Minor units per delivery when `payModel` is PER_DELIVERY. */
  payValue: Minor;
  isActive: boolean;
  createdAt: string;
}

export type AssignmentStatus = 'ASSIGNED' | 'DELIVERED';

/** One dispatch of one order. Amounts are snapshotted so a later rate change never rewrites history. */
export interface DeliveryAssignment {
  id: string;
  branchId: string;
  orderId: string;
  orderRef: string;
  customerName: string;
  orderTotal: Minor;
  riderId: string | null;
  partnerId: string | null;
  /** Names as they were at dispatch, so a ticket can say who has it without loading the book. */
  riderName: string | null;
  partnerName: string | null;
  /** Who the money settles with: the partner when there is one, else the rider. */
  accountKind: 'PARTNER' | 'RIDER';
  accountId: string;
  status: AssignmentStatus;
  assignedAt: string;
  deliveredAt: string | null;
  /** What the branch owes the courier for this run. */
  courierFee: Minor;
  /** Cash the courier was meant to take at the door. 0 = already paid, or the courier does not collect. */
  cashToCollect: Minor;
  /** What actually came back. Null until delivered. */
  cashCollected: Minor | null;
}

export interface Settlement {
  id: string;
  branchId: string;
  accountKind: 'PARTNER' | 'RIDER';
  accountId: string;
  /** Set when the money was settled as part of settling one delivery order. */
  orderId?: string | null;
  /** COLLECT: the courier handed cash to the branch (at an order's settlement). PAYOUT: the branch paid the courier. */
  direction: 'COLLECT' | 'PAYOUT';
  /** Money that actually changes hands. */
  amount: Minor;
  /** Cleared on the other side in the same act: fees netted off a collection, or cash netted off a payout. Absent on older records = 0. */
  offset?: Minor;
  method: 'CASH' | 'BANK';
  note: string;
  at: string;
}

export type Account = { kind: 'PARTNER'; id: string } | { kind: 'RIDER'; id: string };

export interface DeliveryData {
  partners: DeliveryPartner[];
  riders: Rider[];
  assignments: DeliveryAssignment[];
  settlements: Settlement[];
}

/**
 * What the Delivery page reads: every courier with its balance already summed, no runs and no settlements.
 * A courier's page asks for its own `CourierDetail` and then its statement a page at a time, so none of
 * these grow with the branch's history.
 */
export interface PartnerListing extends DeliveryPartner {
  balance: Balance;
  /** How many riders ride for this partner. */
  riders: number;
  /** Deliveries completed in the last 30 days. */
  runs30: number;
}

export interface RiderListing extends Rider {
  /** Null when the rider rides for a partner — the partner's account takes their cash and fees. */
  balance: Balance | null;
  /** Runs this rider has on the road. */
  open: number;
  partnerName: string | null;
  runs30: number;
}

export interface DeliveryOverview {
  partners: PartnerListing[];
  riders: RiderListing[];
  summary: { onRoad: number; cashOut: number; owed: number };
}

/** One courier's page, minus its statement. */
export interface CourierDetail {
  partner: PartnerListing | null;
  rider: RiderListing | null;
  /** The partner a rider rides for. */
  parent: DeliveryPartner | null;
  /** Runs still on the road: this rider's, or any under this partner. */
  openRuns: DeliveryAssignment[];
  /** A partner's riders. */
  riders: RiderListing[];
  /** Partners a rider's terms can name: the active ones, and their own. */
  partners: DeliveryPartner[];
}

/** A line of a partner's rider's deliveries — no ledger, so no running balance. */
export interface RunLine {
  type: 'RUN';
  id: string;
  at: string;
  assignment: DeliveryAssignment;
}

export type StatementLine = (StatementEntry & { balanceAfter: Minor }) | RunLine;

/** Newest first. `nextCursor` goes back as the next request's cursor; null at the end. */
export interface StatementPage {
  entries: StatementLine[];
  nextCursor: string | null;
}

export const PARTNER_FEE_LABEL: Record<PartnerFeeModel, string> = {
  FLAT: 'Flat per delivery',
  PERCENT: 'Percent of order',
  NONE: 'No fee',
};

export const RIDER_KIND_LABEL: Record<RiderKind, string> = { STAFF: 'Staff', FREELANCE: 'Freelance' };

export const RIDER_PAY_LABEL: Record<RiderPayModel, string> = {
  SALARIED: 'Salaried, no per-delivery pay',
  PER_DELIVERY: 'Flat per delivery',
};

/** What the branch owes a partner for delivering an order of this size. */
export function partnerFee(partner: Pick<DeliveryPartner, 'feeModel' | 'feeValue'>, orderTotal: Minor): Minor {
  if (partner.feeModel === 'FLAT') return Math.max(0, Math.round(partner.feeValue));
  if (partner.feeModel === 'PERCENT') return Math.max(0, Math.round((orderTotal * partner.feeValue) / 10_000));
  return 0;
}

export function riderFee(rider: Pick<Rider, 'payModel' | 'payValue'>): Minor {
  return rider.payModel === 'PER_DELIVERY' ? Math.max(0, Math.round(rider.payValue)) : 0;
}

/** The terms in a few words, for a card or a row. `symbolize` formats a minor-unit amount. */
export function partnerTerms(partner: DeliveryPartner, symbolize: (minor: Minor) => string): string {
  if (partner.feeModel === 'FLAT') return `${symbolize(partner.feeValue)} per delivery`;
  if (partner.feeModel === 'PERCENT') return `${Number((partner.feeValue / 100).toFixed(2))}% of each order`;
  return 'No delivery fee';
}

export function riderTerms(rider: Rider, symbolize: (minor: Minor) => string): string {
  return rider.payModel === 'PER_DELIVERY' ? `${symbolize(rider.payValue)} per delivery` : 'Salaried';
}

/** Which account a dispatch settles with: a partner's rider rides on the partner's account. */
export function accountFor(rider: Rider | null, partner: DeliveryPartner | null): Account | null {
  if (partner) return { kind: 'PARTNER', id: partner.id };
  if (rider?.partnerId) return { kind: 'PARTNER', id: rider.partnerId };
  if (rider) return { kind: 'RIDER', id: rider.id };
  return null;
}

export const sameAccount = (a: Account, b: { accountKind: Account['kind']; accountId: string }) => a.kind === b.accountKind && a.id === b.accountId;

/** Cash the courier is holding for the branch from a delivered run, net of nothing — fees are tracked apart. */
const cashHeld = (a: DeliveryAssignment) => (a.status === 'DELIVERED' ? (a.cashCollected ?? 0) : 0);
const feeEarned = (a: DeliveryAssignment) => (a.status === 'DELIVERED' ? a.courierFee : 0);

export interface Balance {
  /** Cash collected at the door and not yet handed over, after collections. */
  cashHeld: Minor;
  /** Fees earned and not yet paid out, after payouts. */
  feesOwed: Minor;
  /** `cashHeld − feesOwed`. Positive: they owe the branch. Negative: the branch owes them. */
  net: Minor;
  /** Runs still on the road. */
  open: number;
}

export function balanceOf(account: Account, assignments: DeliveryAssignment[], settlements: Settlement[]): Balance {
  const mine = assignments.filter((a) => sameAccount(account, a));
  const cash = mine.reduce((sum, a) => sum + cashHeld(a), 0);
  const fees = mine.reduce((sum, a) => sum + feeEarned(a), 0);
  const mineSettled = settlements.filter((s) => sameAccount(account, s));
  const clearedCash = mineSettled.reduce((sum, s) => sum + (s.direction === 'COLLECT' ? s.amount : 0) + (s.offset ?? 0), 0);
  const clearedFees = mineSettled.reduce((sum, s) => sum + (s.direction === 'PAYOUT' ? s.amount : 0) + (s.offset ?? 0), 0);
  const held = cash - clearedCash;
  const owed = fees - clearedFees;
  return { cashHeld: held, feesOwed: owed, net: held - owed, open: mine.filter((a) => a.status === 'ASSIGNED').length };
}

/** One line of a courier's statement. `delta` moves the net balance; `at` orders it. */
export type StatementEntry =
  | { type: 'DELIVERY'; id: string; at: string; delta: Minor; assignment: DeliveryAssignment }
  | { type: 'SETTLEMENT'; id: string; at: string; delta: Minor; settlement: Settlement };

/** Oldest first, each with the running balance after it; callers reverse for newest-first display. */
export function statementOf(account: Account, assignments: DeliveryAssignment[], settlements: Settlement[]): (StatementEntry & { balanceAfter: Minor })[] {
  const entries: StatementEntry[] = [
    ...assignments
      .filter((a) => sameAccount(account, a) && a.status === 'DELIVERED')
      .map((a): StatementEntry => ({ type: 'DELIVERY', id: a.id, at: a.deliveredAt ?? a.assignedAt, delta: cashHeld(a) - feeEarned(a), assignment: a })),
    ...settlements
      .filter((s) => sameAccount(account, s))
      // Cash handed over shrinks what they hold; a payout shrinks what we owe — each pulls the net toward zero.
      .map((s): StatementEntry => ({ type: 'SETTLEMENT', id: s.id, at: s.at, delta: s.direction === 'COLLECT' ? -s.amount : s.amount, settlement: s })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  let running = 0;
  return entries.map((entry) => {
    running += entry.delta;
    return { ...entry, balanceAfter: running };
  });
}

/** The sentence that names a balance: who owes whom, or that it is square. */
export function balanceWords(net: Minor): { tone: 'owes-us' | 'we-owe' | 'square'; label: string } {
  if (net > 0) return { tone: 'owes-us', label: 'Holds your cash' };
  if (net < 0) return { tone: 'we-owe', label: 'You owe' };
  return { tone: 'square', label: 'Settled' };
}

/**
 * What can be settled on its own from a courier's page: the fees the branch owes them. Their cash is received when
 * each delivered order is settled, so it is never a separate transaction here.
 */
export function feesToPay(balance: Pick<Balance, 'feesOwed'>): Minor | null {
  return balance.feesOwed > 0 ? balance.feesOwed : null;
}

export function riderStatus(rider: Rider, open: number): 'on-road' | 'available' | 'off' {
  if (!rider.isActive) return 'off';
  return open > 0 ? 'on-road' : 'available';
}

/**
 * How much of the other side a settlement clears alongside the money that moves. Collecting cash nets
 * off fees owed first; paying fees nets off cash held first. Zero when netting is off.
 */
export function netOffset(direction: 'COLLECT' | 'PAYOUT', amount: Minor, balance: Pick<Balance, 'cashHeld' | 'feesOwed'>, netting: boolean): Minor {
  if (!netting) return 0;
  const held = Math.max(balance.cashHeld, 0);
  const owed = Math.max(balance.feesOwed, 0);
  return Math.max(0, direction === 'COLLECT' ? Math.min(owed, held - amount) : Math.min(held, owed - amount));
}
