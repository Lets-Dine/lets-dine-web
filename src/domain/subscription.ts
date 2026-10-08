import { formatMoney } from './money';
import type { Minor } from './types';

/**
 * A restaurant's plan and where it stands. Everything here is pure — the API
 * decides what happens, this only decides how it is *described*, so the same
 * words appear in the sidebar chip, the alert banner and the Plan page.
 */

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'RESTRICTED' | 'SUSPENDED' | 'CANCELLED';
export type BillingInterval = 'MONTHLY' | 'ANNUAL';
export type UsageLevel = 'ok' | 'warn' | 'over';
export type InvoiceStatus = 'OPEN' | 'PAID' | 'VOID';

export interface PlanLimits {
  /** A missing limit means unlimited. */
  branches?: number;
  staffSeats?: number;
  ordersPerMonth?: number;
}

export interface PlanFeatures {
  analyticsTier: 'basic' | 'full';
  exports: boolean;
  /** Missing means the full history is kept. */
  auditRetentionDays?: number;
}

export interface Plan {
  key: string;
  name: string;
  /** Null when the viewer may see the plan but not what it costs (a manager). */
  monthlyPrice: Minor | null;
  annualPrice: Minor | null;
  extraBranchPrice: Minor | null;
  extraSeatPrice: Minor | null;
  currency: string;
  limits: PlanLimits;
  features: PlanFeatures;
}

export interface Subscription {
  status: SubscriptionStatus;
  interval: BillingInterval;
  trialEndsAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  pastDueSince: string | null;
  extraBranches: number;
  extraSeats: number;
  cancelledAt: string | null;
  plan: Plan;
  /** The downgrade queued for the end of the paid period, if any. */
  pendingPlan: Plan | null;
}

export interface UsageMeter {
  used: number;
  /** Undefined when unlimited. */
  limit?: number;
  level: UsageLevel;
}

export interface Usage {
  orders: UsageMeter;
  branches: UsageMeter;
  seats: UsageMeter;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  /** Minor units. */
  unitAmount: Minor;
  amount: Minor;
}

export interface Invoice {
  id: string;
  number: string;
  amount: Minor;
  currency: string;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  status: InvoiceStatus;
  paidAt: string | null;
  /** The charged lines as they were when the invoice was issued — later price edits never touch them. */
  lines: InvoiceLine[];
  paymentMethod: string | null;
  paymentRef: string | null;
}

export type MeterKind = 'orders' | 'branches' | 'seats';
export type Tone = 'good' | 'info' | 'warn' | 'bad' | 'muted';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shown wherever an owner is told how to pay. */
export const PAYMENT_NOTE =
  "Pay an open invoice with eSewa and your plan renews as soon as the payment is confirmed. Prefer another way? Contact the FeastoX team and they will mark it paid once received.";

/* ── Status ────────────────────────────────────────────────────────── */

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIAL: 'Trial',
  ACTIVE: 'Active',
  PAST_DUE: 'Payment overdue',
  RESTRICTED: 'Restricted',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};

export const STATUS_TONE: Record<SubscriptionStatus, Tone> = {
  TRIAL: 'info',
  ACTIVE: 'good',
  PAST_DUE: 'warn',
  RESTRICTED: 'bad',
  SUSPENDED: 'bad',
  CANCELLED: 'muted',
};

/** Suspended and cancelled restaurants are closed to staff; only the owner reaches the plan page, to put it right. */
export function isLockedOut(status: SubscriptionStatus): boolean {
  return status === 'SUSPENDED' || status === 'CANCELLED';
}

/* ── Dates ─────────────────────────────────────────────────────────── */

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** How an invoice was paid, in words — the API stores free text ("esewa", "bank", "none"). */
export function paymentLabel(method: string | null): string {
  if (!method) return '—';
  const known: Record<string, string> = { esewa: 'eSewa', bank: 'Bank transfer', cash: 'Cash', khalti: 'Khalti', none: 'No charge' };
  return known[method.toLowerCase()] ?? method;
}

