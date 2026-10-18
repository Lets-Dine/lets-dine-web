import { useState } from 'react';
import { GROUP_LABEL, MIN_RATINGS, median, rankable } from '../../api/dishMargins';
import type { DishMargin, Group } from '../../api/dishMargins';
import { cx } from '../ui';

const W = 640;
const H = 400;
const PAD = { l: 48, r: 16, t: 16, b: 40 };
const IN_W = W - PAD.l - PAD.r;
const IN_H = H - PAD.t - PAD.b;

const FILL: Record<Group, string> = { star: 'fill-mint', plowhorse: 'fill-gold', puzzle: 'fill-flame-2', dog: 'fill-berry' };
const SWATCH: Record<Group, string> = { star: 'bg-mint', plowhorse: 'bg-gold', puzzle: 'bg-flame-2', dog: 'bg-berry' };
// Corner each group's dots fall in, so the quadrants can be named without a legend lookup.
const CORNER: Record<Group, { x: number; y: number; anchor: 'start' | 'end'; dy: number }> = {
  star: { x: W - PAD.r - 6, y: PAD.t + 14, anchor: 'end', dy: 0 },
  puzzle: { x: PAD.l + 6, y: PAD.t + 14, anchor: 'start', dy: 0 },
  plowhorse: { x: W - PAD.r - 6, y: H - PAD.b - 8, anchor: 'end', dy: 0 },
  dog: { x: PAD.l + 6, y: H - PAD.b - 8, anchor: 'start', dy: 0 },
};

/** Popularity against margin %, one dot per dish: size is profit, colour is its group. Only dishes with enough costed sales are plotted. */
export function MarginScatter({ rows, groups, money }: { rows: DishMargin[]; groups: Map<string, Group>; money: (v: number) => string }) {
  const [active, setActive] = useState<string | null>(null);
  const dots = rankable(rows);
  const maxUnits = Math.max(1, ...dots.map((r) => r.units));
  const maxPct = Math.max(0.5, ...dots.map((r) => r.marginPct as number));
  const maxProfit = Math.max(1, ...dots.map((r) => r.margin ?? 0));
  const x = (u: number) => PAD.l + (u / maxUnits) * IN_W;
  const y = (p: number) => PAD.t + (1 - p / maxPct) * IN_H;
  const medX = x(median(dots.map((r) => r.units)));
  const medY = y(median(dots.map((r) => r.marginPct as number)));
  const radius = (r: DishMargin) => 6 + 12 * Math.sqrt(Math.max(0, r.margin ?? 0) / maxProfit);
  const shown = dots.find((r) => r.dishId === active);

  if (groups.size === 0) {
    return <p className="rounded-xl bg-surface-2/60 px-4 py-3 text-[13px] text-ink-3 ring-1 ring-hairline ring-inset">The chart needs at least 4 dishes with costed sales in this period. The list view still shows every dish.</p>;
  }

  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Legend">
        {(Object.keys(GROUP_LABEL) as Group[]).map((g) => (
          <li key={g} className="flex items-center gap-1.5" title={GROUP_LABEL[g].hint}>
            <span className={cx('size-2.5 rounded-full', SWATCH[g])} aria-hidden /> {GROUP_LABEL[g].label}
          </li>
        ))}
      </ul>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="group" aria-label="Dishes by units sold and margin percent">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(maxPct * f)} y2={y(maxPct * f)} className="stroke-hairline" />
              <text x={PAD.l - 8} y={y(maxPct * f) + 4} textAnchor="end" className="fill-ink-3 text-[11px]">{Math.round(maxPct * f * 100)}%</text>
            </g>
          ))}
          <line x1={medX} x2={medX} y1={PAD.t} y2={H - PAD.b} className="stroke-hairline-strong" strokeDasharray="4 4" />
          <line x1={PAD.l} x2={W - PAD.r} y1={medY} y2={medY} className="stroke-hairline-strong" strokeDasharray="4 4" />
          {(Object.keys(CORNER) as Group[]).map((g) => (
            <text key={g} x={CORNER[g].x} y={CORNER[g].y} textAnchor={CORNER[g].anchor} className="fill-ink-4 text-[11px] font-semibold uppercase tracking-wider">{GROUP_LABEL[g].label}</text>
          ))}
          <text x={PAD.l + IN_W / 2} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[12px]">Units sold →</text>
          <text transform={`translate(12 ${PAD.t + IN_H / 2}) rotate(-90)`} textAnchor="middle" className="fill-ink-3 text-[12px]">Margin % →</text>

          {dots.map((r) => (
            <circle
              key={r.dishId}
              cx={x(r.units)}
              cy={y(r.marginPct as number)}
              r={radius(r)}
              strokeWidth={2}
              tabIndex={0}
              aria-label={`${r.name}: ${r.units} sold, ${Math.round((r.marginPct as number) * 100)}% margin`}
              className={cx('stroke-surface outline-none focus-visible:stroke-ink', FILL[groups.get(r.dishId) as Group], active === r.dishId ? 'opacity-100' : 'opacity-85')}
              onMouseEnter={() => setActive(r.dishId)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(r.dishId)}
              onBlur={() => setActive(null)}
            />
          ))}
        </svg>

        {shown && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-full rounded-xl bg-surface-3 p-3 text-[12.5px] shadow-lg ring-1 ring-hairline-strong ring-inset"
            style={{ left: `${Math.min(85, Math.max(15, (x(shown.units) / W) * 100))}%`, top: `${((y(shown.marginPct as number) - radius(shown) - 6) / H) * 100}%` }}
          >
            <p className="font-semibold text-ink">{shown.name}</p>
            <p className="text-ink-2">{shown.units} sold · {Math.round((shown.marginPct as number) * 100)}% margin</p>
            <p className="text-ink-2">{money(shown.margin ?? 0)} profit</p>
            <p className="text-ink-3">{shown.avgRating !== null && shown.ratingCount >= MIN_RATINGS ? `★ ${shown.avgRating.toFixed(1)} · ${shown.ratingCount} reviews` : 'Too few reviews to judge'}</p>
          </div>
        )}
      </div>
      <p className="mt-2 text-[12.5px] text-ink-3">
        Dot size is profit. Dashed lines are the medians that split the groups.
        {rows.filter((r) => r.units > 0).length > dots.length && ` ${rows.filter((r) => r.units > 0).length - dots.length} sold dishes can't be fully costed and aren't plotted.`}
      </p>
    </div>
  );
}
