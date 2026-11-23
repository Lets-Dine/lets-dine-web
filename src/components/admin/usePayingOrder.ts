import { useRef, useState } from 'react';
import type { Order } from '../../domain/types';

/**
 * The order being paid, looked up in a list of open orders. Paying settles it, so it drops out of that list and the
 * lookup goes empty — which unmounts the payment sheet before the cashier sees "Payment successful" and can print.
 * The last order found is kept until the sheet is closed.
 */
export function usePayingOrder(orders: Order[]) {
  const [payingId, setPayingId] = useState<string | null>(null);
  const kept = useRef<Order | null>(null);
  const found = orders.find((o) => o.id === payingId) ?? null;
  if (found) kept.current = found;
  const payingOrder = payingId === null ? null : (found ?? (kept.current?.id === payingId ? kept.current : null));
  return { payingId, setPayingId, payingOrder };
}
