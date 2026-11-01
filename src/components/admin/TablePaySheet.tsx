import { useMemo } from 'react';
import { IS_LIVE_API } from '../../api/http';
import { completePayment, endTableSession, fetchBilledItems, fetchOrdersBySession } from '../../api/staff';
import type { Order } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from '../../routes/admin/AdminLayout';
import { useCommand } from './kit';
import { PaymentSheet } from './PaymentSheet';

/**
 * Paying one table order without leaving the page it was opened from. It rides on split
 * billing — the order's lines come up already taken as one share — so it is live tables
 * only and manager-only, like the split itself.
 */
function eligible(order: Order, canSplit: boolean): boolean {
  return IS_LIVE_API && Boolean(order.tableId) && order.status !== 'CANCELLED' && canSplit;
}

/** Whether "Pay this order" should show: a table order with at least one line no share has paid yet. */
export function useCanPayTableOrder(order: Order): boolean {
  const { allows } = useAuth();
  const ok = eligible(order, allows('payments:split'));
  const billed = useAsync(() => (ok ? fetchBilledItems(order.sessionId) : Promise.resolve(null)), [order.sessionId, ok]);
  if (!ok || !billed.data) return false;
  const paid = new Map(billed.data.map((b) => [b.orderItemId, b.quantity]));
  return order.items.some((i) => i.status !== 'CANCELLED' && i.quantity > (paid.get(i.id) ?? 0));
}

/** The split-bill sheet for `order`'s table visit, opened on that order's lines. Mount it only while paying. */
export function TablePaySheet({ order, onClose, onPaid }: { order: Order; onClose: () => void; onPaid: () => void }) {
  const staff = useStaff();
  const { menu } = useDashboard();
  const { pending, run } = useCommand();
  const visit = useAsync(() => fetchOrdersBySession(staff, order.sessionId), [staff, order.sessionId]);
  const billed = useAsync(() => fetchBilledItems(order.sessionId), [order.sessionId]);
  const dishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);

  // The sheet picks its starting selection when it mounts, so it waits for the visit and its paid lines.
  if (!visit.data || !billed.data) return null;
  const table = { id: order.tableId!, name: order.tableName ?? 'Table', qrToken: order.tableId! };
  const settled = () => {
    onPaid();
    visit.reload();
    billed.reload();
  };

  return (
    <PaymentSheet
      table={table}
      orders={visit.data}
      dishes={dishes}
      restaurantName={menu.restaurant.name}
      legalName={menu.restaurant.legalName}
      vatPanNumber={menu.restaurant.vatPanNumber}
      serviceChargeRate={menu.restaurant.serviceChargeRate}
      taxRate={menu.restaurant.taxRate}
      pending={pending}
      billed={billed.data}
      payOrderId={order.id}
      onClose={onClose}
      onSettle={(c) =>
        run(
          table.id,
          () => completePayment(staff, order.sessionId, c.items, c.method, c.discount, c.endSession, c.redeemPoints, c.customerId, c.credit, c.paidNow, c.dueInDays, c.split, c.shareId),
          c.split ? 'Share paid' : `${table.name} paid up`,
        ).then((ok) => {
          if (ok) settled();
          return ok;
        })
      }
      onEndSession={() =>
        void run(table.id, () => endTableSession(staff, table.id), `${table.name}'s visit ended`).then((ok) => {
          if (!ok) return;
          settled();
          onClose();
        })
      }
      onShowQr={onClose}
    />
  );
}
