import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchDishSales, trendOf } from '../../api/dishPerformance';
import type { Trend } from '../../api/dishPerformance';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { TrendUp } from '../../components/icons';
import { Num, useCountUp } from '../../components/admin/profile';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/** What the dish-performance layouts share: the numbers, the trend pill, and the plain-language header. */

export const PERIODS = [7, 30, 90] as const;
export type Days = (typeof PERIODS)[number];

export interface Row {
  id: string;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
  previous: number | null;
  trend: Trend;
}

export const by = (f: (r: Row) => number) => (a: Row, b: Row) => f(b) - f(a) || a.name.localeCompare(b.name);
export const pctText = (n: number) => `${n > 0 ? '+' : '−'}${Math.round(Math.abs(n) * 100)}%`;
export const isRising = (r: Row) => (r.trend.kind === 'up' || r.trend.kind === 'new') && r.trend.delta > 0;
export const isSlipping = (r: Row) => r.trend.kind === 'down';

export function useDishRows() {
  const { menu } = useDashboard();
  const [days, setDays] = useState<Days>(30);
  const sales = useAsync(() => fetchDishSales(days), [days]);

  const rows = useMemo<Row[]>(() => {
    if (!sales.data) return [];
    const photo = new Map(menu.dishes.map((d) => [d.id, d.imageUrl]));
    const sold = new Set(sales.data.map((s) => s.dishId));
    const withSales = sales.data.map((s) => ({
      id: s.dishId,
      name: s.dishName,
      imageUrl: photo.get(s.dishId) ?? null,
      units: s.orderCount,
      revenue: s.totalAmount,
      previous: s.previousCount,
      trend: trendOf(s.orderCount, s.previousCount),
    }));
    // A dish on the menu that sold nothing is part of the answer, not a gap in it.
    const idle = menu.dishes
      .filter((d) => !d.isArchived && !sold.has(d.id))
      .map((d) => ({ id: d.id, name: d.name, imageUrl: d.imageUrl, units: 0, revenue: 0, previous: null, trend: trendOf(0, null) }));
    return [...withSales, ...idle];
  }, [sales.data, menu.dishes]);

  return { rows, days, setDays, sales, currency: menu.restaurant.currency };
}

/** Heading, the one-sentence answer, and the period switch — identical in every layout so only the body differs. */
export function Hero({ rows, days, setDays, currency }: { rows: Row[]; days: Days; setDays: (d: Days) => void; currency: string }) {
  const selling = rows.filter((r) => r.units > 0);
  const leader = [...selling].sort(by((r) => r.units))[0];
  const earner = [...selling].sort(by((r) => r.revenue))[0];
  const climbing = rows.filter(isRising).sort(by((r) => r.trend.delta))[0];
  const slipping = rows.filter(isSlipping).sort(by((r) => -r.trend.delta))[0];
  const unitsShown = useCountUp(leader?.units ?? 0);
  const earnedShown = useCountUp(earner?.revenue ?? 0);

  return (
    <section>
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>How your dishes are doing</h1>

      <p className="mt-5 max-w-[40ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms]">
        {leader && earner ? (
          <>
            <Num>{leader.name}</Num> sold the most — <Num>{unitsShown} plates</Num> in the last {days} days. <Num>{earner.name}</Num> brought in the most money, <Num>{formatMoney(earnedShown, currency)}</Num>.
            {climbing && <> <Num>{climbing.name}</Num> is climbing fastest.</>}
            {slipping && <> <Num>{slipping.name}</Num> is slipping.</>}
          </>
        ) : (
          <>Nothing has been paid for in the last {days} days yet.</>
        )}
      </p>

      <div className="mt-6 flex animate-rise flex-wrap items-center gap-x-5 gap-y-3 [animation-delay:160ms]">
        <div role="group" aria-label="Time period" className="flex gap-2">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={days === p} onClick={() => setDays(p)} className={cx(CHIP, days === p ? CHIP_ON : CHIP_OFF)}>
              Last {p} days
            </button>
          ))}
        </div>
        <p className="text-[13.5px] text-ink-3">Arrows compare with the {days} days before.</p>
      </div>
    </section>
  );
}

export function TrendPill({ trend, previous }: { trend: Trend; previous: number | null }) {
  const base = 'inline-flex h-8 items-center gap-1.5 justify-self-start rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset tnum sm:justify-self-end';
  let body: ReactNode;
  let tone = 'bg-surface-2 text-ink-3 ring-hairline';
  let title: string | undefined;
  switch (trend.kind) {
    case 'up':
      tone = 'bg-mint/14 text-mint-ink ring-mint/30';
      body = <><TrendUp size={14} /> {pctText(trend.pct)}</>;
      title = `Up from ${previous} plates`;
      break;
    case 'down':
      tone = 'bg-berry/14 text-berry-ink ring-berry/30';
      body = <><TrendUp size={14} className="scale-y-[-1]" /> {pctText(trend.pct)}</>;
      title = `Down from ${previous} plates`;
      break;
    case 'new':
      tone = 'bg-gold/14 text-gold-ink ring-gold/30';
      body = 'New';
      title = 'Did not sell in the period before';
      break;
    case 'steady':
      body = 'Steady';
      title = `About the same as before (${previous})`;
      break;
    default:
      body = <span aria-label="Too few sales to tell">—</span>;
      title = 'Too few sales to call a trend';
  }
  return <span title={title} className={cx(base, tone)}>{body}</span>;
}
