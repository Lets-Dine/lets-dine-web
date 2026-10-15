import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchMargins, fetchQuality, loadMarginTarget, saveMarginTarget } from '../../api/inventory';
import { fetchSuppliers } from '../../api/suppliers';
import type { DishMargin, LotQuality } from '../../api/inventory';
import { ADMIN_GHOST, INPUT_BOX, Loading, PANEL, PageTitle, Segmented } from '../../components/admin/kit';
import { Bike, Check, Contact, Plate, Receipt, Search, Send, TrendUp } from '../../components/icons';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useAuth } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

/**
 * The checks that look back at what already happened: dishes whose profit ingredient prices have
 * squeezed, and deliveries that ended up in poorly rated dishes. One queue says what needs a decision
 * and why; the tables underneath hold everything else, so a flag can never hide in a long list.
 */

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const dishName = (r: DishMargin) => (r.variantName ? `${r.name} · ${r.variantName}` : r.name);
const dishKey = (r: DishMargin) => `${r.dishId}:${r.variantName ?? ''}`;
const ROWS_SHOWN = 10;
const NO_DISHES: DishMargin[] = [];
const NO_LOTS: LotQuality[] = [];

type Kind = 'margin' | 'rising' | 'missing' | 'delivery';

interface Issue {
  key: string;
  kind: Kind;
  /** Also true on a low-margin dish whose ingredient cost is climbing, so the Costs rising filter still finds it. */
  rising?: boolean;
  title: string;
  detail: ReactNode;
  /** Quiet links under the detail: the people to talk to about it. */
  extra?: ReactNode;
  action?: { to: string; label: string };
}

const KINDS: Record<Kind, { label: string; filter: string; tone: 'bad' | 'warn'; Icon: typeof Plate }> = {
  margin: { label: 'Low margin', filter: 'Low margin', tone: 'bad', Icon: Plate },
  delivery: { label: 'Poor reviews', filter: 'Deliveries', tone: 'bad', Icon: Bike },
  rising: { label: 'Cost rising', filter: 'Costs rising', tone: 'warn', Icon: TrendUp },
  missing: { label: 'No price', filter: 'Missing prices', tone: 'warn', Icon: Receipt },
};
const KIND_ORDER: Kind[] = ['margin', 'delivery', 'rising', 'missing'];

// The tolerance keeps a real 5% rise (0.42 / 0.40 - 1 = 0.04999…) from slipping under the line.
const risingDriver = (r: DishMargin) => r.drivers.find((d) => d.changeSincePrevious !== null && d.changeSincePrevious >= 0.05 - 1e-9);
// Compared as displayed, so a dish never reads "60% (target 60%)" and yet is flagged.
const isThin = (r: DishMargin, target: number) => Math.round(r.margin * 100) < target;