/** Whole days from `now` until `iso`, rounded up — 0 means "today", negative means it has passed. */
export function daysUntil(iso: string, now: Date): number {
  return Math.ceil((Date.parse(iso) - now.getTime()) / DAY_MS);
}

const plural = (count: number, word: string): string => `${count.toLocaleString()} ${word}${count === 1 ? '' : word.endsWith('ch') ? 'es' : 's'}`;

/* ── Limits and prices ─────────────────────────────────────────────── */

export function limitLabel(value: number | undefined): string {
  return value === undefined ? 'Unlimited' : value.toLocaleString();
}

/** "5 branches · 20 staff seats · 10,000 orders a month" — the plan in one line. */
export function planSummary(plan: Plan): string {
  const { branches, staffSeats, ordersPerMonth } = plan.limits;
  return [
    branches === undefined ? 'Unlimited branches' : plural(branches, 'branch'),
    staffSeats === undefined ? 'unlimited staff seats' : plural(staffSeats, 'staff seat'),
    ordersPerMonth === undefined ? 'unlimited orders' : `${ordersPerMonth.toLocaleString()} orders a month`,
  ].join(' · ');
}

export function planPrice(plan: Plan, interval: BillingInterval): Minor | null {
  return interval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;
}

/** How many months an annual price saves over paying monthly — the "two months free" the plan really gives. */
export function monthsFree(plan: Plan): number {
  if (plan.monthlyPrice === null || plan.annualPrice === null || plan.monthlyPrice === 0) return 0;
  return Math.round((plan.monthlyPrice * 12 - plan.annualPrice) / plan.monthlyPrice);
}

export function intervalLabel(interval: BillingInterval): string {
  return interval === 'ANNUAL' ? 'Billed yearly' : 'Billed monthly';
}

/**
 * Whether moving to `target` takes effect now or waits for the paid period to
 * end. Mirrors the server's rule so the confirmation can say what will happen;
 * the server still decides.
 */
export function changeEffect(current: Subscription, target: Plan): 'now' | 'next_period' {
  if (current.status === 'TRIAL') return 'now';
  return (target.monthlyPrice ?? 0) >= (current.plan.monthlyPrice ?? 0) ? 'now' : 'next_period';
}

/** The prorated charge for moving up mid-period — the same arithmetic the server uses, so the quote matches the invoice. */
export function upgradeCharge(current: Subscription, target: Plan, now: Date): Minor {
  const from = planPrice(current.plan, current.interval) ?? 0;
  const to = planPrice(target, current.interval) ?? 0;
  const start = Date.parse(current.currentPeriodStart);
  const end = Date.parse(current.currentPeriodEnd);
  const total = end - start;
  if (total <= 0) return 0;
  const left = Math.min(Math.max(end - now.getTime(), 0), total);
  return Math.max(Math.round(((to - from) * left) / total), 0);
}

export interface ChangeFact {
  label: string;
  value: string;
}

export interface ChangeDelta {
  label: string;
  from: string;
  to: string;
  /** Gaining more is good news, losing some is what the owner needs to see. */
  direction: 'more' | 'less';
}

export interface ChangeSummary {
  /** The modal's title: the action in two or three words. */
  heading: string;
  /** One sentence: what clicking Confirm does. */
  title: string;
  /** What leaves the account today, or null when nothing does. */
  dueNow: string | null;
  facts: ChangeFact[];
  deltas: ChangeDelta[];
  /** Reasons the switch cannot go ahead yet. Non-empty means Confirm is off. */
  blockers: string[];
  confirmLabel: string;
}

const limitText = (value: number | undefined): string => (value === undefined ? 'Unlimited' : value.toLocaleString());
const rank = (value: number | undefined): number => (value === undefined ? Infinity : value);

