import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RevenueTrend, RevenueTrendPoint, TrendPeriod } from '../../domain/adminMetrics';
import type { Minor } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { DISPLAY, cx } from '../ui';
import { Lock } from '../icons';
import { Change, Loading, Panel, Segmented } from './kit';

const PERIODS: { value: TrendPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const COPY: Record<TrendPeriod, { this: string; last: string; title: string; unit: string }> = {
  week: { this: 'This week', last: 'Last week', title: 'Revenue, week on week', unit: 'day' },
  month: { this: 'This month', last: 'Last month', title: 'Revenue, month on month', unit: 'day' },
  year: { this: 'This year', last: 'Last year', title: 'Revenue, year on year', unit: 'month' },
};

/** "2026-01-14" or "2026-01" as a local date — never `new Date(string)`, which would read it as UTC and slip a day. */
function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d ?? 1);
}

const WEEKDAY = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH = new Intl.DateTimeFormat('en', { month: 'short' });
const LONG_DAY = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short' });
const LONG_MONTH = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });

/** What sits under a slot on the axis: weekday, day of month (every fifth), or month. */
function axisLabel(period: TrendPeriod, key: string, index: number): string {
  const date = parseKey(key);
  if (period === 'week') return WEEKDAY.format(date);
  if (period === 'year') return MONTH.format(date);
  return index === 0 || (index + 1) % 5 === 0 ? String(date.getDate()) : '';
}

function slotTitle(period: TrendPeriod, key: string): string {
  return period === 'year' ? LONG_MONTH.format(parseKey(key)) : LONG_DAY.format(parseKey(key));
}

/** Rounds the tallest point up to a tidy ceiling so the gridlines land on round numbers. */
function niceCeiling(max: number): number {
  const major = Math.max(max / 100, 1);
  const magnitude = 10 ** Math.floor(Math.log10(major));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= major / 4) ?? 10;
  return Math.ceil(major / (step * magnitude)) * step * magnitude * 100;
}

function compact(minor: Minor): string {
  const major = minor / 100;
  if (major === 0) return '0';
  if (major >= 100_000) return `${+(major / 100_000).toFixed(1)}L`;
  if (major >= 1_000) return `${+(major / 1_000).toFixed(1)}k`;
  return String(Math.round(major));
}

const GRID_LINES = 4;

interface XY {
  x: number;
  y: number;
}

/**
 * A smooth curve through every point, as cubic Béziers. Tangents are chosen so the curve never
 * overshoots its neighbours (monotone interpolation) — a dip to zero stays at zero instead of
 * swinging below the axis and implying negative revenue between two real figures.
 */
function smoothPath(pts: XY[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M ${pts[0].x} ${pts[0].y}`;

  const h = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const s = pts.slice(1).map((p, i) => (p.y - pts[i].y) / h[i]);
  const t = new Array<number>(n);

  if (n === 2) {
    t[0] = t[1] = s[0];
  } else {
    for (let i = 1; i < n - 1; i++) {
      t[i] = s[i - 1] * s[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((h[i - 1] + 2 * h[i]) / s[i - 1] + (h[i] + 2 * h[i - 1]) / s[i]);
    }
    t[0] = (3 * s[0] - t[1]) / 2;
    t[n - 1] = (3 * s[n - 2] - t[n - 2]) / 2;
  }

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const w = h[i] / 3;
    d += ` C ${pts[i].x + w} ${pts[i].y + t[i] * w}, ${pts[i + 1].x - w} ${pts[i + 1].y - t[i + 1] * w}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }
  return d;
}

/** How long the this-period line takes to sweep across the plot. */
const DRAW_MS = 1100;

/** The current line starts a beat after the previous one, so the comparison is laid down first. */
const THIS_LAG_MS = 160;

/** Few enough slots to afford a dot on each; a month of days shows only today's and the hovered one. */
const DOT_LIMIT = 12;

interface Props {
  trend: RevenueTrend | null;
  period: TrendPeriod;
  onPeriodChange: (next: TrendPeriod) => void;
  /** True while a request is in flight — the last figures stay on screen, dimmed, until the new ones land. */
  loading: boolean;
  failed: boolean;
  /** The restaurant's plan does not include revenue trends — a state of the plan, not a failure. */
  locked?: boolean;
  onRetry: () => void;
  currency: string;
}

