import { useEffect, useRef, useState } from 'react';
import { formatMoney } from '../../domain/money';
import { limitLabel, monthsFree, planPrice } from '../../domain/subscription';
import type { BillingInterval, Plan } from '../../domain/subscription';
import { Check, Lock, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Loading, PANEL, Segmented } from './kit';

interface Props {
  plans: { data: Plan[] | null; loading: boolean; reload: () => void };
  /** Key of the plan the restaurant is on now. */
  current: string;
  /** The interval the restaurant is billed on — where the toggle starts. */
  interval: BillingInterval;
  /** An owner can go on to change plan; a manager only reads. */
  onChangePlan?: () => void;
  onClose: () => void;
}

type Cell = { text: string; muted?: boolean; icon?: 'yes' | 'no' };

const LIMITS: { label: string; cell: (p: Plan) => Cell }[] = [
  { label: 'Branches', cell: (p) => ({ text: limitLabel(p.limits.branches) }) },
  { label: 'Staff seats', cell: (p) => ({ text: limitLabel(p.limits.staffSeats) }) },
  { label: 'Orders a month', cell: (p) => ({ text: limitLabel(p.limits.ordersPerMonth) }) },
];

const FEATURES: { label: string; cell: (p: Plan) => Cell }[] = [
  { label: 'Analytics', cell: (p) => (p.features.analyticsTier === 'full' ? { text: 'Full analytics', icon: 'yes' } : { text: 'Basic analytics', icon: 'no', muted: true }) },
  { label: 'Data exports', cell: (p) => (p.features.exports ? { text: 'Included', icon: 'yes' } : { text: 'Not included', icon: 'no', muted: true }) },
  { label: 'Audit history', cell: (p) => ({ text: p.features.auditRetentionDays ? `${p.features.auditRetentionDays} days` : 'Full history', icon: 'yes' }) },
];

const perMonth = (amount: number | null, currency: string): Cell | null =>
  amount === null ? null : amount === 0 ? { text: '—', muted: true } : { text: `${formatMoney(amount, currency)} / month` };

const ADDONS: { label: string; cell: (p: Plan) => Cell | null }[] = [
  { label: 'Extra branch', cell: (p) => perMonth(p.extraBranchPrice, p.currency) },
  { label: 'Extra staff seat', cell: (p) => perMonth(p.extraSeatPrice, p.currency) },
];

/**
 * Every plan side by side in a modal, opened on demand from the Plan page. A native
 * `<dialog>` gives the focus trap, Escape and the inert page behind for free.
 */
