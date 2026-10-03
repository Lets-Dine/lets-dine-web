import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allOrders } from '../../api/admin';
import {
  BRANCHES_ENABLED,
  completeOrderPayment,
  fetchBranchPerformance,
  fetchOrderComparison,
  fetchRevenueComparison,
  fetchTopSellingDishes,
} from '../../api/staff';
import { funnel } from '../../domain/analytics';
import { byUrgencyThenAge, floorBillSubject, focusMap, newestOrderPerTable } from '../../domain/orderStatus';
import { feedbackSummary, periodReport } from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import type { Order, OrderStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useNow } from '../../state/useNow';
import { Empty, Loading, PageTitle, Panel, Row, Segmented, StatTile, useCommand } from '../../components/admin/kit';
import { PassCard } from '../../components/admin/PassCard';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { DISPLAY, cx } from '../../components/ui';
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
  { value: 'ready', label: 'Ready', statuses: ['READY', 'OUT_FOR_DELIVERY'] },
];

/**
 * §26. The opening screen answers three questions in the order a restaurant
 * asks them: is anything waiting on me, how is today going, and is anything
 * about the menu quietly broken. Nothing here is a number for its own sake —
 * every tile is either an action or a comparison.
 *
 * The pass is the one question that never waits, so it leads: a full-width
 * hero, not a panel sharing a row with sales figures, with the same
 * accept/advance/cancel moves the full queue has — nobody should have to
 * leave the dashboard to touch a ticket.
 */
