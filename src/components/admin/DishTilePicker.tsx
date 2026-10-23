import { useMemo, useState } from 'react';
import type { Dish, Menu } from '../../domain/types';
import { formatMoney } from '../../domain/money';
import { haptic } from '../../platform/haptics';
import { Check, Plus, Search, X } from '../icons';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../ui';
import { orderableOptions } from './DishOptionsDialog';

/**
 * The staff-side menu for building a ticket: a quiet typographic list, one row per dish.
 *
 * Search narrows as you type and Enter takes the top match, so a waiter who
 * knows the dish never touches the mouse. Every tap lands on the ticket at once
 * and the row answers — its plus becomes a count that bumps — so
 * "did that register?" never has to be asked. It stays open between picks.
 */
export function DishTilePicker({
  menu,
  busy,
  counts,
  onPick,
  onDone,
}: {
  menu: Menu;
  busy: boolean;
  /** How many of each dish are already on the ticket. */
  counts: Record<string, number>;
  onPick: (dish: Dish) => void;
  onDone: () => void;
}) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const currency = menu.restaurant.currency;

  const orderable = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);
  const categories = useMemo(
    () => menu.categories.filter((c) => orderable.some((d) => d.categoryId === c.id)),
    [menu.categories, orderable],
  );
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return orderable
      .filter((d) => (categoryId ? d.categoryId === categoryId : true))
      .filter((d) => (needle ? d.name.toLowerCase().includes(needle) : true))
      .slice(0, 60);
  }, [orderable, query, categoryId]);

  const onTicket = Object.values(counts).reduce((n, c) => n + c, 0);
  const pick = (dish: Dish) => {
    if (busy) return;
    haptic.select();
    onPick(dish);
  };

  return (
    <div
      className="animate-rise overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline ring-inset"
      onKeyDown={(e) => e.key === 'Escape' && onDone()}
    >
      <div className="flex items-center gap-2 border-b border-hairline p-3">
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
            className="h-10 w-full rounded-full bg-surface-2 pl-10 pr-9 text-[14px] text-ink outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40"
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
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[13.5px] font-semibold ring-1 ring-hairline ring-inset transition-transform active:scale-95"
        >
          <Check size={14} className="text-mint" />
          Done
          {onTicket > 0 && (
            <span key={onTicket} className="animate-bump rounded-full bg-flame px-1.5 text-[11.5px] leading-5 text-white tnum">
              {onTicket}
            </span>
          )}
        </button>
      </div>

      {categories.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-hairline px-3 py-2.5">
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
      <div className="max-h-[24rem] overflow-y-auto overscroll-contain p-2">
        {matches.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] text-ink-3">Nothing on the menu matches that.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {matches.map((dish) => {
              const n = counts[dish.id] ?? 0;
              const { variants, addOns } = orderableOptions(dish, menu);
              const prices = variants.map((v) => v.price);
              const price = prices.length > 0 ? `from ${formatMoney(Math.min(...prices), currency)}` : formatMoney(dish.price, currency);
              const hasOptions = variants.length > 0 || addOns.length > 0;
              return (
                <li key={dish.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(dish)}
                    aria-label={`${dish.name}, ${price}${n ? `, ${n} on the ticket` : ''}`}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-[background-color,scale] duration-150 hover:bg-surface-2 active:scale-[0.985] disabled:opacity-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{dish.name}</span>
                      {hasOptions && <span className="block text-[12px] text-ink-4">Sizes or extras</span>}
                    </span>
                    <span className="shrink-0 text-[13.5px] tnum text-ink-3">{price}</span>
                    <span
                      aria-hidden
                      className={cx(
                        'grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold tnum transition-[background-color,color,scale] duration-300 ease-spring',
                        n > 0 ? 'bg-flame text-white' : 'bg-surface-2 text-flame-1 group-hover:scale-110 group-hover:bg-flame-2/15',
                      )}
                    >
                      {n > 0 ? (
                        <span key={n} className="animate-bump">
                          {n}
                        </span>
                      ) : (
                        <Plus size={15} />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