export function PlanCompareModal({ plans, current, interval: billed, onChangePlan, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [interval, setPicked] = useState<BillingInterval>(billed);
  const list = plans.data;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const showMoney = !!list?.some((p) => p.monthlyPrice !== null);
  const addons = ADDONS.filter((row) => list?.some((p) => row.cell(p) !== null));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="compare-plans-title"
      className={cx(
        PANEL,
        'm-auto flex max-h-[calc(100dvh-1.5rem)] w-[min(66rem,calc(100vw-1.5rem))] flex-col overflow-hidden p-0 shadow-2xl shadow-black/40',
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline px-5 py-5 sm:px-7">
        <div className="min-w-0">
          <h2 id="compare-plans-title" className={cx(DISPLAY, 'text-[28px] sm:text-[34px]')}>
            Compare plans
          </h2>
          <p className="mt-1 max-w-[52ch] text-[13.5px] leading-relaxed text-ink-3">Everything each plan includes, side by side. Your current plan is marked.</p>
        </div>
        <div className="flex items-center gap-3">
          {showMoney && (
            <Segmented
              label="Billing interval"
              value={interval}
              onChange={setPicked}
              options={[
                { value: 'MONTHLY', label: 'Monthly' },
                { value: 'ANNUAL', label: 'Yearly' },
              ]}
            />
          )}
          <button type="button" onClick={() => ref.current?.close()} aria-label="Close" className="grid size-9 place-items-center rounded-full text-ink-3 ring-1 ring-hairline ring-inset hover:text-ink">
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {plans.loading && !list ? (
          <Loading label="Loading the plans…" />
        ) : !list ? (
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
          <table className="w-full min-w-170 border-collapse text-left">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 w-36 bg-docket-surface sm:w-44">
                  <span className="sr-only">Feature</span>
                </th>
                {list.map((plan) => (
                  <PlanHead key={plan.key} plan={plan} interval={interval} isCurrent={plan.key === current} showMoney={showMoney} />
                ))}
              </tr>
            </thead>
            <tbody>
              <Group label="Limits" span={list.length + 1} />
              {LIMITS.map((row) => (
                <Row key={row.label} label={row.label} cells={list.map((p) => ({ plan: p, cell: row.cell(p) }))} current={current} big />
              ))}
              <Group label="Features" span={list.length + 1} />
              {FEATURES.map((row) => (
                <Row key={row.label} label={row.label} cells={list.map((p) => ({ plan: p, cell: row.cell(p) }))} current={current} />
              ))}
              {addons.length > 0 && <Group label="Add-ons" span={list.length + 1} />}
              {addons.map((row) => (
                <Row key={row.label} label={row.label} cells={list.map((p) => ({ plan: p, cell: row.cell(p) }))} current={current} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {onChangePlan && list && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-4 sm:px-7">
          <p className="text-[13px] text-ink-3">Moving up starts now. Moving down waits for the end of the paid period.</p>
          <button type="button" className={ADMIN_PRIMARY} onClick={onChangePlan}>
            Change plan
          </button>
        </footer>
      )}
    </dialog>
  );
}

const CURRENT_COL = 'bg-surface-2/55';

function PlanHead({ plan, interval, isCurrent, showMoney }: { plan: Plan; interval: BillingInterval; isCurrent: boolean; showMoney: boolean }) {
  const price = planPrice(plan, interval);
  const free = monthsFree(plan);
  return (
    <th
      scope="col"
      className={cx('px-4 pb-5 pt-6 align-top font-normal sm:px-5', isCurrent && `${CURRENT_COL} shadow-[inset_0_3px_0_var(--color-flame-2)]`)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={cx(DISPLAY, 'text-[22px] leading-none')}>{plan.name}</span>
        {isCurrent && <span className="rounded-full bg-flame-2/18 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-flame-3">Your plan</span>}
      </div>
      {showMoney && price !== null && (
        <>
          <div className="mt-3 text-[28px] font-semibold leading-none tracking-tight tnum">{formatMoney(price, plan.currency)}</div>
          <div className="mt-1.5 text-[12.5px] text-ink-3">
            {interval === 'ANNUAL' ? 'per year' : 'per month'}
            {interval === 'ANNUAL' && free > 0 && <span className="font-semibold text-mint-ink"> · {free} months free</span>}
          </div>
        </>
      )}
    </th>
  );
}

function Group({ label, span }: { label: string; span: number }) {
  return (
    <tr>
      <th scope="colgroup" colSpan={span} className="sticky left-0 border-t border-hairline px-4 pb-1.5 pt-5 text-left text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4 sm:px-5">
        {label}
      </th>
    </tr>
  );
}

function Row({ label, cells, current, big = false }: { label: string; cells: { plan: Plan; cell: Cell | null }[]; current: string; big?: boolean }) {
  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 bg-docket-surface px-4 py-2.5 text-left text-[13px] font-medium text-ink-3 sm:px-5">
        {label}
      </th>
      {cells.map(({ plan, cell }) => (
        <td key={plan.key} className={cx('px-4 py-2.5 sm:px-5', plan.key === current && CURRENT_COL)}>
          {cell && (
            <span className={cx('inline-flex items-center gap-2 tnum', big ? 'text-[16px] font-semibold' : 'text-[13.5px]', cell.muted && 'text-ink-4')}>
              {cell.icon && (cell.icon === 'yes' ? <Check size={15} className="text-mint-ink" /> : <Lock size={14} />)}
              {cell.text}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}
