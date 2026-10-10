import { latency, uid } from './store';
import { ApiError } from './store';
import { apiRequest, IS_LIVE_API } from './http';
import type { Paginated } from './http';
import { platformHeaders } from './platform';
import type { BillingInterval, Plan, SubscriptionStatus } from '../domain/subscription';
import type { Minor } from '../domain/types';

/**
 * Operator console data. FRONTEND DESIGN ONLY: everything here is synthetic
 * demo material held in memory (it resets on reload) so every screen has real
 * shapes to design against. None of these restaurants, people or figures exist.
 * Replace this module with the real `/platform/*` endpoints when they ship —
 * the function signatures are the contract the screens were designed to.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const ahead = (ms: number) => new Date(Date.now() + ms).toISOString();
const rs = (major: number): Minor => major * 100;

export const OPERATOR = 'Operator';

/* ── Types ─────────────────────────────────────────────────────────── */

export type PlanKey = 'starter' | 'growth' | 'scale';
export type InvoiceState = 'OPEN' | 'OVERDUE' | 'PAID' | 'VOID';
export type PayMethod = 'BANK' | 'ESEWA' | 'KHALTI' | 'CASH';
export type EventKind = 'billing' | 'access' | 'restaurant' | 'security' | 'plan';
export type StaffRole = 'OWNER' | 'MANAGER' | 'STAFF';

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  BANK: 'Bank transfer',
  ESEWA: 'eSewa',
  KHALTI: 'Khalti',
  CASH: 'Cash at office',
};

export interface Person {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  lastSignInAt: string | null;
  active: boolean;
}

export interface Note {
  id: string;
  at: string;
  author: string;
  text: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  city: string;
  cuisine: string;
  planKey: PlanKey;
  status: SubscriptionStatus;
  interval: BillingInterval;
  createdAt: string;
  lastActiveAt: string;
  trialEndsAt: string | null;
  periodEnd: string;
  pastDueSince: string | null;
  suspendedReason: string | null;
  branches: number;
  seats: number;
  extraBranches: number;
  extraSeats: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  /** Orders per week, oldest first, last 8 weeks. */
  weekly: number[];
  firstOrderAt: string | null;
  currency: string;
  timezone: string;
  serviceChargeRate: number;
  taxRate: number;
  owner: Person;
  people: Person[];
  notes: Note[];
}

export interface Invoice {
  id: string;
  number: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  amount: Minor;
  issuedAt: string;
  dueAt: string;
  periodLabel: string;
  state: InvoiceState;
  paidAt: string | null;
  method: PayMethod | null;
  reference: string | null;
  remindedAt: string | null;
}

export interface AuditEvent {
  id: string;
  at: string;
  actor: string;
  kind: EventKind;
  action: string;
  tenantId: string | null;
  tenantName: string | null;
  detail: string | null;
}

export interface PlatformSettings {
  defaults: { currency: string; timezone: string; serviceChargePct: string; taxPct: string; trialDays: string };
  dunning: { remindBeforeDueDays: string; remindAfterDueDays: string; restrictAfterDays: string; suspendAfterDays: string };
  announcement: { text: string; tone: 'info' | 'warn'; live: boolean };
  maintenance: boolean;
  keyRotatedAt: string;
  keyHint: string;
}

export type QueueKind = 'overdue' | 'trial' | 'over-limit' | 'quiet' | 'stuck';
export type QueueAction = 'settle' | 'remind' | 'extend' | 'open';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  tenantId: string;
  tenantName: string;
  title: string;
  detail: string;
  tone: 'warn' | 'bad' | 'info' | 'muted';
  actions: QueueAction[];
  invoice?: Pick<Invoice, 'id' | 'number' | 'amount' | 'tenantName'>;
}

/* ── Plans ─────────────────────────────────────────────────────────── */

let plans: Plan[] = [
  {
    key: 'starter',
    name: 'Starter',
    monthlyPrice: rs(2500),
    annualPrice: rs(25000),
    extraBranchPrice: null,
    extraSeatPrice: rs(300),
    currency: 'NPR',
    limits: { branches: 1, staffSeats: 5, ordersPerMonth: 1500 },
    features: { analyticsTier: 'basic', exports: false, autoStockConsumption: false, auditRetentionDays: 30 },
  },
  {
    key: 'growth',
    name: 'Growth',
    monthlyPrice: rs(6000),
    annualPrice: rs(60000),
    extraBranchPrice: rs(2500),
    extraSeatPrice: rs(250),
    currency: 'NPR',
    limits: { branches: 3, staffSeats: 15, ordersPerMonth: 6000 },
    features: { analyticsTier: 'full', exports: true, autoStockConsumption: true, auditRetentionDays: 180 },
  },
  {
    key: 'scale',
    name: 'Scale',
    monthlyPrice: rs(14000),
    annualPrice: rs(140000),
    extraBranchPrice: rs(2000),
    extraSeatPrice: rs(200),
    currency: 'NPR',
    limits: { branches: 10, staffSeats: 60 },
    features: { analyticsTier: 'full', exports: true, autoStockConsumption: true },
  },
];

const planOf = (key: PlanKey): Plan => plans.find((p) => p.key === key) ?? plans[0];

/* ── Seed ──────────────────────────────────────────────────────────── */

interface Seed {
  name: string;
  slug: string;
  city: string;
  cuisine: string;
  plan: PlanKey;
  status: SubscriptionStatus;
  interval?: BillingInterval;
  ageDays: number;
  branches: number;
  seats: number;
  orders: number;
  prevOrders: number;
  activeHoursAgo: number;
  owner: string;
  trialLeft?: number;
  overdueDays?: number;
  firstOrderAfterDays?: number | null;
}

