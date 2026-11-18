import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  adjustStock,
  consumeStock,
  fetchConsumption,
  fetchExpiring,
  fetchIngredientSummary,
  fetchIngredients,
  fetchMargins,
  fetchPurchases,
  fetchWaste,
  formatQty,
  logWaste,
  receiveDelivery,
  returnStock,
  stockState,
  transferStock,
  updateIngredient,
  wasteLabel,
} from '../../api/inventory';
import type { ConsumptionSource, Ingredient, IngredientSummary } from '../../api/inventory';
import { fetchSuppliers, priceLabel } from '../../api/suppliers';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Loading, Segmented, useCommand } from '../../components/admin/kit';
import { PurchaseSheet } from '../../components/admin/PurchaseSheet';
import { Num } from '../../components/admin/profile';
import { ChevronLeft, ChevronRight } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useAuth } from '../../state/AuthContext';
import { useDashboard } from './AdminLayout';
import { IngredientSheet, Qty, STATE_COPY, TOOLS, UNIT_NAMES, dayOnly, describeMovement, pricePer, rise, usageTime } from './Inventory';
import type { Tool } from './Inventory';

const HISTORY_PAGE = 10;
const SOURCES: { value: ConsumptionSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'order', label: 'Dishes' },
  { value: 'manual', label: 'By hand' },
  { value: 'waste', label: 'Waste' },
];

const SKELETON = 'shimmer-bg animate-shimmer mt-4 h-20 rounded-xl';
const TH = 'px-3 py-2 text-[12px] font-semibold text-ink-3';
const H2 = 'text-[17px] font-semibold tracking-tight';
const PAGER = 'inline-flex h-8 items-center gap-0.5 rounded-full font-semibold text-flame-1 transition-move active:scale-95 disabled:pointer-events-none disabled:opacity-40';