/** A line comparison of revenue: this period drawn solid up to today, the one before it dashed behind. */
export function RevenueTrendChart({ trend, period, onPeriodChange, loading, failed, locked = false, onRetry, currency }: Props) {
  const copy = COPY[period];

  return (
    <Panel
      title={copy.title}
      hint="Settled payments, against the period before"
      action={locked ? undefined : <Segmented label="Period" value={period} onChange={onPeriodChange} options={PERIODS} />}
    >
      {trend === null ? (
        locked ? (
          <div className="grid place-items-center gap-2 py-14 text-center">
            <Lock size={20} className="text-ink-4" />
            <p className="text-[13.5px] font-semibold">Revenue trends are not in your current plan</p>
            <p className="max-w-[38ch] text-[13px] leading-snug text-ink-3">Today's orders and the pass are unaffected. A higher plan adds trends and comparisons.</p>
            <Link to="/admin/plan" className="mt-1 text-[13px] font-semibold text-flame-1">
              See what your plan includes
            </Link>
          </div>
        ) : failed ? (
          <div className="grid place-items-center gap-3 py-16 text-center">
            <p className="text-[13.5px] text-ink-3">Revenue couldn't be loaded.</p>
            <button type="button" onClick={onRetry} className="text-[13px] font-semibold text-flame-1">
              Try again
            </button>
          </div>
        ) : (
          <Loading label="Adding up the till…" />
        )
      ) : (
        <div className={cx('transition-opacity duration-200', loading && 'opacity-55')} aria-busy={loading}>
          <Chart key={`${trend.period}:${trend.currentTotal}:${trend.previousTotal}`} trend={trend} currency={currency} />
        </div>
      )}
    </Panel>
  );
}

