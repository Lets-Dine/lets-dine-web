import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dish, Menu } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { haptic } from '../../platform/haptics';
import { DietMarks, DishImage, QuantityStepper } from '../Bits';
import { Check, Minus, Plus, Search, Star, X } from '../icons';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../ui';
import { orderableOptions } from './DishOptionsDialog';
import type { DishSelection } from './DishOptionsDialog';

export interface TicketLine {
  key: string;
  dish: Dish;
  qty: number;
}

export interface DraftLine extends TicketLine {
  variantId: string | null;
  addOnIds: string[];
}

/**
 * A ticket staff are still lining up — nothing exists server-side until it is placed.
 * A line is a dish *and* its variant and extras: a large and a small of the same dish are two lines.
 * A dish with sizes or extras sets `configuring` (the options dialog's cue); a plain one goes straight on.
 */
export function useTicketDraft(menu: Menu) {
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [configuring, setConfiguring] = useState<Dish | null>(null);
  const add = (dish: Dish, sel: Partial<DishSelection> = {}) => {
    const variantId = sel.variantId ?? null;
    const addOnIds = [...(sel.addOnIds ?? [])].sort();
    const key = [dish.id, variantId, addOnIds.join(',')].join('|');
    const qty = sel.quantity ?? 1;
    setDraft((d) =>
      d.some((l) => l.key === key) ? d.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...d, { key, dish, variantId, addOnIds, qty }],
    );
    haptic.select();
  };
  const pick = (dish: Dish) => {
    const { variants, addOns } = orderableOptions(dish, menu);
    if (variants.length > 0 || addOns.length > 0) setConfiguring(dish);
    else add(dish);
  };
  const changeQty = (key: string, by: number) =>
    setDraft((d) => d.flatMap((l) => (l.key !== key ? [l] : l.qty + by > 0 ? [{ ...l, qty: l.qty + by }] : [])));
  /** "Large · 2× Extra cheese" — what makes two lines of the same dish tell apart. */
  const describe = (l: TicketLine) => {
    const line = l as DraftLine;
    const parts: string[] = [];
    const variant = line.dish.variants.find((v) => v.id === line.variantId);
    if (variant) parts.push(variant.name);
    for (const id of new Set(line.addOnIds)) {
      const n = line.addOnIds.filter((a) => a === id).length;
      const name = menu.addOns.find((a) => a.id === id)?.name ?? 'Extra';
      parts.push(n > 1 ? `${n}× ${name}` : name);
    }
    return parts.join(' · ');
  };
  // Per dish (a large and a small count toward the same tile), and a rough total.
  // Estimate only — the server prices the order when it is placed.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of draft) c[l.dish.id] = (c[l.dish.id] ?? 0) + l.qty;
    return c;
  }, [draft]);
  const priceOf = (l: DraftLine) =>
    (l.variantId ? (l.dish.variants.find((v) => v.id === l.variantId)?.price ?? 0) : l.dish.price) +
    l.addOnIds.reduce((a, id) => a + (menu.addOns.find((x) => x.id === id)?.price ?? 0), 0);
  const total = draft.reduce((sum, l) => sum + priceOf(l) * l.qty, 0);
  return {
    draft,
    setDraft,
    configuring,
    setConfiguring,
    add,
    pick,
    changeQty,
    describe,
    counts,
    total,
    priceOf,
  };
}

/**
 * The menu half of building a ticket: search, category chips, and every orderable dish as a tile.
 *
 * Search narrows as you type and Enter takes the top match. Every tap lands on the ticket at once
 * and the tile answers with a count that bumps, so "did that register?" never has to be asked.
 * `heading` sits above the search; `onClose` adds a close button beside it on small screens.
 */
