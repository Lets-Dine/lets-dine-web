import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GROUP_LABEL, MIN_COVERAGE, MIN_RATINGS, advise, fetchDishMargins, groupDishes, isLukewarm, targetMargin } from '../../api/dishMargins';
import type { DishMargin, Group, MarginSort } from '../../api/dishMargins';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { MarginScatter } from '../../components/admin/MarginScatter';
import { ADMIN_GHOST, Empty, Loading, Select } from '../../components/admin/kit';
import { Block } from '../../components/admin/profile';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

const DAY = 86_400_000;
const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const SORTS: { value: MarginSort; label: string }[] = [
  { value: 'marginPct', label: 'Best margin %' },
  { value: 'margin', label: 'Most profit' },
  { value: 'units', label: 'Most sold' },
  { value: 'name', label: 'Name, A–Z' },
];

const GROUP_TONE: Record<Group, string> = {
  star: 'bg-mint/14 text-mint-ink',
  plowhorse: 'bg-gold/20 text-gold',
  puzzle: 'bg-flame-2/15 text-flame-1',
  dog: 'bg-berry/14 text-berry-ink',
};

const rangeOf = (r: Range) => {
  const to = new Date();
  if (r === 'month') return { from: new Date(to.getFullYear(), to.getMonth(), 1), to };
  return { from: new Date(to.getTime() - Number(r) * DAY), to };
};