const SEEDS: Seed[] = [
  { name: 'Newa Kitchen', slug: 'newa-kitchen', city: 'Kathmandu', cuisine: 'Newari', plan: 'growth', status: 'ACTIVE', interval: 'ANNUAL', ageDays: 214, branches: 2, seats: 11, orders: 3820, prevOrders: 3510, activeHoursAgo: 0.3, owner: 'Ranjana Shrestha' },
  { name: 'Himal Chulo', slug: 'himal-chulo', city: 'Pokhara', cuisine: 'Charcoal grill', plan: 'growth', status: 'ACTIVE', ageDays: 171, branches: 1, seats: 9, orders: 2490, prevOrders: 2610, activeHoursAgo: 0.1, owner: 'Suman Gurung' },
  { name: 'Thakali Bhansa', slug: 'thakali-bhansa', city: 'Kathmandu', cuisine: 'Thakali', plan: 'starter', status: 'ACTIVE', ageDays: 132, branches: 1, seats: 5, orders: 1380, prevOrders: 1240, activeHoursAgo: 1.2, owner: 'Pasang Lama' },
  { name: 'Momo Ghar', slug: 'momo-ghar', city: 'Lalitpur', cuisine: 'Momo house', plan: 'starter', status: 'PAST_DUE', ageDays: 118, branches: 1, seats: 6, orders: 1620, prevOrders: 1410, activeHoursAgo: 0.6, owner: 'Binod Tamang', overdueDays: 9 },
  { name: 'Sherpa Hearth', slug: 'sherpa-hearth', city: 'Kathmandu', cuisine: 'Himalayan', plan: 'scale', status: 'ACTIVE', interval: 'ANNUAL', ageDays: 260, branches: 4, seats: 28, orders: 9120, prevOrders: 8540, activeHoursAgo: 0.2, owner: 'Dawa Sherpa' },
  { name: 'Lakeside Tandoor', slug: 'lakeside-tandoor', city: 'Pokhara', cuisine: 'North Indian', plan: 'growth', status: 'RESTRICTED', ageDays: 190, branches: 2, seats: 14, orders: 1910, prevOrders: 3120, activeHoursAgo: 52, owner: 'Rajesh Thapa', overdueDays: 21 },
  { name: 'Bhaktapur Juju Dhau Café', slug: 'juju-dhau-cafe', city: 'Bhaktapur', cuisine: 'Café', plan: 'starter', status: 'TRIAL', ageDays: 11, branches: 1, seats: 3, orders: 412, prevOrders: 0, activeHoursAgo: 2.4, owner: 'Sabina Maharjan', trialLeft: 3, firstOrderAfterDays: 1 },
  { name: 'Terai Thali House', slug: 'terai-thali-house', city: 'Biratnagar', cuisine: 'Thali', plan: 'growth', status: 'TRIAL', ageDays: 6, branches: 1, seats: 4, orders: 188, prevOrders: 0, activeHoursAgo: 5, owner: 'Anil Yadav', trialLeft: 8, firstOrderAfterDays: 2 },
  { name: 'Rooftop 27', slug: 'rooftop-27', city: 'Kathmandu', cuisine: 'Bar & grill', plan: 'growth', status: 'TRIAL', ageDays: 9, branches: 1, seats: 2, orders: 0, prevOrders: 0, activeHoursAgo: 190, owner: 'Kiran Joshi', trialLeft: 5, firstOrderAfterDays: null },
  { name: 'Dal Bhat Power', slug: 'dal-bhat-power', city: 'Chitwan', cuisine: 'Nepali', plan: 'starter', status: 'ACTIVE', ageDays: 88, branches: 1, seats: 7, orders: 1710, prevOrders: 1390, activeHoursAgo: 0.9, owner: 'Gita Chaudhary' },
  { name: 'Patan Sekuwa Corner', slug: 'patan-sekuwa', city: 'Lalitpur', cuisine: 'Sekuwa', plan: 'starter', status: 'ACTIVE', ageDays: 64, branches: 1, seats: 4, orders: 880, prevOrders: 790, activeHoursAgo: 14, owner: 'Hari Karki' },
  { name: 'Everest Bakery & Bistro', slug: 'everest-bakery', city: 'Kathmandu', cuisine: 'Bakery', plan: 'growth', status: 'ACTIVE', ageDays: 146, branches: 3, seats: 16, orders: 5320, prevOrders: 4980, activeHoursAgo: 0.4, owner: 'Maya Basnet' },
  { name: 'Koshi Fish Fry', slug: 'koshi-fish-fry', city: 'Dharan', cuisine: 'Seafood', plan: 'starter', status: 'SUSPENDED', ageDays: 240, branches: 1, seats: 4, orders: 0, prevOrders: 740, activeHoursAgo: 24 * 38, owner: 'Ramesh Rai', overdueDays: 47 },
  { name: 'Gorkha Momo Express', slug: 'gorkha-momo', city: 'Kathmandu', cuisine: 'Momo', plan: 'starter', status: 'CANCELLED', ageDays: 300, branches: 1, seats: 3, orders: 0, prevOrders: 0, activeHoursAgo: 24 * 70, owner: 'Tek Bahadur Gurung' },
];

const FIRST_NAMES = ['Aarav', 'Sita', 'Prakash', 'Nirmala', 'Bikash', 'Sunita', 'Roshan', 'Anita', 'Deepak', 'Kamala'];
const LAST_NAMES = ['Shrestha', 'Adhikari', 'Pandey', 'Magar', 'Khadka', 'Bhandari', 'Rana', 'Poudel'];

