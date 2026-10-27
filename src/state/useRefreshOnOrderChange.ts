import { useEffect, useMemo, useRef } from 'react';
import type { Order } from '../domain/types';

/**
 * Re-reads figures that are computed on the server (today's revenue, what is selling) whenever the live order list
 * changes — a status moving, an item being served, an order arriving. Waits a beat so a burst of changes (a whole
 * table's items served together) triggers one read, not a dozen. Skips the first render: the page's own load
 * already fetched them.
 */
export function useRefreshOnOrderChange(orders: Order[], reload: () => void, delayMs = 1500) {
  const stamp = useMemo(() => orders.map((o) => `${o.id}:${o.status}:${o.items.map((i) => i.status).join(',')}`).join('|'), [orders]);
  const first = useRef(true);
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => latest.current(), delayMs);
    return () => clearTimeout(timer);
  }, [stamp, delayMs]);
}
