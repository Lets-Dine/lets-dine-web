import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allOrders } from '../../api/admin';
import { funnel } from '../../domain/analytics';
import {
  PERIOD_LABEL,
  dailySeries,
  dishPerformance,
  feedbackSummary,
  hourlyLoad,
  periodReport,
} from '../../domain/adminMetrics';
import type { DishPerformance, Period } from '../../domain/adminMetrics';
import { rankedByRating, rankedByReorder } from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { Empty, Loading, PageTitle, Panel, Row, Segmented, StatTile } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §31. The numbers, and only the ones a restaurant can act on.
 *
 * Every figure is compared against the same window immediately before it —
 * "Rs. 84,200 this week" says nothing on its own, and "Rs. 84,200, up 12% on
 * last week" is a decision. Cancelled orders are excluded from revenue
 * everywhere, and counted separately where that matters.
 */
export function Analytics() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const [period, setPeriod] = useState<Period>('week');

  const feed = useAsync(() => allOrders(staff), [staff]);
  const orders = feed.data;
  const currency = menu.restaurant.currency;

  const report = useMemo(() => (orders ? periodReport(orders, period) : null), [orders, period]);
  const performance = useMemo<DishPerformance[]>(
    () => (orders && report ? dishPerformance(orders, menu.dishes, report.window.from, report.window.to) : []),
    [orders, report, menu.dishes],
  );
  const series = useMemo(() => (orders ? dailySeries(orders, 30) : []), [orders]);
  const hours = useMemo(
    () => (orders && report ? hourlyLoad(orders, report.window.from, report.window.to) : []),
    [orders, report],
  );
  const feedback = useMemo(() => feedbackSummary(menu.dishes), [menu.dishes]);
  const { dishDecisionRate } = funnel();

  if (feed.loading && !orders) return <Loading label="Adding up the last ninety days…" />;
  if (!report) return <Empty emoji="📉" title="No data yet" message="Analytics appear once orders start coming in." />;

  const mostOrdered = [...performance].filter((d) => d.units > 0).sort((a, b) => b.units - a.units);
  const bestRated = rankedByRating(performance, 'best');
  const worstRated = rankedByRating(performance, 'worst');
  const reorder = rankedByReorder(performance);

  return (
    <>
      <PageTitle
        title="Analytics"
        subtitle="Cancelled orders are excluded from revenue throughout."
        action={
          <Segmented
            label="Period"
            value={period}
            onChange={setPeriod}
            options={(['today', 'week', 'month'] as Period[]).map((p) => ({ value: p, label: PERIOD_LABEL[p] }))}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Orders ${PERIOD_LABEL[period].toLowerCase()}`}
          value={report.current.orders.toLocaleString()}
          change={report.orderChange}
          sub={`vs ${previousLabel(period)}`}
        />
        <StatTile
          label="Revenue"
          value={formatMoney(report.current.revenue, currency)}
          change={report.revenueChange}
          sub={`vs ${previousLabel(period)}`}
        />
        <StatTile
          label="Average order"
          value={formatMoney(report.current.averageOrder, currency)}
          sub={`${report.current.covers.toLocaleString()} dishes served`}
        />
        <StatTile
          label="Cancelled"
          value={report.current.cancelled.toLocaleString()}
          sub={
            report.current.orders + report.current.cancelled > 0
              ? `${((report.current.cancelled / (report.current.orders + report.current.cancelled)) * 100).toFixed(1)}% of tickets`
              : undefined
          }
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Revenue, last 30 days" hint="Each bar is one day">
          <RevenueChart series={series} currency={currency} />
        </Panel>
        <Panel title="When the orders land" hint={`Across ${PERIOD_LABEL[period].toLowerCase()}`}>
          <HourChart hours={hours} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Most ordered" hint={PERIOD_LABEL[period]} bare>
          <DishTable
            rows={mostOrdered.slice(0, 8)}
            currency={currency}
            value={(d) => `×${d.units}`}
            empty="Nothing has sold in this period yet."
          />
        </Panel>

        <Panel title="Highest rated" hint="All time, five or more ratings" bare>
          <DishTable
            rows={bestRated.slice(0, 8)}
            currency={currency}
            value={(d) => `${d.avgRating?.toFixed(2)} ★`}
            empty="No dish has enough ratings yet."
          />
        </Panel>

        <Panel title="Lowest rated" hint="Where the kitchen should look first" bare>
          <DishTable
            rows={worstRated.slice(0, 8)}
            currency={currency}
            value={(d) => `${d.avgRating?.toFixed(2)} ★`}
            tone={(d) => ((d.avgRating ?? 5) < 4.2 ? 'bad' : undefined)}
            empty="No dish has enough ratings yet."
          />
        </Panel>

        <Panel title="Would order again" hint="The strongest signal in the product" bare>
          <DishTable
            rows={reorder.slice(0, 8)}
            currency={currency}
            value={(d) => `${Math.round((d.recommendRate ?? 0) * 100)}%`}
            empty="Not enough reviews to claim a rate."
          />
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Average restaurant rating"
          value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
          sub={`${feedback.reviewCount.toLocaleString()} reviews`}
        />
        <StatTile
          label="Average dish rating"
          value={feedback.averageDishRating ? `${feedback.averageDishRating.toFixed(2)} ★` : '—'}
          sub="unweighted, per dish"
        />
        <StatTile
          label="Recommendation rate"
          value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
          sub="would order again"
        />
        <StatTile
          label="Dish decision rate"
          value={dishDecisionRate !== null ? `${Math.round(dishDecisionRate * 100)}%` : '—'}
          sub="dish page → added to cart"
        />
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-4">
        Dish decision rate (§32) is the product metric that matters most: how often opening a dish page ends in that
        dish going into a cart. It is measured from this browser's diner session, so it reads as a demo figure here.
      </p>
    </>
  );
}

function previousLabel(period: Period): string {
  return period === 'today' ? 'yesterday' : period === 'week' ? 'last week' : 'last month';
}

function DishTable({
  rows,
  currency,
  value,
  tone,
  empty,
}: {
  rows: DishPerformance[];
  currency: string;
  value: (row: DishPerformance) => string;
  tone?: (row: DishPerformance) => 'bad' | undefined;
  empty: string;
}) {
  if (rows.length === 0) return <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">{empty}</p>;
  return (
    <ol>
      {rows.map((row, index) => (
        <li key={row.dishId}>
          <Row>
            <span className="w-4 shrink-0 text-[12.5px] font-bold tnum text-ink-4">{index + 1}</span>
            <span className="min-w-0 flex-1">
              <Link to={`/admin/menu/${row.dishId}`} className="block truncate text-[14px] font-semibold hover:text-flame-1">
                {row.name}
              </Link>
              <span className="block text-[12px] text-ink-4 tnum">
                {row.units > 0 ? `${formatMoney(row.revenue, currency)} · ` : ''}
                {row.ratingCount > 0 ? `${row.ratingCount} ratings` : 'no ratings yet'}
              </span>
            </span>
            <span className={cx('shrink-0 text-[14.5px] font-bold tnum', tone?.(row) === 'bad' && 'text-berry')}>
              {value(row)}
            </span>
          </Row>
        </li>
      ))}
    </ol>
  );
}

/** Deliberately plain: bar height is the only encoding, and it is to scale. */
function RevenueChart({ series, currency }: { series: { day: number; label: string; revenue: number; orders: number }[]; currency: string }) {
  const peak = Math.max(1, ...series.map((p) => p.revenue));
  const today = series[series.length - 1];

  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Daily revenue for the last thirty days">
        {series.map((point) => (
          <div
            key={point.day}
            className="group relative flex-1 rounded-t-[3px] bg-flame-2/35 transition-colors hover:bg-flame-2"
            style={{ height: `${Math.max(2, (point.revenue / peak) * 100)}%` }}
            title={`${point.label} — ${formatMoney(point.revenue, currency)} from ${point.orders} orders`}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-ink-4">
        <span>{series[0]?.label}</span>
        <span className="tnum">peak {formatMoney(peak, currency)}</span>
        <span>{today?.label} (today)</span>
      </div>
    </div>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const peak = Math.max(1, ...hours);
  const busiest = hours.indexOf(peak);
  const shown = hours.slice(8, 24);

  return (
    <div>
      <div className="flex h-40 items-end gap-[3px]" role="img" aria-label="Orders by hour of day">
        {shown.map((count, index) => {
          const hour = index + 8;
          return (
            <div
              key={hour}
              className={cx(
                'flex-1 rounded-t-[3px] transition-colors',
                hour === busiest ? 'bg-flame' : 'bg-surface-3 hover:bg-flame-2/45',
              )}
              style={{ height: `${Math.max(2, (count / peak) * 100)}%` }}
              title={`${hour}:00 — ${count} orders`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11.5px] text-ink-4">
        <span>8am</span>
        <span className="font-semibold text-ink-3">busiest {busiest}:00</span>
        <span>11pm</span>
      </div>
    </div>
  );
}