function Chart({ trend, currency }: { trend: RevenueTrend; currency: string }) {
  const { period, points } = trend;
  const copy = COPY[period];
  const n = points.length;
  const [active, setActive] = useState<number | null>(null);
  const [drawn, setDrawn] = useState(false);

  // One authored moment: both lines sweep in once the chart has painted. A new period or fresh
  // figures remount this component (see the key below), so the sweep replays by itself.
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setDrawn(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  const { ceiling, ticks, todayIndex, best } = useMemo(() => {
    const max = Math.max(0, ...points.map((p) => Math.max(p.previous ?? 0, p.current ?? 0)));
    const top = niceCeiling(max);
    const elapsed = points.filter((p) => p.current !== null);
    return {
      ceiling: top,
      ticks: Array.from({ length: GRID_LINES + 1 }, (_, i) => (top / GRID_LINES) * (GRID_LINES - i)),
      todayIndex: elapsed.length - 1,
      best: elapsed.reduce<RevenueTrendPoint | null>((top2, p) => ((p.current ?? 0) > (top2?.current ?? -1) ? p : top2), null),
    };
  }, [points]);

  /** Points sit at the centre of each slot: x in a 0–700 viewBox, y as a percentage from the top. */
  const xAt = (i: number) => ((i + 0.5) / n) * 700;
  const yAt = (v: Minor) => 100 - (v / ceiling) * 100;
  // A gap (the 31st with no counterpart) ends the previous line rather than dropping it to zero.
  const previousPath = smoothPath(points.flatMap((p, i) => (p.previous === null ? [] : [{ x: xAt(i), y: yAt(p.previous) }])));
  const currentPath = smoothPath(points.flatMap((p, i) => (p.current === null ? [] : [{ x: xAt(i), y: yAt(p.current) }])));

  const showDots = n <= DOT_LIMIT;
  const delay = (i: number, lag = 0) => `${lag + (DRAW_MS * (i + 0.5)) / n - 100}ms`;

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={cx(DISPLAY, 'text-[28px] tnum sm:text-[32px]')}>{formatMoney(trend.currentTotal, currency)}</span>
          <span className="flex items-center gap-2 text-[13px]">
            <Change value={trend.previousToDate > 0 ? trend.differencePercentage / 100 : null} />
            <span className="text-ink-3">vs {formatMoney(trend.previousToDate, currency)} by this {copy.unit} {copy.last.toLowerCase()}</span>
          </span>
        </div>
        <ul className="flex items-center gap-4 text-[12.5px] text-ink-3" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-flame-2" aria-hidden />
            {copy.this}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-ink-4" aria-hidden />
            {copy.last}
          </li>
        </ul>
      </div>

      <div className="mt-5 flex gap-2.5 sm:gap-3">
        <div className="relative h-52 w-9 shrink-0 text-[11.5px] tnum text-ink-4 sm:w-10" aria-hidden>
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${(i / GRID_LINES) * 100}%` }}>
              {compact(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-52" onMouseLeave={() => setActive(null)}>
            {ticks.map((t, i) => (
              <div
                key={t}
                className={cx('absolute inset-x-0 border-t', i === GRID_LINES ? 'border-hairline-strong' : 'border-hairline border-dashed')}
                style={{ top: `${(i / GRID_LINES) * 100}%` }}
                aria-hidden
              />
            ))}

            <svg
              className="absolute inset-0 size-full overflow-visible transition-[clip-path] ease-linear motion-reduce:transition-none"
              style={{ clipPath: drawn ? 'inset(-12px -12px -12px 0)' : 'inset(-12px 100% -12px 0)', transitionDuration: drawn ? `${DRAW_MS}ms` : '0ms' }}
              viewBox="0 0 700 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d={previousPath} fill="none" stroke="var(--color-ink-4)" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {active !== null && (
                <line x1={xAt(active)} x2={xAt(active)} y1="0" y2="100" stroke="var(--color-hairline-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              )}
            </svg>

            {/* The current line sits in its own layer so one clip can sweep it in a beat after the previous one. */}
            <svg
              className="absolute inset-0 size-full overflow-visible transition-[clip-path] ease-linear motion-reduce:transition-none"
              style={{
                clipPath: drawn ? 'inset(-12px -12px -12px 0)' : 'inset(-12px 100% -12px 0)',
                transitionDuration: drawn ? `${DRAW_MS}ms` : '0ms',
                transitionDelay: drawn ? `${THIS_LAG_MS}ms` : '0ms',
              }}
              viewBox="0 0 700 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path d={currentPath} fill="none" stroke="var(--color-flame-2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Dots are HTML, not SVG, so the stretched viewBox can't squash them into ovals. */}
            {points.map((p, i) =>
              p.previous === null || !(showDots || active === i) ? null : (
                <span
                  key={`previous-${p.index}`}
                  className={cx('pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface ring-2 ring-ink-4 transition-opacity duration-200', drawn ? 'opacity-100' : 'opacity-0')}
                  style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${yAt(p.previous)}%`, transitionDelay: drawn ? delay(i) : '0ms' }}
                  aria-hidden
                />
              ),
            )}
            {points.map((p, i) =>
              p.current === null || !(showDots || i === todayIndex || active === i) ? null : (
                <span
                  key={`current-${p.index}`}
                  className={cx(
                    'pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface ring-[2.5px] ring-flame-2 transition-[width,height,opacity] duration-200',
                    i === todayIndex || active === i ? 'size-3.5 ring-flame-1' : 'size-2.5',
                    drawn ? 'opacity-100' : 'opacity-0',
                  )}
                  style={{ left: `${((i + 0.5) / n) * 100}%`, top: `${yAt(p.current)}%`, transitionDelay: drawn ? delay(i, THIS_LAG_MS) : '0ms' }}
                  aria-hidden
                />
              ),
            )}

            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {points.map((p, i) => {
                const isActive = active === i;
                const delta = p.current !== null && p.previous ? (p.current - p.previous) / p.previous : null;
                const top = yAt(Math.max(p.previous ?? 0, p.current ?? 0));
                const title = slotTitle(period, p.date);
                return (
                  <button
                    key={p.date}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive((a) => (a === i ? null : a))}
                    aria-label={`${title}: ${p.current === null ? 'not yet' : formatMoney(p.current, currency)} ${copy.this.toLowerCase()}, ${p.previous === null ? 'nothing to compare' : `${formatMoney(p.previous, currency)} ${copy.last.toLowerCase()}`}`}
                    className="relative h-full outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-flame-1"
                  >
                    {isActive && (
                      <span
                        role="presentation"
                        className={cx(
                          'pointer-events-none absolute z-10 w-48 rounded-xl bg-surface-3 p-3 text-left shadow-[0_10px_28px_-8px_rgb(0_0_0/0.55)] ring-1 ring-hairline-strong ring-inset',
                          i < n * 0.25 ? 'left-0' : i >= n * 0.75 ? 'right-0' : 'left-1/2 -translate-x-1/2',
                        )}
                        style={{ bottom: `min(calc(${100 - top}% + 14px), calc(100% - 96px))` }}
                      >
                        <span className="block text-[12px] font-semibold text-ink-2">{title}</span>
                        <span className="mt-1.5 flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-1.5 text-ink-3">
                            <span className="h-0.5 w-3 rounded-full bg-flame-2" aria-hidden />
                            {copy.this}
                          </span>
                          <span className="font-semibold tnum text-ink">{p.current === null ? '—' : formatMoney(p.current, currency)}</span>
                        </span>
                        <span className="mt-1 flex items-center justify-between gap-3 text-[13px]">
                          <span className="flex items-center gap-1.5 text-ink-3">
                            <span className="w-3 border-t-2 border-dashed border-ink-4" aria-hidden />
                            {copy.last}
                          </span>
                          <span className="tnum text-ink-2">{p.previous === null ? '—' : formatMoney(p.previous, currency)}</span>
                        </span>
                        {delta !== null && (
                          <span className="mt-2 block border-t border-hairline pt-2 text-[12.5px]">
                            <Change value={delta} /> <span className="text-ink-3">on {p.previousDate ? slotTitle(period, p.previousDate) : copy.last.toLowerCase()}</span>
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
            {points.map((p, i) => (
              <span
                key={p.date}
                className={cx(
                  'text-center text-[12px]',
                  i === todayIndex ? 'font-bold text-ink' : p.current === null ? 'text-ink-4' : 'font-medium text-ink-3',
                )}
              >
                {axisLabel(period, p.date, i)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 border-t border-hairline pt-3 text-[12.5px] text-ink-3">
        {best && (best.current ?? 0) > 0 ? (
          <>
            <span className="font-semibold text-ink-2">{slotTitle(period, best.date)}</span> is the strongest {copy.unit} so far at{' '}
            <span className="tnum">{formatMoney(best.current ?? 0, currency)}</span>.{' '}
          </>
        ) : (
          <>Nothing has been paid for yet this {period}. </>
        )}
        {copy.last} closed on <span className="tnum">{formatMoney(trend.previousTotal, currency)}</span>.
      </p>
    </>
  );
}
