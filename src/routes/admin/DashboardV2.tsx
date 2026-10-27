import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
// Store orders only: the 90-day history `allOrders` adds never falls inside today, and today is all this page reads.
import { listQueue as storeOrders } from '../../api/admin';
import {
  BRANCHES_ENABLED,
  completeOrderPayment,
  fetchBranchPerformance,
  fetchOrderComparison,
  fetchRevenueComparison,
  fetchRevenueTrend,
  fetchTopSellingDishes,
  isFeatureLocked,
} from '../../api/staff';
import { funnel } from '../../domain/analytics';
import { byUrgencyThenAge, floorBillSubject, focusMap } from '../../domain/orderStatus';
import type { TrendPeriod } from '../../domain/adminMetrics';
import { feedbackSummary, periodReport } from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import type { Order, OrderStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useRefreshOnOrderChange } from '../../state/useRefreshOnOrderChange';
import { useNow } from '../../state/useNow';
import { Change, Loading, useCommand } from '../../components/admin/kit';
import { useCountUp } from '../../components/admin/profile';
import { LowStockPanel } from '../../components/admin/LowStockPanel';
import { useOrderSheet } from '../../components/admin/OrderSheet';
import { PassCardV2 } from '../../components/admin/PassCardV2';
import { RevenueTrendChart } from '../../components/admin/RevenueTrendChart';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/** How many of the oldest working tickets the hero grid shows before pointing to the full pass. */
const PASS_GRID_SIZE = 9;

/** How often the ages on screen re-read the clock. */
const TICK_MS = 15_000;

type Lane = 'all' | 'focus' | 'new' | 'kitchen' | 'ready';

/** `statuses: null` means the lane is not about status — see `inLane` below. */
const LANES: { value: Lane; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'focus', label: 'Needs you', statuses: null },
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  // Covers a delivery ticket already dispatched too, or it would fall out of every lane once it leaves READY.
  { value: 'ready', label: 'Ready', statuses: ['READY', 'OUT_FOR_DELIVERY', 'SETTLE'] },
];

/*
 * Dashboard, take two — same data and moves as `Dashboard`, laid out as a calm page of
 * sections: today's three figures, the pass, then the quieter reading (stock, branches,
 * sales, feedback). Boxes give way to space and hairlines; the pass leads.
 */

