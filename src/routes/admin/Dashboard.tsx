import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, allOrders } from '../../api/admin';
import { funnel } from '../../domain/analytics';
import {
  dishPerformance,
  feedbackSummary,
  periodReport,
  windowFor,
} from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../../components/time';
import { Loading, PageTitle, Panel, Row, StatTile, StatusPill } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §26. The opening screen answers three questions in the order a restaurant
 * asks them: is anything waiting on me, how is today going, and is anything
 * about the menu quietly broken. Nothing here is a number for its own sake —
 * every tile is either an action or a comparison.
 */
export function Dashboard() {
  const staff = useStaff();
  const { menu, orders: queue } = useDashboard();
  const history = useAsync(() => allOrders(staff), [staff]);

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
              waiting.length > 0 ? 'bg-flame text-ember shadow-flame' : 'bg-surface-2 text-ink ring-1 ring-hairline ring-inset',
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

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
        <StatTile
          label="In the kitchen"
          value={String(working.length)}
          sub={waiting.length > 0 ? `${waiting.length} not yet accepted` : 'all accepted'}
          emphasis={waiting.length > 0}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Panel
          title="On the pass"
          hint="Live tickets, oldest first"
          bare
          action={
            <Link to="/admin/orders" className="text-[13px] font-semibold text-flame-1">
              All orders
            </Link>
          }
        >
          {working.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">The kitchen is clear.</p>
          ) : (
            [...working]
              .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
              .slice(0, 6)
              .map((order) => (
                <Row key={order.id}>
                  <span className="w-16 shrink-0 text-[14px] font-bold tnum">{order.reference}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{order.tableName}</span>
                    <span className="block truncate text-[12.5px] text-ink-4">
                      {order.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-[12.5px] tnum text-ink-4 sm:block">
                    {relativeTime(order.createdAt)}
                  </span>
                  <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
                </Row>
              ))
          )}
        </Panel>

        <div className="grid gap-4">
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

function greeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(' ')[0];
  if (hour < 11) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