export function DishMenu({
  menu,
  busy,
  counts,
  lines,
  onPick,
  onQty,
  onClose,
  heading,
}: {
  menu: Menu;
  busy: boolean;
  /** How many of each dish are already on the ticket. */
  counts: Record<string, number>;
  lines: TicketLine[];
  onPick: (dish: Dish) => void;
  /** Change a line's quantity by this much; dropping it to zero removes it. */
  onQty: (key: string, by: number) => void;
  onClose?: () => void;
  heading?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const currency = menu.restaurant.currency;

  const orderable = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);
  const categories = useMemo(() => menu.categories.filter((c) => orderable.some((d) => d.categoryId === c.id)), [menu.categories, orderable]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderable
      .filter((d) => (categoryId ? d.categoryId === categoryId : true))
      .filter((d) => (needle ? d.name.toLowerCase().includes(needle) : true));
  }, [orderable, query, categoryId]);

  const pick = (dish: Dish) => {
    if (busy) return;
    haptic.select();
    onPick(dish);
  };
  // A dish can sit on the ticket as several lines (sizes, extras); stepping down takes from the newest.
  const lessOf = (dish: Dish) => {
    const line = [...lines].reverse().find((l) => l.dish.id === dish.id);
    if (line) onQty(line.key, -1);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {heading}
      <div className="flex items-center gap-2 border-b border-hairline p-3 sm:p-4">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                pick(matches[0]);
              }
            }}
            placeholder="Search the menu — Enter adds the first"
            aria-label="Search the menu"
            className="h-11 w-full rounded-full bg-surface-2 pl-10 pr-9 text-[14.5px] text-ink outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition-colors hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {categories.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-hairline px-3 py-2.5 sm:px-4">
          <button type="button" className={cx(CHIP, categoryId === null ? CHIP_ON : CHIP_OFF)} onClick={() => setCategoryId(null)}>
            All
          </button>
          {categories.map((c) => (
            <button key={c.id} type="button" className={cx(CHIP, categoryId === c.id ? CHIP_ON : CHIP_OFF)} onClick={() => setCategoryId(c.id)}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
      )}

      <p className="sr-only" role="status">
        {matches.length} dish{matches.length === 1 ? '' : 'es'}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {matches.length === 0 ? (
          <p className="py-16 text-center text-[13.5px] text-ink-3">Nothing on the menu matches that.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(164px,1fr))]">
            {matches.map((dish) => {
              const n = counts[dish.id] ?? 0;
              const { variants, addOns } = orderableOptions(dish, menu);
              const prices = variants.map((v) => v.price);
              const price = prices.length > 0 ? `from ${formatMoney(Math.min(...prices), currency)}` : formatMoney(dish.price, currency);
              const hasOptions = variants.length > 0 || addOns.length > 0;
              // A rating never shows without its count, and never before there is one.
              const rated = dish.stats.avgRating !== null && dish.stats.ratingCount > 0;
              return (
                <li key={dish.id} className="relative">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(dish)}
                    aria-label={`${dish.name}, ${price}${n ? `, ${n} on the ticket` : ''}`}
                    className={cx(
                      'group relative isolate block aspect-[5/4] w-full overflow-hidden rounded-[18px] text-left outline-none',
                      'transition-[translate,box-shadow,scale] duration-300 ease-out-quart hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.97] disabled:opacity-50',
                      'focus-visible:ring-2 focus-visible:ring-flame focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                      n > 0 && 'shadow-flame ring-2 ring-flame ring-offset-2 ring-offset-surface',
                    )}
                  >
                    <span className="absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                      <DishImage
                        dish={dish}
                        monogram="text-[52px]"
                        className="size-full transition-transform duration-700 ease-out-quart group-hover:scale-[1.06]"
                      />
                    </span>
                    {/* The plate's caption is set on its own shadow, so it reads on any photo. */}
                    <span
                      className="absolute inset-x-0 bottom-0 -z-10 h-[85%] bg-gradient-to-t from-black/90 via-black/55 to-transparent"
                      aria-hidden
                    />
                    {n > 0 && <span className="absolute inset-0 -z-10 bg-flame/12" aria-hidden />}

                    {/* Once it is on the ticket the count takes the top edge; on a narrow card the two would collide. */}
                    {rated && n === 0 && (
                      <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-[3px] text-[11px] font-semibold leading-none text-white tnum">
                        <Star size={10} className="text-gold" />
                        {dish.stats.avgRating!.toFixed(1)}
                        <span className="font-medium text-white/60">· {dish.stats.ratingCount.toLocaleString('en-US')}</span>
                      </span>
                    )}
                    {n === 0 && (
                      <span
                        className="absolute right-2 top-2 grid size-8 scale-75 place-items-center rounded-full bg-white text-black opacity-0 shadow-lift transition-[opacity,scale] duration-200 ease-out-quart group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
                        aria-hidden
                      >
                        <Plus size={16} />
                      </span>
                    )}

                    <span className="absolute inset-x-0 bottom-0 px-3 pb-2.5">
                      <span className="line-clamp-2 font-display text-[15px] font-semibold leading-[1.15] tracking-[-0.01em] text-balance text-white">
                        {dish.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-white/70">
                        <span className="font-semibold text-white tnum">{price}</span>
                        {hasOptions && <span>· options</span>}
                        <DietMarks dish={dish} />
                      </span>
                    </span>
                  </button>
                  {n > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex animate-pop items-center rounded-full bg-flame text-white shadow-deep">
                      <button
                        type="button"
                        aria-label={`One fewer ${dish.name}`}
                        disabled={busy}
                        onClick={() => lessOf(dish)}
                        className="grid size-8 place-items-center rounded-full transition-transform active:scale-90"
                      >
                        <Minus size={14} />
                      </button>
                      <span key={n} className="min-w-5 animate-bump text-center text-[13.5px] font-bold tnum">
                        {n}
                      </span>
                      <button
                        type="button"
                        aria-label={`One more ${dish.name}`}
                        disabled={busy}
                        onClick={() => pick(dish)}
                        className="grid size-8 place-items-center rounded-full transition-transform active:scale-90"
                      >
                        <Plus size={14} />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The staff-side menu for building a ticket, as a big two-pane modal: every dish
 * in a grid on the left, the ticket so far pinned on the right. It stays open between picks.
 * Below `lg` the ticket collapses to a bar at the bottom that expands on tap.
 */
export function DishTilePicker({
  menu,
  busy,
  counts,
  lines,
  describe,
  total,
  onPick,
  onQty,
  onDone,
}: {
  menu: Menu;
  busy: boolean;
  counts: Record<string, number>;
  lines: TicketLine[];
  /** "Large · 2× Extra cheese" for a line. */
  describe: (line: TicketLine) => string;
  total: number;
  onPick: (dish: Dish) => void;
  onQty: (key: string, by: number) => void;
  onDone: () => void;
}) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const currency = menu.restaurant.currency;
  const onTicket = lines.reduce((n, l) => n + l.qty, 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDone();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-3 backdrop-blur-sm sm:p-6" role="presentation" onClick={onDone}>
      <div
        className="animate-pop flex h-[min(92dvh,860px)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-deep ring-1 ring-hairline ring-inset lg:flex-row"
        role="dialog"
        aria-modal="true"
        aria-label="Add dishes for the diner"
        onClick={(e) => e.stopPropagation()}
      >
        <DishMenu menu={menu} busy={busy} counts={counts} lines={lines} onPick={onPick} onQty={onQty} onClose={onDone} />

        {/* ── Ticket so far ── */}
        <aside className="flex min-h-0 shrink-0 flex-col border-t border-hairline bg-surface-2/40 lg:w-[340px] lg:border-l lg:border-t-0">
          <button
            type="button"
            aria-expanded={ticketOpen}
            onClick={() => setTicketOpen((o) => !o)}
            className="flex items-center justify-between px-4 py-3 text-left lg:pointer-events-none lg:pt-5"
          >
            <span className="min-w-0 truncate text-[15px] font-semibold">On the ticket</span>
            <span className="shrink-0 text-[13px] text-ink-3 tnum">
              {onTicket} item{onTicket === 1 ? '' : 's'} · {formatMoney(total, currency)}
            </span>
          </button>
          <div className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 lg:block', ticketOpen ? 'block max-h-[40dvh]' : 'hidden')}>
            {lines.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] text-ink-3">Tap a dish to add it here.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {lines.map((line) => {
                  const detail = describe(line);
                  return (
                    <li key={line.key} className="flex animate-rise items-center gap-2.5 py-2.5">
                      <DishImage dish={line.dish} className="size-10 shrink-0 rounded-lg" monogram="text-base" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold">{line.dish.name}</span>
                        {detail && <span className="block truncate text-[12px] text-ink-3">{detail}</span>}
                      </span>
                      <QuantityStepper value={line.qty} onChange={(n) => onQty(line.key, n - line.qty)} size="sm" min={0} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2 p-3 lg:p-4">
            <p className="mr-auto hidden text-[13px] text-ink-3 lg:block">
              Estimated total
              <b className="ml-2 text-[16px] font-bold text-ink tnum">{formatMoney(total, currency)}</b>
            </p>
            <button
              type="button"
              onClick={onDone}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-flame px-5 text-[14px] font-semibold text-white transition-transform active:scale-95 lg:flex-none"
            >
              <Check size={15} />
              Done
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
