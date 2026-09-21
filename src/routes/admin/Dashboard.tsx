import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADVANCE_LABEL, STATUS_LABEL, allOrders, canCancel, nextStatus } from '../../api/admin';
import { advanceOrder, rejectOrder } from '../../api/staff';
import { funnel } from '../../domain/analytics';
import {
  dishPerformance,
  feedbackSummary,
  periodReport,
  windowFor,
} from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import type { Order, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../../components/time';
import {
  ADMIN_TINY,
  Confirm,
  Loading,
  PageTitle,
  Panel,
  Row,
  Segmented,
  StatTile,
  StatusPill,
  useCommand,
} from '../../components/admin/kit';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/** A new ticket nobody has touched for this long is a problem worth showing, right here. */
const STALE_MINUTES = 5;

/** How many of the oldest working tickets the hero grid shows before pointing to the full pass. */
const PASS_GRID_SIZE = 9;

type Lane = 'all' | 'new' | 'kitchen' | 'ready';

const LANES: { value: Lane; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  { value: 'ready', label: 'Ready', statuses: ['READY'] },
];

/**
 * The status color language, borrowed for each ticket card's border. Tailwind only generates CSS
 * for class names it can find as literal text in source — `border-${ACCENT[status]}` would build a
 * string it can never see, so these are whole class names, not fragments assembled at runtime.
 */
const ACCENT_BORDER: Record<OrderStatus, string> = {
  PENDING: 'border-flame-3',
  ACCEPTED: 'border-gold',
  PREPARING: 'border-[#7e9bff]',
  READY: 'border-mint',
  COMPLETED: 'border-ink-4',
  CANCELLED: 'border-berry',
};

const ACCENT_BUTTON: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-3',
  ACCEPTED: 'bg-gold',
  PREPARING: 'bg-[#7e9bff]',
  READY: 'bg-mint',
  COMPLETED: 'bg-ink-4',
  CANCELLED: 'bg-berry',
};

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
  const { menu, orders: queue, reloadOrders } = useDashboard();
  const history = useAsync(() => allOrders(staff), [staff]);
  const [lane, setLane] = useState<Lane>('all');

  const orders = history.data;
  const today = useMemo(() => (orders ? periodReport(orders, 'today') : null), [orders]);
  const bestSellers = useMemo(() => {
    if (!orders) return [];
    const w = windowFor('today');
    return dishPerformance(orders, menu.dishes, w.from, w.to)
      .filter((d) => d.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [orders, menu.dishes]);

  const feedback = useMemo(() => feedbackSummary(menu.dishes), [menu.dishes]);
  const { dishDecisionRate } = funnel();

  const working = queue.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED');
  const waiting = working.filter((o) => o.status === 'PENDING');

  const laneCounts = useMemo(() => {
    const counts = {} as Record<Lane, number>;
    for (const l of LANES) counts[l.value] = l.statuses ? working.filter((o) => l.statuses!.includes(o.status)).length : working.length;
    return counts;
  }, [working]);

  const filtered = useMemo(() => {
    const active = LANES.find((l) => l.value === lane) ?? LANES[0];
    const list = active.statuses ? working.filter((o) => active.statuses!.includes(o.status)) : working;
    return [...list].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [working, lane]);

  const shown = filtered.slice(0, PASS_GRID_SIZE);
  const hiddenCount = filtered.length - shown.length;

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
          waiting.length > 0
            ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting to be accepted.`
            : 'Nothing is waiting to be accepted right now.'
        }
        action={
          <Link
            to="/admin/orders"
            className={cx(
              'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-move active:scale-95',
              waiting.length > 0 ? 'bg-flame shadow-flame' : 'bg-surface-2 text-ink ring-1 ring-hairline ring-inset',
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
              <span className="absolute inline-flex size-full animate-breathe rounded-full bg-mint" />
              <span className="relative inline-flex size-2.5 rounded-full bg-mint" />
            </span>
            <div>
              <h2 className={cx(DISPLAY, 'text-[19px] sm:text-[22px]')}>On the pass</h2>
              <p className="mt-0.5 text-[12.5px] text-ink-3">Live tickets, oldest first</p>
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
            <div className="grid place-items-center gap-2 px-4 py-14 text-center">
              <div className="text-3xl" aria-hidden>
                ✅
              </div>
              <p className="text-[14.5px] font-semibold">The kitchen is clear</p>
              <p className="max-w-[36ch] text-[13px] text-ink-3">A new ticket will appear here the moment a table orders.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-14 text-center text-[13.5px] text-ink-3">Nothing in this lane right now.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((order, i) => (
                <PassCard key={order.id} order={order} index={i} onChanged={reloadOrders} />
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
          value={today ? String(today.current.orders) : '—'}
          change={today?.orderChange}
          sub="vs yesterday"
        />
        <StatTile
          label="Revenue today"
          value={today ? formatMoney(today.current.revenue, menu.restaurant.currency) : '—'}
          change={today?.revenueChange}
          sub="vs yesterday"
        />
        <StatTile
          label="Average order"
          value={today ? formatMoney(today.current.averageOrder, menu.restaurant.currency) : '—'}
          sub={today ? `${today.current.covers} dishes served` : undefined}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Selling today" hint="By dishes served" bare>
          {history.loading ? (
            <Loading label="Counting today…" />
          ) : bestSellers.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Nothing has sold yet today.</p>
          ) : (
            bestSellers.map((dish) => (
              <Row key={dish.dishId}>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{dish.name}</span>
                <span className="shrink-0 text-[13.5px] tnum text-ink-3">
                  {formatMoney(dish.revenue, menu.restaurant.currency)}
                </span>
                <span className="w-12 shrink-0 text-right text-[14px] font-bold tnum text-flame-1">×{dish.units}</span>
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
        />
        <StatTile
          label="Would order again"
          value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
          sub="across rated dishes"
        />
        <StatTile
          label="Dishes without ratings"
          value={String(feedback.unratedDishes)}
          sub={`of ${feedback.ratedDishes + feedback.unratedDishes} on the menu`}
        />
        <StatTile
          label="Dish decision rate"
          value={dishDecisionRate !== null ? `${Math.round(dishDecisionRate * 100)}%` : '—'}
          sub="dish page → added to cart"
        />
      </div>
    </>
  );
}

/**
 * A ticket on the pass hero — the same one-obvious-next-move rule as the
 * full queue (§27), just sized to sit in a dashboard grid. The dashboard is
 * where a shift's eyes already are, so accepting or bumping a ticket
 * shouldn't require a trip to /admin/orders.
 */
function PassCard({ order, index, onChanged }: { order: Order; index: number; onChanged: () => void }) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  const next = nextStatus(order.status);

  const waitingMinutes = Math.floor((Date.now() - Date.parse(order.createdAt)) / 60_000);
  const stale = order.status === 'PENDING' && waitingMinutes >= STALE_MINUTES;
  const noted = order.items.find((i) => i.notes);
  const canAdvance = next !== null && allows('orders:advance');
  const canCancelHere = canCancel(order.status) && allows('orders:cancel');

  return (
    <article
      className={cx(
        'animate-rise relative flex flex-col overflow-hidden rounded-2xl bg-surface-2/60 p-4',
        'transition-move hover:-translate-y-0.5 hover:shadow-lift border',
        ACCENT_BORDER[order.status],
        stale && 'shadow-flame border-2',
      )}
      style={{ animationDelay: `${index * 45}ms` }}
    >

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-bold tnum">{order.reference}</span>
            <span className="truncate text-[13px] font-semibold text-ink-2">{order.tableName}</span>
          </div>
          <div className={cx('mt-0.5 text-[11.5px] tnum', stale ? 'font-semibold text-flame-1' : 'text-ink-4')}>
            {stale ? `Waiting ${waitingMinutes}m` : relativeTime(order.createdAt)}
          </div>
        </div>
        <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
      </div>

      <div className="mt-2.5 flex-1 truncate text-[12.5px] text-ink-3">
        {order.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}
      </div>
      {noted && <div className="mt-1 truncate text-[12px] italic text-gold">“{noted.notes}”</div>}

      {(canAdvance || canCancelHere) && (
        <div className="mt-3 flex items-center gap-2">
          {canAdvance && (
            <button
              type="button"
              disabled={pending !== null}
              className={cx(ADMIN_TINY, `flex-1 justify-center text-white`, ACCENT_BUTTON[order.status])}
              onClick={() =>
                void run(
                  order.id,
                  () => advanceOrder(staff, order.id, order.status),
                  `${order.reference} → ${STATUS_LABEL[next!].toLowerCase()}`,
                ).then(onChanged)
              }
            >
              {pending === order.id ? 'Working…' : ADVANCE_LABEL[order.status]}
            </button>
          )}
          {canCancelHere && (
            <Confirm
              label="Cancel"
              question="Cancel this order?"
              confirmLabel="Cancel it"
              disabled={pending !== null}
              onConfirm={() =>
                void run(
                  order.id,
                  () => rejectOrder(staff, order.id, 'Cancelled from the dashboard'),
                  `${order.reference} cancelled`,
                ).then(onChanged)
              }
            />
          )}
        </div>
      )}
    </article>
  );
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(' ')[0];
  if (hour < 11) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
