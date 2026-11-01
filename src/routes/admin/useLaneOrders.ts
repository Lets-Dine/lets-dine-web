import { useMemo } from 'react';
import { listOrdersByStatus } from '../../api/staff';
import type { Order, OrderStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

/**
 * The orders behind one tab of the Orders page: fetched for that tab's statuses whenever it is opened
 * (`null` — the "needs you" tab — reads the live queue only), then overlaid with the dashboard's live
 * orders so a press or a pushed update lands before the next fetch.
 */
export function useLaneOrders(statuses: OrderStatus[] | null): { orders: Order[]; loading: boolean } {
  const staff = useStaff();
  const { orders: live } = useDashboard();
  const key = statuses?.join(',') ?? '';
  const fetched = useAsync(() => (statuses ? listOrdersByStatus(staff, statuses) : Promise.resolve([] as Order[])), [staff, key]);
  const orders = useMemo(() => {
    const byId = new Map((fetched.data ?? []).map((o) => [o.id, o]));
    for (const o of live) byId.set(o.id, o);
    return [...byId.values()];
  }, [fetched.data, live]);
  return { orders, loading: fetched.loading };
}
