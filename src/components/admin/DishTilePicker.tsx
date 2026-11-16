import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Dish, Menu } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { haptic } from '../../platform/haptics';
import { DietMarks, DishImage, QuantityStepper } from '../Bits';
import { Check, Minus, Plus, Search, X } from '../icons';
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
  autoFocusSearch = true,
  pos = false,
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
  /** Off on a tablet, where focusing the search box would throw the keyboard up over the menu. */
  autoFocusSearch?: boolean;
  /** POS terminal look: category chips and search share one row. */
  pos?: boolean;
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
      <div className={cx('flex items-center gap-2', pos ? 'px-3 pt-2 pb-1 sm:px-4' : 'border-b border-hairline p-3 sm:p-4')}>
        {pos && (
          <div className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto" role="group" aria-label="Category">
            <button type="button" aria-pressed={categoryId === null} className={cx(CHIP, 'h-9 px-3.5 text-[13px]', categoryId === null ? CHIP_ON : CHIP_OFF)} onClick={() => setCategoryId(null)}>
              All Categories
            </button>
            {categories.map((c) => (
              <button key={c.id} type="button" aria-pressed={categoryId === c.id} className={cx(CHIP, 'h-9 px-3.5 text-[13px]', categoryId === c.id ? CHIP_ON : CHIP_OFF)} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className={cx('relative min-w-0', pos ? 'w-36 shrink-0 sm:w-44' : 'flex-1')}>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-4" />
          <input
            value={query}
            autoFocus={autoFocusSearch}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                pick(matches[0]);
              }
            }}
            placeholder={pos ? 'Search' : 'Search the menu — Enter adds the first'}
            aria-label="Search the menu"
            className={cx('w-full rounded-full bg-surface-2 text-ink outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40', pos ? 'h-9 pl-9 pr-8 text-[13px]' : 'h-11 pl-10 pr-9 text-[14.5px]')}
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

      {!pos && categories.length > 1 && (
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
          <ul className={cx('grid', pos ? 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-x-3 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(176px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(164px,1fr))] gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(192px,1fr))]')}>
            {matches.map((dish) => {
              const n = counts[dish.id] ?? 0;
              const { variants, addOns } = orderableOptions(dish, menu);
              const prices = variants.map((v) => v.price);
              const price = prices.length > 0 ? `from ${formatMoney(Math.min(...prices), currency)}` : formatMoney(dish.price, currency);
              const hasOptions = variants.length > 0 || addOns.length > 0;
              return (
                <li key={dish.id}>
                  <div
                    className={cx(
                      'group relative flex h-full flex-col bg-surface ring-1 ring-hairline ring-inset',
                      pos ? 'rounded-[22px] p-3' : 'rounded-[28px] p-4',
                      'shadow-[0_1px_2px_rgb(0_0_0/0.06),0_14px_26px_-20px_rgb(0_0_0/0.5)] transition-[translate,box-shadow,background-color] duration-300 ease-out-quart',
                      'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(0_0_0/0.08),0_22px_34px_-22px_rgb(0_0_0/0.55)]',
                      n > 0 && 'bg-flame/[0.07] ring-2 ring-flame',
                    )}
                  >
                    {/* The whole card takes the tap, padding included. The plate and its add control sit above this; the photo's own button is the one assistive tech sees. */}
                    <button type="button" tabIndex={-1} aria-hidden disabled={busy} onClick={() => pick(dish)} className="absolute inset-0 rounded-[inherit] outline-none disabled:opacity-50" />
                    {/* The plate, seen from above. The tap target covers it; the add control straddles its foot. */}
                    <div className={cx('relative aspect-square shrink-0', pos && 'mx-auto w-[68%]')}>
                      <span className="absolute inset-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-black/5 ring-inset" aria-hidden>
                        <DishImage dish={dish} monogram="text-[48px]" className="size-full transition-transform duration-700 ease-out-quart group-hover:scale-[1.05]" />
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => pick(dish)}
                        aria-label={`${dish.name}, ${price}${n ? `, ${n} on the ticket` : ''}`}
                        className="absolute inset-0 rounded-full outline-none transition-transform duration-200 ease-out-quart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame active:scale-[0.98] disabled:opacity-50"
                      />
                      {n === 0 ? (
                        // A real button, not a drawing on top of one: half of it hangs below the photo, where the photo's own tap
                        // target stops, so it has to take the tap itself.
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => pick(dish)}
                          aria-label={`Add ${dish.name}`}
                          className={cx('absolute left-1/2 grid -translate-x-1/2', pos ? '-bottom-3.5 size-8' : '-bottom-4 size-11', ' place-items-center rounded-full bg-flame text-white shadow-[0_4px_10px_-2px_rgb(0_0_0/0.4)] ring-4 ring-surface outline-none transition-transform duration-200 ease-out-quart group-hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame active:scale-95 disabled:opacity-50')}
                        >
                          <Plus size={pos ? 15 : 18} />
                        </button>
                      ) : (
                        <span className={cx('absolute left-1/2 flex -translate-x-1/2 animate-pop items-center rounded-full bg-flame text-white shadow-[0_4px_12px_-2px_rgb(0_0_0/0.45)] ring-4 ring-surface', pos ? '-bottom-3.5' : '-bottom-4')}>
                          <button
                            type="button"
                            aria-label={`One fewer ${dish.name}`}
                            disabled={busy}
                            onClick={() => lessOf(dish)}
                            className={cx('grid place-items-center rounded-full transition-transform active:scale-90', pos ? 'size-8' : 'size-11')}
                          >
                            <Minus size={pos ? 13 : 15} />
                          </button>
                          <span key={n} className="min-w-6 animate-bump text-center text-[15px] font-bold tnum">
                            {n}
                          </span>
                          <button
                            type="button"
                            aria-label={`One more ${dish.name}`}
                            disabled={busy}
                            onClick={() => pick(dish)}
                            className={cx('grid place-items-center rounded-full transition-transform active:scale-90', pos ? 'size-8' : 'size-11')}
                          >
                            <Plus size={pos ? 13 : 15} />
                          </button>
                        </span>
                      )}
                    </div>

                    {/* The caption taps like the photo does; the photo's button is the one assistive tech sees. */}
                    <button type="button" tabIndex={-1} aria-hidden disabled={busy} onClick={() => pick(dish)} className={cx(pos ? 'mt-5' : 'mt-7', 'block flex-1 text-center outline-none')}>
                      <span className="line-clamp-2 font-display text-[17px] leading-[1.2] font-semibold tracking-[-0.01em] text-balance text-ink">{dish.name}</span>
                      <span aria-hidden className="mx-auto mt-2.5 block h-px w-8 bg-gold/70" />
                      <span className={cx('mt-2.5 block tnum', pos ? 'font-display text-[17px] leading-none font-bold text-flame-3' : 'font-mono text-[13px] tracking-wide text-ink-2')}>{price}</span>
                      {(hasOptions || dish.dietaryType) && (
                        <span className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[12px] text-ink-3">
                          {hasOptions && <span className="italic">sizes &amp; extras</span>}
                          <DietMarks dish={dish} />
                        </span>
                      )}
                    </button>
                  </div>
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
        className="animate-pop flex h-[min(92dvh,860px)] w-full flex-col overflow-hidden rounded-3xl bg-surface text-ink shadow-deep ring-1 ring-hairline ring-inset lg:flex-row"
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