function planDeltas(from: Plan, to: Plan): ChangeDelta[] {
  const rows: ChangeDelta[] = [];
  const numeric: [string, number | undefined, number | undefined][] = [
    ['Branches', from.limits.branches, to.limits.branches],
    ['Staff seats', from.limits.staffSeats, to.limits.staffSeats],
    ['Orders a month', from.limits.ordersPerMonth, to.limits.ordersPerMonth],
  ];
  for (const [label, a, b] of numeric) {
    if (a !== b) rows.push({ label, from: limitText(a), to: limitText(b), direction: rank(b) > rank(a) ? 'more' : 'less' });
  }
  if (from.features.analyticsTier !== to.features.analyticsTier) {
    rows.push({
      label: 'Analytics',
      from: from.features.analyticsTier === 'full' ? 'Full' : 'Basic',
      to: to.features.analyticsTier === 'full' ? 'Full' : 'Basic',
      direction: to.features.analyticsTier === 'full' ? 'more' : 'less',
    });
  }
  if (from.features.exports !== to.features.exports) {
    rows.push({ label: 'Exports', from: from.features.exports ? 'Included' : 'Not included', to: to.features.exports ? 'Included' : 'Not included', direction: to.features.exports ? 'more' : 'less' });
  }
  return rows;
}

/**
 * Everything an owner should know before confirming a plan change, decided before the click:
 * what they pay today, when it starts, what the next invoice is, and what changes in what they can use.
 * Mirrors the server's rules; the server still decides.
 */
export function describeChange(current: Subscription, target: Plan, interval: BillingInterval, usage: Usage | null, now: Date): ChangeSummary {
  const sameIntervalAsPaid = interval === current.interval;
  const perPeriod = interval === 'ANNUAL' ? 'a year' : 'a month';
  const nextInvoice = (plan: Plan): string => {
    const p = planPrice(plan, interval);
    return `${plan.name}${p === null ? '' : `, ${formatMoney(p, plan.currency)} ${perPeriod}`}`;
  };
  const periodEnd = formatDay(current.currentPeriodEnd);
  const base = { dueNow: null, deltas: [] as ChangeDelta[], blockers: [] as string[] };

  if (target.key === current.plan.key) {
    if (current.pendingPlan) {
      return {
        ...base,
        heading: `Stay on ${target.name}`,
        title: `Stay on ${target.name} and cancel the scheduled switch to ${current.pendingPlan.name}.`,
        facts: [
          { label: 'You pay today', value: 'Nothing' },
          { label: 'Your plan', value: `${target.name} continues past ${periodEnd}` },
          { label: 'Next invoice', value: `${periodEnd} · ${nextInvoice(target)}` },
        ],
        confirmLabel: `Stay on ${target.name}`,
      };
    }
    return {
      ...base,
      heading: 'Change billing interval',
      title: `Billing becomes ${interval === 'ANNUAL' ? 'yearly' : 'monthly'}. Your plan and limits stay the same.`,
      facts: [
        { label: 'You pay today', value: 'Nothing' },
        { label: 'Takes effect', value: `${periodEnd}, with your next invoice` },
        { label: 'Next invoice', value: `${periodEnd} · ${nextInvoice(target)}` },
      ],
      confirmLabel: 'Change billing',
    };
  }

  const deltas = planDeltas(current.plan, target);

  if (changeEffect(current, target) === 'now') {
    const due = current.status === 'ACTIVE' ? upgradeCharge(current, target, now) : 0;
    if (due > 0) {
      const daysLeft = Math.max(1, Math.ceil((Date.parse(current.currentPeriodEnd) - now.getTime()) / DAY_MS));
      const money = formatMoney(due, target.currency);
      return {
        ...base,
        deltas,
        dueNow: money,
        heading: `Upgrade to ${target.name}`,
        title: `Upgrade to ${target.name}: pay ${money} now and it starts as soon as the payment arrives.`,
        facts: [
          { label: 'You pay today', value: `${money} — the price difference for the ${plural(daysLeft, 'day')} left in this period` },
          { label: 'Starts', value: `When that payment is received. Until then you stay on ${current.plan.name}.` },
          { label: 'Next invoice', value: `${periodEnd} · ${nextInvoice(target)}${sameIntervalAsPaid ? '' : ' (new billing interval)'}` },
        ],
        confirmLabel: `Pay ${money} and upgrade`,
      };
    }
    return {
      ...base,
      deltas,
      heading: `Switch to ${target.name}`,
      title: `Switch to ${target.name} now.`,
      facts: [
        { label: 'You pay today', value: 'Nothing extra' },
        { label: 'Starts', value: 'Immediately' },
        { label: 'Next invoice', value: `${periodEnd} · ${nextInvoice(target)}` },
      ],
      confirmLabel: `Switch to ${target.name}`,
    };
  }

  // A downgrade: scheduled for the end of what is already paid, unless today's usage would not fit.
  const blockers: string[] = [];
  if (usage) {
    const cap = (limit: number | undefined, extra: number, extraPrice: Minor | null) => (limit === undefined ? undefined : limit + (extraPrice === null ? 0 : extra));
    const branchCap = cap(target.limits.branches, current.extraBranches, target.extraBranchPrice);
    const seatCap = cap(target.limits.staffSeats, current.extraSeats, target.extraSeatPrice);
    if (branchCap !== undefined && usage.branches.used > branchCap) {
      blockers.push(`You have ${plural(usage.branches.used, 'active branch')}; ${target.name} allows ${branchCap}. Deactivate ${usage.branches.used - branchCap} first.`);
    }
    if (seatCap !== undefined && usage.seats.used > seatCap) {
      blockers.push(`You have ${plural(usage.seats.used, 'active staff seat')}; ${target.name} allows ${seatCap}. Deactivate ${usage.seats.used - seatCap} first.`);
    }
  }

  return {
    ...base,
    deltas,
    blockers,
    heading: `Downgrade to ${target.name}`,
    title: `Move to ${target.name} on ${periodEnd}. You keep ${current.plan.name} until then.`,
    facts: [
      { label: 'You pay today', value: 'Nothing' },
      { label: 'Until ' + periodEnd, value: `Everything in ${current.plan.name}, already paid for` },
      { label: 'From ' + periodEnd, value: `${target.name}'s limits and features` },
      { label: 'Next invoice', value: `${periodEnd} · ${nextInvoice(target)}` },
      { label: 'Changed your mind?', value: `Choose ${current.plan.name} again before ${periodEnd} to cancel the switch` },
    ],
    confirmLabel: `Schedule switch to ${target.name}`,
  };
}

