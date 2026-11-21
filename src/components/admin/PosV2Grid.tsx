import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { formatMoney } from '../../domain/money';
import { matchDishes } from '../../domain/posBoard';
import type { Dish, Menu, MenuCategory } from '../../domain/types';
import { DietMarks, DishImage } from '../Bits';
import { Minus, Search, Sliders, X } from '../icons';
import { cx } from '../ui';
import { orderableOptions } from './DishOptionsDialog';

/**
 * The menu as POS v2 reads it. A hook rather than internal state because the terminal's keyboard layer
 * has to act on the same list the grid is showing — Enter takes `matches[cursor]`, and two copies of
 * that filter would drift apart the moment one of them lagged a render behind.
 */
export function usePosMenu(menu: Menu, query: string, categoryId: string | null) {
  const orderable = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);
  const categories = useMemo(() => menu.categories.filter((c) => orderable.some((d) => d.categoryId === c.id)), [menu.categories, orderable]);
  const matches = useMemo(() => matchDishes(orderable, query, categoryId), [orderable, query, categoryId]);
  return { orderable, categories, matches };
}

/**
 * The dish half of the v2 terminal: a category rail down the side, one search box, and dishes as dense
 * text-first tiles. No photographs — a plate shot is for a diner deciding, and the person at the pass has
 * already been told what to ring up. Rows of names and prices fit three times as many dishes on a laptop
 * screen, which is the difference between scrolling for a Coke and tapping one.
 *
 * Fully controlled: query, category and the keyboard cursor live in the terminal, so the keys and the
 * pixels can never disagree about which dish is "the one Enter would add".
 */
