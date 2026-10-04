import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { changePlan, fetchPlans } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import {
  PAYMENT_NOTE,
  changeEffect,
  formatDay,
  intervalLabel,
  keyDate,
  meterFraction,
  meterLabel,
  meterNote,
  monthsFree,
  planPrice,
  planSummary,
  statusStatement,
} from '../../domain/subscription';
import type { BillingInterval, Invoice, MeterKind, Plan as PlanData, Subscription, Tone, Usage, UsageMeter } from '../../domain/subscription';
import { useAuth } from '../../state/AuthContext';
import { useSubscription } from '../../state/SubscriptionContext';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_QUIET, Empty, Loading, PANEL, PageTitle, Panel, Segmented, useCommand } from '../../components/admin/kit';
import { SubscriptionStatusPill, TonePill } from '../../components/admin/SubscriptionBits';
import { Check, Lock } from '../../components/icons';
import { DISPLAY, TAG, TAG_ON, cx } from '../../components/ui';

/**
 * The restaurant's plan: what it is on, how much of it is used, and — for an
 * owner — what to pay and how to change it.
 *
 * A manager sees the same page minus the money, so they know what to expect
 * (a trial running out, a limit coming up) without being shown figures that are
 * the owner's to manage. The page never needs the rest of the dashboard — an owner
 * of a suspended restaurant reaches this and nothing else, to put things right.
 */