export function Watchlist() {
  const { menu } = useDashboard();
  const currency = menu.restaurant.currency;
  const [target, setTarget] = useState(loadMarginTarget);
  // What is typed may be empty or out of range; only a valid value becomes the target.
  const [draft, setDraft] = useState(String(target));
  const [days, setDays] = useState('30');
  const margins = useAsync(fetchMargins, []);
  const quality = useAsync(() => fetchQuality(Number(days)), [days]);
  // Phone numbers for the suppliers named on flagged deliveries; the links just don't appear if this can't load.
  const suppliers = useAsync(() => fetchSuppliers().catch(() => []), []);
  const canManage = useAuth().allows('inventory:manage');

  const dishes = margins.data ?? NO_DISHES;
  const lots = quality.data ?? NO_LOTS;

  const issues = useMemo(() => {
    const out: Issue[] = [];
    const priced = dishes.filter((r) => r.missing.length === 0);
    for (const r of [...priced].sort((a, b) => a.margin - b.margin)) {
      const top = r.drivers[0];
      const rising = risingDriver(r);
      const thin = isThin(r, target);
      if (!thin && !rising) continue;
      const rise = rising && rising.changeSincePrevious !== null && (
        <>
          {rising.ingredientName} is up <b className="tnum">{pct(rising.changeSincePrevious)}</b> since the delivery before.
        </>
      );
      out.push({
        key: `d:${dishKey(r)}`,
        kind: thin ? 'margin' : 'rising',
        rising: Boolean(rising),
        title: dishName(r),
        detail: thin ? (
          <>
            Keeps <b className="tnum">{pct(r.margin)}</b> of its price (target {target}%). Sells for <span className="tnum">{formatMoney(r.price, currency)}</span>, costs{' '}
            <span className="tnum">{formatMoney(r.cost, currency)}</span>
            {top && (
              <>
                ; {top.ingredientName} is <span className="tnum">{pct(top.share)}</span> of that
              </>
            )}
            . {rise}
          </>
        ) : (
          <>
            Still keeps <span className="tnum">{pct(r.margin)}</span>, but {rise}
          </>
        ),
        action: { to: `/admin/menu/${r.dishId}`, label: 'Edit dish' },
      });
    }
    for (const lot of lots.filter((l) => l.flagged)) {
      out.push({
        key: `l:${lot.lotId}`,
        kind: 'delivery',
        title: `${lot.ingredientName} · delivered ${day(lot.receivedAt)}`,
        detail: (
          <>
            <b className="tnum">
              {lot.poorCount} of {lot.reviewCount}
            </b>{' '}
            reviews of dishes made with it were poor ({pct(lot.poorRate)}, against {pct(lot.baselineRate)} for other {lot.ingredientName.toLowerCase()}). Ask {lot.supplier ?? 'whoever supplied it'} about this
            batch.
          </>
        ),
        extra: lot.supplier && <SupplierLinks name={lot.supplier} phone={suppliers.data?.find((s) => s.name === lot.supplier)?.phone ?? ''} />,
        // What is left of the delivery can go back; once it is used up, the ingredient is the place to look at it.
        action: !canManage
          ? { to: '/admin/inventory', label: 'Open stock' }
          : lot.canReturn
            ? { to: `/admin/inventory?open=${lot.ingredientId}&tool=return&lot=${lot.lotId}`, label: 'Return to supplier' }
            : { to: `/admin/inventory?open=${lot.ingredientId}`, label: `Open ${lot.ingredientName}` },
      });
    }
    for (const r of dishes.filter((x) => x.missing.length > 0)) {
      out.push({
        key: `m:${dishKey(r)}`,
        kind: 'missing',
        title: dishName(r),
        detail: (
          <>
            No price yet for {r.missing.join(', ')}, so its margin can’t be worked out.
            {isThin(r, target) && <> What is priced already leaves only {pct(r.margin)}, so the real margin is lower.</>} Enter what you paid when you next receive it.
          </>
        ),
        action: { to: '/admin/inventory', label: 'Receive delivery' },
      });
    }
    return out.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  }, [dishes, lots, target, currency, suppliers.data, canManage]);

  const [filter, setFilter] = useState<Kind | 'all'>('all');
  const inKind = (i: Issue, k: Kind) => i.kind === k || (k === 'rising' && i.rising === true);
  const counts = (k: Kind) => issues.filter((i) => inKind(i, k)).length;
  // A filter whose group has emptied falls back to All instead of leaving a blank list.
  const active = filter !== 'all' && counts(filter) === 0 ? 'all' : filter;
  const shown = active === 'all' ? issues : issues.filter((i) => inKind(i, active));

  const loading = (margins.loading && !margins.data) || (quality.loading && !quality.data);
  const failed = margins.error ?? quality.error;
  // One half failing must never read as "all clear" — say which half is missing.
  const missingParts = [margins.error && 'dish margins', quality.error && 'delivery reviews'].filter(Boolean).join(' and ');
  const incomplete = Boolean(margins.error || quality.error);

  return (
    <>
      <PageTitle title="Watchlist" purpose="What needs your attention." subtitle="Dishes that earn too little after ingredient prices, and deliveries that disappointed diners. Check weekly." />

      {loading ? (
        <Loading />
      ) : failed && !margins.data && !quality.data ? (
        <div className={cx(PANEL, 'flex flex-wrap items-center gap-3 p-4 sm:p-5')}>
          <p className="min-w-0 flex-1 text-[14px]">The watchlist couldn’t load. {failed.message}</p>
          <button
            type="button"
            className={ADMIN_GHOST}
            onClick={() => {
              margins.reload();
              quality.reload();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="grid gap-8">
          <section aria-labelledby="attn-h" className="grid gap-3">
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1">
                <h2 id="attn-h" className="text-[18px] font-semibold tracking-tight">
                  {issues.length === 0 ? (incomplete ? 'Nothing flagged in what loaded' : 'Nothing needs attention') : `${issues.length} thing${issues.length === 1 ? '' : 's'} need${issues.length === 1 ? 's' : ''} attention`}
                </h2>
                <p className="mt-0.5 text-[13.5px] text-ink-3">
                  Checked {dishes.length} dish{dishes.length === 1 ? '' : 'es'} and {lots.length} reviewed deliver{lots.length === 1 ? 'y' : 'ies'} from the last {days} days.{quality.loading && ' Updating deliveries…'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3">
                <label className="flex items-center gap-2">
                  Warn below
                  <input
                    className={cx(INPUT_BOX, 'h-9 w-16 py-0 text-center tnum')}
                    inputMode="numeric"
                    value={draft}
                    aria-label="Profit percent to warn below"
                    onChange={(e) => {
                      const text = e.target.value.replace(/\D/g, '').slice(0, 2);
                      setDraft(text);
                      const next = Number.parseInt(text || '0', 10);
                      if (next >= 1 && next <= 95) {
                        setTarget(next);
                        saveMarginTarget(next);
                      }
                    }}
                    onBlur={() => setDraft(String(target))}
                  />
                  % left over
                </label>
                <span className="flex items-center gap-2">
                  Delivery reviews from
                  <Segmented label="Delivery review period" value={days} onChange={setDays} options={PERIODS} />
                </span>
              </div>
            </div>

            {incomplete && (
              <div role="alert" className={cx(PANEL, 'flex flex-wrap items-center gap-3 p-3.5 sm:px-5')}>
                <p className="min-w-0 flex-1 text-[13.5px] text-berry-ink">The {missingParts} couldn’t load, so this list is incomplete.</p>
                <button
                  type="button"
                  className={ADMIN_GHOST}
                  onClick={() => {
                    margins.reload();
                    quality.reload();
                  }}
                >
                  Try again
                </button>
              </div>
            )}

            {issues.length > 0 && (
              <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-2">
                <FilterChip on={active === 'all'} onClick={() => setFilter('all')} label="All" count={issues.length} />
                {KIND_ORDER.map((k) => (
                  <FilterChip key={k} on={active === k} onClick={() => setFilter(k)} label={KINDS[k].filter} count={counts(k)} tone={counts(k) > 0 ? KINDS[k].tone : undefined} />
                ))}
              </div>
            )}

            {issues.length === 0 && incomplete ? null : issues.length === 0 ? (
              <div className={cx(PANEL, 'flex items-start gap-3 p-4 sm:p-5')}>
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-mint/20 text-mint-ink">
                  <Check size={16} />
                </span>
                <p className="max-w-[62ch] text-[14px] leading-relaxed text-docket-inksoft">
                  {dishes.length === 0
                    ? 'Nothing to check yet. A margin needs a recipe on the dish and a price on each ingredient — prices come from the amount you enter when you receive a delivery.'
                    : `Every priced dish keeps at least ${target}% and no delivery stands out. This updates as ingredient prices and reviews come in.`}
                </p>
              </div>
            ) : shown.length === 0 ? (
              <p className="px-1 text-[13.5px] text-ink-3">Nothing in this group.</p>
            ) : (
              <ul className={cx(PANEL, 'overflow-hidden', quality.loading && 'opacity-60 transition-opacity')} aria-busy={quality.loading}>
                {shown.map((i, n) => (
                  <IssueRow key={i.key} issue={i} delay={Math.min(n, 10) * 45} />
                ))}
              </ul>
            )}
          </section>

          <Everything dishes={dishes} lots={lots} target={target} currency={currency} days={days} />
        </div>
      )}
    </>
  );
}

function FilterChip({ on, onClick, label, count, tone }: { on: boolean; onClick: () => void; label: string; count: number; tone?: 'bad' | 'warn' }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-2 rounded-full px-3 text-[13px] font-semibold ring-1 ring-inset transition-move',
        on ? 'bg-surface-3 text-ink ring-ink/25' : 'bg-surface-2 text-ink-3 ring-hairline hover:text-ink-2',
      )}
    >
      {label}
      <span className={cx('tnum rounded-md px-1.5 text-[12px]', tone === 'bad' ? 'bg-berry/14 text-berry-ink' : tone === 'warn' ? 'bg-gold/20 text-gold-ink' : 'text-ink-4')}>{count}</span>
    </button>
  );
}