export function PosGrid({
  menu,
  categories,
  matches,
  counts,
  busy,
  query,
  onQuery,
  categoryId,
  onCategory,
  cursor,
  multiplier,
  onPick,
  onLess,
  searchRef,
  listRef,
}: {
  menu: Menu;
  categories: MenuCategory[];
  matches: Dish[];
  /** How many of each dish are on the ticket already, summed across sizes and extras. */
  counts: Record<string, number>;
  busy: boolean;
  query: string;
  onQuery: (q: string) => void;
  categoryId: string | null;
  onCategory: (id: string | null) => void;
  /**
   * Index into `matches` that Enter would ring up: the first match until the arrow keys move it. The mouse deliberately
   * does not move it — a pointer resting over a tile must not change what the next Enter buys.
   */
  cursor: number;
  /** The pending quantity prefix: typing 3 then adding a dish puts three on. */
  multiplier: number | null;
  onPick: (dish: Dish) => void;
  onLess: (dish: Dish) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Held by the terminal: its arrow keys read the real column count off this element. */
  listRef: RefObject<HTMLUListElement | null>;
}) {
  const currency = menu.restaurant.currency;

  // Arrowing off the bottom of the viewport has to bring the tile with it, or the cursor is a rumour.
  useEffect(() => {
    if (cursor < 0) return;
    listRef.current?.children[cursor]?.querySelector('button')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <nav aria-label="Category" className="hidden w-42 shrink-0 flex-col border-r border-hairline lg:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain py-3 pr-2 pl-3">
          <RailButton active={categoryId === null} onClick={() => onCategory(null)}>
            Everything
          </RailButton>
          {categories.map((c) => (
            <RailButton key={c.id} active={categoryId === c.id} onClick={() => onCategory(c.id)}>
              {c.name}
            </RailButton>
          ))}
        </div>
        <p className="border-t border-hairline px-3 py-2.5 text-[11.5px] text-ink-4">
          <Key>[</Key> <Key>]</Key> steps through these
        </p>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-3 pt-3 pb-2 sm:px-4">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Type a dish — Enter rings up the first"
              aria-label="Search the menu"
              className="h-11 w-full rounded-lg bg-surface-2 pr-9 pl-10 text-[14.5px] text-ink caret-flame-2 outline-none ring-1 ring-hairline ring-inset selection:bg-flame/25 placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/50"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => onQuery('')}
                className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full text-ink-4 transition-colors hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {/* The multiplier is the one place the screen must shout: ringing up 6 when you meant 1 is a refund and an apology. */}
          <span
            role="status"
            aria-label={multiplier ? `Next dish goes on ${multiplier} times` : 'No quantity typed'}
            className={cx(
              'grid h-11 w-16 shrink-0 place-items-center rounded-lg text-[19px] font-bold tnum ring-1 ring-inset transition-colors duration-150',
              multiplier ? 'animate-pop bg-flame text-white ring-white/15' : 'bg-surface-2 text-ink-4 ring-hairline',
            )}
          >
            {multiplier ? `×${multiplier}` : '×1'}
          </span>
        </div>

        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2 sm:px-4 lg:hidden" role="group" aria-label="Category">
          <RailChip active={categoryId === null} onClick={() => onCategory(null)}>
            Everything
          </RailChip>
          {categories.map((c) => (
            <RailChip key={c.id} active={categoryId === c.id} onClick={() => onCategory(c.id)}>
              {c.name}
            </RailChip>
          ))}
        </div>

        <p className="sr-only" role="status">
          {matches.length} dish{matches.length === 1 ? '' : 'es'}
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
          {matches.length === 0 ? (
            <p className="py-20 text-center text-[14px] text-ink-3">
              Nothing on the menu matches {query.trim() ? <b className="font-semibold text-ink">“{query.trim()}”</b> : 'this category'}.
            </p>
          ) : (
            // A touch wider than text alone needed, so a name still gets two lines next to a photo.
            <ul ref={listRef} className="grid grid-cols-[repeat(auto-fill,minmax(172px,1fr))] gap-2">
              {matches.map((dish, i) => {
                const n = counts[dish.id] ?? 0;
                const { variants, addOns } = orderableOptions(dish, menu);
                const prices = variants.map((v) => v.price);
                const price = prices.length > 0 ? `from ${formatMoney(Math.min(...prices), currency)}` : formatMoney(dish.price, currency);
                return (
                  <li key={dish.id} className="relative">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onPick(dish)}
                      aria-label={`${dish.name}, ${price}${n ? `, ${n} on the ticket` : ''}`}
                      className={cx(
                        'flex h-21 w-full items-stretch gap-2.5 rounded-xl p-2.5 text-left ring-1 ring-inset',
                        'transition-[background-color,box-shadow,scale] duration-150 ease-out-quart active:scale-[0.97] disabled:opacity-40',
                        'outline-none focus-visible:ring-2 focus-visible:ring-flame',
                        n > 0 ? 'bg-flame/[0.09] ring-flame/50' : 'bg-surface-2 ring-hairline hover:bg-surface-3',
                        i === cursor && 'ring-2 ring-flame shadow-[0_0_0_4px_rgb(255_120_55/0.14)]',
                      )}
                    >
                      {/* Only a dish that actually has a photo gives up width for one. A monogram placeholder would
                          cost every tile on a menu with no pictures the same space, and say nothing in return. */}
                      {dish.imageUrl && <DishImage dish={dish} className="size-14 shrink-0 self-center rounded-lg" />}
                      <span className="flex min-w-0 flex-1 flex-col justify-between">
                        <span className="line-clamp-2 text-[14px] leading-tight font-semibold text-balance text-ink">{dish.name}</span>
                        <span className="flex w-full items-end justify-between gap-1">
                          <span className="font-mono text-[12.5px] tracking-tight text-ink-2 tnum">{price}</span>
                          {(variants.length > 0 || addOns.length > 0 || dish.dietaryType) && (
                            <span className="flex items-center gap-1 text-[11px] text-ink-4">
                              {(variants.length > 0 || addOns.length > 0) && <Sliders size={11} aria-label="has sizes or extras" />}
                              <DietMarks dish={dish} />
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    {n > 0 && (
                      <span className="pointer-events-none absolute -top-1.5 -right-1.5 flex items-center rounded-full bg-flame text-white shadow-[0_2px_6px_-1px_rgb(0_0_0/0.45)] ring-2 ring-surface">
                        <button
                          type="button"
                          aria-label={`One fewer ${dish.name}`}
                          disabled={busy}
                          onClick={() => onLess(dish)}
                          className="pointer-events-auto grid size-6 place-items-center rounded-full transition-transform active:scale-90"
                        >
                          <Minus size={11} />
                        </button>
                        <span key={n} className="animate-bump min-w-4 text-center text-[12px] font-bold tnum">
                          {n}
                        </span>
                        <span aria-hidden className="w-1.5" />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** A key as it is printed on screen. Every shortcut in POS v2 is shown beside the thing it does — one nobody can see is one nobody uses. */
export function Key({ children }: { children: string }) {
  return <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-hairline-strong bg-surface-2 px-1 font-mono text-[10.5px] leading-none text-ink-2">{children}</kbd>;
}

function RailButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'flex min-h-10 items-center rounded-lg px-2.5 text-left text-[13.5px] font-semibold transition-colors',
        active ? 'bg-flame/12 text-flame-3 ring-1 ring-flame/35 ring-inset' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

function RailChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors',
        active ? 'bg-flame text-white' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset',
      )}
    >
      {children}
    </button>
  );
}