/** What each dish costs to make against what it sells for — food cost only, worked out from the stock the orders actually used. */
export function DishMargins() {
  const { menu } = useDashboard();
  const currency = menu.restaurant.currency;
  const money = (v: number) => formatMoney(v, currency);
  const [range, setRange] = useState<Range>('30');
  const [view, setView] = useState<'list' | 'chart'>('list');
  const [sortBy, setSortBy] = useState<MarginSort>('marginPct');
  const list = useAsync(() => fetchDishMargins({ ...rangeOf(range), sortBy }), [range, sortBy]);

  if (list.error && !list.data) return <Empty emoji="⚠️" title="Couldn't load dish margins" message={list.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={list.reload}>Try again</button>} />;
  if (!list.data) return <Loading label="Working out what each dish costs…" />;

  const rows = list.data.rows;
  const groups = groupDishes(rows);
  const sold = rows.filter((r) => r.units > 0);
  const target = targetMargin(rows);
  const unknown = sold.filter((r) => r.coverage < MIN_COVERAGE);

  const attention = rows.filter((r) => ['plowhorse', 'dog'].includes(groups.get(r.dishId) ?? '')).length;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Dish margins</h1>
      <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[40ch]">
        Food cost against price, from the stock your orders actually used. Labour, rent, discounts and tax are not included.
      </p>

      <div className="mt-5 flex animate-rise flex-wrap items-center gap-2 [animation-delay:120ms]">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
          {RANGES.map((r) => (
            <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)} className={cx(CHIP, range === r.value ? CHIP_ON : CHIP_OFF)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="flex gap-2" role="group" aria-label="View">
            {(['list', 'chart'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx(CHIP, view === v ? CHIP_ON : CHIP_OFF)}>
                {v === 'list' ? 'List' : 'Chart'}
              </button>
            ))}
          </div>
          {view === 'list' && <Select value={sortBy} onChange={(v) => setSortBy(v as MarginSort)} options={SORTS} aria-label="Sort dishes" />}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="mt-10"><Empty emoji="🍽️" title="No dishes yet" message="Add dishes to the menu and they'll show up here once they sell." /></div>
      ) : (
        <>
          <section aria-label="The three answers" className="mt-10 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
            <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
              <Cell title="Dishes sold" sub={`Of ${rows.length} on the menu`}>{String(sold.length)}</Cell>
              <Cell title="Typical margin" sub="What the middle dish earns" good>{target === null ? '—' : `${Math.round(target * 100)}%`}</Cell>
              <Cell title="Needs attention" sub="Plowhorses and Dogs" bad={attention > 0}>{String(attention)}</Cell>
            </div>
          </section>

          <div className="mt-6 grid gap-6">
            <NeedsAttention rows={rows} groups={groups} />

            {unknown.length > 0 && (
              <p role="note" className="animate-rise rounded-2xl bg-surface-2/60 px-5 py-4 text-[14px] leading-relaxed text-ink-3 ring-1 ring-hairline ring-inset [animation-delay:280ms]">
                {unknown.length} of {sold.length} dishes that sold can't be fully costed yet — they have no recipe, or their stock was bought without a price. Add a recipe or a price to see their margin.
              </p>
            )}

            <Block title={view === 'chart' ? 'Margin against sales' : 'Every dish'} hint={view === 'list' ? 'Tap a name to edit' : undefined} delay={340}>
              {view === 'chart' ? (
                <MarginScatter rows={rows} groups={groups} money={money} />
              ) : (
                <ul className="border-t border-hairline">
                  {rows.map((r) => (
                    <Row key={r.dishId} r={r} group={groups.get(r.dishId)} target={target} money={money} />
                  ))}
                </ul>
              )}
            </Block>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ title, sub, good, bad, children }: { title: string; sub: string; good?: boolean; bad?: boolean; children: string }) {
  return (
    <div className="px-6 py-6">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', good && 'text-mint-ink', bad && 'text-berry-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

const SHOWN = 5;

/** The dishes worth acting on first, each linking to its editor: what Plowhorses and Dogs are doing to the menu, and Stars diners aren't happy with. */
function NeedsAttention({ rows, groups }: { rows: DishMargin[]; groups: Map<string, Group> }) {
  const sections = [
    { key: 'plowhorse', label: 'Plowhorses — sell well, earn little', dishes: rows.filter((r) => groups.get(r.dishId) === 'plowhorse') },
    { key: 'dog', label: 'Dogs — sell little, earn little', dishes: rows.filter((r) => groups.get(r.dishId) === 'dog') },
    { key: 'star', label: 'Stars diners are lukewarm on', dishes: rows.filter((r) => groups.get(r.dishId) === 'star' && isLukewarm(r)) },
  ].filter((s) => s.dishes.length > 0);
  if (sections.length === 0) return null;
  return (
    <Block title="Needs attention" hint="Act on these first" delay={260}>
      <ul className="grid gap-1.5 border-t border-hairline pt-3">
        {sections.map((s) => (
          <li key={s.key} className="text-[13.5px] text-ink-2">
            <span className="font-medium text-ink">{s.dishes.length}</span> {s.label}:{' '}
            {s.dishes.slice(0, SHOWN).map((d, i) => (
              <span key={d.dishId}>
                {i > 0 && ', '}
                <Link to={`/admin/menu/${d.dishId}`} className="font-semibold text-flame-1 hover:underline">{d.name}</Link>
              </span>
            ))}
            {s.dishes.length > SHOWN && ` and ${s.dishes.length - SHOWN} more`}
          </li>
        ))}
      </ul>
    </Block>
  );
}

function Row({ r, group, target, money }: { r: DishMargin; group?: Group; target: number | null; money: (v: number) => string }) {
  const known = r.marginPct !== null && r.coverage >= MIN_COVERAGE;
  const tip = advise(r, group, target, money);
  const pct = r.marginPct === null ? 0 : Math.max(0, Math.min(1, r.marginPct));
  return (
    <li className="grid gap-x-6 gap-y-2 border-b border-hairline py-4 last:border-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/menu/${r.dishId}`} className="truncate text-[16px] font-semibold hover:underline">
            {r.name}
          </Link>
          {group && (
            <span title={GROUP_LABEL[group].hint} className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold', GROUP_TONE[group])}>
              {GROUP_LABEL[group].label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {r.units > 0 ? `${r.units} sold · ${money(r.revenue)}` : 'Not sold in this period'} · price {money(r.price)}
          {r.recipeCost !== null && ` · recipe costs ${money(r.recipeCost)}`}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {r.avgRating === null ? 'No reviews yet' : (
            <>
              ★ {r.avgRating.toFixed(1)} · {r.ratingCount} {r.ratingCount === 1 ? 'review' : 'reviews'}
              {r.recommendRate !== null && ` · ${Math.round(r.recommendRate * 100)}% would order again`}
              {r.ratingCount < MIN_RATINGS && ' · too few to judge'}
            </>
          )}
        </p>
        {tip && <p className="mt-1 text-[13px] font-medium text-ink-2">{tip}</p>}
      </div>

      <div>
        {known ? (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`Margin ${Math.round(pct * 100)} percent`}>
              <div className="h-full rounded-full bg-flame-2" style={{ width: `${pct * 100}%` }} />
            </div>
            <p className="mt-1 text-[12.5px] text-ink-3">
              Cost {money(r.cost ?? 0)} of {money(r.revenue)}
              {r.coverage < 1 && ` · based on ${Math.round(r.coverage * 100)}% of sales`}
            </p>
          </>
        ) : r.units > 0 ? (
          <p className="text-[13px] text-ink-3">
            {r.coverage === 0 ? 'Cost unknown' : `Only ${Math.round(r.coverage * 100)}% of sales could be costed`} ·{' '}
            <Link to={`/admin/menu/${r.dishId}`} className="font-semibold text-flame-1 hover:underline">
              Add a recipe
            </Link>
          </p>
        ) : null}
      </div>

      <div className="text-right">
        {known ? (
          <>
            <p className="text-[20px] font-semibold tracking-tight tnum">{Math.round(pct * 100)}%</p>
            <p className="text-[12.5px] text-ink-3 tnum">{money(r.margin ?? 0)} profit</p>
          </>
        ) : (
          <p className="text-[20px] font-semibold text-ink-4">—</p>
        )}
      </div>
    </li>
  );
}
