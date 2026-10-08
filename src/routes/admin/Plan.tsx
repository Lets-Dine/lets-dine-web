import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { changePlan, confirmEsewa, fetchPlans, redirectToEsewa, startEsewa } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import {
  PAYMENT_NOTE,
  changeEffect,
  describeChange,
  formatDay,
  intervalLabel,
  keyDate,
  paymentLabel,
  meterFraction,
  meterLabel,
  meterNote,
  monthsFree,
  planPrice,
  planSummary,
  statusStatement,
} from '../../domain/subscription';
import type { BillingInterval, ChangeSummary, Invoice, MeterKind, Plan as PlanData, Subscription, Tone, Usage, UsageMeter } from '../../domain/subscription';
import { useAuth } from '../../state/AuthContext';
import { useSubscription } from '../../state/SubscriptionContext';
import { useAsync } from '../../state/useAsync';

type AsyncPlans = ReturnType<typeof useAsync<PlanData[]>>;
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_QUIET, Empty, Loading, PANEL, PageTitle, Panel, Segmented, useCommand } from '../../components/admin/kit';
import { PlanCompareModal } from '../../components/admin/PlanCompareModal';
import { SubscriptionStatusPill, TonePill } from '../../components/admin/SubscriptionBits';
import { Check, ChevronRight, Lock, X } from '../../components/icons';
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
  const plans = useAsync(() => fetchPlans(), []);
  const [comparing, setComparing] = useState(false);

  // eSewa sends the payer back here with the result in `?data=`. The API checks it with eSewa; the page only reloads.
  const { search } = useLocation();
  const navigate = useNavigate();
  const { run } = useCommand();
  useEffect(() => {
    const data = new URLSearchParams(search).get('data');
    if (!data) return;
    navigate('/admin/plan', { replace: true });
    void run('esewa-confirm', () => confirmEsewa(data), 'Payment received. Your plan is renewed.').then(() => sub.reload());
  }, [search]);

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
      <PageTitle
        title="Plan"
        subtitle={canManage ? 'Your subscription, usage and invoices' : 'What this restaurant is on, and how much of it is used'}
        action={
          <button type="button" className={ADMIN_GHOST} onClick={() => setComparing(true)}>
            Compare plans
          </button>
        }
      />
      {comparing && (
        <PlanCompareModal
          plans={plans}
          current={subscription.plan.key}
          interval={subscription.interval}
          onClose={() => setComparing(false)}
          onChangePlan={
            canManage
              ? () => {
                  setComparing(false);
                  requestAnimationFrame(() => document.getElementById('change-plan')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
                }
              : undefined
          }
        />
      )}

      <div className="grid gap-4">
        <StatusBand subscription={subscription} canManage={canManage} now={now} />
        {owing && invoices}

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
          <UsageSection usage={sub.usage} />
          <IncludedSection subscription={subscription} />
        </div>

        {canManage ? (
          <>
            <ChangePlanSection subscription={subscription} plans={plans} usage={sub.usage} now={now} onChanged={sub.reload} />
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

function ChangePlanSection({
  subscription,
  plans,
  usage,
  now,
  onChanged,
}: {
  subscription: Subscription;
  plans: AsyncPlans;
  usage: Usage | null;
  now: Date;
  onChanged: () => Promise<void>;
}) {
  // What the owner has picked in the toggle, or nothing yet — which means whatever they are billed on now.
  const [picked, setPicked] = useState<BillingInterval | null>(null);
  const interval = picked ?? subscription.interval;
  const [choice, setChoice] = useState<string | null>(null);
  const { busy, run } = useCommand();

  const apply = (plan: PlanData) => {
    const success = changeEffect(subscription, plan) === 'next_period' && plan.key !== subscription.plan.key ? 'Switch scheduled' : 'Plan updated';
    const upgrading = subscription.status === 'ACTIVE' && changeEffect(subscription, plan) === 'now' && plan.key !== subscription.plan.key;
    void run(
      'change-plan',
      async () => {
        const result = await changePlan(plan.key, interval);
        // An upgrade on a paid period starts when its prorated invoice is paid, so go straight to paying it.
        if (result.invoice && result.invoice.currency === 'NPR') redirectToEsewa(await startEsewa(result.invoice.id));
        return result;
      },
      upgrading ? 'Upgrade invoice created' : success,
    ).then(async (ok) => {
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
        hint={
          subscription.status === 'TRIAL'
            ? 'Plans can be changed once your trial ends. Until then you have the full features of your trial plan.'
            : 'Moving up is charged for the days left in this period and starts once paid. Moving down waits for the end of the paid period.'
        }
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
                usage={usage}
                now={now}
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

const priceText = (amount: number | null, currency: string, interval: BillingInterval): string | null =>
  amount === null ? null : `${formatMoney(amount, currency)} ${interval === 'ANNUAL' ? 'a year' : 'a month'}`;

function PlanRow({
  plan,
  subscription,
  interval,
  usage,
  now,
  confirming,
  busy,
  onChoose,
  onCancel,
  onConfirm,
}: {
  plan: PlanData;
  subscription: Subscription;
  interval: BillingInterval;
  usage: Usage | null;
  now: Date;
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
          {action && subscription.status === 'TRIAL' && !current ? (
            <span className="text-[13px] text-ink-4">After your trial</span>
          ) : action ? (
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
        <ChangeConfirm
          summary={describeChange(subscription, plan, interval, usage, now)}
          from={{ name: subscription.plan.name, price: priceText(planPrice(subscription.plan, subscription.interval), subscription.plan.currency, subscription.interval) }}
          to={{ name: plan.name, price: priceText(price, plan.currency, interval) }}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      )}
    </li>
  );
}

/**
 * Confirming a plan change is a billing decision, so it gets the whole screen's attention: a modal over
 * the page rather than a strip inside the list. A native `<dialog>` gives the focus trap, Escape and the
 * inert page behind; while a request is in flight it cannot be dismissed.
 */
function ChangeConfirm({
  summary,
  from,
  to,
  busy,
  onCancel,
  onConfirm,
}: {
  summary: ChangeSummary;
  from: { name: string; price: string | null };
  to: { name: string; price: string | null };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const blocked = summary.blockers.length > 0;
  const sameplan = from.name === to.name;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={(e) => busy && e.preventDefault()}
      onClick={(e) => e.target === ref.current && !busy && ref.current?.close()}
      aria-labelledby="change-plan-title"
      className={cx(
        PANEL,
        'm-auto flex max-h-[calc(100dvh-1.5rem)] w-[min(36rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 shadow-2xl shadow-black/40',
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-5 py-5 sm:px-6">
        <div className="min-w-0">
          <h2 id="change-plan-title" className={cx(DISPLAY, 'text-[26px] sm:text-[30px]')}>
            {summary.heading}
          </h2>
          {!sameplan && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
              <span>
                {from.name}
                {from.price && <span className="tnum"> · {from.price}</span>}
              </span>
              <ChevronRight size={12} className="shrink-0 text-ink-4" aria-hidden />
              <span className="font-semibold text-ink">
                {to.name}
                {to.price && <span className="tnum"> · {to.price}</span>}
              </span>
            </p>
          )}
        </div>
        <button type="button" onClick={() => ref.current?.close()} disabled={busy} aria-label="Close" className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-40">
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <p className="text-[14.5px] leading-snug text-ink">{summary.title}</p>

        <dl className="mt-4 grid gap-x-5 gap-y-3 text-[13px] sm:grid-cols-[9.5rem_1fr]">
          {summary.facts.map((fact) => {
            const due = fact.label === 'You pay today' && summary.dueNow !== null;
            return (
              <div key={fact.label} className="contents">
                <dt className="text-ink-3">{fact.label}</dt>
                <dd className={cx('min-w-0 text-ink-2', due && 'text-[14px] font-semibold text-ink')}>{fact.value}</dd>
              </div>
            );
          })}
        </dl>

        {summary.deltas.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <p className="text-[12.5px] font-semibold text-ink-3">What changes in what you can use</p>
            <ul className="mt-2.5 grid gap-2">
              {summary.deltas.map((delta) => (
                <li key={delta.label} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                  <span className="w-32 shrink-0 text-ink-3">{delta.label}</span>
                  <span className="tnum text-ink-3">{delta.from}</span>
                  <ChevronRight size={12} className="shrink-0 self-center text-ink-4" aria-hidden />
                  <span className={cx('tnum font-semibold', delta.direction === 'more' ? 'text-leaf' : 'text-berry-ink')}>{delta.to}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {blocked && (
          <div role="alert" className="mt-5 rounded-lg bg-berry/10 px-3.5 py-3 text-[13px] leading-snug text-berry-ink ring-1 ring-berry/30 ring-inset">
            <p className="font-semibold">You can't switch yet</p>
            <ul className="mt-1 grid gap-1">
              {summary.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-hairline px-5 py-4 sm:px-6">
        <button type="button" className={ADMIN_QUIET} onClick={() => ref.current?.close()} disabled={busy}>
          Not now
        </button>
        <button type="button" className={ADMIN_PRIMARY} onClick={onConfirm} disabled={busy || blocked}>
          {busy ? 'Working…' : summary.confirmLabel}
        </button>
      </footer>
    </dialog>
  );
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
  const { busy, run } = useCommand();
  const [expanded, setExpanded] = useState(false);
  const open = invoice.status === 'OPEN';
  const overdue = open && Date.parse(invoice.dueAt) < now.getTime();
  const tone: Tone = invoice.status === 'PAID' ? 'good' : invoice.status === 'VOID' ? 'muted' : overdue ? 'warn' : 'info';
  const label = invoice.status === 'PAID' ? 'Paid' : invoice.status === 'VOID' ? 'Replaced' : overdue ? 'Overdue' : 'Open';
  const when =
    invoice.status === 'PAID' && invoice.paidAt ? `Paid ${formatDay(invoice.paidAt)}` : open ? `Due ${formatDay(invoice.dueAt)}` : 'Replaced by a newer invoice';
  const detailsId = `invoice-${invoice.id}`;

  return (
    <li className={cx('border-b border-hairline last:border-0', open && 'bg-flame-dim')}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3.5 sm:px-5">
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
        {open && invoice.currency === 'NPR' && (
          <button
            type="button"
            className={ADMIN_PRIMARY}
            disabled={busy}
            onClick={() => void run('esewa-start', async () => redirectToEsewa(await startEsewa(invoice.id)))}
          >
            {busy ? 'Opening eSewa…' : 'Pay with eSewa'}
          </button>
        )}
        <button
          type="button"
          className={cx(ADMIN_QUIET, 'gap-1')}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={`${expanded ? 'Hide' : 'Show'} details of ${invoice.number}`}
          onClick={() => setExpanded((v) => !v)}
        >
          Details
          <ChevronRight size={14} className={cx('transition-transform duration-200 ease-out', expanded && 'rotate-90')} />
        </button>
      </div>
      {expanded && <InvoiceDetails id={detailsId} invoice={invoice} />}
    </li>
  );
}

/** What the invoice is made of, as it was issued, and how it was settled. Opens under its row so the list stays in view. */
function InvoiceDetails({ id, invoice }: { id: string; invoice: Invoice }) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const paid = invoice.status === 'PAID';
  const facts: [string, string][] = [
    ['Billing period', `${formatDay(invoice.periodStart)} – ${formatDay(invoice.periodEnd)}`],
    ['Due', formatDay(invoice.dueAt)],
    ...(paid && invoice.paidAt ? ([['Paid', formatDay(invoice.paidAt)]] as [string, string][]) : []),
    ...(paid && invoice.paymentMethod ? ([['Paid with', paymentLabel(invoice.paymentMethod)]] as [string, string][]) : []),
    ...(paid && invoice.paymentRef ? ([['Reference', invoice.paymentRef]] as [string, string][]) : []),
  ];

  return (
    <div id={id} className="mx-4 mb-4 grid gap-4 rounded-xl bg-surface-2/70 p-4 ring-1 ring-hairline ring-inset sm:mx-5 sm:grid-cols-[1.4fr_1fr] sm:gap-6">
      <div>
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">Charges</h3>
        {lines.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">No breakdown was kept for this invoice.</p>
        ) : (
          <ul className="mt-1.5">
            {lines.map((line, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5">
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium">{line.description}</div>
                  {line.quantity > 1 && (
                    <div className="text-[12px] text-ink-4 tnum">
                      {line.quantity} × {formatMoney(line.unitAmount, invoice.currency)}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-[13.5px] tnum">{formatMoney(line.amount, invoice.currency)}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <span className="text-[13.5px] font-semibold">Total</span>
          <span className="text-[16px] font-semibold tnum">{formatMoney(invoice.amount, invoice.currency)}</span>
        </div>
      </div>

      <dl className="grid content-start gap-3">
        {facts.map(([term, value]) => (
          <div key={term}>
            <dt className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{term}</dt>
            <dd className="mt-0.5 break-words text-[13.5px] font-medium tnum">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