function emailFor(name: string, slug: string): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@${slug.replace(/-/g, '')}.com.np`;
}

function weeklyFrom(total: number, seed: number): number[] {
  const base = total / 4.3;
  return Array.from({ length: 8 }, (_, i) => {
    const wobble = Math.sin(i * 1.7 + seed) * 0.12 + (i / 8) * 0.14;
    return Math.max(0, Math.round(base * (0.82 + wobble)));
  });
}

function buildTenant(seed: Seed, index: number): Tenant {
  const owner: Person = {
    id: `own-${index}`,
    name: seed.owner,
    email: emailFor(seed.owner, seed.slug),
    role: 'OWNER',
    lastSignInAt: ago(seed.activeHoursAgo * HOUR + 3 * HOUR),
    active: seed.status !== 'CANCELLED',
  };
  const crew: Person[] = Array.from({ length: Math.min(seed.seats - 1, 3) }, (_, i) => {
    const name = `${FIRST_NAMES[(index + i * 3) % FIRST_NAMES.length]} ${LAST_NAMES[(index * 2 + i) % LAST_NAMES.length]}`;
    return {
      id: `stf-${index}-${i}`,
      name,
      email: emailFor(name, seed.slug),
      role: i === 0 ? 'MANAGER' : 'STAFF',
      lastSignInAt: ago((seed.activeHoursAgo + i * 9 + 2) * HOUR),
      active: true,
    } satisfies Person;
  });
  const trial = seed.status === 'TRIAL';
  return {
    id: `rst-${index + 1}`,
    name: seed.name,
    slug: seed.slug,
    city: seed.city,
    cuisine: seed.cuisine,
    planKey: seed.plan,
    status: seed.status,
    interval: seed.interval ?? 'MONTHLY',
    createdAt: ago(seed.ageDays * DAY),
    lastActiveAt: ago(seed.activeHoursAgo * HOUR),
    trialEndsAt: trial ? ahead((seed.trialLeft ?? 14) * DAY) : null,
    periodEnd: ahead(((index * 5) % 26 + 2) * DAY),
    pastDueSince: seed.overdueDays ? ago(seed.overdueDays * DAY) : null,
    suspendedReason: seed.status === 'SUSPENDED' ? 'Unpaid for 47 days after reminders.' : null,
    branches: seed.branches,
    seats: seed.seats,
    extraBranches: 0,
    extraSeats: 0,
    ordersThisMonth: seed.orders,
    ordersLastMonth: seed.prevOrders,
    weekly: weeklyFrom(seed.orders || seed.prevOrders / 2, index),
    firstOrderAt: seed.firstOrderAfterDays === null ? null : ago((seed.ageDays - (seed.firstOrderAfterDays ?? 2)) * DAY),
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
    serviceChargeRate: 0.1,
    taxRate: 0.13,
    owner,
    people: [owner, ...crew],
    notes:
      index === 3
        ? [{ id: 'n1', at: ago(4 * DAY), author: OPERATOR, text: 'Owner said payment goes out with the supplier run on Friday. Hold off on restricting.' }]
        : [],
  };
}

let tenants: Tenant[] = SEEDS.map(buildTenant);

const PERIOD_FMT = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

function price(t: Tenant): Minor {
  const plan = planOf(t.planKey);
  const base = (t.interval === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice) ?? 0;
  return base + t.extraBranches * (plan.extraBranchPrice ?? 0) + t.extraSeats * (plan.extraSeatPrice ?? 0);
}

let invoiceSeq = 41;
function nextNumber(): string {
  invoiceSeq += 1;
  return `LD-2610-${String(invoiceSeq).padStart(4, '0')}`;
}

function buildInvoices(): Invoice[] {
  const out: Invoice[] = [];
  for (const t of tenants) {
    if (t.status === 'TRIAL') continue;
    const monthsBilled = t.interval === 'ANNUAL' ? 1 : Math.min(3, Math.floor((Date.now() - Date.parse(t.createdAt)) / (30 * DAY)));
    for (let m = monthsBilled - 1; m >= 0; m -= 1) {
      const issued = new Date(Date.now() - m * 30 * DAY - 6 * DAY);
      const due = new Date(issued.getTime() + 7 * DAY);
      const latest = m === 0;
      const overdue = latest && (t.status === 'PAST_DUE' || t.status === 'RESTRICTED' || t.status === 'SUSPENDED');
      const paid = !overdue;
      const open = latest && !overdue && t.id === 'rst-2';
      const state: InvoiceState = overdue ? 'OVERDUE' : open ? 'OPEN' : t.status === 'CANCELLED' && latest ? 'VOID' : 'PAID';
      out.push({
        id: `inv-${t.id}-${m}`,
        number: nextNumber(),
        tenantId: t.id,
        tenantName: t.name,
        planName: planOf(t.planKey).name,
        amount: price(t),
        issuedAt: issued.toISOString(),
        dueAt: overdue && t.pastDueSince ? t.pastDueSince : due.toISOString(),
        periodLabel: t.interval === 'ANNUAL' ? `Year to ${PERIOD_FMT(new Date(issued.getTime() + 365 * DAY))}` : PERIOD_FMT(issued),
        state,
        paidAt: state === 'PAID' && paid ? new Date(due.getTime() - 2 * DAY).toISOString() : null,
        method: state === 'PAID' ? (m % 2 ? 'BANK' : 'ESEWA') : null,
        reference: state === 'PAID' ? `TXN${(480210 + out.length * 37).toString()}` : null,
        remindedAt: overdue ? ago(2 * DAY) : null,
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
}

let invoices: Invoice[] = buildInvoices();

function seedEvents(): AuditEvent[] {
  const e = (hoursAgo: number, kind: EventKind, action: string, tenant: Tenant | null, detail: string | null = null, actor = OPERATOR): AuditEvent => ({
    id: uid('evt'),
    at: ago(hoursAgo * HOUR),
    actor,
    kind,
    action,
    tenantId: tenant?.id ?? null,
    tenantName: tenant?.name ?? null,
    detail,
  });
  const by = (slug: string) => tenants.find((t) => t.slug === slug) ?? null;
  return [
    e(1.5, 'billing', 'Marked invoice paid', by('newa-kitchen'), 'Bank transfer · TXN480991'),
    e(5, 'restaurant', 'Created restaurant', by('rooftop-27'), 'Owner Kiran Joshi invited'),
    e(9, 'billing', 'Sent payment reminder', by('momo-ghar'), 'Reminder 2 of 3'),
    e(27, 'access', 'Opened support view', by('lakeside-tandoor'), 'Read-only · 12 minutes'),
    e(30, 'plan', 'Extended trial by 7 days', by('juju-dhau-cafe'), 'Asked for more time to load the menu'),
    e(52, 'security', 'Reset owner PIN', by('thakali-bhansa'), 'Owner locked out after 5 attempts'),
    e(75, 'restaurant', 'Restricted restaurant', by('lakeside-tandoor'), 'Invoice 21 days overdue (automatic)', 'System'),
    e(98, 'plan', 'Changed plan', by('everest-bakery'), 'Starter → Growth, effective now'),
    e(120, 'billing', 'Voided invoice', by('gorkha-momo'), 'Restaurant cancelled before period began'),
    e(171, 'security', 'Rotated platform key', null, 'Previous key retired'),
    e(220, 'restaurant', 'Suspended restaurant', by('koshi-fish-fry'), 'Unpaid for 47 days after reminders', 'System'),
    e(310, 'plan', 'Updated plan prices', null, 'Growth monthly Rs. 5,500 → Rs. 6,000, applies at renewal'),
  ];
}

let events: AuditEvent[] = seedEvents();

let settings: PlatformSettings = {
  defaults: { currency: 'NPR', timezone: 'Asia/Kathmandu', serviceChargePct: '10', taxPct: '13', trialDays: '14' },
  dunning: { remindBeforeDueDays: '3', remindAfterDueDays: '3', restrictAfterDays: '14', suspendAfterDays: '45' },
  announcement: { text: '', tone: 'info', live: false },
  maintenance: false,
  keyRotatedAt: ago(7 * DAY),
  keyHint: '••••••••k4Qz',
};

const MRR_HISTORY = [19500, 22000, 24500, 27000, 29500, 32000, 34500, 37000, 39000, 41500, 43000, 0].map((v) => rs(v));

function log(kind: EventKind, action: string, tenant: Tenant | null, detail: string | null = null): void {
  events = [{ id: uid('evt'), at: new Date().toISOString(), actor: OPERATOR, kind, action, tenantId: tenant?.id ?? null, tenantName: tenant?.name ?? null, detail }, ...events];
}

/* ── Derived ───────────────────────────────────────────────────────── */

const clone = <T,>(v: T): T => structuredClone(v);

export function isBilling(t: Tenant): boolean {
  return t.status === 'ACTIVE' || t.status === 'PAST_DUE' || t.status === 'RESTRICTED';
}

export function tenantMrr(t: Tenant): Minor {
  if (!isBilling(t)) return 0;
  const monthly = price(t);
  return t.interval === 'ANNUAL' ? Math.round(monthly / 1200) * 100 : monthly;
}

export function usageLimits(t: Tenant) {
  const plan = planOf(t.planKey);
  const { branches, staffSeats, ordersPerMonth } = plan.limits;
  return {
    branches: branches === undefined ? undefined : branches + t.extraBranches,
    seats: staffSeats === undefined ? undefined : staffSeats + t.extraSeats,
    orders: ordersPerMonth,
  };
}

export function planFor(t: Tenant): Plan {
  return planOf(t.planKey);
}

export function tenantNeedsAttention(t: Tenant): boolean {
  return t.status === 'PAST_DUE' || t.status === 'RESTRICTED' || (t.status === 'TRIAL' && !!t.trialEndsAt && Date.parse(t.trialEndsAt) - Date.now() < 4 * DAY);
}

function buildQueue(): QueueItem[] {
  const items: QueueItem[] = [];
  for (const t of tenants) {
    const overdue = invoices.find((i) => i.tenantId === t.id && i.state === 'OVERDUE');
    if (overdue) {
      const days = Math.max(1, Math.floor((Date.now() - Date.parse(overdue.dueAt)) / DAY));
      items.push({
        id: `q-${overdue.id}`,
        kind: 'overdue',
        tenantId: t.id,
        tenantName: t.name,
        title: `${days} days overdue`,
        detail: t.status === 'SUSPENDED' ? 'Suspended. Staff are locked out until this is settled.' : t.status === 'RESTRICTED' ? 'Restricted. Staff can finish open orders but nothing new is added.' : `Reminders are going out. Restricts automatically at day ${settings.dunning.restrictAfterDays}.`,
        tone: t.status === 'RESTRICTED' || t.status === 'SUSPENDED' ? 'bad' : 'warn',
        actions: ['settle', 'remind', 'open'],
        invoice: { id: overdue.id, number: overdue.number, amount: overdue.amount, tenantName: t.name },
      });
    }
    if (t.status === 'TRIAL' && t.trialEndsAt) {
      const left = Math.ceil((Date.parse(t.trialEndsAt) - Date.now()) / DAY);
      if (left <= 4) {
        items.push({ id: `q-trial-${t.id}`, kind: 'trial', tenantId: t.id, tenantName: t.name, title: left <= 0 ? 'Trial ends today' : `Trial ends in ${left} day${left === 1 ? '' : 's'}`, detail: `${t.ordersThisMonth.toLocaleString()} orders taken so far. A good moment to talk about a plan.`, tone: 'info', actions: ['extend', 'open'] });
      }
    }
    if (t.status === 'TRIAL' && t.firstOrderAt === null && Date.now() - Date.parse(t.createdAt) > 5 * DAY) {
      items.push({ id: `q-stuck-${t.id}`, kind: 'stuck', tenantId: t.id, tenantName: t.name, title: `No order yet, ${Math.floor((Date.now() - Date.parse(t.createdAt)) / DAY)} days in`, detail: 'Menu is set up but no diner has ordered. Onboarding may be stuck on printing QR codes.', tone: 'muted', actions: ['open'] });
    }
    const lim = usageLimits(t);
    if (!overdue && isBilling(t) && lim.seats !== undefined && t.seats > lim.seats) {
      items.push({ id: `q-over-${t.id}`, kind: 'over-limit', tenantId: t.id, tenantName: t.name, title: 'Over the seat limit', detail: `${t.seats} seats in use on a plan that includes ${lim.seats}. Likely upgrade.`, tone: 'info', actions: ['open'] });
    }
    if (t.status === 'ACTIVE' && Date.now() - Date.parse(t.lastActiveAt) > 12 * HOUR && Date.now() - Date.parse(t.lastActiveAt) < 5 * DAY && t.ordersThisMonth < t.ordersLastMonth * 0.8) {
      items.push({ id: `q-quiet-${t.id}`, kind: 'quiet', tenantId: t.id, tenantName: t.name, title: 'Orders are down', detail: 'Noticeably fewer orders than last month.', tone: 'muted', actions: ['open'] });
    }
  }
  const rank: Record<QueueKind, number> = { overdue: 0, trial: 1, 'over-limit': 2, stuck: 3, quiet: 4 };
  return items.sort((a, b) => rank[a.kind] - rank[b.kind]);
}

/* ── Reads ─────────────────────────────────────────────────────────── */

export interface Overview {
  mrr: Minor;
  mrrChange: number;
  activeCount: number;
  trialCount: number;
  restrictedCount: number;
  orders: number;
  ordersChange: number;
  collected: Minor;
  outstanding: Minor;
  overdueCount: number;
  series: { label: string; value: Minor }[];
  planMix: { key: PlanKey; name: string; count: number; mrr: Minor }[];
  queue: QueueItem[];
  signups: Tenant[];
  events: AuditEvent[];
  statusCounts: Record<SubscriptionStatus, number>;
}

export async function getOverview(): Promise<Overview> {
  await latency();
  const mrr = tenants.reduce((s, t) => s + tenantMrr(t), 0);
  const history = [...MRR_HISTORY];
  history[history.length - 1] = mrr;
  const labels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - (11 - i));
    return d.toLocaleDateString('en-GB', { month: 'short' });
  });
  const orders = tenants.reduce((s, t) => s + t.ordersThisMonth, 0);
  const prevOrders = tenants.reduce((s, t) => s + t.ordersLastMonth, 0);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const statusCounts = { TRIAL: 0, ACTIVE: 0, PAST_DUE: 0, RESTRICTED: 0, SUSPENDED: 0, CANCELLED: 0 } satisfies Record<SubscriptionStatus, number>;
  for (const t of tenants) statusCounts[t.status] += 1;
  return clone({
    mrr,
    mrrChange: history[10] ? mrr / history[10] - 1 : 0,
    activeCount: statusCounts.ACTIVE + statusCounts.PAST_DUE + statusCounts.RESTRICTED,
    trialCount: statusCounts.TRIAL,
    restrictedCount: statusCounts.RESTRICTED + statusCounts.SUSPENDED,
    orders,
    ordersChange: prevOrders ? orders / prevOrders - 1 : 0,
    collected: invoices.filter((i) => i.state === 'PAID' && i.paidAt && Date.parse(i.paidAt) >= monthStart.getTime()).reduce((s, i) => s + i.amount, 0),
    outstanding: invoices.filter((i) => i.state === 'OPEN' || i.state === 'OVERDUE').reduce((s, i) => s + i.amount, 0),
    overdueCount: invoices.filter((i) => i.state === 'OVERDUE').length,
    series: history.map((value, i) => ({ label: labels[i], value })),
    planMix: plans.map((p) => {
      const on = tenants.filter((t) => t.planKey === p.key && isBilling(t));
      return { key: p.key as PlanKey, name: p.name, count: on.length, mrr: on.reduce((s, t) => s + tenantMrr(t), 0) };
    }),
    queue: buildQueue(),
    signups: [...tenants].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 4),
    events: events.slice(0, 6),
    statusCounts,
  });
}

export async function listTenants(): Promise<Tenant[]> {
  await latency();
  return clone(tenants);
}

/* ── Restaurant listing (server-paged) ─────────────────────────────── */

export type TenantView = 'all' | 'active' | 'trial' | 'attention' | 'closed';
export type TenantSort = 'active' | 'newest' | 'name' | 'revenue';

/** One row of the restaurant listing. Plan name, limit and revenue arrive resolved, so the table never consults the plan catalogue itself. */
export interface TenantListRow {
  id: string;
  name: string;
  slug: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  planKey: string;
  planName: string;
  owner: { name: string; email: string } | null;
  seats: number;
  /** Plan limit plus purchased extras; undefined when unlimited. */
  seatLimit: number | undefined;
  branches: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  /** Orders per week, oldest first, last 8 weeks. */
  weekly: number[];
  lastActiveAt: string | null;
  /** Monthly recurring revenue; 0 unless the restaurant is billing. */
  mrr: Minor;
}

export interface TenantListQuery {
  view: TenantView;
  planKey?: string;
  keyword?: string;
  sort: TenantSort;
  /** 1-based. */
  page: number;
  pageSize: number;
}

interface LiveTenant {
  id: string;
  name: string;
  slug: string;
  status: SubscriptionStatus;
  interval: BillingInterval;
  plan: { key: string; name: string };
  owner: { name: string; email: string } | null;
  seats: number;
  extraSeats: number;
  limits: { staffSeats?: number };
  branches: number;
  ordersThisMonth: number;
  ordersLastMonth: number;
  weekly: number[];
  lastActiveAt: string | null;
  mrr: Minor;
}

function inView(t: Tenant, view: TenantView): boolean {
  if (view === 'all') return true;
  if (view === 'active') return isBilling(t);
  if (view === 'trial') return t.status === 'TRIAL';
  if (view === 'attention') return tenantNeedsAttention(t);
  return t.status === 'SUSPENDED' || t.status === 'CANCELLED';
}

export async function listTenantRows(query: TenantListQuery): Promise<Paginated<TenantListRow>> {
  const offset = (query.page - 1) * query.pageSize;

  if (IS_LIVE_API) {
    const params = new URLSearchParams({ limit: String(query.pageSize), offset: String(offset), sortBy: query.sort });
    if (query.view !== 'all') params.set('view', query.view);
    if (query.planKey) params.set('planKey', query.planKey);
    if (query.keyword?.trim()) params.set('keyword', query.keyword.trim());
    const page = await apiRequest<Paginated<LiveTenant>>(`/platform/billing/tenants?${params}`, { headers: platformHeaders() });
    return {
      count: page.count,
      rows: page.rows.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        interval: t.interval,
        planKey: t.plan.key,
        planName: t.plan.name,
        owner: t.owner,
        seats: t.seats,
        seatLimit: t.limits.staffSeats === undefined ? undefined : t.limits.staffSeats + t.extraSeats,
        branches: t.branches,
        ordersThisMonth: t.ordersThisMonth,
        ordersLastMonth: t.ordersLastMonth,
        weekly: t.weekly,
        lastActiveAt: t.lastActiveAt,
        mrr: t.mrr,
      })),
    };
  }

  await latency();
  const needle = query.keyword?.trim().toLowerCase() ?? '';
  const by: Record<TenantSort, (a: Tenant, b: Tenant) => number> = {
    active: (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
    newest: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
    revenue: (a, b) => tenantMrr(b) - tenantMrr(a),
  };
  const matched = tenants
    .filter(
      (t) =>
        inView(t, query.view) &&
        (!query.planKey || t.planKey === query.planKey) &&
        (!needle || [t.name, t.slug, t.owner.name, t.owner.email].some((v) => v.toLowerCase().includes(needle))),
    )
    .sort(by[query.sort]);
  return {
    count: matched.length,
    rows: matched.slice(offset, offset + query.pageSize).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      interval: t.interval,
      planKey: t.planKey,
      planName: planFor(t).name,
      owner: { name: t.owner.name, email: t.owner.email },
      seats: t.seats,
      seatLimit: usageLimits(t).seats,
      branches: t.branches,
      ordersThisMonth: t.ordersThisMonth,
      ordersLastMonth: t.ordersLastMonth,
      weekly: t.weekly,
      lastActiveAt: t.lastActiveAt,
      mrr: tenantMrr(t),
    })),
  };
}

/** How many restaurants each view holds, regardless of the page, search or plan filter on screen. */
export async function countTenantViews(): Promise<Record<TenantView, number>> {
  if (IS_LIVE_API) return apiRequest<Record<TenantView, number>>('/platform/billing/tenants/counts', { headers: platformHeaders() });
  await latency();
  const views: TenantView[] = ['all', 'active', 'trial', 'attention', 'closed'];
  return Object.fromEntries(views.map((v) => [v, tenants.filter((t) => inView(t, v)).length])) as Record<TenantView, number>;
}

export interface TenantDetail {
  tenant: Tenant;
  invoices: Invoice[];
  events: AuditEvent[];
}

/**
 * DUMMY until a real detail endpoint exists: a live restaurant has no mock record, so the detail
 * page gets a placeholder built from its listing row. Only what the listing knows is real (name,
 * plan, status, owner, usage); the rest is filler. It joins the in-memory tenants so the page's
 * actions have something to act on, and is gone on reload.
 */
async function adoptLiveTenant(id: string): Promise<Tenant | undefined> {
  const { rows } = await listTenantRows({ view: 'all', sort: 'newest', page: 1, pageSize: 100 });
  const row = rows.find((r) => r.id === id);
  if (!row) return undefined;
  const owner: Person = { id: `own-${row.id}`, name: row.owner?.name ?? 'No owner', email: row.owner?.email ?? '', role: 'OWNER', lastSignInAt: null, active: true };
  const tenant: Tenant = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: '—',
    cuisine: '—',
    planKey: row.planKey as PlanKey,
    status: row.status,
    interval: row.interval,
    createdAt: ago(30 * DAY),
    lastActiveAt: row.lastActiveAt ?? ago(30 * DAY),
    trialEndsAt: null,
    periodEnd: ahead(30 * DAY),
    pastDueSince: null,
    suspendedReason: null,
    branches: row.branches,
    seats: row.seats,
    extraBranches: 0,
    extraSeats: 0,
    ordersThisMonth: row.ordersThisMonth,
    ordersLastMonth: row.ordersLastMonth,
    weekly: row.weekly,
    firstOrderAt: null,
    currency: 'NPR',
    timezone: 'Asia/Kathmandu',
    serviceChargeRate: 0,
    taxRate: 0,
    owner,
    people: [owner],
    notes: [],
  };
  tenants.push(tenant);
  return tenant;
}

export async function getTenant(id: string): Promise<TenantDetail> {
  await latency();
  const tenant = tenants.find((t) => t.id === id) ?? (IS_LIVE_API ? await adoptLiveTenant(id) : undefined);
  if (!tenant) throw new ApiError(404, 'That restaurant is not on the platform.');
  return clone({ tenant, invoices: invoices.filter((i) => i.tenantId === id), events: events.filter((e) => e.tenantId === id) });
}

export async function listInvoices(): Promise<Invoice[]> {
  await latency();
  return clone(invoices);
}

export async function listPlans(): Promise<{ plans: Plan[]; counts: Record<string, number> }> {
  if (IS_LIVE_API) {
    return apiRequest<{ plans: Plan[]; counts: Record<string, number> }>('/platform/billing/plans', { headers: platformHeaders() });
  }
  await latency();
  const counts: Record<string, number> = {};
  for (const t of tenants) if (t.status !== 'CANCELLED') counts[t.planKey] = (counts[t.planKey] ?? 0) + 1;
  return clone({ plans, counts });
}

export async function listEvents(): Promise<AuditEvent[]> {
  await latency();
  return clone(events);
}

export async function getSettings(): Promise<PlatformSettings> {
  await latency();
  return clone(settings);
}

export async function slugAvailable(slug: string): Promise<boolean> {
  await latency();
  return !tenants.some((t) => t.slug === slug) && slug !== 'demo';
}

/* ── Writes ────────────────────────────────────────────────────────── */

function need(id: string): Tenant {
  const t = tenants.find((row) => row.id === id);
  if (!t) throw new ApiError(404, 'That restaurant is not on the platform.');
  return t;
}

export interface NewTenantInput {
  name: string;
  slug: string;
  city: string;
  cuisine: string;
  planKey: PlanKey;
  interval: BillingInterval;
  trialDays: number;
  ownerName: string;
  ownerEmail: string;
  serviceChargePct: number;
  taxPct: number;
}

export async function createTenant(input: NewTenantInput): Promise<Tenant> {
  await latency();
  if (tenants.some((t) => t.slug === input.slug)) throw new ApiError(409, 'That slug is already taken.');
  if (tenants.some((t) => t.owner.email.toLowerCase() === input.ownerEmail.toLowerCase())) throw new ApiError(409, 'That owner email already belongs to an account.');
  const owner: Person = { id: uid('own'), name: input.ownerName, email: input.ownerEmail, role: 'OWNER', lastSignInAt: null, active: true };
  const tenant: Tenant = {
    id: uid('rst'),
    name: input.name,
    slug: input.slug,
    city: input.city,
    cuisine: input.cuisine,
    planKey: input.planKey,
    status: input.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
    interval: input.interval,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    trialEndsAt: input.trialDays > 0 ? ahead(input.trialDays * DAY) : null,
    periodEnd: ahead((input.trialDays > 0 ? input.trialDays : 30) * DAY),
    pastDueSince: null,
    suspendedReason: null,
    branches: 1,
    seats: 1,
    extraBranches: 0,
    extraSeats: 0,
    ordersThisMonth: 0,
    ordersLastMonth: 0,
    weekly: [0, 0, 0, 0, 0, 0, 0, 0],
    firstOrderAt: null,
    currency: settings.defaults.currency,
    timezone: settings.defaults.timezone,
    serviceChargeRate: input.serviceChargePct / 100,
    taxRate: input.taxPct / 100,
    owner,
    people: [owner],
    notes: [],
  };
  tenants = [tenant, ...tenants];
  log('restaurant', 'Created restaurant', tenant, `Owner ${owner.name} invited`);
  return clone(tenant);
}

export async function setTenantStatus(id: string, status: 'SUSPENDED' | 'ACTIVE' | 'RESTRICTED', reason?: string): Promise<void> {
  await latency();
  const t = need(id);
  t.status = status;
  t.suspendedReason = status === 'SUSPENDED' ? (reason ?? 'Suspended by operator.') : null;
  if (status === 'ACTIVE') t.pastDueSince = null;
  log('restaurant', status === 'SUSPENDED' ? 'Suspended restaurant' : status === 'RESTRICTED' ? 'Restricted restaurant' : 'Restored restaurant', t, reason ?? null);
}

export async function changeTenantPlan(id: string, planKey: PlanKey, interval: BillingInterval): Promise<void> {
  await latency();
  const t = need(id);
  const from = planOf(t.planKey).name;
  t.planKey = planKey;
  t.interval = interval;
  log('plan', 'Changed plan', t, `${from} → ${planOf(planKey).name}, ${interval === 'ANNUAL' ? 'billed yearly' : 'billed monthly'}`);
}

export async function extendTrial(id: string, days: number): Promise<void> {
  await latency();
  const t = need(id);
  const base = t.trialEndsAt ? Math.max(Date.parse(t.trialEndsAt), Date.now()) : Date.now();
  t.trialEndsAt = new Date(base + days * DAY).toISOString();
  t.status = 'TRIAL';
  log('plan', `Extended trial by ${days} days`, t);
}

export async function setOverrides(id: string, extraBranches: number, extraSeats: number): Promise<void> {
  await latency();
  const t = need(id);
  t.extraBranches = extraBranches;
  t.extraSeats = extraSeats;
  log('plan', 'Adjusted limits', t, `+${extraBranches} branches, +${extraSeats} seats`);
}

export async function addNote(id: string, text: string): Promise<void> {
  await latency();
  const t = need(id);
  t.notes = [{ id: uid('note'), at: new Date().toISOString(), author: OPERATOR, text }, ...t.notes];
}

export async function resetPin(id: string, personId: string): Promise<string> {
  await latency();
  const t = need(id);
  const person = t.people.find((p) => p.id === personId);
  if (!person) throw new ApiError(404, 'That person is not on this restaurant.');
  log('security', 'Reset PIN', t, person.name);
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function setPersonActive(id: string, personId: string, active: boolean): Promise<void> {
  await latency();
  const t = need(id);
  const person = t.people.find((p) => p.id === personId);
  if (!person) throw new ApiError(404, 'That person is not on this restaurant.');
  person.active = active;
  log('security', active ? 'Reactivated account' : 'Deactivated account', t, person.name);
}

export async function settleInvoice(invoiceId: string, method: PayMethod, reference: string): Promise<void> {
  await latency();
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new ApiError(404, 'That invoice does not exist.');
  inv.state = 'PAID';
  inv.paidAt = new Date().toISOString();
  inv.method = method;
  inv.reference = reference || null;
  const t = tenants.find((row) => row.id === inv.tenantId);
  if (t && (t.status === 'PAST_DUE' || t.status === 'RESTRICTED' || t.status === 'SUSPENDED') && !invoices.some((i) => i.tenantId === t.id && i.state === 'OVERDUE')) {
    t.status = 'ACTIVE';
    t.pastDueSince = null;
  }
  log('billing', 'Marked invoice paid', t ?? null, `${PAY_METHOD_LABEL[method]}${reference ? ` · ${reference}` : ''}`);
}

export async function voidInvoice(invoiceId: string): Promise<void> {
  await latency();
  const inv = invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new ApiError(404, 'That invoice does not exist.');
  inv.state = 'VOID';
  log('billing', 'Voided invoice', tenants.find((t) => t.id === inv.tenantId) ?? null, inv.number);
}

export async function remindInvoices(invoiceIds: string[]): Promise<number> {
  await latency();
  let sent = 0;
  for (const inv of invoices) {
    if (!invoiceIds.includes(inv.id) || (inv.state !== 'OPEN' && inv.state !== 'OVERDUE')) continue;
    inv.remindedAt = new Date().toISOString();
    sent += 1;
    log('billing', 'Sent payment reminder', tenants.find((t) => t.id === inv.tenantId) ?? null, inv.number);
  }
  return sent;
}

export async function issueInvoice(tenantId: string, amount: Minor, memo: string): Promise<void> {
  await latency();
  const t = need(tenantId);
  const now = Date.now();
  invoices = [
    {
      id: uid('inv'),
      number: nextNumber(),
      tenantId: t.id,
      tenantName: t.name,
      planName: planOf(t.planKey).name,
      amount,
      issuedAt: new Date(now).toISOString(),
      dueAt: new Date(now + 7 * DAY).toISOString(),
      periodLabel: memo || 'One-off charge',
      state: 'OPEN',
      paidAt: null,
      method: null,
      reference: null,
      remindedAt: null,
    },
    ...invoices,
  ];
  log('billing', 'Issued invoice', t, memo || null);
}

/** Records that the next period was paid. Creates the charge if none is open, then settles it. A plan that costs nothing just rolls forward. */
export async function recordRenewal(tenantId: string, method: PayMethod, reference: string): Promise<void> {
  if (IS_LIVE_API) {
    await apiRequest(`/platform/billing/restaurants/${tenantId}/renewal`, {
      method: 'POST',
      headers: platformHeaders(),
      body: JSON.stringify({ paymentMethod: method.toLowerCase(), ...(reference ? { paymentRef: reference } : null) }),
    });
    return;
  }
  await latency();
  const t = need(tenantId);
  if (t.status === 'CANCELLED') throw new ApiError(400, "This restaurant's subscription is cancelled, so it can't be renewed.");
  const end = Date.parse(t.periodEnd);
  const base = Number.isFinite(end) && end > Date.now() ? end : Date.now();
  t.periodEnd = new Date(base + 30 * DAY).toISOString();
  t.status = 'ACTIVE';
  t.pastDueSince = null;
  log('billing', 'Recorded renewal', t, `${PAY_METHOD_LABEL[method]}${reference ? ` · ${reference}` : ''}`);
}

export async function savePlans(next: Plan[]): Promise<void> {
  if (IS_LIVE_API) {
    await apiRequest('/platform/billing/plans', { method: 'PUT', headers: platformHeaders(), body: JSON.stringify({ plans: next }) });
    return;
  }
  await latency();
  plans = clone(next);
  log('plan', 'Updated plans', null, 'New prices apply at each restaurant’s next renewal');
}

export async function saveSettings(next: PlatformSettings): Promise<void> {
  await latency();
  settings = clone(next);
  log('security', 'Updated platform settings', null);
}

export async function rotateKey(): Promise<string> {
  await latency();
  const key = `ld_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
  settings = { ...settings, keyRotatedAt: new Date().toISOString(), keyHint: `••••••••${key.slice(-4)}` };
  log('security', 'Rotated platform key', null, 'Previous key retired');
  return key;
}