/* ── Usage ─────────────────────────────────────────────────────────── */

export function meterFraction(meter: UsageMeter): number {
  if (meter.limit === undefined || meter.limit === 0) return 0;
  return Math.min(1, meter.used / meter.limit);
}

export function meterLabel(meter: UsageMeter): string {
  return meter.limit === undefined ? `${meter.used.toLocaleString()} · no limit` : `${meter.used.toLocaleString()} of ${meter.limit.toLocaleString()}`;
}

/** One line under a meter saying what the number means for what they can do — or nothing, while there is nothing to say. */
export function meterNote(kind: MeterKind, meter: UsageMeter): string | null {
  if (meter.level === 'ok') return null;
  if (kind === 'orders') {
    return meter.level === 'over'
      ? 'Past the monthly allowance. Orders are still accepted — this never blocks service.'
      : 'Close to the monthly allowance. Orders are never blocked.';
  }
  if (meter.limit === undefined) return null;
  const [one, many] = kind === 'branches' ? ['branch', 'branches'] : ['staff seat', 'staff seats'];
  if (meter.used > meter.limit) return `More ${many} are in use than the plan includes. They keep working, and the extra ones are added to your next invoice.`;
  if (meter.used === meter.limit) return `At the plan's ${one} limit. Adding another is allowed and is added to your next invoice.`;
  return `Close to the plan's ${one} limit.`;
}

/* ── What the plan says right now ──────────────────────────────────── */

