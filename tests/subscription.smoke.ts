import assert from 'node:assert/strict';
import { changeEffect, deriveNotice, describeChange, upgradeCharge, isLockedOut, meterNote, monthsFree, planSummary } from '../src/domain/subscription';
import type { Plan, Subscription, Usage } from '../src/domain/subscription';

const NOW = new Date('2026-10-03T12:00:00.000Z');
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const plan = (over: Partial<Plan> = {}): Plan => ({
  key: 'growth',
  name: 'Growth',
  monthlyPrice: 400000,
  annualPrice: 4000000,
  extraBranchPrice: 80000,
  extraSeatPrice: null,
  currency: 'NPR',
  limits: { branches: 5, staffSeats: 20, ordersPerMonth: 10000 },
  features: { analyticsTier: 'full', exports: true, autoStockConsumption: true, auditRetentionDays: 365 },
  ...over,
});

const sub = (over: Partial<Subscription> = {}): Subscription => ({
  status: 'ACTIVE',
  interval: 'MONTHLY',
  trialEndsAt: null,
  currentPeriodStart: day(-10),
  currentPeriodEnd: day(20),
  pastDueSince: null,
  extraBranches: 0,
  extraSeats: 0,
  cancelledAt: null,
  plan: plan(),
  pendingPlan: null,
  ...over,
});

const usage = (orders: Usage['orders']): Usage => ({ orders, branches: { used: 1, limit: 5, level: 'ok' }, seats: { used: 2, limit: 20, level: 'ok' } });
const notice = (s: Subscription, extra: { usage?: Usage | null; canManage?: boolean } = {}) =>
  deriveNotice({ subscription: s, usage: extra.usage ?? null, canManage: extra.canManage ?? true, now: NOW });

// A healthy restaurant is not interrupted.
assert.equal(notice(sub()), null);

// A trial says nothing until the last week, then asks softly, then urgently.
assert.equal(notice(sub({ status: 'TRIAL', trialEndsAt: day(20) })), null);
const soft = notice(sub({ status: 'TRIAL', trialEndsAt: day(5) }));
assert.equal(soft?.tone, 'info');
assert.equal(soft?.dismissible, true);
const urgent = notice(sub({ status: 'TRIAL', trialEndsAt: day(1) }));
assert.equal(urgent?.tone, 'warn');
assert.equal(urgent?.dismissible, false);

// A manager is told to ask the owner, and is never sent to money.
const forManager = notice(sub({ status: 'TRIAL', trialEndsAt: day(3) }), { canManage: false });
assert.match(forManager!.body, /owner/i);
assert.equal(forManager!.cta.to, '/admin/plan');
assert.equal(notice(sub({ status: 'TRIAL', trialEndsAt: day(3) }), { canManage: true })!.cta.to, '/admin/plan#change-plan');

// Overdue and restricted outrank usage, and cannot be dismissed.
assert.equal(notice(sub({ status: 'PAST_DUE' }), { usage: usage({ used: 20000, limit: 10000, level: 'over' }) })?.id, 'past-due');
assert.equal(notice(sub({ status: 'RESTRICTED' }))?.dismissible, false);

// A closed restaurant is not warned — it is closed.
assert.equal(notice(sub({ status: 'SUSPENDED' })), null);
assert.equal(isLockedOut('SUSPENDED') && isLockedOut('CANCELLED'), true);
assert.equal(isLockedOut('RESTRICTED') || isLockedOut('PAST_DUE'), false);

// A renewal reminder starts a week before the period ends, and stays after it has ended.
assert.equal(notice(sub({ currentPeriodEnd: day(20) })), null);
const upcoming = notice(sub({ currentPeriodEnd: day(5) }));
assert.match(upcoming!.title, /ends in 5 days/);
assert.equal(upcoming!.cta.to, '/admin/plan#renew');
assert.equal(upcoming!.dismissible, true);
const ending = notice(sub({ currentPeriodEnd: day(1) }));
assert.equal(ending!.dismissible, false);
assert.match(notice(sub({ currentPeriodEnd: day(-1) }))!.title, /has ended/);
assert.equal(notice(sub({ currentPeriodEnd: day(5) }), { canManage: false })!.cta.to, '/admin/plan');

// Orders over the allowance nudge, never block; a new month is a new notice.
const over = notice(sub(), { usage: usage({ used: 1043, limit: 1000, level: 'over' }) });
assert.equal(over?.tone, 'warn');
assert.match(over!.id, /^orders-over-2026-10$/);

// Meter notes: quiet while fine, honest about each kind of limit.
assert.equal(meterNote('branches', { used: 1, limit: 5, level: 'ok' }), null);
assert.match(meterNote('seats', { used: 4, limit: 5, level: 'warn' })!, /Close to/);
assert.match(meterNote('seats', { used: 5, limit: 5, level: 'over' })!, /At the plan's staff seat limit/);
assert.match(meterNote('branches', { used: 2, limit: 1, level: 'over' })!, /More branches are in use/);
assert.match(meterNote('orders', { used: 1200, limit: 1000, level: 'over' })!, /never blocks/);

// Plan changes: up and sideways now, down waits — except on a trial.
const starter = plan({ key: 'starter', name: 'Starter', monthlyPrice: 150000 });
assert.equal(changeEffect(sub(), starter), 'next_period');
assert.equal(changeEffect(sub({ plan: starter }), plan()), 'now');
assert.equal(changeEffect(sub({ status: 'TRIAL' }), starter), 'now');

// Upgrade quote: half of a 30-day period left, so half the 250000 difference.
const small = plan({ key: 'starter', name: 'Starter', monthlyPrice: 150000, limits: { branches: 1, staffSeats: 3 } });
const midway = sub({ plan: small, currentPeriodStart: day(-15), currentPeriodEnd: day(15) });
assert.equal(upgradeCharge(midway, plan(), NOW), 125000);
const quote = describeChange(midway, plan(), 'MONTHLY', null, NOW);
assert.equal(quote.dueNow, 'Rs. 1,250');
assert.match(quote.confirmLabel, /^Pay .* and upgrade$/);
assert.ok(quote.deltas.some((d) => d.label === 'Branches' && d.direction === 'more'));

// Downgrade: nothing today, scheduled, and blocked while usage does not fit.
const down = describeChange(sub(), starter, 'MONTHLY', null, NOW);
assert.equal(down.dueNow, null);
assert.match(down.confirmLabel, /^Schedule switch/);
const tight = plan({ key: 'starter', name: 'Starter', monthlyPrice: 150000, limits: { branches: 1, staffSeats: 3 }, extraBranchPrice: null, extraSeatPrice: null });
const heavy = { orders: { used: 1, level: 'ok' }, branches: { used: 3, limit: 5, level: 'ok' }, seats: { used: 2, limit: 20, level: 'ok' } } as Usage;
assert.equal(describeChange(sub(), tight, 'MONTHLY', heavy, NOW).blockers.length, 1);

// Words and arithmetic.
assert.equal(monthsFree(plan()), 2);
assert.equal(planSummary(plan()), '5 branches · 20 staff seats · 10,000 orders a month');
assert.equal(planSummary(starter.limits ? plan({ limits: { branches: 1, staffSeats: 1 } }) : starter), '1 branch · 1 staff seat · unlimited orders');

console.log('subscription smoke: ok');
