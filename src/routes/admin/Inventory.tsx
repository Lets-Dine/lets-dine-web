import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addIngredient,
  adjustStock,
  consumeStock,
  fetchIngredientSummary,
  fetchIngredientUsage,
  fetchExpiring,
  fetchIngredients,
  fetchPurchases,
  logWaste,
  fetchReturnableLots,
  formatQty,
  WASTE_REASONS,
  receiveDelivery,
  returnStock,
  stockState,
  transferStock,
  updateIngredient,
} from '../../api/inventory';
import type { Ingredient, IngredientSummary, StockState, WasteReason } from '../../api/inventory';
import { Block } from '../../components/admin/profile';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Field, INPUT_BOX, MoneyInput, Panel, Segmented, Select, TextInput, useCommand } from '../../components/admin/kit';
import { Num } from '../../components/admin/profile';
import { QtyField } from '../../components/admin/QtyField';
import { useDiscardBack } from '../../components/admin/useDiscardBack';
import { Alert, Bell, Box, ChevronLeft, ChevronRight, History, Minus, Plus, Search, Send, Sliders, X } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { fetchSuppliers, priceLabel } from '../../api/suppliers';
import { useAsync } from '../../state/useAsync';
import { useAuth } from '../../state/AuthContext';
import type { Minor, PaymentMethod } from '../../domain/types';
import { useDashboard } from './AdminLayout';

const UNITS = [
  { value: 'g', label: 'Weight (grams / kg)' },
  { value: 'ml', label: 'Liquid (ml / litres)' },
  { value: 'pcs', label: 'Count (pieces)' },
];

const STATE_COPY: Record<StockState, { label: string; pill: string; bar: string; text: string; tint: string }> = {
  out: {
    label: 'Out of stock',
    pill: 'bg-berry/14 text-berry-ink',
    bar: 'bg-berry',
    text: 'text-berry-ink',
    tint: 'var(--color-berry)',
  },
  low: {
    label: 'Running low',
    pill: 'bg-gold/16 text-gold-ink',
    bar: 'bg-gold',
    text: 'text-gold-ink',
    tint: 'var(--color-gold)',
  },
  ok: {
    label: 'In stock',
    pill: 'bg-mint/14 text-mint-ink',
    bar: 'bg-mint',
    text: 'text-ink',
    tint: 'var(--color-mint)',
  },
};

type Tool = 'receive' | 'consume' | 'waste' | 'recount' | 'transfer' | 'return' | 'edit';

/** The four things you can do to an ingredient, each said in the words a cook would use. */
const TOOLS: Record<Tool, { short: string; title: string; blurb: string; Icon: typeof Box; detail: string }> = {
  receive: {
    short: 'Restock',
    title: 'Delivery arrived',
    blurb: 'Add stock that just arrived',
    Icon: Box,
    detail: 'Add stock that just arrived. If you enter what you paid, it is filed in the cash book for you.',
  },
  consume: {
    short: 'Use',
    title: 'Use stock',
    blurb: 'Take some off for a dish or a staff meal',
    Icon: Minus,
    detail: 'Take an amount off stock by hand, for a dish or for something else like a staff meal. For spoiled or thrown-away stock use Waste instead. It shows in the consumption list.',
  },
  waste: {
    short: 'Waste',
    title: 'Throw away',
    blurb: 'Spoiled, expired or spilled',
    Icon: Alert,
    detail: 'Throw some away and say why. It is priced from the delivery it came from and shows in the waste report.',
  },
  recount: {
    short: 'Recount',
    title: 'Fix the number',
    blurb: 'The shelf shows something different',
    Icon: Sliders,
    detail: 'The shelf says something different from the number here? Enter what is actually there.',
  },
  transfer: {
    short: 'Send',
    title: 'Send to branch',
    blurb: 'Move some to another kitchen',
    Icon: Send,
    detail: 'Move some to another branch. Its supplier and delivery dates go with it.',
  },
  return: {
    short: 'Return',
    title: 'Send back to supplier',
    blurb: 'Return some of a delivery',
    Icon: History,
    detail: 'Send some of a delivery back. Pick the delivery, say how much, and what the supplier gives back for it.',
  },
  edit: {
    short: 'Edit',
    title: 'Rename or alert',
    blurb: 'Change its name or low-stock warning',
    Icon: Bell,
    detail: 'Change its name, or when you get warned that it is running low.',
  },
};

const USAGE_PAGE_SIZE = 8;

const usageTime = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const dayOnly = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const UNIT_NAMES: Record<string, string> = { g: 'Gram (g)', ml: 'Millilitre (ml)', pcs: 'Piece (pcs)' };

const CARD = 'animate-rise rounded-3xl bg-surface-2/50 px-5 py-5 ring-1 ring-hairline ring-inset sm:px-6';
const CARD_TITLE = 'text-[17px] font-semibold tracking-tight';
/** Sections rise one after another, as on the customer page. */
const rise = (ms: number) => ({ animationDelay: `${ms}ms` });

/** The latest movement said as a sentence, in the words a cook would use. */
function describeMovement(m: NonNullable<IngredientSummary['lastMovement']>, name: string, unit: string): string {
  const amount = formatQty(Math.abs(m.delta), unit);
  switch (m.reason) {
    case 'DELIVERY':
      return `A delivery added ${amount} of ${name}.`;
    case 'ORDER':
      return `${amount} of ${name} was used for a dish.`;
    case 'MANUAL_USE':
      return `${amount} of ${name} was taken off by hand.`;
    case 'WASTE':
      return `${amount} of ${name} was thrown away.`;
    case 'TRANSFER_IN':
      return `${amount} of ${name} arrived from another branch.`;
    case 'RETURN':
      return `${amount} of ${name} was sent back to the supplier.`;
    case 'TRANSFER_OUT':
      return `${amount} of ${name} was sent to another branch.`;
    default:
      return `Stock for ${name} was corrected ${m.delta < 0 ? 'down' : 'up'} by ${amount}.`;
  }
}