export function Dashboard() {
  const staff = useStaff();
  const { menu, orders: queue, reloadOrders, applyOrder } = useDashboard();
  const history = useAsync(() => allOrders(staff), [staff]);
  // Today's numbers are the branch being worked in, so the tiles agree with the pass beneath them.
  const revenue = useAsync(() => fetchRevenueComparison(staff, 'today', staff.branchId), [staff]);
  const orderComparison = useAsync(() => fetchOrderComparison(staff, 'today', staff.branchId), [staff]);
  const topDishes = useAsync(() => fetchTopSellingDishes(staff, new Date().toISOString(), undefined, staff.branchId), [staff]);
  // The comparison across locations only means something with more than one to compare.
  const compareBranches = BRANCHES_ENABLED && (staff.branches?.length ?? 0) > 1;
  const branchPerformance = useAsync(() => (compareBranches ? fetchBranchPerformance() : Promise.resolve([])), [staff, compareBranches]);
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
  const newestPerTable = useMemo(() => newestOrderPerTable(queue), [queue]);

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

  const unavailable = menu.dishes.filter((d) => !d.isArchived && !d.isAvailable);
  const weakest = menu.dishes
    .filter((d) => !d.isArchived && d.stats.ratingCount >= 20 && (d.stats.avgRating ?? 5) < 4.2)
    .sort((a, b) => (a.stats.avgRating ?? 5) - (b.stats.avgRating ?? 5))
    .slice(0, 3);

  return (
    <>
      <PageTitle
        title={greeting(staff.name)}
        subtitle={
          overdue > 0
            ? `${overdue} ticket${overdue === 1 ? '' : 's'} past due on the pass.`
            : waiting.length > 0
              ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting to be accepted.`
              : 'Nothing is waiting to be accepted right now.'
        }
        action={
          <Link
            to="/admin/orders"
            className={cx(
              'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-move active:scale-95 text-white',
              waiting.length > 0 ? 'bg-flame shadow-flame' : 'bg-surface-2 text-ink/50 ring-1 ring-hairline ring-inset',
            )}
          >
            Open the pass
            {waiting.length > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bg/30 px-1.5 text-[11px] font-bold tnum">
                {waiting.length}
              </span>
            )}
          </Link>
        }
      />

      {/* ── The pass: full-width, decorated, the first thing a shift sees ── */}
      <section className="relative mb-5 overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline ring-inset">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-flame-3/18 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-flame-2/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5 shrink-0" aria-hidden>
              <span className={cx('absolute inline-flex size-full animate-breathe rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
              <span className={cx('relative inline-flex size-2.5 rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
            </span>
            <div>
              <h2 className={cx(DISPLAY, 'text-[19px] sm:text-[22px]')}>On the pass</h2>
              <p className={cx('mt-0.5 text-[12.5px]', overdue > 0 ? 'font-semibold text-berry-ink' : 'text-ink-3')}>
                {overdue > 0 ? `${overdue} past due · overdue tickets first` : 'Live tickets, oldest first'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="overflow-x-auto no-scrollbar">
              <Segmented
                label="Lane"
                value={lane}
                onChange={setLane}
                options={LANES.map((l) => ({
                  value: l.value,
                  label: `${l.label}${laneCounts[l.value] ? ` (${laneCounts[l.value]})` : ''}`,
                }))}
              />
            </div>
            <Link to="/admin/orders" className="hidden shrink-0 text-[13px] font-semibold text-flame-1 sm:inline">
              All orders
            </Link>
          </div>
        </div>

        <div className="relative p-4 sm:p-5">
          {working.length === 0 ? (
            <Empty
              image="/empty.svg"
              title="The kitchen is clear"
              message="A new ticket will appear here the moment a table orders."
            />
          ) : filtered.length === 0 ? (
            <p className="px-4 py-14 text-center text-[13.5px] text-ink-3">Nothing in this lane right now.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((order, i) => (
                <PassCard
                  key={order.id}
                  order={order}
                  index={i}
                  focus={flags.get(order.id) ?? null}
                  menu={menu}
                  canAdd={order.tableId !== null && newestPerTable.get(order.tableId) === order.id}
                  now={now}
                  onApply={applyOrder}
                  onResync={reloadOrders}
                  onTakePayment={(o) => setPayingId(o.id)}
                />
              ))}
              {hiddenCount > 0 && (
                <Link
                  to="/admin/orders"
                  className="grid place-items-center gap-1 rounded-2xl border border-dashed border-hairline-strong px-4 py-6 text-center transition-move hover:bg-surface-2 active:scale-[0.98]"
                >
                  <span className="text-[16px] font-bold tnum text-flame-1">+{hiddenCount}</span>
                  <span className="text-[12.5px] font-semibold text-ink-3">more on the pass</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile
          label="Orders today"
          value={orderComparison.data ? String(orderComparison.data.current) : '—'}
          change={orderComparison.data ? orderComparison.data.differencePercentage / 100 : null}
          sub="vs yesterday"
          variant="primary"
        />
        <StatTile
          label="Revenue today"
          value={revenue.data ? formatMoney(revenue.data.current, menu.restaurant.currency) : '—'}
          change={revenue.data ? revenue.data.differencePercentage / 100 : null}
          sub="vs yesterday"
          variant="primary"
        />
        <StatTile
          label="Average order"
          value={today ? formatMoney(today.current.averageOrder, menu.restaurant.currency) : '—'}
          sub={today ? `${today.current.covers} dishes served` : undefined}
          variant="primary"
        />
      </div>

      {compareBranches && (
        <Panel title="Branches" hint="Last 30 days, by revenue" bare className="mb-4">
          {branchPerformance.loading && !branchPerformance.data ? (
            <Loading label="Comparing branches…" />
          ) : (branchPerformance.data ?? []).length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">No orders at any branch yet.</p>
          ) : (
            (branchPerformance.data ?? []).map((branch) => (
              <Row key={branch.branchId}>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
                  {branch.branchName}
                  {branch.branchId === staff.branchId && <span className="ml-1.5 font-normal text-ink-4">(here)</span>}
                </span>
                <span className="shrink-0 text-[13px] tnum text-ink-4">{branch.completed} orders</span>
                <span className="w-28 shrink-0 text-right text-[14px] font-bold tnum text-flame-1">
                  {formatMoney(branch.grossRevenue, menu.restaurant.currency)}
                </span>
              </Row>
            ))
          )}
        </Panel>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Selling today" hint="By dishes served" bare>
          {topDishes.loading ? (
            <Loading label="Counting today…" />
          ) : bestSellers.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Nothing has sold yet today.</p>
          ) : (
            bestSellers.map((dish) => (
              <Row key={dish.dishId}>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{dish.dishName}</span>
                <span className="shrink-0 text-[13.5px] tnum text-ink-3">
                  {formatMoney(dish.totalAmount, menu.restaurant.currency)}
                </span>
                <span className="w-12 shrink-0 text-right text-[14px] font-bold tnum text-flame-1">×{dish.orderCount}</span>
              </Row>
            ))
          )}
        </Panel>

        <Panel title="Worth a look" bare>
          {unavailable.length === 0 && weakest.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">
              Everything is on the menu and rating well.
            </p>
          ) : (
            <>
              {unavailable.length > 0 && (
                <Row>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">
                      {unavailable.length} dish{unavailable.length === 1 ? '' : 'es'} marked unavailable
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-4">
                      {unavailable.map((d) => d.name).join(', ')}
                    </span>
                  </span>
                  <Link to="/admin/menu" className="shrink-0 text-[13px] font-semibold text-flame-1">
                    Menu
                  </Link>
                </Row>
              )}
              {weakest.map((dish) => (
                <Row key={dish.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{dish.name}</span>
                    <span className="block text-[12.5px] text-ink-4">
                      {dish.stats.avgRating?.toFixed(1)} ★ from {dish.stats.ratingCount} diners
                    </span>
                  </span>
                  <Link to="/admin/reviews" className="shrink-0 text-[13px] font-semibold text-flame-1">
                    Reviews
                  </Link>
                </Row>
              ))}
            </>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Restaurant rating"
          value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
          sub={`${feedback.reviewCount.toLocaleString()} verified reviews`}
          variant="subtle"
        />
        <StatTile
          label="Would order again"
          value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
          sub="across rated dishes"
          variant="subtle"
        />
        <StatTile
          label="Dishes without ratings"
          value={String(feedback.unratedDishes)}
          sub={`of ${feedback.ratedDishes + feedback.unratedDishes} on the menu`}
          variant="subtle"
        />
        <StatTile
          label="Dish decision rate"
          value={dishDecisionRate !== null ? `${Math.round(dishDecisionRate * 100)}%` : '—'}
          sub="dish page → added to cart"
          variant="subtle"
        />
      </div>

      <PaymentSheet
        table={payingOrder ? floorBillSubject(payingOrder) : null}
        orders={payingOrder ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder) return Promise.resolve(false);
          const order = payingOrder;
          return run(
            order.id,
            () => completeOrderPayment(staff, order, changes.items, changes.method, changes.discount),
            `${order.reference} paid up`,
          ).then((ok) => {
            if (ok) reloadOrders();
            return ok;
          });
        }}
        onEndSession={() => setPayingId(null)}
        onShowQr={() => setPayingId(null)}
      />
    </>
  );
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(' ')[0];
  if (hour < 11) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