/** The supplier behind a flagged delivery: their page, and a call or message when a number is saved. */
function SupplierLinks({ name, phone }: { name: string; phone: string }) {
  const digits = phone.replace(/\D/g, '');
  const link = 'inline-flex items-center gap-1 font-semibold text-docket-ink underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-flame-2/60';
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
      <Link to={`/admin/suppliers/${encodeURIComponent(name)}`} className={link}>
        {name}
      </Link>
      {digits && (
        <>
          <a href={`tel:${digits}`} className={link}>
            <Contact size={13} /> Call
          </a>
          <a href={`https://wa.me/${digits.length === 10 ? '977' + digits : digits}`} target="_blank" rel="noreferrer" className={link}>
            <Send size={13} /> WhatsApp
          </a>
        </>
      )}
    </p>
  );
}

function IssueRow({ issue, delay }: { issue: Issue; delay: number }) {
  const { label, tone, Icon } = KINDS[issue.kind];
  return (
    <li style={{ animationDelay: `${delay}ms` }} className="animate-rise grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-docket-line px-4 py-3.5 last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <span className={cx('mt-0.5 grid size-8 place-items-center rounded-full sm:mt-0', tone === 'bad' ? 'bg-berry/14 text-berry-ink' : 'bg-gold/20 text-gold-ink')}>
        <Icon size={16} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <span title={issue.title} className="min-w-0 truncate text-[15px] font-semibold text-docket-ink">
            {issue.title}
          </span>
          <span className={cx('text-[12px] font-bold', tone === 'bad' ? 'text-berry-ink' : 'text-gold-ink')}>{label}</span>
        </div>
        <p className="mt-0.5 max-w-[78ch] text-[13px] leading-relaxed text-docket-inksoft">{issue.detail}</p>
        {issue.extra}
      </div>
      {issue.action && (
        <Link
          to={issue.action.to}
          className="col-start-2 justify-self-start text-[13px] font-semibold text-flame-1 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-flame-2/60 sm:col-start-3 sm:justify-self-end"
        >
          {issue.action.label}
        </Link>
      )}
    </li>
  );
}