/** The facts that rarely change, as label and value pairs. */
function BasicDetails({ ing, summary, currency }: { ing: Ingredient; summary: IngredientSummary | null; currency: string }) {
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
    <section aria-label="Basic details" className={CARD} style={rise(300)}>
      <h3 className={CARD_TITLE}>Basic details</h3>
      <dl className="mt-3 grid grid-cols-[minmax(0,9.5rem)_1fr] gap-x-4 gap-y-2.5 text-[14px]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-ink-3">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Where the number stands: now, what came in and went out lately, and the latest change. */
function StockOverview({ ing, state, summary }: { ing: Ingredient; state: StockState; summary: IngredientSummary | null }) {
  const tiles = [
    { label: 'Current stock', value: ing.quantity, hint: STATE_COPY[state].label, tone: STATE_COPY[state].text },
    { label: 'Stock in', value: summary?.stockIn, hint: `last ${summary?.days ?? 30} days`, tone: 'text-ink' },
    { label: 'Stock out', value: summary?.stockOut, hint: `last ${summary?.days ?? 30} days`, tone: 'text-ink' },
  ];
  const last = summary?.lastMovement;
  return (
    <section aria-label="Stock overview" className={CARD} style={rise(240)}>
      <h3 className={CARD_TITLE}>Stock overview</h3>
      <div className="mt-4 grid grid-cols-3 divide-x divide-hairline">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0 px-3 first:pl-0 last:pr-0">
            <p className="truncate text-[12.5px] text-ink-3">{t.label}</p>
            <p className="mt-2 text-[24px] leading-none">{t.value === undefined ? <span className="text-ink-4">-</span> : <Qty value={t.value} unit={ing.unit} unitClassName="text-ink-3" />}</p>
            <p className={cx('mt-1.5 truncate text-[11.5px] font-semibold', t.tone === 'text-ink' ? 'text-ink-4' : t.tone)}>{t.hint}</p>
          </div>
        ))}
      </div>
      {last && (
        <p className="mt-4 border-t border-hairline pt-3.5 text-[13.5px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Latest: </span>
          {describeMovement(last, ing.name, ing.unit)} <span className="whitespace-nowrap text-flame-1">{dayOnly.format(new Date(last.at))}</span>
        </p>
      )}
    </section>
  );
}

const PURCHASE_COUNT = 5;

/** Today as the YYYY-MM-DD a date input uses, in the viewer's own time zone. */
const localDay = () => new Date().toLocaleDateString('en-CA');

