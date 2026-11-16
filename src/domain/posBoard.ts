import type { DiningTable, Dish, Order } from './types';
import { minutesSince } from './orderStatus';
import type { Focus } from './orderStatus';

/**
 * The dishes a query and category show, in the order they are shown.
 *
 * Kept as a plain function, and out of the grid component, because the terminal has to know where a dish will land in
 * the list it is *about* to show: when the search clears after a dish is rung up, the cursor follows that dish into the
 * revealed list instead of snapping to row one. Otherwise typing "coke" then pressing Enter twice buys a Coke and then
 * whatever dish happens to sit first in the whole menu.
 */
export function matchDishes(orderable: Dish[], query: string, categoryId: string | null): Dish[] {
  const needle = query.trim().toLowerCase();
  // Searching looks across the whole menu: at the pass you type the dish, you don't first remember its category.
  const pool = needle || !categoryId ? orderable : orderable.filter((d) => d.categoryId === categoryId);
  if (!needle) return pool;
  // A name that starts with what was typed is what was meant; a name that merely contains it is the fallback.
  const starts = pool.filter((d) => d.name.toLowerCase().startsWith(needle));
  const rest = pool.filter((d) => !d.name.toLowerCase().startsWith(needle) && d.name.toLowerCase().includes(needle));
  return [...starts, ...rest];
}

/** Where one seated table has got to, as the POS board shows it. */
export interface TableService {
  /** How long the visit has been running — the age of its *first* order, not its latest round. */
  minutes: number;
  /** Everything ordered on this visit so far, cancellations excluded. */
  total: number;
  /** Dishes the kitchen still owes: not started, or on the stove. */
  coming: number;
  /** Dishes plated and waiting for someone to carry them out. */
  ready: number;
  /** The worst flag on any of the visit's orders, as the pass reads them. */
  urgent: 'warn' | 'critical' | null;
}

/**
 * What the board prints on each seated table, from the live order queue. A table with a session but no orders yet
 * is left out: it is seated, and there is nothing to say about it beyond that.
 */
export function tableService(tables: DiningTable[], orders: Order[], flags: Map<string, Focus>, now: number): Map<string, TableService> {
  const map = new Map<string, TableService>();
  for (const t of tables) {
    if (!t.currentSessionId) continue;
    const mine = orders.filter((o) => o.sessionId === t.currentSessionId && o.status !== 'CANCELLED');
    if (mine.length === 0) continue;
    const items = mine.flatMap((o) => o.items).filter((i) => i.status !== 'CANCELLED');
    const worst = mine.map((o) => flags.get(o.id)).filter((f) => f !== undefined);
    map.set(t.id, {
      minutes: Math.max(...mine.map((o) => minutesSince(o.createdAt, now))),
      total: mine.reduce((n, o) => n + o.total, 0),
      coming: items.filter((i) => i.status === 'PENDING' || i.status === 'PREPARING').length,
      ready: items.filter((i) => i.status === 'READY').length,
      urgent: worst.some((f) => f.level === 'critical') ? 'critical' : worst.length > 0 ? 'warn' : null,
    });
  }
  return map;
}