/* ── Everything else ───────────────────────────────────────────────── */

type Tab = 'dishes' | 'deliveries';

function Everything({ dishes, lots, target, currency, days }: { dishes: DishMargin[]; lots: LotQuality[]; target: number; currency: string; days: string }) {
  const [tab, setTab] = useState<Tab>('dishes');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'margin' | 'name'>('margin');
  const [all, setAll] = useState(false);

  const q = query.trim().toLowerCase();
  const dishRows = useMemo(() => {
    const rows = dishes.filter((r) => dishName(r).toLowerCase().includes(q));
    // Unpriced dishes have no real margin, so they sit last under a margin sort.
    return rows.sort((a, b) =>
      sort === 'name'
        ? dishName(a).localeCompare(dishName(b))
        : Number(a.missing.length > 0) - Number(b.missing.length > 0) || a.margin - b.margin,
    );
  }, [dishes, q, sort]);
  const lotRows = useMemo(
    () => lots.filter((l) => l.ingredientName.toLowerCase().includes(q)).sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.poorRate - a.poorRate),
    [lots, q],
  );

  const rows = tab === 'dishes' ? dishRows : lotRows;
  const visible = all ? rows : rows.slice(0, ROWS_SHOWN);

  return (
    <section aria-labelledby="all-h" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <h2 id="all-h" className="text-[18px] font-semibold tracking-tight">
          Everything
        </h2>
        <Segmented
          label="What to list"
          value={tab}
          onChange={(t) => {
            setTab(t);
            setQuery('');
            setAll(false);
          }}
          options={[
            { value: 'dishes', label: `Dishes · ${dishes.length}` },
            { value: 'deliveries', label: `Deliveries · ${lots.length}` },
          ]}
        />
        <div className="relative ml-auto w-full sm:w-64">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4">
            <Search size={15} />
          </span>
          <input
            className={cx(INPUT_BOX, 'h-10 py-0 pl-9')}
            placeholder={tab === 'dishes' ? 'Find a dish' : 'Find an ingredient'}
            aria-label={tab === 'dishes' ? 'Find a dish' : 'Find an ingredient'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {tab === 'dishes' && (
          <Segmented
            label="Sort dishes"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'margin', label: 'Lowest margin' },
              { value: 'name', label: 'A–Z' },
            ]}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <p className="px-1 text-[13.5px] text-ink-3">
          {q ? 'No match.' : tab === 'dishes' ? 'No dishes with a recipe yet. Add one from the menu.' : `No delivery has been reviewed in the last ${days} days.`}
        </p>
      ) : (
        <div className={cx(PANEL, 'overflow-hidden')}>
          {tab === 'dishes' ? (
            <>
              <HeadRow cols={DISH_COLS} labels={['Dish', 'Price', 'Cost', 'Margin', 'Biggest cost']} />
              {(visible as DishMargin[]).map((r, n) => (
                <DishRow key={dishKey(r)} r={r} target={target} currency={currency} delay={Math.min(n, 10) * 45} />
              ))}
            </>
          ) : (
            <>
              <HeadRow cols={LOT_COLS} labels={['Ingredient', 'Delivered', 'Poor reviews', 'Other deliveries', 'Verdict']} />
              {(visible as LotQuality[]).map((l, n) => (
                <LotRow key={l.lotId} l={l} delay={Math.min(n, 10) * 45} />
              ))}
            </>
          )}
        </div>
      )}

      {rows.length > ROWS_SHOWN && (
        <button type="button" className="justify-self-start text-[13px] font-semibold text-flame-1 underline-offset-4 hover:underline" onClick={() => setAll((v) => !v)}>
          {all ? `Show fewer` : `Show all ${rows.length}`}
        </button>
      )}

      <p className="max-w-[72ch] px-1 text-[12.5px] leading-relaxed text-ink-4">
        {tab === 'dishes'
          ? 'Cost is the recipe at each ingredient’s latest delivery price. Add-ons aren’t included, and the warning level is saved on this device.'
          : 'A rating of 2 stars or lower on taste or overall counts as poor. A delivery is flagged only when it is at least twice as bad as the same ingredient’s other deliveries, with four or more reviews behind it.'}
      </p>
    </section>
  );
}

