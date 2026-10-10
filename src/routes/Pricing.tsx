import { useLayoutEffect, useState } from 'react';
import { fetchPublicPlans, type PublicPlanCatalogue } from '../api/subscription';
import { formatMoney } from '../domain/money';
import { limitLabel, monthsFree, planPrice, type BillingInterval, type Plan } from '../domain/subscription';
import { useAsync } from '../state/useAsync';
import { usePageTitle } from '../state/usePageTitle';
import { cx } from '../components/ui';
import { LandingNav } from './landing/Nav';
import { LandingFooter } from './landing/LandingFooter';
import { DISPLAY_MD, GhostButton, LEAD, PrimaryCta, RAIL, SecondaryCta } from './landing/kit';
import { ScrollTrigger, useReveal } from './landing/motion';

const PAPER = '#f6f1e7';
const DINER = '#12100e';
const START = '/get-started';

/**
 * Public pricing. Prices, limits and the trial plan come from
 * `GET /public/plans`, the same catalogue an owner can switch to.
 */
export function Pricing() {
  usePageTitle(
    'Pricing · FeastoX for restaurants',
    'Plans and prices for FeastoX. A new restaurant starts on a free trial, then pays monthly or yearly.',
  );

  const catalogue = useAsync(fetchPublicPlans, []);
  const [interval, setInterval] = useState<BillingInterval>('MONTHLY');

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', PAPER);
    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', DINER);
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  const choose = (next: BillingInterval) => {
    if (next === interval) return;
    setInterval(next);
  };

  const data = catalogue.data;

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main">
        <Offer
          interval={interval}
          onInterval={choose}
          catalogue={data}
          loading={catalogue.loading}
          error={catalogue.error}
          onRetry={catalogue.reload}
        />
        {data && data.plans.length > 0 && (
          <>
            <Compare plans={data.plans} trialPlanKey={data.trialPlanKey} />
            <Billing plans={data.plans} trialDays={data.trialDays} trialPlanKey={data.trialPlanKey} />
            <Close plans={data.plans} trialDays={data.trialDays} trialPlanKey={data.trialPlanKey} />
          </>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}

function Offer({
  interval,
  onInterval,
  catalogue,
  loading,
  error,
  onRetry,
}: {
  interval: BillingInterval;
  onInterval: (next: BillingInterval) => void;
  catalogue: PublicPlanCatalogue | null;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const plans = catalogue?.plans ?? [];
  const trial = plans.find((plan) => plan.key === catalogue?.trialPlanKey);
  const currency = plans.length > 0 && plans.every((plan) => plan.currency === plans[0].currency) ? plans[0].currency : null;
  const sharedFree = sharedMonthsFree(plans);

  return (
    <section className="pb-16 pt-[calc(104px+var(--safe-t))] sm:pb-20 lg:pb-24">
      <div className={RAIL}>
        <h1 className="max-w-[16ch] font-display text-[clamp(36px,5vw,60px)] font-semibold leading-[1.05] tracking-[-0.032em] text-ink [font-optical-sizing:auto]">
          Plans and what they include.
        </h1>
        <p className={cx(LEAD, 'mt-4 max-w-[46ch]')}>
          {trial
            ? `${catalogue!.trialDays} days of ${trial.name}, free. Then a monthly or yearly plan, priced per restaurant${currency ? ` in ${currency}` : ''}.`
            : `Monthly or yearly plans, priced per restaurant${currency ? ` in ${currency}` : ''}.`}
        </p>

        {plans.length > 0 && <IntervalToggle interval={interval} onInterval={onInterval} monthsFree={sharedFree} />}

        <div className="mt-10">
          {loading && !catalogue && <PlanSkeleton />}
          {!loading && error && (
            <div className="max-w-[46ch] rounded-[20px] bg-surface px-6 py-8 ring-1 ring-hairline ring-inset">
              <p className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">The plans could not be loaded.</p>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-2">{error.message}</p>
              <div className="mt-6">
                <GhostButton onClick={onRetry}>Try again</GhostButton>
              </div>
            </div>
          )}
          {!loading && !error && plans.length === 0 && (
            <p className={cx(LEAD, 'max-w-[42ch]')}>No plans are published right now.</p>
          )}
          {plans.length > 0 && (
            <div className="grid items-stretch gap-4 lg:grid-cols-12">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.key}
                  plan={plan}
                  interval={interval}
                  featured={plan.key === catalogue?.trialPlanKey}
                  className={cardSpan(plan, plans, catalogue?.trialPlanKey ?? '')}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function cardSpan(plan: Plan, plans: Plan[], trialPlanKey: string): string {
  const featured = plan.key === trialPlanKey;
  if (plans.length === 1) return 'lg:col-span-12';
  if (plans.length === 2) return featured ? 'order-1 lg:order-2 lg:col-span-7' : 'order-2 lg:order-1 lg:col-span-5';
  return featured ? 'order-1 lg:col-span-12' : 'order-2 lg:col-span-6';
}

function sharedMonthsFree(plans: Plan[]): number {
  const priced = plans.filter((plan) => plan.monthlyPrice !== null && plan.monthlyPrice > 0);
  if (priced.length === 0) return 0;
  const first = monthsFree(priced[0]);
  return priced.every((plan) => monthsFree(plan) === first) ? first : 0;
}

function IntervalToggle({
  interval,
  onInterval,
  monthsFree: freeMonths,
}: {
  interval: BillingInterval;
  onInterval: (next: BillingInterval) => void;
  monthsFree: number;
}) {
  const options: { id: BillingInterval; label: string }[] = [
    { id: 'MONTHLY', label: 'Monthly' },
    { id: 'ANNUAL', label: 'Yearly' },
  ];

  return (
    <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-full bg-surface p-1 ring-1 ring-hairline ring-inset">
        {options.map((option) => {
          const on = interval === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onInterval(option.id)}
              className={cx(
                'h-10 rounded-full px-4 text-[14.5px] font-semibold transition-move active:scale-[0.98]',
                on ? 'bg-ink text-bg' : 'text-ink-2 hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {freeMonths > 0 && <p className="text-[13.5px] font-semibold text-flame-1">{freeMonths} months free on yearly</p>}
    </div>
  );
}

function PlanCard({
  plan,
  interval,
  featured = false,
  className,
}: {
  plan: Plan;
  interval: BillingInterval;
  featured?: boolean;
  className?: string;
}) {
  const charge = planPrice(plan, interval);
  const free = monthsFree(plan);

  return (
    <article
      className={cx(
        'flex flex-col rounded-[20px] p-6 sm:p-8',
        featured ? 'bg-ink text-bg shadow-deep' : 'bg-surface text-ink ring-1 ring-hairline ring-inset',
        className,
      )}
    >
      {featured ? (
        <p className="text-[14px] font-semibold text-[#ff9e6b]">Included with the free trial</p>
      ) : (
        <p className="hidden text-[14px] lg:invisible lg:block" aria-hidden>
          Included with the free trial
        </p>
      )}
      <h2 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.03em]">{plan.name}</h2>

      <p key={`${plan.key}-${interval}`} aria-live="polite" className="mt-6">
        {charge === null ? (
          <span className="font-display text-[40px] font-semibold tracking-[-0.03em] sm:text-[46px]">Custom</span>
        ) : (
          <span className="font-mono text-[40px] font-bold tabular-nums tracking-tight sm:text-[46px]">{formatMoney(charge, plan.currency)}</span>
        )}
        {charge !== null && (
          <span className={cx('mt-1 block text-[14.5px]', featured ? 'text-bg/70' : 'text-ink-3')}>
            {interval === 'ANNUAL' ? 'a year' : 'a month'}
          </span>
        )}
      </p>
      <p className={cx('mt-2 min-h-[2.5em] text-[13.5px] leading-snug', featured ? 'text-bg/70' : 'text-ink-3')}>
        {charge === null
          ? 'Arranged with the FeastoX team.'
          : interval === 'ANNUAL'
            ? free > 0
              ? `${12 - free} months at the monthly price.`
              : 'Billed once a year.'
            : 'Billed every month.'}
      </p>

      <ul className={cx('mt-6 flex flex-col gap-2 text-[15px] leading-snug', featured ? 'text-bg' : 'text-ink')}>
        {cardLines(plan).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        {featured ? (
          <PrimaryCta to={START} className="w-full sm:w-fit">
            Get started
          </PrimaryCta>
        ) : (
          <SecondaryCta to={START} className="w-full sm:w-fit">
            Get started
          </SecondaryCta>
        )}
      </div>
    </article>
  );
}

function cardLines(plan: Plan): string[] {
  const { branches, staffSeats, ordersPerMonth } = plan.limits;
  const analytics = plan.features.analyticsTier === 'full' ? 'Full analytics' : 'Basic analytics';
  const exports = plan.features.exports ? 'exports included' : 'no exports';
  const lines = [
    branches === undefined ? 'Unlimited branches' : `${branches.toLocaleString('en-US')} ${branches === 1 ? 'branch' : 'branches'}`,
    staffSeats === undefined ? 'Unlimited staff seats' : `${staffSeats.toLocaleString('en-US')} staff ${staffSeats === 1 ? 'seat' : 'seats'}`,
    ordersPerMonth === undefined ? 'Unlimited orders a month' : `${ordersPerMonth.toLocaleString('en-US')} orders a month`,
    `${analytics}, ${exports}.`,
    extraBranchLine(plan),
  ];
  if (plan.extraSeatPrice !== null) lines.push(`Extra staff seats are ${formatMoney(plan.extraSeatPrice, plan.currency)} a month.`);
  return lines;
}

function extraBranchLine(plan: Plan): string {
  if (plan.limits.branches === undefined) return 'Extra branches are not used.';
  if (plan.extraBranchPrice === null) return 'Extra branches are not offered.';
  return `Extra branches are ${formatMoney(plan.extraBranchPrice, plan.currency)} a month.`;
}

function PlanSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-12" aria-hidden>
      <div className="h-[420px] rounded-[20px] bg-surface ring-1 ring-hairline ring-inset lg:col-span-5" />
      <div className="h-[420px] rounded-[20px] bg-surface-3 lg:col-span-7" />
    </div>
  );
}

function Compare({ plans, trialPlanKey }: { plans: Plan[]; trialPlanKey: string }) {
  const ref = useReveal<HTMLElement>();
  const seatsSold = plans.some((plan) => plan.extraSeatPrice !== null);

  return (
    <section ref={ref} className="rule-t py-16 sm:py-20 lg:py-24">
      <div className={RAIL}>
        <h2 data-reveal className={cx(DISPLAY_MD, 'max-w-[18ch] text-ink')}>
          Compare them line by line.
        </h2>
        <p data-reveal className={cx(LEAD, 'mt-3 max-w-[48ch]')}>
          The same limits and tools, so you can see the difference without inferring it.
        </p>

        <div data-reveal className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-[15px]">
            <caption className="sr-only">{plans.map((plan) => plan.name).join(', ')} compared</caption>
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 bg-bg py-3 pr-4">
                  <span className="sr-only">What is included</span>
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.key}
                    scope="col"
                    className={cx(
                      'px-4 py-3 font-display text-[22px] font-semibold tracking-[-0.02em]',
                      plan.key === trialPlanKey ? 'bg-surface text-flame-1' : 'text-ink',
                    )}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Group label="Capacity" span={plans.length + 1} />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Branches" hint="A hard cap, unless an extra branch is offered below." values={plans.map((plan) => limitLabel(plan.limits.branches))} />
              <Row
                plans={plans}
                trialPlanKey={trialPlanKey}
                label="Staff seats"
                hint={seatsSold ? 'A starting number. Extra seats are priced below.' : 'A hard cap. Extra seats are not sold.'}
                values={plans.map((plan) => limitLabel(plan.limits.staffSeats))}
              />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Orders a month" hint="An allowance. Passing it never stops service." values={plans.map((plan) => limitLabel(plan.limits.ordersPerMonth))} />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Extra branch" values={plans.map(extraBranchCell)} />
              {seatsSold && <Row plans={plans} trialPlanKey={trialPlanKey} label="Extra staff seat" values={plans.map(extraSeatCell)} />}

              <Group label="Tools" span={plans.length + 1} note="Full analytics adds revenue trends, comparisons, and branch performance." />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Analytics" values={plans.map((plan) => (plan.features.analyticsTier === 'full' ? 'Full' : 'Basic'))} />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Exports" values={plans.map((plan) => (plan.features.exports ? 'Included' : 'Not included'))} />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Automatic stock use" values={plans.map((plan) => (plan.features.autoStockConsumption ? 'Included' : 'Not included'))} />
              <Row plans={plans} trialPlanKey={trialPlanKey} label="Audit history" values={plans.map((plan) => auditLabel(plan.features.auditRetentionDays))} />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Group({ label, note, span }: { label: string; note?: string; span: number }) {
  return (
    <tr>
      <th colSpan={span} scope="colgroup" className="border-t border-hairline px-0 pb-2 pt-8 text-left">
        <span className="font-display text-[20px] font-semibold tracking-[-0.02em] text-ink">{label}</span>
        {note && <span className="mt-1 block max-w-[62ch] text-[14px] font-normal leading-relaxed text-ink-3">{note}</span>}
      </th>
    </tr>
  );
}

function Row({
  plans,
  trialPlanKey,
  label,
  hint,
  values,
}: {
  plans: Plan[];
  trialPlanKey: string;
  label: string;
  hint?: string;
  values: string[];
}) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 bg-bg py-3 pr-4 align-top font-semibold text-ink">
        {label}
        {hint && <span className="mt-0.5 block text-[13px] font-normal leading-snug text-ink-3">{hint}</span>}
      </th>
      {values.map((value, index) => (
        <td
          key={plans[index].key}
          className={cx(
            'px-4 py-3 align-top text-ink',
            /^(\d|Rs\.|Unlimited)/.test(value) ? 'font-mono text-[14px] font-bold tabular-nums' : 'text-[15px] font-semibold',
            plans[index].key === trialPlanKey && 'bg-surface',
          )}
        >
          {value}
        </td>
      ))}
    </tr>
  );
}

function extraBranchCell(plan: Plan): string {
  if (plan.limits.branches === undefined) return 'Not used';
  if (plan.extraBranchPrice === null) return 'Not offered';
  return `${formatMoney(plan.extraBranchPrice, plan.currency)} a month`;
}

function extraSeatCell(plan: Plan): string {
  if (plan.limits.staffSeats === undefined) return 'Not used';
  if (plan.extraSeatPrice === null) return 'Not offered';
  return `${formatMoney(plan.extraSeatPrice, plan.currency)} a month`;
}

function auditLabel(days: number | undefined): string {
  if (days === undefined) return 'Full history';
  if (days % 365 === 0) {
    const years = days / 365;
    return years === 1 ? '1 year' : `${years} years`;
  }
  return `${days} days`;
}

function Billing({ plans, trialDays, trialPlanKey }: { plans: Plan[]; trialDays: number; trialPlanKey: string }) {
  const ref = useReveal<HTMLElement>();
  const facts = billingFacts(plans, trialDays, trialPlanKey);

  return (
    <section ref={ref} className="rule-t py-16 sm:py-20 lg:py-24">
      <div className={RAIL}>
        <h2 data-reveal className={cx(DISPLAY_MD, 'text-ink')}>
          How billing works
        </h2>
        <div data-reveal-group="facts" className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {facts.map((fact) => (
            <div key={fact.title} data-reveal>
              <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{fact.title}</h3>
              <p className="mt-2 max-w-[48ch] text-[15.5px] leading-relaxed text-ink-2">{fact.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function addonSentence(plans: Plan[], field: 'extraBranchPrice' | 'extraSeatPrice', noun: string): string {
  const sellers = plans.filter((plan) => plan[field] !== null);
  if (sellers.length === 0) return `${noun[0].toUpperCase()}${noun.slice(1)} are not sold.`;
  const price = sellers[0][field];
  const same = sellers.every((plan) => plan[field] === price);
  if (same && price !== null) {
    const names = sellers.map((plan) => plan.name);
    const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
    const verb = names.length === 1 ? 'sells' : 'sell';
    return `${who} ${verb} ${noun} at ${formatMoney(price, sellers[0].currency)} a month.`;
  }
  return sellers.map((plan) => `${plan.name} sells ${noun} at ${formatMoney(plan[field]!, plan.currency)} a month.`).join(' ');
}

function billingFacts(plans: Plan[], trialDays: number, trialPlanKey: string): { title: string; body: string }[] {
  const trial = plans.find((plan) => plan.key === trialPlanKey);
  const branchSentence = addonSentence(plans, 'extraBranchPrice', 'extra branches');
  const seatSentence = addonSentence(plans, 'extraSeatPrice', 'extra seats');
  const currency = plans.every((plan) => plan.currency === plans[0]?.currency) ? plans[0]?.currency : null;

  return [
    {
      title: 'The trial',
      body: trial
        ? `New restaurants get ${trialDays} days of ${trial.name}. Pick a paid plan when it ends, or menu edits pause. Orders keep going either way.`
        : 'Pick a plan when you are ready to pay. Until then, orders keep going.',
    },
    {
      title: 'What actually stops',
      body: `Order limits never block service. Branch and staff limits do. ${branchSentence} ${seatSentence}`,
    },
    {
      title: 'Changing plan',
      body: 'A more expensive plan starts once you pay the price difference for the days left. A cheaper plan waits until the period ends.',
    },
    {
      title: 'How you pay',
      body: `Renew with eSewa in ${currency ?? 'the restaurant currency'} when the plan is due, and it continues once the payment is confirmed. The team can record another method once the money arrives.`,
    },
  ];
}

function Close({ plans, trialDays, trialPlanKey }: { plans: Plan[]; trialDays: number; trialPlanKey: string }) {
  const ref = useReveal<HTMLElement>();
  const trial = plans.find((plan) => plan.key === trialPlanKey);

  return (
    <section ref={ref} className="rule-t py-16 sm:py-20 lg:py-24">
      <div className={cx(RAIL, 'grid items-center gap-10 lg:grid-cols-12')}>
        <div className="lg:col-span-6">
          <h2 data-reveal className={cx(DISPLAY_MD, 'max-w-[16ch] text-ink')}>
            {trial ? `Start on ${trial.name} for ${trialDays} days.` : 'Open your restaurant.'}
          </h2>
          <p data-reveal className={cx(LEAD, 'mt-4 max-w-[42ch]')}>
            {trial ? `The trial includes ${trial.name}'s features. You choose what to pay for when it ends.` : 'You choose a plan when the account is open.'}
          </p>
          <div data-reveal className="mt-7">
            <PrimaryCta to={START}>Get started</PrimaryCta>
          </div>
        </div>
        <div data-reveal className="lg:col-span-5 lg:col-start-8">
          <img
            src="/img/chicken-sekuwa.jpg"
            alt="Chicken sekuwa on the FeastoX demo menu."
            width={800}
            height={1000}
            className="aspect-[4/5] w-full rounded-[20px] object-cover"
          />
        </div>
      </div>
    </section>
  );
}