export function DashboardV2() {
  const staff = useStaff();
  const { menu, orders: queue, reloadOrders, applyOrder } = useDashboard();
  const history = useAsync(() => storeOrders(staff), [staff]);
  // Today's numbers are the branch being worked in, so the tiles agree with the pass beneath them.
  const revenue = useAsync(() => fetchRevenueComparison(staff, 'today', staff.branchId), [staff]);
  const orderComparison = useAsync(() => fetchOrderComparison(staff, 'today', staff.branchId), [staff]);
  // Below the fold: these wait (still showing their loading state) until scrolled near.
  const [lowerNear, lowerRef] = useNearViewport();
  const [branchesNear, branchesRef] = useNearViewport();
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('week');
  const trend = useAsync(() => (lowerNear ? fetchRevenueTrend(staff, trendPeriod, staff.branchId) : notYet()), [staff, trendPeriod, lowerNear]);
  // Pinned to page load, so a late fetch asks for exactly what an immediate one would have.
  const [loadedAt] = useState(() => new Date().toISOString());
  const topDishes = useAsync(
    () => (lowerNear ? fetchTopSellingDishes(staff, loadedAt, undefined, staff.branchId) : notYet()),
    [staff, loadedAt, lowerNear],
  );
  // The comparison across locations only means something with more than one to compare.
  const compareBranches = BRANCHES_ENABLED && (staff.branches?.length ?? 0) > 1;
  const branchPerformance = useAsync(
    () => (!compareBranches ? Promise.resolve([]) : branchesNear ? fetchBranchPerformance() : notYet()),
    [staff, compareBranches, branchesNear],
  );
  // A plan without analytics answers these with FEATURE_LOCKED. That is the plan talking, not something broken.
  // Today's figures come from the server, so they are re-read as orders move — otherwise a screen left open all shift goes stale.
  useRefreshOnOrderChange(queue, () => {
    revenue.reload();
    orderComparison.reload();
    topDishes.reload();
  });
  const analyticsLocked = isFeatureLocked(revenue.error) || isFeatureLocked(orderComparison.error);
  const trendLocked = isFeatureLocked(trend.error);
  const branchesLocked = isFeatureLocked(branchPerformance.error);
  const now = useNow(TICK_MS);
  const [lane, setLane] = useState<Lane>('all');
  const { pending, run } = useCommand();
  const [payingId, setPayingId] = useState<string | null>(null);

  const orders = history.data;
  const today = useMemo(() => (orders ? periodReport(orders, 'today') : null), [orders]);
  const bestSellers = useMemo(() => (topDishes.data ?? []).slice(0, 5), [topDishes.data]);

  const feedback = useMemo(() => feedbackSummary(menu.dishes), [menu.dishes]);
  const { dishDecisionRate } = funnel();

  const working = useMemo(
    () => queue.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'),
    [queue],
  );
  const waiting = working.filter((o) => o.status === 'PENDING');
  const payingOrder = working.find((o) => o.id === payingId) ?? null;
  const menuDishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);

  /** The same clocks the full pass runs on — one sweep per tick, read by every lane and card. */
  const flags = useMemo(() => focusMap(working, now), [working, now]);
  const orderSheet = useOrderSheet({ orders: queue, flags, now, onApply: applyOrder, onResync: reloadOrders, onTakePayment: (o) => setPayingId(o.id) });

  const inLane = useMemo(
    () => (value: Lane, order: Order) => {
      if (value === 'focus') return flags.has(order.id);
      const definition = LANES.find((l) => l.value === value)!;
      return definition.statuses ? definition.statuses.includes(order.status) : true;
    },
    [flags],
  );

  const laneCounts = useMemo(() => {
    const counts = {} as Record<Lane, number>;
    for (const l of LANES) counts[l.value] = working.filter((o) => inLane(l.value, o)).length;
    return counts;
  }, [working, inLane]);

  const filtered = useMemo(
    () => working.filter((o) => inLane(lane, o)).sort(byUrgencyThenAge(flags)),
    [working, inLane, lane, flags],
  );

  const shown = filtered.slice(0, PASS_GRID_SIZE);
  const hiddenCount = filtered.length - shown.length;
  const overdue = laneCounts.focus;

  const money = (v: number) => formatMoney(v, menu.restaurant.currency);
  const maxSold = Math.max(1, ...bestSellers.map((d) => d.orderCount));
  const maxBranch = Math.max(1, ...(branchPerformance.data ?? []).map((b) => b.grossRevenue));

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-10 flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'wrap-break-word text-[clamp(34px,6.4vw,60px)] leading-[0.98] tracking-[-0.03em]')}>{greeting(staff.name)}</h1>
          <p className={cx('mt-3 text-[14.5px]', overdue > 0 ? 'font-semibold text-berry-ink' : 'text-ink-3')}>
            {overdue > 0
              ? `${overdue} ticket${overdue === 1 ? '' : 's'} past due on the pass.`
              : waiting.length > 0
                ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting to be accepted.`
                : 'Nothing is waiting to be accepted right now.'}
          </p>
        </div>
        <Link
          to="/admin/orders"
          className={cx(
            'inline-flex h-12 items-center gap-2.5 rounded-full px-6 text-[15px] font-semibold transition-[scale,background-color] duration-200 active:scale-95',
            waiting.length > 0 ? 'bg-flame text-white shadow-flame' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:text-ink',
          )}
        >
          Open the pass
          {waiting.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/25 px-1.5 text-[11.5px] font-bold tnum">{waiting.length}</span>}
        </Link>
      </header>

      {/* ── The pass ── */}
      <section className="mb-14 animate-rise [animation-delay:60ms]">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5 shrink-0" aria-hidden>
              <span className={cx('absolute inline-flex size-full animate-breathe rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
              <span className={cx('relative inline-flex size-2.5 rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
            </span>
            <div>
              <h2 className={cx(DISPLAY, 'text-[26px]')}>On the pass</h2>
              <p className={cx('mt-0.5 text-[13px]', overdue > 0 ? 'font-semibold text-berry-ink' : 'text-ink-3')}>
                {overdue > 0 ? `${overdue} past due · overdue tickets first` : 'Live tickets, oldest first'}
              </p>
            </div>
          </div>
          <Link to="/admin/orders" className="text-[13.5px] font-semibold text-flame-1 transition-opacity hover:opacity-80">
            All orders →
          </Link>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Lane">
          {LANES.map((l) => (
            <button key={l.value} type="button" aria-pressed={lane === l.value} className={cx(CHIP, lane === l.value ? CHIP_ON : CHIP_OFF)} onClick={() => setLane(l.value)}>
              {l.label}
              {laneCounts[l.value] > 0 && <span className="tnum"> · {laneCounts[l.value]}</span>}
            </button>
          ))}
        </div>

        {working.length === 0 ? (
          <div className="rounded-3xl bg-surface px-6 py-14 text-center ring-1 ring-hairline ring-inset">
            <h3 className={cx(DISPLAY, 'text-[24px]')}>The kitchen is clear</h3>
            <p className="mx-auto mt-3 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-3">A new ticket will appear here the moment a table orders.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-14 text-center text-[14px] text-ink-3">Nothing in this lane right now.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((order, i) => (
              <PassCardV2
                key={order.id}
                order={order}
                index={i}
                focus={flags.get(order.id) ?? null}
                now={now}
                onApply={applyOrder}
                onResync={reloadOrders}
                onTakePayment={(o) => setPayingId(o.id)}
                onOpenDetail={orderSheet.open}
              />
            ))}
            {hiddenCount > 0 && (
              <Link
                to="/admin/orders"
                className="grid min-h-32 place-items-center gap-1 rounded-3xl border border-dashed border-hairline-strong px-4 py-6 text-center transition-[background-color,scale] duration-200 hover:bg-surface-2 active:scale-[0.98]"
              >
                <span className="text-[22px] font-bold tnum text-flame-1">+{hiddenCount}</span>
                <span className="text-[13px] font-semibold text-ink-3">more on the pass</span>
              </Link>
            )}
          </div>
        )}
      </section>

      {/* ── Today: three figures, nothing around them ── */}
      <section
        aria-label="Today"
        className="mb-14 grid animate-rise divide-y divide-hairline border-y border-hairline [animation-delay:120ms] sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <Figure
          label="Orders today"
          target={orderComparison.data ? orderComparison.data.current : null}
          format={(n) => String(n)}
          change={analyticsLocked ? undefined : orderComparison.data ? orderComparison.data.differencePercentage / 100 : null}
          note={analyticsLocked ? 'Not in your plan' : 'vs yesterday'}
        />
        <Figure
          label="Revenue today"
          target={revenue.data ? revenue.data.current : null}
          format={money}
          change={analyticsLocked ? undefined : revenue.data ? revenue.data.differencePercentage / 100 : null}
          note={analyticsLocked ? 'Not in your plan' : 'vs yesterday'}
        />
        <Figure
          label="Average order"
          target={today ? today.current.averageOrder : null}
          format={money}
          note={today ? `${today.current.covers} dishes served` : undefined}
        />
      </section>

      <LowStockPanel plain />

      {compareBranches && (
        <div ref={branchesRef}>
          <Block title="Branches" aside="Last 30 days, by revenue">
            {branchPerformance.loading && !branchPerformance.data ? (
              <Loading label="Comparing branches…" />
            ) : branchesLocked ? (
              <p className="text-[14px] text-ink-3">
                Comparing branches is not in your current plan.{' '}
                <Link to="/admin/plan" className="font-semibold text-flame-1">
                  See what it includes
                </Link>
              </p>
            ) : (branchPerformance.data ?? []).length === 0 ? (
              <p className="text-[14px] text-ink-3">No orders at any branch yet.</p>
            ) : (
              <ul className="grid gap-1">
                {(branchPerformance.data ?? []).map((branch) => (
                  <Bar key={branch.branchId} share={branch.grossRevenue / maxBranch}>
                    <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                      {branch.branchName}
                      {branch.branchId === staff.branchId && <span className="ml-1.5 font-normal text-ink-4">(here)</span>}
                    </span>
                    <span className="shrink-0 text-[13px] tnum text-ink-3">{branch.completed} orders</span>
                    <span className="w-28 shrink-0 text-right text-[14.5px] font-bold tnum">{money(branch.grossRevenue)}</span>
                  </Bar>
                ))}
              </ul>
            )}
          </Block>
        </div>
      )}

      <div ref={lowerRef} className="grid gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Block title="Selling today" aside="By dishes served">
          {topDishes.loading && !topDishes.data ? (
            <Loading label="Counting today…" />
          ) : bestSellers.length === 0 ? (
            <p className="text-[14px] text-ink-3">Nothing has sold yet today.</p>
          ) : (
            <ul className="grid gap-1">
              {bestSellers.map((dish) => (
                <Bar key={dish.dishId} share={dish.orderCount / maxSold}>
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{dish.dishName}</span>
                  <span className="shrink-0 text-[13px] tnum text-ink-3">{money(dish.totalAmount)}</span>
                  <span className="w-10 shrink-0 text-right text-[14.5px] font-bold tnum">×{dish.orderCount}</span>
                </Bar>
              ))}
            </ul>
          )}
        </Block>

        <div className="mb-14 animate-rise border-t border-hairline pt-8">
          <RevenueTrendChart
            trend={trend.data}
            period={trendPeriod}
            onPeriodChange={setTrendPeriod}
            loading={trend.loading}
            failed={trend.error !== null && !trendLocked}
            locked={trendLocked}
            onRetry={trend.reload}
            currency={menu.restaurant.currency}
            plain
          />
        </div>
      </div>

      <Block title="Feedback" aside="From verified diners">
        <div className="grid grid-cols-2 gap-y-6 lg:grid-cols-4 lg:divide-x lg:divide-hairline">
          <Quiet
            label="Restaurant rating"
            value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
            sub={`${feedback.reviewCount.toLocaleString()} verified reviews`}
          />
          <Quiet label="Would order again" value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'} sub="across rated dishes" />
          <Quiet label="Dishes without ratings" value={String(feedback.unratedDishes)} sub={`of ${feedback.ratedDishes + feedback.unratedDishes} on the menu`} />
          <Quiet label="Dish decision rate" value={dishDecisionRate !== null ? `${Math.round(dishDecisionRate * 100)}%` : '—'} sub="dish page → added to cart" />
        </div>
      </Block>

      {orderSheet.sheet}

      <PaymentSheet
        table={payingOrder ? floorBillSubject(payingOrder) : null}
        orders={payingOrder ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        legalName={menu.restaurant.legalName}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder) return Promise.resolve(false);
          const order = payingOrder;
          return run(
            order.id,
            () => completeOrderPayment(staff, order, changes.items, changes.method, changes.discount, changes.redeemPoints, changes.customerId, changes.credit, changes.paidNow, changes.dueInDays),
            `${order.reference} paid up`,
          ).then((ok) => {
            if (ok) reloadOrders();
            return ok;
          });
        }}
        onEndSession={() => setPayingId(null)}
        onShowQr={() => setPayingId(null)}
      />
    </div>
  );
}

/** A headline number that rolls to its value; nothing around it. */
function Figure({
  label,
  target,
  format,
  change,
  note,
}: {
  label: string;
  target: number | null;
  format: (n: number) => string;
  change?: number | null;
  note?: string;
}) {
  const n = useCountUp(target ?? 0, 900);
  return (
    <div className="px-0 py-6 sm:px-8 sm:first:pl-0 sm:last:pr-0">
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className={cx(DISPLAY, 'mt-2 text-[clamp(32px,4.6vw,46px)] leading-none tracking-tight tnum')}>{target === null ? '—' : format(n)}</p>
      <p className="mt-3 flex items-center gap-2 text-[13px]">
        {change !== undefined && <Change value={change} />}
        {note && <span className="truncate text-ink-3">{note}</span>}
      </p>
    </div>
  );
}

/** A titled section: a hairline above, space around, no box. */
function Block({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section className="mb-14 animate-rise">
      <div className="mb-5 flex items-baseline justify-between gap-3 border-t border-hairline pt-8">
        <h2 className={cx(DISPLAY, 'text-[24px]')}>{title}</h2>
        {aside && <span className="text-[13px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** A list row with a soft bar behind it showing its share of the largest. */
function Bar({ share, children }: { share: number; children: ReactNode }) {
  return (
    <li className="relative flex items-center gap-3 rounded-xl px-3 py-2.5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 origin-left animate-grow-x rounded-xl bg-flame-2/12"
        style={{ width: `${Math.max(4, Math.min(1, share) * 100)}%` }}
      />
      {children}
    </li>
  );
}

function Quiet({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="lg:px-6 lg:first:pl-0">
      <p className="text-[13px] font-medium text-ink-3">{label}</p>
      <p className={cx(DISPLAY, 'mt-1.5 text-[28px] leading-none tnum')}>{value}</p>
      <p className="mt-2 text-[12.5px] text-ink-4">{sub}</p>
    </div>
  );
}

/** Never settles, so `useAsync` stays in its loading state until the real request replaces it. */
const notYet = (): Promise<never> => new Promise<never>(() => {});

/** Latches true once the element comes within 400px of the viewport (or at once where IntersectionObserver is missing). */
function useNearViewport() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (near || !el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [el, near]);
  return [near, setEl] as const;
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(' ')[0];
  if (hour < 11) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