const DISH_COLS = 'sm:grid-cols-[minmax(0,1.6fr)_5.5rem_5.5rem_9.5rem_minmax(0,1fr)]';
const LOT_COLS = 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_7.5rem_8rem]';

function HeadRow({ cols, labels }: { cols: string; labels: string[] }) {
  return (
    <div className={cx('hidden gap-x-4 border-b border-docket-line bg-surface-2/40 px-5 py-2 text-[12px] font-semibold text-ink-3 sm:grid', cols)}>
      {labels.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </div>
  );
}

function DishRow({ r, target, currency, delay }: { r: DishMargin; target: number; currency: string; delay: number }) {
  const unpriced = r.missing.length > 0;
  const thin = !unpriced && isThin(r, target);
  const rising = !unpriced && risingDriver(r);
  const top = r.drivers[0];
  const tags = [
    unpriced && { text: 'No price', cls: 'text-gold-ink' },
    thin && { text: 'Low margin', cls: 'text-berry-ink' },
    rising && { text: 'Cost rising', cls: 'text-gold-ink' },
  ].filter((t): t is { text: string; cls: string } => Boolean(t));
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={cx('animate-rise grid gap-x-4 gap-y-1 border-b border-docket-line px-4 py-3 text-[13.5px] last:border-0 sm:items-center sm:px-5', DISH_COLS)}>
      <div className="flex min-w-0 items-baseline gap-2">
        <Link to={`/admin/menu/${r.dishId}`} title={dishName(r)} className="min-w-0 truncate text-[14.5px] font-semibold text-docket-ink underline-offset-4 hover:underline">
          {dishName(r)}
        </Link>
        {tags.map((t) => (
          <span key={t.text} className={cx('shrink-0 text-[12px] font-bold', t.cls)}>
            {t.text}
          </span>
        ))}
      </div>
      <span className="tnum text-docket-inksoft sm:text-docket-ink">
        <span className="sm:hidden">Price </span>
        {formatMoney(r.price, currency)}
      </span>
      <span className="tnum text-docket-inksoft sm:text-docket-ink">
        <span className="sm:hidden">Cost </span>
        {unpriced ? '—' : formatMoney(r.cost, currency)}
      </span>
      {unpriced ? (
        <span className="text-docket-inksoft">Missing: {r.missing.join(', ')}</span>
      ) : (
        <div className="flex items-center gap-2" role="img" aria-label={`${pct(r.margin)} of the price left`}>
          <div className="h-1.5 w-20 shrink-0 rounded-full bg-docket-line">
            <div className={cx('h-full rounded-full', thin ? 'bg-berry' : 'bg-mint')} style={{ width: `${Math.max(2, Math.min(100, r.margin * 100))}%` }} />
          </div>
          <span className={cx('tnum font-bold', thin ? 'text-berry-ink' : 'text-docket-ink')}>{pct(r.margin)}</span>
        </div>
      )}
      <span className="min-w-0 truncate text-docket-inksoft">{!unpriced && top ? <><span className="sm:hidden">Biggest cost: </span>{top.ingredientName} · {pct(top.share)}</> : ''}</span>
    </div>
  );
}