export function Plan() {
  const { allows } = useAuth();
  const sub = useSubscription();
  const canManage = allows('billing:manage');
  const { hash } = useLocation();
  const subscription = sub.subscription;
  // Read once per visit: "days left" and "overdue" do not need to tick while someone reads a page.
  const [now] = useState(() => new Date());

  // A banner or a toast can point at a section; the page is long enough that the link has to land on it.
  useEffect(() => {
    if (!subscription || !hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [hash, subscription]);

  if (!subscription) {
    if (sub.phase === 'loading') return <Loading label="Reading your plan…" />;
    return (
      <Panel>
        <Empty
          title="The plan could not be read"
          message={sub.error ?? 'Something went wrong reading the plan. Nothing has changed.'}
          action={
            <button type="button" className={ADMIN_GHOST} onClick={() => void sub.reload()}>
              Try again
            </button>
          }
        />
      </Panel>
    );
  }

  // When money is owed, the invoice is the thing to get to; otherwise it is the reference at the end.
  const owing = canManage && ['PAST_DUE', 'RESTRICTED', 'SUSPENDED', 'CANCELLED'].includes(subscription.status);
  const invoices = <InvoicesSection invoices={sub.invoices} now={now} />;

  return (
    <>
      <PageTitle title="Plan" subtitle={canManage ? 'Your subscription, usage and invoices' : 'What this restaurant is on, and how much of it is used'} />

      <div className="grid gap-4">
        <StatusBand subscription={subscription} canManage={canManage} now={now} />
        {owing && invoices}

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <UsageSection usage={sub.usage} />
          <IncludedSection subscription={subscription} />
        </div>

        {canManage ? (
          <>
            <ChangePlanSection subscription={subscription} onChanged={sub.reload} />
            {!owing && invoices}
          </>
        ) : (
          <Panel variant="subtle">
            <p className="text-[13.5px] leading-relaxed text-ink-3">
              Plan changes and invoices are handled by the owner. This page shows where the restaurant stands, so a trial running out or a limit coming
              up is no surprise.
            </p>
          </Panel>
        )}
      </div>
    </>
  );
}

/* ── Where it stands ───────────────────────────────────────────────── */

function StatusBand({ subscription, canManage, now }: { subscription: Subscription; canManage: boolean; now: Date }) {
  const { plan, interval, status } = subscription;
  const price = canManage ? planPrice(plan, interval) : null;
  const date = keyDate(subscription);
  const extras = [
    subscription.extraBranches > 0 && `${subscription.extraBranches} extra ${subscription.extraBranches === 1 ? 'branch' : 'branches'}`,
    subscription.extraSeats > 0 && `${subscription.extraSeats} extra staff ${subscription.extraSeats === 1 ? 'seat' : 'seats'}`,
  ].filter(Boolean);

  const edge: Partial<Record<typeof status, string>> = { RESTRICTED: 'ring-berry/30', SUSPENDED: 'ring-berry/30', PAST_DUE: 'ring-gold/35' };

  return (
    <section className={cx(PANEL, 'overflow-hidden', edge[status])}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 p-5 sm:p-6">
        <div className="min-w-0 max-w-[58ch]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 className={cx(DISPLAY, 'text-[30px] sm:text-[36px]')}>{plan.name}</h2>
            <SubscriptionStatusPill status={status} />
          </div>
          <p className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{statusStatement(subscription, canManage, now)}</p>
        </div>

        {price !== null && (
          <div className="sm:text-right">
            <div className="text-[22px] font-semibold tnum">{formatMoney(price, plan.currency)}</div>
            <div className="text-[12.5px] text-ink-3">
              {interval === 'ANNUAL' ? 'per year' : 'per month'}
              {status === 'TRIAL' && ' once the trial ends'}
            </div>
            {extras.length > 0 && <div className="mt-1 text-[12.5px] text-ink-4">plus {extras.join(' and ')}</div>}
          </div>
        )}
      </div>

      <dl className="flex flex-col border-t border-hairline sm:flex-row">
        <Fact label="Current period" value={`${formatDay(subscription.currentPeriodStart)} – ${formatDay(subscription.currentPeriodEnd)}`} />
        {date && <Fact label={date.label} value={date.value} />}
        <Fact label="Billing" value={subscription.pendingPlan ? `${intervalLabel(interval)} · then ${subscription.pendingPlan.name}` : intervalLabel(interval)} />
      </dl>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-hairline px-5 py-3.5 not-first:border-t sm:flex-1 sm:px-6 sm:not-first:border-t-0 sm:not-first:border-l">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{label}</dt>
      <dd className="mt-0.5 text-[14px] font-semibold tnum">{value}</dd>
    </div>
  );
}

/* ── Usage against the plan ────────────────────────────────────────── */

const FILL: Record<UsageMeter['level'], string> = { ok: 'bg-mint', warn: 'bg-gold', over: 'bg-berry' };

function UsageSection({ usage }: { usage: Usage | null }) {
  const rows: { kind: MeterKind; label: string; sub: string; meter: UsageMeter }[] = usage
    ? [
        { kind: 'orders', label: 'Orders this month', sub: 'Counted from the 1st of the month', meter: usage.orders },
        { kind: 'branches', label: 'Branches', sub: 'Active branches', meter: usage.branches },
        { kind: 'seats', label: 'Staff seats', sub: 'Active team members', meter: usage.seats },
      ]
    : [];

  return (
    <Panel title="Usage" hint="Against what the plan includes" bare>
      {!usage ? (
        <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Usage could not be read just now. Reload the page to try again.</p>
      ) : (
        rows.map(({ kind, label, sub, meter }) => <MeterRow key={kind} kind={kind} label={label} sub={sub} meter={meter} />)
      )}
    </Panel>
  );
}

function MeterRow({ kind, label, sub, meter }: { kind: MeterKind; label: string; sub: string; meter: UsageMeter }) {
  const note = meterNote(kind, meter);
  return (
    <div className="border-b border-hairline px-4 py-4 last:border-0 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[14px] font-semibold">{label}</div>
          <div className="text-[12.5px] text-ink-4">{sub}</div>
        </div>
        <div className="shrink-0 text-[14px] font-semibold tnum">{meterLabel(meter)}</div>
      </div>

      {meter.limit !== undefined && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={meter.limit}
          aria-valuenow={Math.min(meter.used, meter.limit)}
          className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3"
        >
          <div className={cx('h-full origin-left animate-grow-x rounded-full', FILL[meter.level])} style={{ width: `${meterFraction(meter) * 100}%` }} />
        </div>
      )}

      {note && <p className="mt-2 text-[12.5px] leading-snug text-ink-3">{note}</p>}
    </div>
  );
}

/* ── What the plan includes ────────────────────────────────────────── */

function IncludedSection({ subscription }: { subscription: Subscription }) {
  const { features } = subscription.plan;
  const full = features.analyticsTier === 'full';
  const rows = [
    {
      included: full,
      label: full ? 'Full analytics' : 'Basic analytics',
      note: full ? 'Revenue trends, comparisons and branch performance.' : 'Trends, comparisons and branch performance are on higher plans.',
    },
    { included: features.exports, label: 'Data exports', note: features.exports ? 'Part of this plan.' : 'Not part of this plan.' },
    {
      included: true,
      label: 'Audit history',
      note: features.auditRetentionDays ? `Changes are kept for ${features.auditRetentionDays} days.` : 'The full history is kept.',
    },
  ];
  const extras = [
    subscription.extraBranches > 0 && `${subscription.extraBranches} extra ${subscription.extraBranches === 1 ? 'branch' : 'branches'}`,
    subscription.extraSeats > 0 && `${subscription.extraSeats} extra staff ${subscription.extraSeats === 1 ? 'seat' : 'seats'}`,
  ].filter(Boolean);

  return (
    <Panel title="What's included" hint={`In ${subscription.plan.name}`} bare>
      <ul>
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-3 border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
            <span className={cx('mt-0.5 shrink-0', row.included ? 'text-mint-ink' : 'text-ink-4')}>{row.included ? <Check size={16} /> : <Lock size={16} />}</span>
            <div className="min-w-0">
              <div className={cx('text-[14px] font-semibold', !row.included && 'text-ink-3')}>{row.label}</div>
              <div className="text-[12.5px] leading-snug text-ink-3">{row.note}</div>
            </div>
          </li>
        ))}
      </ul>
      {extras.length > 0 && <p className="border-t border-hairline px-4 py-3 text-[12.5px] leading-snug text-ink-3 sm:px-5">Includes {extras.join(' and ')}, added to the limits shown under Usage.</p>}
    </Panel>
  );
}