/** The state in a sentence a manager and an owner can both act on. */
export function statusStatement(subscription: Subscription, canManage: boolean, now: Date): string {
  const { status, plan, pendingPlan } = subscription;

  switch (status) {
    case 'TRIAL': {
      if (!subscription.trialEndsAt) return `You are on a free trial of ${plan.name}.`;
      const left = daysUntil(subscription.trialEndsAt, now);
      const when = left < 0 ? `ended on ${formatDay(subscription.trialEndsAt)}` : left === 0 ? 'ends today' : `ends on ${formatDay(subscription.trialEndsAt)} (${plural(left, 'day')} left)`;
      return `A free trial with everything in ${plan.name}. It ${when}.${canManage ? ' Choose a plan to carry on.' : ' The owner chooses the plan to carry on with.'}`;
    }
    case 'ACTIVE':
      return `Renews on ${formatDay(subscription.currentPeriodEnd)}.${pendingPlan ? ` It switches to ${pendingPlan.name} then.` : ''}`;
    case 'PAST_DUE':
      return `The renewal${subscription.pastDueSince ? ` due ${formatDay(subscription.pastDueSince)}` : ''} has not been paid. Everything still works, but editing will lock soon.`;
    case 'RESTRICTED':
      return `Overdue${subscription.pastDueSince ? ` since ${formatDay(subscription.pastDueSince)}` : ''}. Menu, table, branch and settings changes are paused until it is paid; orders and payments still work.`;
    case 'SUSPENDED':
      return 'This restaurant is suspended. Staff cannot sign in until the overdue invoice is paid.';
    case 'CANCELLED':
      return `This subscription was cancelled${subscription.cancelledAt ? ` on ${formatDay(subscription.cancelledAt)}` : ''}.`;
  }
}

/** The date that matters most for this status, labelled — what to look at first. */
export function keyDate(subscription: Subscription): { label: string; value: string } | null {
  switch (subscription.status) {
    case 'TRIAL':
      return subscription.trialEndsAt ? { label: 'Trial ends', value: formatDay(subscription.trialEndsAt) } : null;
    case 'ACTIVE':
      return { label: 'Renews', value: formatDay(subscription.currentPeriodEnd) };
    case 'PAST_DUE':
    case 'RESTRICTED':
    case 'SUSPENDED':
      return subscription.pastDueSince ? { label: 'Overdue since', value: formatDay(subscription.pastDueSince) } : null;
    case 'CANCELLED':
      return subscription.cancelledAt ? { label: 'Cancelled', value: formatDay(subscription.cancelledAt) } : null;
  }
}

/** The status in the few words a sidebar chip has room for. */
export function chipStatus(subscription: Subscription, now: Date): string {
  if (subscription.status === 'TRIAL' && subscription.trialEndsAt) {
    const left = daysUntil(subscription.trialEndsAt, now);
    return left < 0 ? 'Trial ended' : left === 0 ? 'Trial ends today' : `Trial · ${plural(left, 'day')} left`;
  }
  if (subscription.status === 'ACTIVE') return `Renews ${formatDay(subscription.currentPeriodEnd).replace(/ \d{4}$/, '')}`;
  return STATUS_LABEL[subscription.status];
}

/* ── The alert banner ──────────────────────────────────────────────── */

export interface Notice {
  /** Stable, so dismissing one stays dismissed — and a new month or a new invoice is a new notice. */
  id: string;
  tone: 'info' | 'warn' | 'bad';
  title: string;
  body: string;
  cta: { label: string; to: string };
  dismissible: boolean;
}

export interface NoticeInput {
  subscription: Subscription;
  usage: Usage | null;
  /** Owners only — a manager is never told amounts. */
  invoices: Invoice[] | null;
  canManage: boolean;
  now: Date;
}

export const TRIAL_NOTICE_DAYS = 7;
export const TRIAL_URGENT_DAYS = 2;

/**
 * The one thing worth interrupting the dashboard for, or nothing. Most days there
 * is nothing: a banner that is always there is a banner nobody reads. Suspended
 * and cancelled restaurants never get here — they are closed, not warned.
 */