function LotRow({ l, delay }: { l: LotQuality; delay: number }) {
  const verdict = l.flagged ? { text: 'Worse than usual', cls: 'text-berry-ink' } : l.reviewCount < 4 ? { text: 'Too few reviews', cls: 'text-docket-inksoft' } : { text: 'Normal', cls: 'text-docket-ink' };
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={cx('animate-rise grid gap-x-4 gap-y-1 border-b border-docket-line px-4 py-3 text-[13.5px] last:border-0 sm:items-center sm:px-5', LOT_COLS)}>
      <span title={l.ingredientName} className="truncate text-[14.5px] font-semibold text-docket-ink">
        {l.ingredientName}
      </span>
      <span className="min-w-0 truncate text-docket-inksoft">
        {day(l.receivedAt)}
        {l.supplier ? ` · ${l.supplier}` : ' · opening stock'}
      </span>
      <span className="tnum">
        <b>{l.poorCount}</b> of {l.reviewCount} poor <span className="text-docket-inksoft">({pct(l.poorRate)})</span>
      </span>
      <span className="tnum text-docket-inksoft">
        <span className="sm:hidden">Other deliveries: </span>
        {pct(l.baselineRate)}
      </span>
      <span className={cx('font-bold', verdict.cls)}>{verdict.text}</span>
    </div>
  );
}