/* ── Changing plan (owner) ─────────────────────────────────────────── */

function ChangePlanSection({ subscription, onChanged }: { subscription: Subscription; onChanged: () => Promise<void> }) {
  const plans = useAsync(() => fetchPlans(), []);
  // What the owner has picked in the toggle, or nothing yet — which means whatever they are billed on now.
  const [picked, setPicked] = useState<BillingInterval | null>(null);
  const interval = picked ?? subscription.interval;
  const [choice, setChoice] = useState<string | null>(null);
  const { busy, run } = useCommand();

  const apply = (plan: PlanData) => {
    const success = changeEffect(subscription, plan) === 'next_period' && plan.key !== subscription.plan.key ? 'Switch scheduled' : 'Plan updated';
    void run('change-plan', () => changePlan(plan.key, interval), success).then(async (ok) => {
      if (!ok) return;
      setChoice(null);
      setPicked(null);
      await onChanged();
    });
  };

  return (
    <div id="change-plan" className="scroll-mt-24">
      <Panel
        title="Change plan"
        hint="Moving up starts now and is billed from your next invoice. Moving down waits for the end of the paid period."
        className="overflow-hidden"
        action={
          <Segmented
            label="Billing interval"
            value={interval}
            onChange={(next) => {
              setPicked(next);
              setChoice(null);
            }}
            options={[
              { value: 'MONTHLY', label: 'Monthly' },
              { value: 'ANNUAL', label: 'Yearly' },
            ]}
          />
        }
        bare
      >
        {plans.loading && !plans.data ? (
          <Loading label="Loading the plans…" />
        ) : !plans.data ? (
          <Empty
            title="The plans could not be loaded"
            message="Nothing has changed. Try again in a moment."
            action={
              <button type="button" className={ADMIN_GHOST} onClick={plans.reload}>
                Try again
              </button>
            }
          />
        ) : (
          <ul>
            {plans.data.map((plan) => (
              <PlanRow
                key={plan.key}
                plan={plan}
                subscription={subscription}
                interval={interval}
                confirming={choice === plan.key}
                busy={busy}
                onChoose={() => setChoice(plan.key)}
                onCancel={() => setChoice(null)}
                onConfirm={() => apply(plan)}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PlanRow({
  plan,
  subscription,
  interval,
  confirming,
  busy,
  onChoose,
  onCancel,
  onConfirm,
}: {
  plan: PlanData;
  subscription: Subscription;
  interval: BillingInterval;
  confirming: boolean;
  busy: boolean;
  onChoose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const current = plan.key === subscription.plan.key;
  const queued = subscription.pendingPlan?.key === plan.key;
  const sameInterval = interval === subscription.interval;
  const price = planPrice(plan, interval);
  const free = monthsFree(plan);

  const action = current
    ? subscription.pendingPlan
      ? `Stay on ${plan.name}`
      : sameInterval
        ? null
        : `Switch to ${interval === 'ANNUAL' ? 'yearly' : 'monthly'} billing`
    : `Switch to ${plan.name}`;

  return (
    <li className={cx('border-b border-hairline px-4 py-4 last:border-0 sm:px-5', current && 'bg-surface-2/55')}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{plan.name}</span>
            {current && <span className={cx(TAG, TAG_ON, 'h-6 px-2.5 text-[11.5px]')}>Your plan</span>}
            {queued && <span className={cx(TAG, TAG_ON, 'h-6 px-2.5 text-[11.5px]')}>From {formatDay(subscription.currentPeriodEnd)}</span>}
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{planSummary(plan)}</p>
        </div>

        {price !== null && (
          <div className="shrink-0 sm:text-right">
            <div className="text-[15px] font-semibold tnum">{formatMoney(price, plan.currency)}</div>
            <div className="text-[12px] text-ink-4">
              {interval === 'ANNUAL' ? `per year${free > 0 ? ` · ${free} months free` : ''}` : 'per month'}
            </div>
          </div>
        )}

        <div className="shrink-0">
          {action ? (
            !confirming && (
              <button type="button" className={ADMIN_GHOST} onClick={onChoose}>
                {action}
              </button>
            )
          ) : (
            <span className="text-[13px] text-ink-4">In use</span>
          )}
        </div>
      </div>

      {confirming && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3 ring-1 ring-hairline ring-inset">
          <p className="min-w-0 flex-1 basis-64 text-[13px] leading-snug text-ink-2">{effectCopy(plan, subscription, interval, price)}</p>
          <div className="flex shrink-0 gap-2">
            <button type="button" className={ADMIN_QUIET} onClick={onCancel} disabled={busy}>
              Not now
            </button>
            <button type="button" className={ADMIN_PRIMARY} onClick={onConfirm} disabled={busy}>
              {busy ? 'Saving…' : 'Confirm'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** What confirming will do, in the words the owner would use — decided before the click, not discovered after. */
function effectCopy(plan: PlanData, subscription: Subscription, interval: BillingInterval, price: number | null): string {
  const current = plan.key === subscription.plan.key;
  if (current && subscription.pendingPlan) {
    return `You stay on ${plan.name}. The switch to ${subscription.pendingPlan.name} on ${formatDay(subscription.currentPeriodEnd)} is cancelled.`;
  }
  if (current) {
    return `Billing becomes ${interval === 'ANNUAL' ? 'yearly' : 'monthly'}, from your next invoice.`;
  }
  if (changeEffect(subscription, plan) === 'now') {
    return subscription.status === 'TRIAL'
      ? `Starts now. You are still on the trial, so you are billed from the first invoice after it ends${price !== null ? `: ${formatMoney(price, plan.currency)} ${interval === 'ANNUAL' ? 'a year' : 'a month'}` : ''}.`
      : `Starts now, with ${plan.name}'s limits straight away. You are billed ${price !== null ? `${formatMoney(price, plan.currency)} ${interval === 'ANNUAL' ? 'a year' : 'a month'} ` : ''}from your next invoice.`;
  }
  return `Takes effect on ${formatDay(subscription.currentPeriodEnd)}, when the current period ends. You keep ${subscription.plan.name} until then.`;
}

/* ── Invoices (owner) ──────────────────────────────────────────────── */

function InvoicesSection({ invoices, now }: { invoices: Invoice[] | null; now: Date }) {
  const hasOpen = (invoices ?? []).some((invoice) => invoice.status === 'OPEN');

  return (
    <div id="invoices" className="scroll-mt-24">
      <Panel title="Invoices" hint="Newest first" className="overflow-hidden" bare>
        {invoices === null ? (
          <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Invoices could not be read just now. Reload the page to try again.</p>
        ) : invoices.length === 0 ? (
          <Empty title="No invoices yet" message="The first one is issued about a week before the trial ends, or before the current period does." />
        ) : (
          <ul>
            {invoices.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} now={now} />
            ))}
          </ul>
        )}
        {hasOpen && <p className="border-t border-hairline px-4 py-3.5 text-[13px] leading-relaxed text-ink-3 sm:px-5">{PAYMENT_NOTE}</p>}
      </Panel>
    </div>
  );
}

function InvoiceRow({ invoice, now }: { invoice: Invoice; now: Date }) {
  const open = invoice.status === 'OPEN';
  const overdue = open && Date.parse(invoice.dueAt) < now.getTime();
  const tone: Tone = invoice.status === 'PAID' ? 'good' : invoice.status === 'VOID' ? 'muted' : overdue ? 'warn' : 'info';
  const label = invoice.status === 'PAID' ? 'Paid' : invoice.status === 'VOID' ? 'Replaced' : overdue ? 'Overdue' : 'Open';
  const when =
    invoice.status === 'PAID' && invoice.paidAt ? `Paid ${formatDay(invoice.paidAt)}` : open ? `Due ${formatDay(invoice.dueAt)}` : 'Replaced by a newer invoice';

  return (
    <li className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5', open && 'bg-flame-dim')}>
      <div className="min-w-0 flex-1 basis-48">
        <div className="text-[14px] font-semibold tnum">{invoice.number}</div>
        <div className="text-[12.5px] text-ink-3 tnum">
          {formatDay(invoice.periodStart)} – {formatDay(invoice.periodEnd)}
        </div>
      </div>
      <div className="text-[12.5px] text-ink-3 tnum">{when}</div>
      <div className="w-28 shrink-0 text-right text-[14px] font-semibold tnum">{formatMoney(invoice.amount, invoice.currency)}</div>
      <TonePill tone={tone} className="w-24 justify-center">
        {label}
      </TonePill>
    </li>
  );
}