/** A titled stretch of the main column, set off by a rule rather than boxed in a card. */
function Section({ title, aside, delay = 0, label, children }: { title: string; aside?: ReactNode; delay?: number; label?: string; children: ReactNode }) {
  return (
    <section aria-label={label ?? title} className="animate-rise border-t border-hairline pt-5" style={rise(delay)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className={H2}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One ingredient's own page: where it stands, who sells it cheapest, what is on the shelf, where it goes, and what it costs to lose. */
export function IngredientDetail() {
  const { ingredientId = '' } = useParams();
  const list = useAsync(fetchIngredients, []);
  const ing = list.data?.find((i) => i.id === ingredientId);

  if (list.error && !list.loading)
    return (
      <Empty
        emoji="⚠️"
        title="Couldn't load this ingredient"
        message={list.error.message}
        action={
          <button type="button" className={ADMIN_GHOST} onClick={list.reload}>
            Try again
          </button>
        }
      />
    );
  if (!list.data) return <Loading label="Opening the ingredient…" />;
  if (!ing)
    return (
      <Empty
        emoji="🔍"
        title="Ingredient not found"
        message="It may have been removed, or the link is out of date."
        action={
          <Link to="/admin/inventory" className={ADMIN_GHOST}>
            Back to stock
          </Link>
        }
      />
    );
  return <Page ing={ing} reload={list.reload} />;
}

function Page({ ing, reload }: { ing: Ingredient; reload: () => void }) {
  const { allows, staff } = useAuth();
  const { menu } = useDashboard();
  const { busy, run } = useCommand();
  const canManage = allows('inventory:manage');
  const currency = menu.restaurant.currency;
  const suppliers = useAsync(() => fetchSuppliers().catch(() => []), []);
  const otherBranches = (staff?.branches ?? []).filter((b) => b.id !== staff?.branchId);
  const state = stockState(ing);
  const copy = STATE_COPY[state];

  // A tool's form opens in the same sheet the stock grid uses. `version` re-reads every section after a change.
  const [tool, setTool] = useState<Tool | null>(null);
  const [version, setVersion] = useState(0);
  const [buyFrom, setBuyFrom] = useState<string | null>(null);
  const summary = useAsync(() => fetchIngredientSummary(ing.id).catch(() => null), [ing.id, version]).data;
  const tools = (Object.keys(TOOLS) as Tool[]).filter(
    (t) => t !== 'edit' && (t !== 'transfer' || (otherBranches.length > 0 && ing.quantity > 0)) && (t !== 'consume' || ing.quantity > 0) && (t !== 'waste' || ing.quantity > 0) && (t !== 'return' || ing.quantity > 0),
  );

  const act = (action: () => Promise<unknown>, message: string): Promise<boolean> =>
    run(ing.id, action, message).then((ok) => {
      if (ok) {
        setTool(null);
        setVersion((v) => v + 1);
        reload();
      }
      return ok;
    });

  // The bar runs to twice the warning level, with a tick where the warning sits.
  const level = ing.parLevel > 0 ? Math.min(1, ing.quantity / (ing.parLevel * 2)) : null;
  const last = summary?.lastMovement;

  return (
    <div className="w-full">
      <Link to="/admin/inventory" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
        ← Stock
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(36px,6vw,64px)] leading-[0.98] tracking-[-0.03em]')}>{ing.name}</h1>
          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-bold', copy.pill)}>
            <span className={cx('size-1.5 rounded-full', copy.bar)} aria-hidden />
            {copy.label}
          </span>
        </div>
        <p className="mt-4 max-w-[44ch] animate-rise text-[clamp(18px,2.4vw,24px)] leading-[1.3] font-medium text-ink-2 [animation-delay:60ms]">
          <Num>{formatQty(ing.quantity, ing.unit)}</Num> on the shelf
          {ing.parLevel > 0 && (
            <>
              , {state === 'ok' ? 'above' : 'under'} its warning level of <Num>{formatQty(ing.parLevel, ing.unit)}</Num>
            </>
          )}
          .
        </p>
        {level !== null && (
          <div className="mt-4 max-w-md animate-rise [animation-delay:100ms]" role="img" aria-label={`${formatQty(ing.quantity, ing.unit)} against a warning level of ${formatQty(ing.parLevel, ing.unit)}`}>
            <div className="relative h-2 overflow-hidden rounded-full bg-surface-3">
              <div className={cx('h-full origin-left animate-grow-x rounded-full', copy.bar)} style={{ width: `${Math.max(level * 100, ing.quantity > 0 ? 3 : 0)}%` }} />
              <span className="absolute inset-y-0 left-1/2 w-0.5 bg-ink/40" aria-hidden />
            </div>
            <p className="mt-1.5 flex justify-between text-[11.5px] text-ink-4">
              <span>0</span>
              <span>Warns at {formatQty(ing.parLevel, ing.unit)}</span>
            </p>
          </div>
        )}
        {canManage && (
          <nav aria-label="Actions" className="mt-5 flex animate-rise flex-wrap gap-2.5 [animation-delay:140ms]">
            {[...tools, 'edit' as const].map((t) => {
              const { Icon, short, title } = TOOLS[t];
              return (
                <button key={t} type="button" title={title} onClick={() => setTool(t)} className={cx(t === 'receive' && state !== 'ok' ? ADMIN_PRIMARY : ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')}>
                  <Icon size={16} />
                  {short}
                </button>
              );
            })}
          </nav>
        )}
      </header>

      <div key={version}>
        <Vitals ing={ing} summary={summary} currency={currency} />
        {last && (
          <p className="mt-4 animate-rise text-[13.5px] leading-relaxed text-ink-2" style={rise(260)}>
            <span className="font-semibold text-ink">Latest: </span>
            {describeMovement(last, ing.name, ing.unit)} <span className="whitespace-nowrap text-flame-1">{dayOnly.format(new Date(last.at))}</span>
          </p>
        )}

        <div className="mt-8 grid items-start gap-x-8 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="grid gap-8">
            <SupplierPrices ing={ing} currency={currency} onBuy={canManage ? setBuyFrom : undefined} />
            <Purchases ing={ing} currency={currency} />
            <History ing={ing} currency={currency} />
          </div>
          <aside className="grid gap-8 rounded-3xl bg-surface-2/50 px-5 py-5 ring-1 ring-hairline ring-inset">
            <Details ing={ing} summary={summary} currency={currency} />
            <ExpiringSoon ing={ing} currency={currency} />
            <UsedInDishes ing={ing} currency={currency} />
          </aside>
        </div>
      </div>

      {buyFrom && (
        <PurchaseSheet
          supplier={buyFrom}
          ingredientId={ing.id}
          currency={currency}
          onClose={() => setBuyFrom(null)}
          onSaved={() => {
            setVersion((v) => v + 1);
            reload();
          }}
        />
      )}

      {tool && (
        <IngredientSheet
          key={tool}
          ing={ing}
          initialTool={tool}
          currency={currency}
          supplierNames={(suppliers.data ?? []).map((x) => x.name)}
          branches={otherBranches}
          busy={busy}
          onClose={() => setTool(null)}
          dishes={menu.dishes.filter((d) => !d.isArchived).map((d) => ({ id: d.id, name: d.name }))}
          onReceive={(d) => void act(() => receiveDelivery(ing.id, d), `${ing.name} restocked`)}
          onConsume={(d) => void act(() => consumeStock(ing.id, d), `${ing.name} used`)}
          onWaste={(d) => void act(() => logWaste(ing.id, d), `${ing.name} thrown away`)}
          onRecount={(qty) => void act(() => adjustStock(ing.id, qty, ''), `${ing.name} corrected`)}
          onTransfer={(toBranchId, qty, where) => void act(() => transferStock(ing.id, toBranchId, qty), `${ing.name} sent to ${where}`)}
          onReturn={(d, supplier) => act(() => returnStock(ing.id, d), `${ing.name} sent back to ${supplier}`)}
          onEdit={(patch) => void act(() => updateIngredient(ing.id, patch), `${ing.name} saved`)}
        />
      )}
    </div>
  );
}

/** The numbers in one strip: what is here, what moved lately, how fast it goes, how long it lasts, what was lost. */
function Vitals({ ing, summary, currency }: { ing: Ingredient; summary: IngredientSummary | null; currency: string }) {
  const state = stockState(ing);
  const waste = useAsync(() => fetchWaste({ from: new Date(Date.now() - 30 * 864e5) }).catch(() => null), []);
  const days = summary?.days ?? 30;
  const perDay = summary && summary.days > 0 ? summary.stockOut / summary.days : null;
  const cover = perDay ? ing.quantity / perDay : null;
  const wasted = waste.data?.byIngredient.find((w) => w.ingredientId === ing.id);
  const dash = <span className="text-ink-4">-</span>;
  const qty = (n: number | undefined) => (n === undefined ? dash : <Qty value={n} unit={ing.unit} unitClassName="text-ink-3" />);
  const cells: { label: string; value: ReactNode; hint: string; tone?: string }[] = [
    { label: 'Current stock', value: qty(ing.quantity), hint: STATE_COPY[state].label, tone: state === 'ok' ? undefined : STATE_COPY[state].text },
    { label: 'Stock in', value: qty(summary?.stockIn), hint: `last ${days} days` },
    { label: 'Stock out', value: qty(summary?.stockOut), hint: `last ${days} days` },
    { label: 'Average use', value: perDay === null ? dash : <Qty value={Math.round(perDay)} unit={`${ing.unit}/day`} unitClassName="text-ink-3" />, hint: `over ${days} days` },
    {
      label: 'Lasts about',
      value: ing.quantity <= 0 ? 'Out' : cover === null ? dash : cover < 1 ? 'Under a day' : `${Math.floor(cover)} ${Math.floor(cover) === 1 ? 'day' : 'days'}`,
      hint: cover === null ? 'no recent use' : 'at that pace',
    },
    { label: 'Thrown away', value: waste.data ? qty(wasted?.quantity ?? 0) : dash, hint: wasted?.cost ? `${formatMoney(wasted.cost, currency)} lost, 30 days` : 'last 30 days' },
  ];
  return (
    <section aria-label="Stock figures" className="mt-8 animate-rise" style={rise(200)}>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-hairline ring-1 ring-hairline ring-inset sm:grid-cols-3 xl:grid-cols-6">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0 bg-surface px-4 py-3.5">
            <p className="truncate text-[12.5px] text-ink-3">{c.label}</p>
            <p className="mt-2 truncate text-[22px] leading-none tnum">{c.value}</p>
            <p className={cx('mt-1.5 truncate text-[11.5px] font-semibold', c.tone ?? 'text-ink-4')}>{c.hint}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Each supplier's price for this ingredient per kg / litre / piece, from its priced deliveries, cheapest first. */
function SupplierPrices({ ing, currency, onBuy }: { ing: Ingredient; currency: string; onBuy?: (supplier: string) => void }) {
  // ponytail: reads the last 50 deliveries (the API's cap); a supplier not seen in them is left out. Add a server aggregate if that bites.
  const purchases = useAsync(() => fetchPurchases(ing.id, 50).catch(() => null), [ing.id]);
  const rows = Object.values(
    (purchases.data ?? [])
      .filter((p) => p.kind === 'delivery' && p.supplier && p.cost && p.quantity > 0)
      .reduce<Record<string, { supplier: string; latest: number; latestAt: string; low: number; sum: number; qty: number; count: number }>>((acc, p) => {
        const unit = p.cost! / p.quantity;
        const r = acc[p.supplier!] ?? { supplier: p.supplier!, latest: unit, latestAt: p.at, low: unit, sum: 0, qty: 0, count: 0 };
        if (p.at > r.latestAt) [r.latest, r.latestAt] = [unit, p.at];
        r.low = Math.min(r.low, unit);
        r.sum += p.cost!;
        r.qty += p.quantity;
        r.count += 1;
        acc[p.supplier!] = r;
        return acc;
      }, {}),
  ).sort((a, b) => a.latest - b.latest);
  const best = rows[0]?.latest ?? 0;
  const worst = rows[rows.length - 1]?.latest ?? 0;
  return (
    <Section title="Supplier prices" delay={300}>
      {!purchases.data ? (
        purchases.loading ? <div role="status" aria-label="Loading prices" className={SKELETON} /> : <p className="mt-2 text-[13px] text-ink-3">Couldn't load the prices. Refresh to try again.</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">No priced delivery from a named supplier yet, so there is nothing to compare.</p>
      ) : (
        <>
          {rows.length > 1 && (
            <p className="mt-1.5 text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">{rows[0].supplier}</span> is cheapest on its latest delivery, {priceLabel(worst - best, ing.unit, currency).replace(' per', ' less per')} than {rows[rows.length - 1].supplier}.
            </p>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>Supplier</th>
                  <th className={cx(TH, 'text-right')}>Latest</th>
                  <th className={cx(TH, 'text-right')}>Average</th>
                  <th className={cx(TH, 'text-right')}>Lowest</th>
                  {onBuy && <th className={TH}><span className="sr-only">Buy</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.supplier} className="border-t border-hairline">
                    <td className="max-w-[12rem] px-3 py-3">
                      <Link to={`/admin/suppliers/${encodeURIComponent(r.supplier)}`} className="block truncate font-semibold hover:underline">
                        {r.supplier}
                      </Link>
                      <span className="block text-[12px] text-ink-3">
                        {r.count} {r.count === 1 ? 'delivery' : 'deliveries'} · last {dayOnly.format(new Date(r.latestAt))}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tnum">
                      <span className="font-semibold">{priceLabel(r.latest, ing.unit, currency)}</span>
                      <span className="mt-1.5 ml-auto block h-1 w-20 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                        <span className={cx('block h-full rounded-full', i === 0 ? 'bg-mint' : 'bg-ink-4')} style={{ width: `${Math.max(8, (r.latest / worst) * 100)}%` }} />
                      </span>
                      <span className={cx('mt-1 block text-[12px]', i === 0 ? 'text-mint-ink' : 'text-berry-ink')}>{i === 0 ? (rows.length > 1 ? 'Cheapest' : '') : `+${Math.round(((r.latest - best) / best) * 100)}%`}</span>
                    </td>
                    <td className="px-3 py-3 text-right text-ink-3 tnum">{priceLabel(r.sum / r.qty, ing.unit, currency)}</td>
                    <td className="px-3 py-3 text-right text-ink-3 tnum">{priceLabel(r.low, ing.unit, currency)}</td>
                    {onBuy && (
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => onBuy(r.supplier)} aria-label={`Buy ${ing.name} from ${r.supplier}`} className={cx(i === 0 ? ADMIN_PRIMARY : ADMIN_GHOST, 'h-9 px-4 text-[13.5px]')}>
                          Buy
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

/** The latest deliveries and returns of this ingredient: when, from whom, how much, and what was paid or refunded. */
function Purchases({ ing, currency }: { ing: Ingredient; currency: string }) {
  const purchases = useAsync(() => fetchPurchases(ing.id, 5).catch(() => null), [ing.id]);
  const rows = purchases.data;
  return (
    <Section title="Latest purchases & returns" label="Latest purchases and returns" delay={340}>
      {!rows ? (
        purchases.loading ? <div role="status" aria-label="Loading purchases" className={SKELETON} /> : null
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">No delivery or return of {ing.name} has been recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[440px] border-collapse text-left text-[13.5px]">
            <thead>
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Supplier</th>
                <th className={cx(TH, 'text-right')}>Quantity</th>
                <th className={cx(TH, 'text-right')}>Paid / refunded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-3 py-3 whitespace-nowrap text-ink-3">{dayOnly.format(new Date(r.at))}</td>
                  <td className="max-w-[12rem] truncate px-3 py-3 font-semibold">
                    {r.supplier ?? <span className="font-normal text-ink-4">-</span>}
                    {r.kind === 'return' && <span className="ml-2 rounded-full bg-berry/16 px-2 py-0.5 text-[11.5px] font-semibold text-berry-ink">Returned</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.kind === 'return' && <span className="tnum font-bold text-berry-ink">−</span>}
                    <Qty value={Math.abs(r.quantity)} unit={ing.unit} unitClassName="text-ink-3" />
                  </td>
                  <td className="px-3 py-3 text-right tnum">
                    {r.cost ? formatMoney(r.cost, currency) : <span className="text-ink-4">-</span>}
                    {r.kind === 'return' && r.cost ? <span className="ml-1 text-[12px] text-ink-3">back</span> : null}
                    {r.kind === 'delivery' && r.cost ? <span className="block text-[12px] text-ink-3">{pricePer(r.cost, r.quantity, ing.unit, currency)}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/** Everything that took this ingredient off the shelf, newest first, with who did it and why. */
function History({ ing, currency }: { ing: Ingredient; currency: string }) {
  const [source, setSource] = useState<ConsumptionSource | 'all'>('all');
  const [page, setPage] = useState(1);
  const feed = useAsync(
    () => fetchConsumption({ page, pageSize: HISTORY_PAGE, ingredientId: ing.id, source: source === 'all' ? undefined : source }).catch(() => null),
    [ing.id, source, page],
  );
  const data = feed.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <Section
      title="Stock out history"
      delay={380}
      aside={
        <Segmented
          label="Reason"
          value={source}
          onChange={(v) => {
            setSource(v);
            setPage(1);
          }}
          options={SOURCES.map((o) => ({ value: o.value, label: o.value === 'all' || !data ? o.label : `${o.label} ${data.counts[o.value]}` }))}
        />
      }
    >
      {!data ? (
        feed.loading ? <div role="status" aria-label="Loading history" className={SKELETON} /> : null
      ) : data.total === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">Nothing here yet.</p>
      ) : (
        <>
          <div className={cx('mt-3 overflow-x-auto transition-opacity', feed.loading && 'opacity-50')}>
            <table className="w-full min-w-[520px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr>
                  <th className={TH}>When</th>
                  <th className={TH}>What happened</th>
                  <th className={TH}>By</th>
                  <th className={cx(TH, 'text-right')}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => {
                  const detail = [r.portions ? `${r.portions} ${r.portions === 1 ? 'portion' : 'portions'}` : null, r.source === 'waste' && r.wasteCost ? `${formatMoney(r.wasteCost, currency)} lost` : null, r.source !== 'order' && r.dishName ? r.note : r.source === 'waste' ? r.note : null]
                    .filter(Boolean)
                    .join(' · ');
                  return (
                    <tr key={r.id} className="border-t border-hairline">
                      <td className="px-3 py-3 whitespace-nowrap text-ink-3">{usageTime.format(new Date(r.at))}</td>
                      <td className="max-w-[18rem] px-3 py-3">
                        <span className={cx('block truncate font-semibold', r.source === 'waste' && 'text-berry-ink')}>
                          {r.source === 'waste' ? `Thrown away${r.wasteReason ? ` · ${wasteLabel(r.wasteReason)}` : ''}` : (r.dishName ?? (r.note || 'Taken off by hand'))}
                        </span>
                        {detail && <span className="block truncate text-[12px] text-ink-3">{detail}</span>}
                      </td>
                      <td className="px-3 py-3 text-ink-3">{r.byName ?? 'Kitchen'}</td>
                      <td className="px-3 py-3 text-right">
                        <Qty value={r.quantity} unit={ing.unit} unitClassName="text-ink-3" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-ink-3">
              <button type="button" disabled={page <= 1 || feed.loading} onClick={() => setPage(page - 1)} className={cx(PAGER, 'pr-3 pl-1.5')}>
                <ChevronLeft size={16} /> Newer
              </button>
              <span className="tnum">
                Page {page} of {pages}
              </span>
              <button type="button" disabled={page >= pages || feed.loading} onClick={() => setPage(page + 1)} className={cx(PAGER, 'pr-1.5 pl-3')}>
                Older <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** The facts that rarely change, as label and value pairs. */
function Details({ ing, summary, currency }: { ing: Ingredient; summary: IngredientSummary | null; currency: string }) {
  const buy = summary?.lastPurchase;
  const price = buy?.cost ? pricePer(buy.cost, buy.quantity, ing.unit, currency) : null;
  const rows: [string, string][] = [
    ['Item', ing.name],
    ['Measuring unit', UNIT_NAMES[ing.unit] ?? ing.unit],
    ['Warning level', ing.parLevel > 0 ? formatQty(ing.parLevel, ing.unit) : 'Not set'],
    ['Last price paid', price ?? '-'],
    ['Last supplier', buy?.supplier ?? '-'],
  ];
  return (
    <section aria-label="Basic details">
      <h2 className={H2}>Basic details</h2>
      <dl className="mt-3 grid grid-cols-[minmax(0,7.5rem)_1fr] gap-x-4 gap-y-2.5 text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="min-w-0 font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Deliveries on the shelf that are past their best-before day or reach it within 30 days (the API's limit). */
function ExpiringSoon({ ing, currency }: { ing: Ingredient; currency: string }) {
  const lots = useAsync(() => fetchExpiring(30).then((all) => all.filter((l) => l.ingredientId === ing.id)).catch(() => null), [ing.id]);
  const today = new Date().toLocaleDateString('en-CA');
  return (
    <section aria-label="Expiring soon" className="border-t border-hairline pt-5">
      <h2 className={H2}>Expiring soon</h2>
      {!lots.data ? (
        lots.loading ? <div role="status" aria-label="Loading deliveries" className={SKELETON} /> : <p className="mt-2 text-[13px] text-ink-3">Couldn't load this. Refresh to try again.</p>
      ) : lots.data.length === 0 ? (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-3">Nothing on the shelf has expired or expires within 30 days. Deliveries only appear here if a best-before day was entered when restocking.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline text-[13.5px]">
          {lots.data.map((l) => {
            const gone = l.expiresOn < today;
            return (
              <li key={l.lotId} className="flex items-center justify-between gap-3 py-2.5">
                <span className={cx('font-semibold', gone && 'text-berry-ink')}>
                  {gone ? 'Expired ' : ''}
                  {dayOnly.format(new Date(`${l.expiresOn}T12:00:00`))}
                </span>
                <span className="flex items-baseline gap-3">
                  <Qty value={l.remaining} unit={ing.unit} unitClassName="text-ink-3" />
                  {l.value ? <span className="tnum text-ink-3">{formatMoney(l.value, currency)}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** The dishes whose cost this ingredient drives, biggest share first, from the costed recipes. */
function UsedInDishes({ ing, currency }: { ing: Ingredient; currency: string }) {
  const margins = useAsync(() => fetchMargins().catch(() => null), []);
  const rows = (margins.data ?? [])
    .map((m) => ({ m, share: m.drivers.find((d) => d.ingredientName.toLowerCase() === ing.name.toLowerCase())?.share }))
    .filter((r): r is { m: (typeof r)['m']; share: number } => r.share !== undefined)
    .sort((a, b) => b.share - a.share);
  return (
    <section aria-label="Used in dishes" className="border-t border-hairline pt-5">
      <h2 className={H2}>Used in dishes</h2>
      {!margins.data ? (
        margins.loading ? <div role="status" aria-label="Loading dishes" className={SKELETON} /> : null
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">No dish recipe uses {ing.name} yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline text-[13.5px]">
          {rows.map(({ m, share }) => (
            <li key={`${m.dishId}:${m.variantName ?? ''}`} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">
                  {m.name}
                  {m.variantName && <span className="font-normal text-ink-3"> · {m.variantName}</span>}
                </span>
                <span className="shrink-0 text-ink-3 tnum">{formatMoney(m.cost, currency)} a portion</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <span className="block h-full rounded-full bg-flame-1" style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-[12px] text-ink-3 tnum">{Math.round(share * 100)}% of its cost</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
