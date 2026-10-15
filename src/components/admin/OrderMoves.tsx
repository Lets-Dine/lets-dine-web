import { useState } from 'react';
import type { ReactNode } from 'react';
import { useAsync } from '../../state/useAsync';
import { branchKeyOf, completeDelivery, fetchAssignmentForOrder, settleDelivery } from '../../api/delivery';
import { acceptOrder, advanceDeliveryOrder, advanceOrderItem, deliverOrder, rejectOrder } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import { ADVANCE_LABEL, DELIVERY_ADVANCE_LABEL, ITEM_ADVANCE_LABEL, canCancelOrder } from '../../domain/orderStatus';
import type { ItemStatus, Order, OrderItem, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { cx } from '../ui';
import { Receipt } from '../icons';
import { DispatchSheet, HandoverSheet, SettleOrderSheet } from './delivery';
import { Confirm, useCommand } from './kit';
import { BULK_DONE, nextBulkStage } from './OrderLines';

/** The status colour of an order's one next move, so the button is the colour of where the order is heading. */
export const ACCENT_BUTTON: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-3',
  ACCEPTED: 'bg-gold',
  PREPARING: 'bg-pass',
  READY: 'bg-mint',
  OUT_FOR_DELIVERY: 'bg-mint',
  SETTLE: 'bg-flame-2',
  UNPAID: 'bg-flame-2',
  COMPLETED: 'bg-ink-4',
  CANCELLED: 'bg-berry',
};

/**
 * The whole-order moves, shared by the pass card and the order sheet so a ticket offers exactly the
 * same next step wherever it is opened: accept, start/plate/serve a whole stage, dispatch, mark
 * delivered, settle a delivery, take a floor payment, or cancel. The caller places the pieces —
 * `move` and `cancel` are the buttons, `sheets` must be rendered once somewhere in the tree.
 */
