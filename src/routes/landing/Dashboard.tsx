import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, Panel, PanelBar, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useCountUp, useReveal } from './motion';
import {
  CROSS_SELL_INSIGHT,
  NEEDS_ATTENTION,
  RATING_DISTRIBUTION,
  RESTAURANT_NAME,
  TOP_DISHES,
  WEEK_ORDERS,
} from './data';

/**
 * The restaurant's own view.
 *
 * One panel, at full width, with the numbers a floor manager actually opens
 * the app for — including the ones most dashboards leave out, like which
 * dishes are losing ground. The chart is a real plot of the week's covers:
 * an axis, a grid, labelled values, and no decoration that isn't data.
 */
export function Dashboard() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="dashboard" ref={ref} className="bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="06">Restaurant insights</Mark>
          <SplitHeading
            text="See what your customers are really telling you."
            className={cx(DISPLAY_LG, 'mt-6 text-ink')}
          />
        </div>
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          Every order and every rating lands in one place, attached to the dish that earned it.
        </p>
      </div>

      <div className={cx(RAIL, 'mt-14')}>
        <div data-reveal>
          <Panel>
            <PanelBar
              title={`${RESTAURANT_NAME} · Overview`}
              right={
                <span className="flex items-center gap-2">
                  <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-ink-3 ring-1 ring-hairline ring-inset sm:inline">
                    Last 7 days
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-mint-ink">
                    <span className="size-1.5 rounded-full bg-mint" aria-hidden />
                    Live
                  </span>
                </span>
              }
            />

            <div className="grid grid-cols-2 gap-px bg-hairline lg:grid-cols-4">
              <Kpi label="Orders today" value={184} change="+12% vs last Sunday" />
              <Kpi label="Revenue today" value={96420} prefix="Rs. " grouped change="+8.4% vs last Sunday" />
              <Kpi label="Average rating" value={4.6} decimals={1} suffix="★" change="+0.2 over 30 days" />
              <Kpi label="Repeat orders" value={41.2} decimals={1} suffix="%" change="+3.1 pts over 30 days" />
            </div>

            <div className="grid gap-px bg-hairline lg:grid-cols-[1.35fr_1fr]">
              <div className="bg-surface p-5 sm:p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[13.5px] font-semibold text-ink">Covers served, this week</h3>
                  <span className="font-mono text-[11.5px] tabular-nums text-ink-4">1,173 total</span>
                </div>
                <WeekChart />
              </div>

              <div className="bg-surface p-5 sm:p-6">
                <h3 className="text-[13.5px] font-semibold text-ink">How the 1,248 ratings fall</h3>
                <div className="mt-4 flex flex-col gap-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const n = RATING_DISTRIBUTION[star - 1];
                    const pct = (n / 1248) * 100;
                    return (
                      <div key={star} className="grid grid-cols-[34px_1fr_44px] items-center gap-2.5">
                        <span className="flex items-center gap-1 font-mono text-[11.5px] font-bold tabular-nums text-ink-3">
                          {star}
                          <Star size={9} className="text-gold" />
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                          <span
                            className="block h-full rounded-full bg-gradient-to-r from-gold to-flame-2"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="text-right font-mono text-[11.5px] tabular-nums text-ink-4">
                          {n.toLocaleString('en-US')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-hairline lg:grid-cols-[1fr_1fr_1fr]">
              {/* Top dishes */}
              <div className="bg-surface p-5 sm:p-6">
                <h3 className="text-[13.5px] font-semibold text-ink">Top performing dishes</h3>
                <ol className="mt-3.5 flex flex-col">
                  {TOP_DISHES.map((dish, i) => (
                    <li
                      key={dish.name}
                      className="grid grid-cols-[18px_1fr_auto] items-center gap-3 border-b border-hairline py-2.5 last:border-0"
                    >
                      <span className="font-mono text-[12px] font-bold text-ink-4">{i + 1}</span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-ink">{dish.name}</div>
                        <span className="flex items-center gap-1 text-[11.5px] text-ink-4">
                          <Star size={9} className="text-gold" />
                          {dish.rating}
                        </span>
                      </div>
                      <span className="font-mono text-[12.5px] font-semibold tabular-nums text-ink-2">
                        {dish.orders.toLocaleString('en-US')}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Needs attention — the other half of the truth */}
              <div className="bg-surface p-5 sm:p-6">
                <h3 className="text-[13.5px] font-semibold text-ink">Losing ground</h3>
                <ul className="mt-3.5 flex flex-col gap-3.5">
                  {NEEDS_ATTENTION.map((dish) => (
                    <li key={dish.name}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">{dish.name}</span>
                        <span className="flex shrink-0 items-baseline gap-1.5">
                          <span className="font-mono text-[12.5px] font-semibold tabular-nums text-ink-2">
                            {dish.rating}
                          </span>
                          <span className="font-mono text-[11.5px] font-bold tabular-nums text-berry-ink">
                            {dish.change}
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-ink-4">{dish.note}</p>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What gets ordered together */}
              <div className="bg-surface p-5 sm:p-6">
                <h3 className="text-[13.5px] font-semibold text-ink">Ordered together</h3>
                <div className="mt-3.5 rounded-[14px] bg-flame-2/8 p-4 ring-1 ring-flame-2/20 ring-inset">
                  <span className="label text-flame-1">Insight</span>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{CROSS_SELL_INSIGHT}</p>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-ink-4">
                  Pairings are counted from completed orders. Enough of them, and the menu can start suggesting the
                  second dish itself.
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </Band>
  );
}

function Kpi({
  label,
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  grouped = false,
  change,
}: {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  grouped?: boolean;
  change: string;
}) {
  const [refCb, text] = useCountUp(value, decimals);
  const shown = grouped ? Number(text).toLocaleString('en-US') : text;

  return (
    <div className="bg-surface p-5">
      <div className="label text-ink-4">{label}</div>
      <div ref={refCb} className="mt-2 font-mono text-[26px] font-bold tabular-nums tracking-tight text-ink sm:text-[30px]">
        {prefix}
        {shown}
        {suffix}
      </div>
      <div className="mt-1.5 text-[11.5px] font-medium text-mint-ink">{change}</div>
    </div>
  );
}

/**
 * The week's covers as an area plot. Drawn from the series in data.ts, with a
 * baseline grid and every point labelled — a chart you could actually read a
 * Friday off, rather than a decorative squiggle.
 */
function WeekChart() {
  const ref = useRef<SVGSVGElement>(null);
  const W = 560;
  const H = 150;
  const PAD = { t: 10, r: 4, b: 4, l: 4 };
  const max = 260;

  const points = WEEK_ORDERS.map((d, i) => {
    const x = PAD.l + (i / (WEEK_ORDERS.length - 1)) * (W - PAD.l - PAD.r);
    const y = PAD.t + (1 - d.orders / max) * (H - PAD.t - PAD.b);
    return { ...d, x, y };
  });

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${H} L${points[0].x.toFixed(1)},${H} Z`;

  useEffect(() => {
    const svg = ref.current;
    if (!svg || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const path = svg.querySelector<SVGPathElement>('[data-line]');
      const fill = svg.querySelector('[data-area]');
      const dots = svg.querySelectorAll('[data-dot]');
      if (!path) return;
      const length = path.getTotalLength();

      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
      gsap.set(fill, { opacity: 0 });
      gsap.set(dots, { scale: 0, transformOrigin: 'center' });

      gsap
        .timeline({ scrollTrigger: { trigger: svg, start: 'top 88%' } })
        .to(path, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' })
        .to(fill, { opacity: 1, duration: 0.8 }, 0.35)
        .to(dots, { scale: 1, duration: 0.4, stagger: 0.06, ease: 'back.out(2)' }, 0.5);
    }, svg);

    return () => ctx.revert();
  }, []);

  return (
    <div className="mt-4">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[150px] w-full overflow-visible"
        role="img"
        aria-label={`Covers served this week: ${WEEK_ORDERS.map((d) => `${d.day} ${d.orders}`).join(', ')}.`}
      >
        <defs>
          <linearGradient id="covers-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-flame-2)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-flame-2)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((t) => (
          <line
            key={t}
            x1={0}
            x2={W}
            y1={PAD.t + t * (H - PAD.t - PAD.b)}
            y2={PAD.t + t * (H - PAD.t - PAD.b)}
            stroke="var(--color-hairline)"
            strokeWidth={1}
          />
        ))}

        <path data-area d={area} fill="url(#covers-fill)" />
        <path
          data-line
          d={line}
          fill="none"
          stroke="var(--flame)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <circle
            key={p.day}
            data-dot
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill="var(--color-surface)"
            stroke="var(--flame)"
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between">
        {WEEK_ORDERS.map((d) => (
          <div key={d.day} className="flex flex-col items-center gap-0.5">
            <span className="font-mono text-[11.5px] font-bold tabular-nums text-ink-2">{d.orders}</span>
            <span className="label text-[9.5px] tracking-[0.1em] text-ink-4">{d.day}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