/** The latest deliveries of this ingredient: when, from whom, how much, and what was paid. */
function LatestPurchases({ ing, currency }: { ing: Ingredient; currency: string }) {
  const purchases = useAsync(() => fetchPurchases(ing.id, PURCHASE_COUNT).catch(() => null), [ing.id]);
  const rows = purchases.data;
  return (
    <section aria-label="Latest purchases and returns" className={CARD} style={rise(360)}>
      <h3 className={CARD_TITLE}>Latest purchases &amp; returns</h3>
      {!rows ? (
        purchases.loading ? <div role="status" aria-label="Loading purchases" className="shimmer-bg animate-shimmer mt-3 h-20 rounded-xl" /> : null
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">No delivery or return of {ing.name} has been recorded yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[13.5px]">
            <thead className="text-[12.5px] text-ink-3">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Date</th>
                <th className="px-3.5 py-2.5 font-semibold">Supplier</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">Quantity</th>
                <th className="px-3.5 py-2.5 text-right font-semibold">Paid / refunded</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-hairline">
                  <td className="px-3.5 py-2.5 whitespace-nowrap text-ink-3">{dayOnly.format(new Date(r.at))}</td>
                  <td className="max-w-[12rem] truncate px-3.5 py-2.5 font-semibold">
                    {r.supplier ?? <span className="font-normal text-ink-4">-</span>}
                    {r.kind === 'return' && <span className="ml-2 rounded-full bg-berry/16 px-2 py-0.5 text-[11.5px] font-semibold text-berry-ink">Returned</span>}
                  </td>
                  <td className="px-3.5 py-2.5 text-right">
                    {r.kind === 'return' && <span className="tnum font-bold text-berry-ink">−</span>}
                    <Qty value={Math.abs(r.quantity)} unit={ing.unit} unitClassName="text-ink-3" />
                  </td>
                  <td className="px-3.5 py-2.5 text-right tnum">
                    {r.cost ? formatMoney(r.cost, currency) : <span className="text-ink-4">-</span>}
                    {r.kind === 'return' && r.cost ? <span className="ml-1 text-[12px] text-ink-3">back</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Every time a dish used this ingredient, newest first, a page at a time. Quiet if it can't load. */
function DishConsumption({ ing, onAdd }: { ing: Ingredient; onAdd: () => void }) {
  const [page, setPage] = useState(1);
  const usage = useAsync(() => fetchIngredientUsage(ing.id, page, USAGE_PAGE_SIZE).catch(() => null), [ing.id, page]);
  const data = usage.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <section aria-label="Consumption" className={CARD} style={rise(420)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className={CARD_TITLE}>Consumption</h3>
        <button
          type="button"
          onClick={onAdd}
          disabled={ing.quantity <= 0}
          title={ing.quantity <= 0 ? 'There is nothing in stock to use' : undefined}
          className="inline-flex h-8 items-center gap-1 rounded-full bg-surface-2 pr-3 pl-2.5 text-[13px] font-semibold text-flame-1 ring-1 ring-hairline ring-inset transition-move hover:bg-surface-3 active:scale-95 disabled:pointer-events-none disabled:opacity-40"
        >
          <Plus size={14} /> Add consumption
        </button>
      </div>
      {!data ? (
        usage.loading ? <div role="status" aria-label="Loading usage" className="shimmer-bg animate-shimmer mt-3 h-20 rounded-xl" /> : null
      ) : data.total === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">Nothing has used {ing.name} yet.</p>
      ) : (
        <>
          <div className={cx('mt-3 overflow-x-auto transition-opacity', usage.loading && 'opacity-50')}>
            <table className="w-full min-w-[420px] border-collapse text-left text-[13.5px]">
              <thead className="text-[12.5px] text-ink-3">
                <tr>
                  <th className="px-3.5 py-2.5 font-semibold">When</th>
                  <th className="px-3.5 py-2.5 font-semibold">Used for</th>
                  <th className="px-3.5 py-2.5 text-right font-semibold">Portions</th>
                  <th className="px-3.5 py-2.5 text-right font-semibold">Used</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="px-3.5 py-2.5 whitespace-nowrap text-ink-3">{usageTime.format(new Date(r.at))}</td>
                    <td className="max-w-[14rem] px-3.5 py-2.5">
                      <span className="block truncate font-semibold">{r.dishName ?? (r.note || 'Taken off by hand')}</span>
                      {r.source === 'manual' && (
                        <span className="block truncate text-[12px] text-ink-3">
                          Recorded by hand{r.dishName && r.note ? ` · ${r.note}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tnum">{r.portions ?? <span className="text-ink-4">-</span>}</td>
                    <td className="px-3.5 py-2.5 text-right">
                      <Qty value={r.quantity} unit={ing.unit} unitClassName="text-ink-3" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-ink-3">
              <button type="button" disabled={page <= 1 || usage.loading} onClick={() => setPage(page - 1)} className="inline-flex h-8 items-center gap-0.5 rounded-full pr-3 pl-1.5 font-semibold text-flame-1 disabled:opacity-40">
                <ChevronLeft size={16} /> Newer
              </button>
              <span className="tnum">
                Page {page} of {pages}
              </span>
              <button type="button" disabled={page >= pages || usage.loading} onClick={() => setPage(page + 1)} className="inline-flex h-8 items-center gap-0.5 rounded-full pr-1.5 pl-3 font-semibold text-flame-1 disabled:opacity-40">
                Older <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** What a price works out to per kg / litre / piece, so "Rs 2,400 for 5 kg" reads as "Rs 480 per kg". */
function pricePer(cost: Minor, quantity: number, unit: string, currency: string): string | null {
  if (quantity <= 0 || cost <= 0) return null;
  const per = unit === 'g' ? { label: 'kg', factor: 1000 } : unit === 'ml' ? { label: 'L', factor: 1000 } : { label: unit, factor: 1 };
  return `${formatMoney(Math.round((cost * per.factor) / quantity), currency)} per ${per.label}`;
}

/** What pressing the button will do, said before it is pressed. */
function Outcome({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return (
    <p
      className={cx('max-w-[62ch] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset', tone === 'warn' ? 'bg-berry/10 text-berry-ink ring-berry/25' : 'bg-surface-2/60 text-ink-2 ring-hairline')}
      aria-live="polite"
    >
      {children}
    </p>
  );
}

/** "2.5 kg" as a bold number and a quiet unit, so a column of quantities scans by number. */
function Qty({ value, unit, className, unitClassName = 'text-ink-4' }: { value: number; unit: string; className?: string; unitClassName?: string }) {
  const [n, ...u] = formatQty(value, unit).split(' ');
  return (
    <span className={cx('tnum whitespace-nowrap', className)}>
      <span className="font-bold tracking-tight">{n}</span>
      <span className={cx('ml-1 text-[0.62em] font-semibold', unitClassName)}>{u.join(' ')}</span>
    </span>
  );
}

/** The sheet's one action, pinned to the bottom so it never scrolls out of reach on a phone. */
const SHEET_FOOT = 'sticky bottom-0 z-10 -mx-5 mt-1 flex items-center gap-2 border-t border-hairline bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]';
const FOOT_PRIMARY = cx(ADMIN_PRIMARY, 'h-11 flex-1 text-[15px]');

/** Most depleted first, measured against each ingredient's own warning line. */
const depletion = (i: Ingredient) => (i.parLevel > 0 ? i.quantity / i.parLevel : i.quantity > 0 ? Infinity : 0);

/**
 * The shared frame for the add and ingredient sheets: a native <dialog> (focus trap, Esc, backdrop)
 * that slides up on phones and in from the right on wider screens, and leaves the same way. Every way
 * of closing (button, backdrop, Esc) goes through `close`, which plays the exit before the dialog shuts.
 */
function SheetShell({ label, onClose, wide, children }: { label: string; onClose: () => void; wide?: boolean; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useDiscardBack();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => {
    const el = ref.current;
    if (!el || !el.open || el.hasAttribute('data-closing')) return;
    el.setAttribute('data-closing', '');
    window.setTimeout(() => el.close(), 200);
  };
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={label}
      className={cx(
        'sheet fixed m-0 flex max-h-none flex-col overflow-hidden bg-surface p-0 text-ink shadow-deep outline-none backdrop:bg-black/55 backdrop:backdrop-blur-[2px]',
        'inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl',
        'sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:rounded-none sm:rounded-l-3xl',
        wide ? 'sm:w-[720px]' : 'sm:w-[460px]',
      )}
    >
      {children(close)}
    </dialog>
  );
}

/** `lot` preselects the delivery in the return form. */
type Open = { id: string; tool: Tool | null; lot?: string } | null;

/** Rank for the list: what needs you first (out, then low, then fine), and within each, alphabetical. */
const RANK: Record<StockState, number> = { out: 0, low: 1, ok: 2 };

/**
 * Stock is a grid of ingredient tiles, the ones that need you first. Tapping a tile opens a
 * modal where everything you can do to it (delivery, recount, send, rename) is carried out.
 */
export function Inventory() {
  const { allows, staff } = useAuth();
  const { menu } = useDashboard();
  const { pending, busy, run } = useCommand();
  const list = useAsync(fetchIngredients, []);
  // Suggestions for the delivery form's supplier box; it stays a free-text field if this can't load.
  const suppliers = useAsync(() => fetchSuppliers().catch(() => []), []);
  const expiring = useAsync(() => fetchExpiring(3).catch(() => []), []);
  const canManage = allows('inventory:manage');
  const currency = menu.restaurant.currency;
  // Other branches this person can send stock to; none means no "Send to branch" action.
  const otherBranches = (staff?.branches ?? []).filter((b) => b.id !== staff?.branchId);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState(false);

  // A link from elsewhere (the Watchlist) can open an ingredient, and straight into a form: ?open=<id>&tool=return&lot=<id>.
  const [params, setParams] = useSearchParams();
  const wanted = params.get('open');
  useEffect(() => {
    if (!wanted || !list.data) return;
    const ing = list.data.find((i) => i.id === wanted);
    const tool = params.get('tool') as Tool | null;
    // A form is only offered where the sheet itself would offer it; otherwise land on the details.
    const usable = tool && tool in TOOLS && canManage && (tool === 'receive' || tool === 'recount' || tool === 'edit' || ing?.quantity);
    // Only people who can act on stock open the sheet from the grid, so a link does not open it for anyone else.
    if (ing && canManage) setOpen({ id: ing.id, tool: usable ? tool : null, lot: params.get('lot') ?? undefined });
    setParams({}, { replace: true });
  }, [wanted, list.data, params, setParams, canManage]);

  /** Runs a change, then closes the modal and refreshes the list. */
  const act = (ing: Ingredient, action: () => Promise<unknown>, message: string): Promise<boolean> =>
    run(ing.id, action, message).then((ok) => {
      if (ok) {
        setOpen(null);
        list.reload();
        suppliers.reload();
        expiring.reload();
      }
      return ok;
    });

  const rows = useMemo(() => {
    const withState = (list.data ?? []).map((ing) => ({ ing, state: stockState(ing) }));
    return withState.sort((a, b) => RANK[a.state] - RANK[b.state] || depletion(a.ing) - depletion(b.ing) || a.ing.name.localeCompare(b.ing.name));
  }, [list.data]);

  if (list.loading && !list.data)
    return (
      <div className="mx-auto max-w-6xl">
        <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Stock</h1>
        <div role="status" aria-label="Loading stock" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] mt-10 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="shimmer-bg animate-shimmer h-[9.5rem] rounded-2xl" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    );

  const q = query.trim().toLowerCase();
  const visible = rows.filter(({ ing }) => !q || ing.name.toLowerCase().includes(q));
  const needing = rows.filter((r) => r.state !== 'ok').length;
  const openIng = open ? rows.find((r) => r.ing.id === open.id)?.ing : undefined;

  const expiringCount = expiring.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Stock</h1>

      <div className="mt-5 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]">
        {rows.length > 6 && (
          <span className="relative min-w-40 flex-1 sm:max-w-72 sm:flex-none">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
            <input
              type="search"
              className={cx(INPUT_BOX, 'h-10 py-0 pr-3 pl-9')}
              value={query}
              placeholder="Find an ingredient"
              aria-label="Find an ingredient"
              onChange={(e) => setQuery(e.target.value)}
            />
          </span>
        )}
        {rows.length > 0 && canManage && (
          <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Link to="/admin/inventory/count" className={ADMIN_GHOST}>
              Count everything
            </Link>
            <button type="button" className={ADMIN_PRIMARY} onClick={() => setAdding(true)}>
              <Plus size={16} /> Add ingredient
            </button>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-10"><FirstRun onAdd={canManage ? () => setAdding(true) : undefined} /></div>
      ) : (
        <>
          <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:120ms] sm:max-w-[40ch]">
            {needing > 0 ? `${needing} of ${rows.length} ingredients need restocking.` : `${rows.length} ingredients, all in stock.`} Open one to see where it went, restock it or fix its count.
          </p>

          <section aria-label="The three answers" className="mt-10 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
            <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
              <Cell title="Ingredients" sub="On the shelf right now">{rows.length}</Cell>
              <Cell title="Need restocking" sub="Low or out, listed first" bad={needing > 0}>{needing}</Cell>
              <Cell title="Use or bin soon" sub="Expired or expiring in 3 days" bad={expiringCount > 0}>{expiringCount}</Cell>
            </div>
          </section>

          <div className="mt-6 grid gap-6">
          {expiringCount > 0 && (
            <Block title="Use or bin soon" hint="Oldest first" delay={260}>
              <ul className="border-t border-hairline">
                {expiring.data?.map((l) => {
                  const gone = l.expiresOn < localDay();
                  const label = gone ? 'Expired' : l.expiresOn === localDay() ? 'Expires today' : `Expires ${dayOnly.format(new Date(`${l.expiresOn}T12:00:00`))}`;
                  return (
                    <li key={l.lotId} className="flex items-baseline justify-between gap-3 border-b border-hairline py-3 text-[14px] last:border-0">
                      <span className="min-w-0 truncate">
                        <span className="font-semibold">{l.name}</span> · {formatQty(l.remaining, l.unit)}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-3">
                        <span className={gone ? 'font-semibold text-berry-ink' : 'text-ink-3'}>{label}</span>
                        {canManage && (
                          <button type="button" className="font-semibold underline" onClick={() => setOpen({ id: l.ingredientId, tool: 'waste' })}>
                            Throw away
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Block>
          )}

          {visible.length === 0 ? (
            <Panel>
              <p className="py-4 text-center text-[13.5px] text-ink-3">No ingredient matches “{query.trim()}”.</p>
            </Panel>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] gap-3">
              {visible.map(({ ing, state }, i) => (
                <li key={ing.id} className={cx('transition-opacity', pending === ing.id && 'opacity-50')}>
                  {/* Tiles rise in a short cascade (capped, so a long list doesn't make you wait). */}
                  <div className="h-full animate-rise" style={rise(Math.min(i, 10) * 45)}>
                    <StockRow ing={ing} state={state} interactive={canManage} onOpen={() => setOpen({ id: ing.id, tool: null })} delay={Math.min(i, 10) * 45 + 200} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>
        </>
      )}

      {openIng && (
        <IngredientSheet
          // A fresh modal per ingredient, so it always opens on its list of actions.
          key={`${openIng.id}:${open?.tool ?? 'home'}`}
          ing={openIng}
          initialTool={open?.tool ?? null}
          initialLot={open?.lot}
          currency={currency}
          supplierNames={(suppliers.data ?? []).map((x) => x.name)}
          branches={otherBranches}
          busy={busy}
          onClose={() => setOpen(null)}
          dishes={menu.dishes.filter((d) => !d.isArchived).map((d) => ({ id: d.id, name: d.name }))}
          onReceive={(d) => act(openIng, () => receiveDelivery(openIng.id, d), `${openIng.name} restocked`)}
          onConsume={(d) => act(openIng, () => consumeStock(openIng.id, d), `${openIng.name} used`)}
          onWaste={(d) => act(openIng, () => logWaste(openIng.id, d), `${openIng.name} thrown away`)}
          onRecount={(qty) => act(openIng, () => adjustStock(openIng.id, qty, ''), `${openIng.name} corrected`)}
          onTransfer={(toBranchId, qty, where) => act(openIng, () => transferStock(openIng.id, toBranchId, qty), `${openIng.name} sent to ${where}`)}
          onReturn={(d, supplier) => act(openIng, () => returnStock(openIng.id, d), `${openIng.name} sent back to ${supplier}`)}
          onEdit={(patch) => act(openIng, () => updateIngredient(openIng.id, patch), `${openIng.name} saved`)}
        />
      )}

      {adding && (
        <AddIngredientSheet
          busy={busy}
          currency={currency}
          onClose={() => setAdding(false)}
          onAdd={(draft) =>
            void run('new', () => addIngredient(draft), `${draft.name} added`).then((ok) => {
              if (!ok) return;
              setAdding(false);
              list.reload();
            })
          }
        />
      )}
    </div>
  );
}

function Cell({ title, sub, bad, children }: { title: string; sub: string; bad?: boolean; children: number }) {
  return (
    <div className="px-6 py-6">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', bad && 'text-berry-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

/**
 * One ingredient as a compact tile: name, what is left, and a level gauge against its warning line
 * (the gauge's midpoint is the warning, so a full bar means at least twice that). Opens its modal.
 */
function StockRow({ ing, state, interactive, onOpen, delay }: { ing: Ingredient; state: StockState; interactive: boolean; onOpen: () => void; delay: number }) {
  const copy = STATE_COPY[state];
  const level = ing.parLevel > 0 ? Math.min(1, ing.quantity / (ing.parLevel * 2)) : null;
  const warn = ing.parLevel > 0 ? `Warns below ${formatQty(ing.parLevel, ing.unit)}` : 'No warning set';
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 text-[15px] leading-snug font-semibold break-words" title={ing.name}>
          {ing.name}
        </span>
        <span className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11.5px] font-bold', state === 'ok' ? 'text-ink-3' : copy.pill)}>
          <span className={cx('size-1.5 rounded-full', copy.bar)} aria-hidden />
          {copy.label}
        </span>
      </span>
      <Qty value={ing.quantity} unit={ing.unit} unitClassName="text-ink-3" className={cx('mt-3 block text-[28px] leading-none', state === 'out' && 'text-berry-ink')} />
      {level !== null && (
        <span className="mt-3.5 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className={cx('block h-full origin-left animate-grow-x rounded-full', copy.bar)} style={{ width: `${Math.max(level * 100, ing.quantity > 0 ? 4 : 0)}%`, animationDelay: `${delay}ms` }} />
        </span>
      )}
      <span className={cx('block truncate text-[12.5px] text-ink-3', level !== null ? 'mt-2' : 'mt-3.5')}>{warn}</span>
    </>
  );
  const tile = 'block h-full w-full min-w-0 overflow-hidden rounded-2xl bg-surface p-4 text-left ring-1 ring-hairline ring-inset';
  return interactive ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${ing.name}, ${formatQty(ing.quantity, ing.unit)}, ${copy.label}. ${warn}. Open actions`}
      className={cx(tile, 'transition-move hover:bg-surface-2/60 focus-visible:bg-surface-2/60 active:scale-[0.985]')}
    >
      {body}
    </button>
  ) : (
    <div className={tile}>{body}</div>
  );
}

/**
 * The add form lives in a drawer (native <dialog>: focus trap, Esc and backdrop for free) so the
 * page stays about what needs doing. Mounted only while open, so it always starts empty.
 */
function AddIngredientSheet({
  busy,
  currency,
  onClose,
  onAdd,
}: {
  busy: boolean;
  currency: string;
  onClose: () => void;
  onAdd: (draft: { name: string; unit: string; quantity: number; parLevel: number; cost: Minor }) => void;
}) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('g');
  const [qty, setQty] = useState<number | ''>('');
  const [par, setPar] = useState<number | ''>('');
  const [cost, setCost] = useState<Minor>(0);
  // Changing the unit changes what the quantity fields mean, so they start over.
  const [unitKey, setUnitKey] = useState(0);

  return (
    <SheetShell label="Add an ingredient" onClose={onClose}>
      {(close) => (
        <>
          <div className="flex items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <h2 className={cx(DISPLAY, 'text-[24px]')}>New ingredient</h2>
              <p className="mt-1 max-w-[40ch] text-[13px] leading-relaxed text-ink-3">An ingredient is something the kitchen buys and uses up. Add what runs out first: chicken, rice, buns.</p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90"
            >
              <X size={16} />
            </button>
          </div>
          <form
            className="grid flex-1 content-start gap-4 overflow-y-auto px-5 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim())
                onAdd({
                  name: name.trim(),
                  unit,
                  quantity: qty || 0,
                  parLevel: par || 0,
                  cost: qty ? cost : 0,
                });
            }}
          >
            <Field label="Name">
              <TextInput value={name} onChange={setName} maxLength={80} placeholder="Chicken" autoFocus />
            </Field>
            <Field label="How do you measure it?" hint="Pick the unit you would use in a recipe. You can still type kg or litres below.">
              <Select
                value={unit}
                onChange={(u) => {
                  setUnit(u);
                  setUnitKey((k) => k + 1);
                  setQty('');
                  setPar('');
                }}
                options={UNITS}
              />
            </Field>
            <Field label="How much is on the shelf now?" hint="Leave empty if you have none yet.">
              <QtyField key={`q${unitKey}`} unit={unit} onChange={setQty} />
            </Field>
            {qty ? (
              <Field
                label="What did that cost you?"
                hint="Optional, the total for what is on the shelf. It lets us work out what each dish costs to make. This is not added to the cash book, because you already paid for it."
              >
                <MoneyInput value={cost} onChange={setCost} currency={currency} />
              </Field>
            ) : null}
            <Field label="Warn me when it falls below" hint="Optional. It is flagged on the Stock page and the dashboard before you run out.">
              <QtyField key={`p${unitKey}`} unit={unit} onChange={setPar} />
            </Field>
            <Outcome>
              {name.trim() ? name.trim() : 'This ingredient'} will start with {qty ? formatQty(qty, unit) : 'nothing on the shelf'}
              {qty && cost > 0 ? `, bought at ${pricePer(cost, qty, unit, currency)}` : ''}. {par ? `You will be warned below ${formatQty(par, unit)}. ` : ''}
              {qty && cost > 0 ? 'Dish costs can be worked out straight away.' : 'Dish costs appear after your first delivery with a price.'}
            </Outcome>
            <div className={SHEET_FOOT}>
              <button type="submit" disabled={busy || !name.trim()} className={FOOT_PRIMARY}>
                Add ingredient
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => close()}>
                Cancel
              </button>
            </div>
          </form>
        </>
      )}
    </SheetShell>
  );
}

/** What an empty page is for: the three things that make stock work, in the order they happen. */
function FirstRun({ onAdd }: { onAdd?: () => void }) {
  const steps = [
    {
      title: 'Add your ingredients',
      body: 'The few things that run out first. Say how much is on the shelf today.',
    },
    {
      title: 'Give dishes a recipe',
      body: 'Open a dish in the menu and say what one portion uses.',
    },
    {
      title: 'Let it run',
      body: 'Stock comes off when the kitchen starts a dish, and a dish sells out by itself when it can’t be made. You only receive deliveries and recount.',
    },
  ];
  return (
    <Panel
      title="How stock works"
      className="mb-4"
      action={
        onAdd && (
          <button type="button" className={ADMIN_PRIMARY} onClick={onAdd}>
            Add your first ingredient
          </button>
        )
      }
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-flame-2/14 text-[13px] font-bold text-flame-1 tnum">{i + 1}</span>
            <span>
              <span className="block text-[14px] font-semibold">
                {s.title}
                {i === 1 && (
                  <>
                    {' '}
                    <Link to="/admin/menu" className="text-[12.5px] font-semibold text-flame-1">
                      Open menu
                    </Link>
                  </>
                )}
              </span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-3">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/**
 * One ingredient in full, laid out as cards: basic details, how stock has moved, and which dishes
 * used it. The four jobs (restock, recount, send, edit) are buttons beside the name; choosing one
 * slides its form in under the same header, and Back returns to the details. Built on the native
 * <dialog>, like the add form: focus trap, Esc and the backdrop come with it.
 */
function IngredientSheet({
  ing,
  initialTool,
  initialLot,
  currency,
  supplierNames,
  branches,
  dishes,
  busy,
  onClose,
  onReceive,
  onConsume,
  onWaste,
  onRecount,
  onTransfer,
  onReturn,
  onEdit,
}: {
  ing: Ingredient;
  initialTool: Tool | null;
  initialLot?: string;
  currency: string;
  supplierNames: string[];
  branches: { id: string; name: string }[];
  dishes: { id: string; name: string }[];
  busy: boolean;
  onClose: () => void;
  onReceive: (d: { quantity: number; supplier: string; cost: Minor; method: PaymentMethod; receivedAt?: string; onCredit?: boolean; expiresOn?: string }) => void;
  onConsume: (d: { quantity: number; dishId?: string; note?: string; usedAt?: string }) => void;
  onWaste: (d: { quantity: number; reason: WasteReason; note?: string }) => void;
  onRecount: (quantity: number) => void;
  onTransfer: (toBranchId: string, quantity: number, branchName: string) => void;
  onReturn: (d: { lotId: string; quantity: number; refund: Minor; method: PaymentMethod; note: string }, supplier: string) => Promise<boolean>;
  onEdit: (patch: { name?: string; parLevel?: number; isArchived?: boolean }) => void;
}) {
  const [view, setView] = useState<'home' | Tool>(initialTool ?? 'home');
  const [qty, setQty] = useState<number | ''>('');
  const [par, setPar] = useState<number | ''>(ing.parLevel);
  const [name, setName] = useState(ing.name);
  const [toBranch, setToBranch] = useState(branches[0]?.id ?? '');
  const [supplier, setSupplier] = useState('');
  const [cost, setCost] = useState<Minor>(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [onCredit, setOnCredit] = useState(false);
  const returnable = useAsync(() => fetchReturnableLots(ing.id).catch(() => []), [ing.id]);
  const [lotId, setLotId] = useState(initialLot ?? '');
  const [refund, setRefund] = useState<Minor>(0);
  const [refundTyped, setRefundTyped] = useState(false);
  const [refundKey, setRefundKey] = useState(0);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');
  const [returnNote, setReturnNote] = useState('');
  const [priceTyped, setPriceTyped] = useState(false);
  // Its own key, so filling the price in never remounts the quantity box while it is being typed in.
  const [priceKey, setPriceKey] = useState(0);
  const today = localDay();
  const [arrivedOn, setArrivedOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState('');
  const [usedOn, setUsedOn] = useState(today);
  const [usedFor, setUsedFor] = useState('');
  const [reason, setReason] = useState('');
  const [wasteWhy, setWasteWhy] = useState<WasteReason>('SPOILED');
  const [wasteNote, setWasteNote] = useState('');
  const summary = useAsync(() => fetchIngredientSummary(ing.id).catch(() => null), [ing.id]);
  const state = stockState(ing);
  const copy = STATE_COPY[state];
  // Counted in kg or L on the jar, so the forms start in kg or L too.
  const big = ing.unit !== 'pcs' && Math.max(ing.quantity, ing.parLevel) >= 1000;
  const tools = (Object.keys(TOOLS) as Tool[]).filter((t) => (t !== 'transfer' || (branches.length > 0 && ing.quantity > 0)) && (t !== 'consume' || ing.quantity > 0) && (t !== 'waste' || ing.quantity > 0) && (t !== 'return' || ing.quantity > 0));

  // Each form's quantity field starts empty, so the remembered number has to as well.
  const go = (next: 'home' | Tool) => {
    setQty('');
    setPriceTyped(false);
    setRefundTyped(false);
    setView(next);
  };

  // Returning: what the supplier gives back follows the share of the delivery's price, until it is typed by hand.
  const lots = returnable.data ?? [];
  const lot = lots.find((l) => l.lotId === lotId) ?? lots[0];
  // At most what is on the shelf (stock already used belongs to no delivery), and their share of the price less earlier refunds from it.
  const room = lot ? Math.min(lot.remaining, ing.quantity) : 0;
  const share = lot?.cost && qty ? Math.min(Math.round((lot.cost * qty) / lot.quantity), Math.max(0, lot.cost - lot.refunded)) : 0;
  useEffect(() => {
    if (view === 'return' && !refundTyped && share !== refund) {
      setRefund(share);
      setRefundKey((k) => k + 1);
    }
  }, [view, refundTyped, share, refund]);

  // The delivery's price follows the last price paid and the quantity, until it is typed by hand.
  const last = summary.data?.lastPurchase;
  const unitCost = last?.cost && last.quantity > 0 ? last.cost / last.quantity : 0;
  const suggested = unitCost && qty ? Math.round(unitCost * qty) : 0;
  useEffect(() => {
    if (view === 'receive' && !priceTyped && suggested !== cost) {
      setCost(suggested);
      setPriceKey((k) => k + 1);
    }
  }, [view, priceTyped, suggested, cost]);

  return (
    <SheetShell label={`${ing.name} details`} onClose={onClose} wide>
      {(close) => (
        <>
          <div className="flex items-center justify-between px-3 pt-3">
            {view !== 'home' ? (
              <button type="button" onClick={() => go('home')} className="inline-flex h-9 items-center gap-0.5 rounded-full pr-3 pl-1.5 text-[14px] font-semibold text-flame-1 transition-move active:scale-95">
                <ChevronLeft size={18} /> Back
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90"
            >
              <X size={16} />
            </button>
          </div>

          {/* What you are working on stays put; on the details page the name leads, a sentence says where it stands, and the actions sit under it. */}
          <header className="px-5 pt-2 pb-5">
            {view === 'home' ? (
              <>
                <h2 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(30px,6vw,44px)] leading-[1] tracking-[-0.03em]')}>{ing.name}</h2>
                <p className="mt-3 max-w-[40ch] animate-rise text-[clamp(17px,2.2vw,21px)] font-medium leading-[1.35] text-ink-2 [animation-delay:80ms]">
                  {state === 'out' ? (
                    <>
                      <span className={copy.text}>Out of stock</span>
                      {ing.parLevel > 0 && <>, with a warning level of <Num>{formatQty(ing.parLevel, ing.unit)}</Num></>}.
                    </>
                  ) : state === 'low' ? (
                    <>
                      Only <Num>{formatQty(ing.quantity, ing.unit)}</Num> left, under its warning level of <Num>{formatQty(ing.parLevel, ing.unit)}</Num>.
                    </>
                  ) : (
                    <>
                      <Num>{formatQty(ing.quantity, ing.unit)}</Num> on the shelf{ing.parLevel > 0 && <>, above its warning level of <Num>{formatQty(ing.parLevel, ing.unit)}</Num></>}.
                    </>
                  )}
                </p>
                <nav aria-label="Actions" className="mt-5 flex animate-rise flex-wrap gap-2.5 [animation-delay:160ms]">
                  {tools
                    .filter((t) => t !== 'consume')
                    .map((t) => {
                      const { Icon, short, title } = TOOLS[t];
                      const lead = t === 'receive';
                      return (
                        <button key={t} type="button" onClick={() => go(t)} title={title} className={cx(lead && state !== 'ok' ? ADMIN_PRIMARY : ADMIN_GHOST, 'h-11 px-5 text-[14.5px]')}>
                          <Icon size={16} />
                          {short}
                        </button>
                      );
                    })}
                </nav>
              </>
            ) : (
              <div className="min-w-0">
                <h2 className={cx(DISPLAY, 'truncate text-[26px]')}>{ing.name}</h2>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2.5 text-[13px] text-ink-3">
                  <Qty value={ing.quantity} unit={ing.unit} className="text-[18px] text-ink" unitClassName="text-ink-3" />
                  <span className={cx('rounded-md px-2 py-0.5 text-[11.5px] font-bold', copy.pill)}>{copy.label}</span>
                </p>
              </div>
            )}
          </header>

          <div key={view} className="min-h-0 flex-1 animate-swap overflow-y-auto px-4 pb-6">
            {view === 'home' ? (
              <div className="grid gap-3.5">
                <BasicDetails ing={ing} summary={summary.data} currency={currency} />
                <StockOverview ing={ing} state={state} summary={summary.data} />
                <LatestPurchases ing={ing} currency={currency} />
                <DishConsumption ing={ing} onAdd={() => go('consume')} />
              </div>
            ) : (
              <div className="grid gap-4 px-1">
                <div>
                  <h3 className="text-[17px] font-semibold tracking-tight">{TOOLS[view].title}</h3>
                  <p className="mt-1 max-w-[52ch] text-[13px] leading-relaxed text-ink-3">{TOOLS[view].detail}</p>
                </div>

                {view === 'receive' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (qty)
                        onReceive({
                          quantity: qty,
                          supplier: supplier.trim(),
                          cost,
                          method,
                          onCredit: onCredit && cost > 0 && supplier.trim() !== '',
                          expiresOn: expiresOn || undefined,
                          // Today means now; an earlier day is filed at midday, so it lands inside that day.
                          receivedAt: arrivedOn && arrivedOn < today ? new Date(`${arrivedOn}T12:00:00`).toISOString() : undefined,
                        });
                    }}
                  >
                    <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
                      <Field label="How much arrived">
                        <QtyField unit={ing.unit} onChange={setQty} big={big} />
                      </Field>
                      <Field label="Best before (optional)">
                        <input type="date" value={expiresOn} min={arrivedOn} onChange={(e) => setExpiresOn(e.target.value)} className={cx(INPUT_BOX, 'tnum')} />
                      </Field>
                      <Field label="Date received">
                        <input type="date" value={arrivedOn} max={today} onChange={(e) => setArrivedOn(e.target.value || today)} className={cx(INPUT_BOX, 'tnum')} />
                      </Field>
                      <Field label="From">
                        <Select
                          value={supplier}
                          onChange={setSupplier}
                          options={[{ value: '', label: 'No supplier' }, ...supplierNames.map((n) => ({ value: n, label: n }))]}
                          placeholder="Supplier (optional)"
                          maxLength={80}
                          allowNew
                        />
                      </Field>
                      <Field
                        label="What you paid"
                        hint={unitCost ? `Last price ${priceLabel(unitCost, ing.unit, currency)}${last?.supplier ? ` from ${last.supplier}` : ''}${!priceTyped && suggested > 0 ? ', filled in for you' : ''}.` : undefined}
                      >
                        <MoneyInput
                          key={priceKey}
                          value={cost}
                          onChange={(v) => {
                            setPriceTyped(true);
                            setCost(v);
                          }}
                          currency={currency}
                        />
                      </Field>
                    </div>
                    {/* Only a payment has a method, so the choice appears once a price is entered. */}
                    {supplier.trim() !== '' && (
                      <Segmented
                        label="Payment"
                        value={onCredit ? 'credit' : 'now'}
                        onChange={(v) => setOnCredit(v === 'credit')}
                        options={[
                          { value: 'now', label: 'Paid now' },
                          { value: 'credit', label: 'On credit' },
                        ]}
                      />
                    )}
                    {cost > 0 && !(onCredit && supplier.trim() !== '') && (
                      <Segmented
                        label="Paid with"
                        value={method}
                        onChange={setMethod}
                        options={[
                          { value: 'CASH', label: 'Cash' },
                          { value: 'CARD', label: 'Bank' },
                        ]}
                      />
                    )}
                    {qty ? (
                      <Outcome>
                        {ing.name} goes from {formatQty(ing.quantity, ing.unit)} to {formatQty(ing.quantity + qty, ing.unit)}.{' '}
                        {cost > 0
                          ? onCredit && supplier.trim() !== ''
                            ? `${formatMoney(cost, currency)} (${pricePer(cost, qty, ing.unit, currency)}) is added to what you owe ${supplier.trim()}. The cash book records it when you pay.`
                            : `${formatMoney(cost, currency)} (${pricePer(cost, qty, ing.unit, currency)}) is filed in the cash book as a stock expense.`
                          : 'No price entered, so nothing is filed in the cash book.'}
                      </Outcome>
                    ) : null}
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || !qty} className={FOOT_PRIMARY}>
                        {qty ? `Add ${formatQty(qty, ing.unit)} to stock` : 'Add to stock'}
                      </button>
                    </div>
                  </form>
                )}

                {view === 'consume' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (qty && qty <= ing.quantity)
                        onConsume({
                          quantity: qty,
                          ...(usedFor ? { dishId: usedFor } : { note: reason.trim() }),
                          usedAt: usedOn && usedOn < today ? new Date(`${usedOn}T12:00:00`).toISOString() : undefined,
                        });
                    }}
                  >
                    <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
                      <Field label="How much was used">
                        <QtyField unit={ing.unit} onChange={setQty} big={big} />
                      </Field>
                      <Field label="Date used">
                        <input type="date" value={usedOn} max={today} onChange={(e) => setUsedOn(e.target.value || today)} className={cx(INPUT_BOX, 'tnum')} />
                      </Field>
                      <Field label="Used for" className={usedFor ? 'sm:col-span-2' : undefined}>
                        <Select value={usedFor} onChange={setUsedFor} options={[{ value: '', label: 'Something else' }, ...dishes.map((d) => ({ value: d.id, label: d.name }))]} />
                      </Field>
                      {!usedFor && (
                        <Field label="What for">
                          <TextInput value={reason} onChange={setReason} maxLength={200} placeholder="Staff meal, tasting…" />
                        </Field>
                      )}
                    </div>
                    {qty ? (
                      <Outcome tone={qty > ing.quantity ? 'warn' : 'info'}>
                        {qty > ing.quantity
                          ? `You only have ${formatQty(ing.quantity, ing.unit)}. Use less.`
                          : `${ing.name} goes from ${formatQty(ing.quantity, ing.unit)} to ${formatQty(ing.quantity - qty, ing.unit)}. It shows in the consumption list${usedFor ? ` under ${dishes.find((d) => d.id === usedFor)?.name ?? 'that dish'}` : ''}.`}
                      </Outcome>
                    ) : null}
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || !qty || qty > ing.quantity} className={FOOT_PRIMARY}>
                        {qty ? `Use ${formatQty(qty, ing.unit)}` : 'Use stock'}
                      </button>
                    </div>
                  </form>
                )}

                {view === 'waste' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (qty && qty <= ing.quantity) onWaste({ quantity: qty, reason: wasteWhy, note: wasteNote.trim() });
                    }}
                  >
                    <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
                      <Field label="How much was thrown away">
                        <QtyField unit={ing.unit} onChange={setQty} big={big} />
                      </Field>
                      <Field label="Why">
                        <Select value={wasteWhy} onChange={(v) => setWasteWhy(v as WasteReason)} options={WASTE_REASONS} />
                      </Field>
                      <Field label="Note (optional)" className="sm:col-span-2">
                        <TextInput value={wasteNote} onChange={setWasteNote} maxLength={200} placeholder="Left out overnight, dropped tray…" />
                      </Field>
                    </div>
                    {qty ? (
                      <Outcome tone={qty > ing.quantity ? 'warn' : 'info'}>
                        {qty > ing.quantity
                          ? `You only have ${formatQty(ing.quantity, ing.unit)}. Throw away less.`
                          : `${ing.name} goes from ${formatQty(ing.quantity, ing.unit)} to ${formatQty(ing.quantity - qty, ing.unit)}. It is priced from the delivery it came from and shows in the waste report.`}
                      </Outcome>
                    ) : null}
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || !qty || qty > ing.quantity} className={FOOT_PRIMARY}>
                        {qty ? `Throw away ${formatQty(qty, ing.unit)}` : 'Throw away'}
                      </button>
                    </div>
                  </form>
                )}

                {view === 'recount' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (qty !== '') onRecount(qty);
                    }}
                  >
                    <Field label="What is actually on the shelf" hint={`The system says ${formatQty(ing.quantity, ing.unit)}. Whatever you enter replaces it, and the difference is kept in the history.`}>
                      <QtyField unit={ing.unit} onChange={setQty} big={big} />
                    </Field>
                    {qty !== '' && (
                      <Outcome>
                        {qty === ing.quantity
                          ? 'That matches what the system has. Nothing changes.'
                          : `${ing.name} changes from ${formatQty(ing.quantity, ing.unit)} to ${formatQty(qty, ing.unit)}, ${formatQty(Math.abs(qty - ing.quantity), ing.unit)} ${qty < ing.quantity ? 'less' : 'more'}. The difference is kept in the history.`}
                      </Outcome>
                    )}
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || qty === ''} className={FOOT_PRIMARY}>
                        {qty === '' ? 'Save the number' : `Set ${ing.name} to ${formatQty(qty, ing.unit)}`}
                      </button>
                    </div>
                  </form>
                )}

                {view === 'transfer' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const branch = branches.find((b) => b.id === toBranch);
                      if (qty && branch) onTransfer(branch.id, qty, branch.name);
                    }}
                  >
                    <Field label="Send to">
                      <Select
                        value={toBranch}
                        onChange={setToBranch}
                        options={branches.map((b) => ({
                          value: b.id,
                          label: b.name,
                        }))}
                      />
                    </Field>
                    <Field label="How much" hint={`You have ${formatQty(ing.quantity, ing.unit)}. The oldest stock goes first.`}>
                      <QtyField unit={ing.unit} onChange={setQty} big={big} />
                    </Field>
                    {qty ? (
                      <Outcome tone={qty > ing.quantity ? 'warn' : 'info'}>
                        {qty > ing.quantity
                          ? `You only have ${formatQty(ing.quantity, ing.unit)}. Send less.`
                          : `${branches.find((b) => b.id === toBranch)?.name ?? 'The other branch'} receives ${formatQty(qty, ing.unit)}. You keep ${formatQty(ing.quantity - qty, ing.unit)}.`}
                      </Outcome>
                    ) : null}
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || !qty || qty > ing.quantity} className={FOOT_PRIMARY}>
                        {qty ? `Send ${formatQty(qty, ing.unit)}` : 'Send stock'}
                      </button>
                    </div>
                  </form>
                )}

                {view === 'return' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (lot && qty && qty <= room && refund <= share) void onReturn({ lotId: lot.lotId, quantity: qty, refund, method: refundMethod, note: returnNote.trim() }, lot.supplier).then((ok) => !ok && returnable.reload());
                    }}
                  >
                    {returnable.loading && !returnable.data ? (
                      <p className="text-[13px] text-ink-3">Loading deliveries…</p>
                    ) : !lot ? (
                      <Outcome>There is no delivery with a named supplier left to send back. Only stock received from a supplier can be returned.</Outcome>
                    ) : (
                      <>
                        <Field label="Which delivery">
                          <Select
                            value={lot.lotId}
                            onChange={(id) => {
                              setLotId(id);
                              setQty('');
                              setRefundTyped(false);
                            }}
                            options={lots.map((l) => ({ value: l.lotId, label: `${l.supplier} · ${dayOnly.format(new Date(l.receivedAt))} · ${formatQty(l.remaining, ing.unit)} left` }))}
                          />
                        </Field>
                        <Field label="How much goes back" hint={`Up to ${formatQty(room, ing.unit)}${room < lot.remaining ? ' (what is on the shelf)' : ` of the ${formatQty(lot.quantity, ing.unit)} delivered`}.`}>
                          <QtyField key={lot.lotId} unit={ing.unit} onChange={setQty} big={big} />
                        </Field>
                        <Field
                          label="What they give back"
                          hint={
                            lot.cost
                              ? lot.onCredit
                                ? `It comes off what you still owe ${lot.supplier} first; anything beyond that is money back, recorded as income.`
                                : 'Money back, recorded in the cash book as income. Leave it at 0 if you are waiting for a replacement.'
                              : 'No price was entered for this delivery, so there is nothing to refund.'
                          }
                        >
                          <MoneyInput
                            key={refundKey}
                            value={refund}
                            onChange={(v) => {
                              setRefundTyped(true);
                              setRefund(v);
                            }}
                            currency={currency}
                          />
                        </Field>
                        {refund > 0 && (
                          <Segmented
                            label={lot.onCredit ? 'Any money back received as' : 'Received as'}
                            value={refundMethod}
                            onChange={setRefundMethod}
                            options={[
                              { value: 'CASH', label: 'Cash' },
                              { value: 'CARD', label: 'Bank' },
                            ]}
                          />
                        )}
                        <Field label="Why (optional)">
                          <TextInput value={returnNote} onChange={setReturnNote} maxLength={200} placeholder="Spoiled, wrong item…" />
                        </Field>
                        {qty ? (
                          <Outcome tone={qty > room || refund > share ? 'warn' : 'info'}>
                            {qty > room
                              ? `Only ${formatQty(room, ing.unit)} can go back from that delivery.`
                              : refund > share
                                ? `They can't give back more than ${formatMoney(share, currency)} for this much.`
                                : `${ing.name} goes from ${formatQty(ing.quantity, ing.unit)} to ${formatQty(ing.quantity - qty, ing.unit)}. ${
                                    refund > 0 ? (lot.onCredit ? `${formatMoney(refund, currency)} comes off what you owe ${lot.supplier}, and any of it you have already paid for comes back as money, filed as income.` : `${formatMoney(refund, currency)} is filed in the cash book as income.`) : 'No money is expected back.'
                                  }`}
                          </Outcome>
                        ) : null}
                        <div className={SHEET_FOOT}>
                          <button type="submit" disabled={busy || !qty || qty > room || refund > share} className={FOOT_PRIMARY}>
                            {qty ? `Return ${formatQty(qty, ing.unit)}` : 'Return stock'}
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                )}

                {view === 'edit' && (
                  <form
                    className="grid gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (name.trim()) onEdit({ name: name.trim(), parLevel: par || 0 });
                    }}
                  >
                    <Field label="Name">
                      <TextInput value={name} onChange={setName} maxLength={80} />
                    </Field>
                    <Field label="Warn me when it falls below" hint={par === 0 ? 'Currently off.' : `Currently ${formatQty(ing.parLevel, ing.unit)}.`}>
                      <QtyField unit={ing.unit} onChange={setPar} placeholder={String(big ? ing.parLevel / 1000 : ing.parLevel)} big={big} />
                    </Field>
                    <div className={SHEET_FOOT}>
                      <button type="submit" disabled={busy || !name.trim()} className={FOOT_PRIMARY}>
                        Save
                      </button>
                      <Confirm label="Remove ingredient" question="Remove it from stock?" confirmLabel="Remove" disabled={busy} onConfirm={() => onEdit({ isArchived: true })} />
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </SheetShell>
  );
}