export function useOrderMoves(
  order: Order,
  {
    onApply,
    onResync,
    onTakePayment,
  }: { onApply: (order: Order) => void; onResync: () => void; onTakePayment?: (order: Order) => void },
  { moveClass, cancelLabel = 'Cancel' }: { moveClass: string; cancelLabel?: string },
) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  /** Which delivery sheet is up: choosing a courier before the ticket goes out, or recording the cash when it lands. */
  const [sheet, setSheet] = useState<'dispatch' | 'handover' | 'settle' | null>(null);

  const live = allows('orders:advance') && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const bulk = nextBulkStage(order);
  const isDelivery = order.orderType === 'DELIVERY';
  // The two manual delivery steps only ever apply once the kitchen side is done — a delivery
  // ticket with items still cooking uses the same accept/advance-item controls as dine-in.
  const canDispatch = isDelivery && order.status === 'READY' && allows('orders:advance');
  const canMarkDelivered = isDelivery && order.status === 'OUT_FOR_DELIVERY' && allows('orders:advance');
  const canSettleDelivery = isDelivery && order.status === 'SETTLE' && allows('orders:advance');
  const assignment = useAsync(
    () => (isDelivery && order.status !== 'PENDING' ? fetchAssignmentForOrder(order.id) : Promise.resolve(null)),
    [order.id, order.status, isDelivery],
  );
  const courierRun = assignment.data;

  const apply = (key: string, action: () => Promise<Order>, success?: string) =>
    void run(key, async () => onApply(await action()), success).then((ok) => {
      if (!ok) onResync();
    });

  const advanceAll = (stage: ItemStatus, items: OrderItem[]) =>
    void run(
      `bulk:${order.id}`,
      async () => {
        let latest = order;
        for (const item of items) latest = await advanceOrderItem(staff, order.id, item.id, stage);
        onApply(latest);
      },
      `${items.length} dishes ${BULK_DONE[stage]}`,
    ).then((ok) => {
      if (!ok) onResync();
    });

  const button = cx(moveClass, 'justify-center text-white', ACCENT_BUTTON[order.status]);
  const busy = pending !== null;

  const move: ReactNode =
    order.status === 'PENDING' && allows('orders:advance') ? (
      <button type="button" disabled={busy} className={button} onClick={() => apply(order.id, () => acceptOrder(staff, order.id, 'PENDING'), `${order.reference} accepted`)}>
        {pending === order.id ? 'Working…' : ADVANCE_LABEL.PENDING}
      </button>
    ) : bulk && live ? (
      <button type="button" disabled={busy} className={button} onClick={() => advanceAll(bulk.stage, bulk.items)}>
        {pending === `bulk:${order.id}` ? 'Working…' : `${ITEM_ADVANCE_LABEL[bulk.stage]} all ${bulk.items.length}`}
      </button>
    ) : canDispatch ? (
      <button type="button" disabled={busy} className={button} onClick={() => setSheet('dispatch')}>
        {pending === order.id ? 'Working…' : DELIVERY_ADVANCE_LABEL.READY}
      </button>
    ) : canMarkDelivered ? (
      <button
        type="button"
        disabled={busy}
        className={button}
        onClick={() =>
          courierRun && courierRun.status === 'ASSIGNED' && courierRun.cashToCollect > 0
            ? setSheet('handover')
            : apply(
                order.id,
                async () => {
                  await completeDelivery(order.id, 0);
                  return deliverOrder(staff, order.id);
                },
                `${order.reference} delivered`,
              )
        }
      >
        {pending === order.id ? 'Working…' : DELIVERY_ADVANCE_LABEL.OUT_FOR_DELIVERY}
      </button>
    ) : canSettleDelivery ? (
      <button type="button" disabled={busy} className={button} onClick={() => setSheet('settle')}>
        {DELIVERY_ADVANCE_LABEL.SETTLE} · {formatMoney(order.total, order.currency)}
      </button>
    ) : order.status === 'UNPAID' && onTakePayment && live ? (
      <button type="button" disabled={busy} className={cx(button, 'gap-1.5')} onClick={() => onTakePayment(order)}>
        <Receipt size={13} /> Take payment · {formatMoney(order.total, order.currency)}
      </button>
    ) : null;

  const cancel: ReactNode =
    canCancelOrder(order) && allows('orders:cancel') ? (
      <Confirm
        label={cancelLabel}
        question="Cancel this order?"
        confirmLabel="Cancel it"
        disabled={busy}
        onConfirm={() => apply(order.id, () => rejectOrder(staff, order.id, 'Cancelled from the dashboard'), `${order.reference} cancelled`)}
      />
    ) : null;

  const sheets: ReactNode = (
    <>
      {sheet === 'dispatch' && (
        <DispatchSheet
          branchId={branchKeyOf(staff)}
          order={order}
          onClose={() => setSheet(null)}
          onDispatch={async () => {
            try {
              onApply(await advanceDeliveryOrder(staff, order.id, 'READY'));
              assignment.reload();
            } catch (error) {
              onResync();
              throw error;
            }
          }}
        />
      )}
      {sheet === 'handover' && courierRun && (
        <HandoverSheet
          order={order}
          run={courierRun}
          onClose={() => setSheet(null)}
          onDelivered={async () => {
            try {
              onApply(await deliverOrder(staff, order.id));
              assignment.reload();
            } catch (error) {
              onResync();
              throw error;
            }
          }}
        />
      )}
      {sheet === 'settle' && (
        <SettleOrderSheet
          order={order}
          run={courierRun}
          canPayFee={allows('ledger:manage')}
          onClose={() => setSheet(null)}
          onSettle={async (input) => {
            try {
              onApply(await settleDelivery(staff, branchKeyOf(staff), order, input));
              assignment.reload();
            } catch (error) {
              onResync();
              throw error;
            }
          }}
        />
      )}
    </>
  );

  return { move, cancel, sheets, courierRun, live };
}