export function deriveNotice({ subscription, usage, invoices, canManage, now }: NoticeInput): Notice | null {
  const { status } = subscription;
  if (isLockedOut(status)) return null;

  const seePlan = { label: 'See plan', to: '/admin/plan' };

  if (status === 'RESTRICTED') {
    return {
      id: 'restricted',
      tone: 'bad',
      title: 'Changes are locked until the overdue payment is made',
      body: canManage
        ? 'Menu, table, branch and settings edits are paused. Orders and payments keep working.'
        : 'Menu, table, branch and settings edits are paused. Orders and payments keep working. Ask the owner to settle the overdue invoice.',
      cta: canManage ? { label: 'View invoices', to: '/admin/plan#invoices' } : seePlan,
      dismissible: false,
    };
  }

  if (status === 'PAST_DUE') {
    return {
      id: 'past-due',
      tone: 'warn',
      title: 'The plan payment is overdue',
      body: canManage
        ? 'Pay the renewal soon, or editing the menu, tables and settings will be locked. Orders keep working either way.'
        : 'Ask the owner to settle the renewal before editing the menu, tables and settings gets locked. Orders keep working either way.',
      cta: canManage ? { label: 'View invoices', to: '/admin/plan#invoices' } : seePlan,
      dismissible: false,
    };
  }

  if (status === 'TRIAL' && subscription.trialEndsAt) {
    const left = daysUntil(subscription.trialEndsAt, now);
    if (left <= TRIAL_NOTICE_DAYS) {
      const urgent = left <= TRIAL_URGENT_DAYS;
      return {
        id: 'trial-ending',
        tone: urgent ? 'warn' : 'info',
        title: left < 0 ? 'The trial has ended' : left === 0 ? 'The trial ends today' : `The trial ends in ${plural(left, 'day')}`,
        body: canManage
          ? 'Choose a plan to keep editing the menu, tables and settings. Orders are not affected.'
          : 'The owner needs to choose a plan to keep editing the menu, tables and settings. Orders are not affected.',
        cta: canManage ? { label: 'Choose a plan', to: '/admin/plan#change-plan' } : seePlan,
        dismissible: !urgent,
      };
    }
  }

  const open = (invoices ?? []).filter((invoice) => invoice.status === 'OPEN').sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  if (open && canManage) {
    const overdue = Date.parse(open.dueAt) < now.getTime();
    return {
      id: `invoice-${open.id}`,
      tone: overdue ? 'warn' : 'info',
      title: overdue ? `Invoice ${open.number} is overdue` : `Invoice ${open.number} is due ${formatDay(open.dueAt)}`,
      body: `${formatMoney(open.amount, open.currency)} for ${formatDay(open.periodStart)} – ${formatDay(open.periodEnd)}.`,
      cta: { label: 'View invoice', to: '/admin/plan#invoices' },
      dismissible: !overdue,
    };
  }

  const month = now.toISOString().slice(0, 7);
  if (usage?.orders.level === 'over') {
    return {
      id: `orders-over-${month}`,
      tone: 'warn',
      title: "This month's order allowance has been passed",
      body: canManage
        ? 'Orders are still accepted. Move to a bigger plan to stay within your allowance.'
        : 'Orders are still accepted. Let the owner know, so they can move to a bigger plan.',
      cta: canManage ? { label: 'Change plan', to: '/admin/plan#change-plan' } : seePlan,
      dismissible: true,
    };
  }
  if (usage?.orders.level === 'warn' && usage.orders.limit) {
    const percent = Math.round((usage.orders.used / usage.orders.limit) * 100);
    return {
      id: `orders-warn-${month}`,
      tone: 'info',
      title: `${percent}% of this month's orders used`,
      body: "Orders are never blocked — this is a heads-up that the plan's monthly allowance is close.",
      cta: seePlan,
      dismissible: true,
    };
  }

  return null;
}

/** Whether a notice should also mark the Plan item in the navigation. */
export const needsAttention = (notice: Notice | null): boolean => notice !== null && notice.tone !== 'info';
