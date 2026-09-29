import { useState } from 'react';
import { acceptOrder, advanceDeliveryOrder, advanceOrderItem, rejectOrder, settleDeliveryOrder } from '../../api/staff';
import {
  ADVANCE_LABEL,
  DELIVERY_ADVANCE_LABEL,
  ITEM_ADVANCE_LABEL,
  STATUS_LABEL,
  billableItems,
  canCancelOrder,
  itemStatusSummary,
} from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import type { ItemStatus, Menu, Order, OrderItem, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { relativeTime } from '../time';
import { cx } from '../ui';
import { ChevronRight } from '../icons';
import { ADMIN_TINY, Confirm, StatusPill, useCommand } from './kit';
import { BULK_DONE, FocusRibbon, ItemRow, Progress, nextBulkStage } from './OrderLines';

/**
 * The status color language, borrowed for each ticket card's border. Tailwind only generates CSS
 * for class names it can find as literal text in source — `border-${ACCENT[status]}` would build a
 * string it can never see, so these are whole class names, not fragments assembled at runtime.
 */
const ACCENT_BORDER: Record<OrderStatus, string> = {
  PENDING: 'border-flame-3',
  ACCEPTED: 'border-gold',
  PREPARING: 'border-pass',
  READY: 'border-mint',
  OUT_FOR_DELIVERY: 'border-mint',
  COMPLETED: 'border-ink-4',
  CANCELLED: 'border-berry',
};

const ACCENT_BUTTON: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-3',
  ACCEPTED: 'bg-gold',
  PREPARING: 'bg-pass',
  READY: 'bg-mint',
  OUT_FOR_DELIVERY: 'bg-mint',
  COMPLETED: 'bg-ink-4',
  CANCELLED: 'bg-berry',
};

/**
 * A ticket card, shared by the dashboard's hero and the full pass (`admin/Orders`)
 * so a ticket behaves and reads identically wherever a person happens to be
 * standing — same width, same rows, same rules (§27).
 *
 * The lines stay folded behind a summary so a dense grid of these still fits
 * on one screen. A ticket that is overdue unfolds itself, since the whole
 * reason it is lit is that somebody needs to look inside it.
 */
export function PassCard({
  order,
  index,
  focus,
  now,
  onApply,
  onResync,
}: {
  order: Order;
  index: number;
  focus: Focus | null;
  /** Kept in the type for when Add returns — see `menu`/`canAdd` below. */
  menu: Menu;
  canAdd: boolean;
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
}) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  /** `null` means "nobody has decided" — an overdue ticket then opens on its own. */
  const [opened, setOpened] = useState<boolean | null>(null);
  // Add is commented out for now — see the footer button below.
  // const [adding, setAdding] = useState(false);
  const open = opened ?? focus !== null;

  const noted = order.items.find((i) => i.notes);
  const live = allows('orders:advance') && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const canAdvance = order.status === 'PENDING' && allows('orders:advance');
  const canCancelHere = canCancelOrder(order) && allows('orders:cancel');
  const progress = itemStatusSummary(order);
  const bulk = nextBulkStage(order);
  const isDelivery = order.orderType === 'DELIVERY';
  // The two manual delivery steps only ever apply once the kitchen side is done — a delivery
  // ticket with items still cooking uses the same accept/advance-item controls as dine-in.
  const canDispatch = isDelivery && order.status === 'READY' && allows('orders:advance');
  const canSettleDelivery = isDelivery && order.status === 'OUT_FOR_DELIVERY' && allows('orders:advance');

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

  return (
    <article
      className={cx(
        'animate-rise relative flex flex-col overflow-hidden rounded-2xl bg-surface-2/60',
        'transition-move hover:-translate-y-0.5 hover:shadow-lift border',
        ACCENT_BORDER[order.status],
        focus?.level === 'critical' && 'ring-[1.5px] ring-berry/40',
        focus?.level === 'warn' && 'ring-[1.5px] ring-gold/35',
      )}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-bold tnum">{order.reference}</span>
              {isDelivery && (
                <span className="shrink-0 rounded-full bg-mint/14 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.05em] text-mint-ink">
                  Delivery
                </span>
              )}
              <span className="truncate text-[13px] font-semibold text-ink-2">
                {isDelivery ? order.deliveryCustomerName || 'Guest' : order.tableName}
              </span>
            </div>
            {isDelivery ? (
              <div className="mt-0.5 truncate text-[11.5px] text-ink-3">
                {[order.deliveryPhone, order.deliveryAddress].filter(Boolean).join(' · ') || 'No address on file'}
              </div>
            ) : null}
            <div className={cx('mt-0.5 text-[11.5px] tnum', focus ? 'font-semibold text-berry-ink' : 'text-ink-4')}>
              {relativeTime(order.createdAt)}
            </div>
          </div>
          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
        </div>
      </div>

      <Progress order={order} />

      {focus && <FocusRibbon focus={focus} className="px-4 py-1.5" />}

      {open ? (
        <ul className="divide-y divide-hairline border-t border-hairline px-4">
          {order.items.map((item) => (
            <ItemRow key={item.id} order={order} item={item} now={now} canEdit={live} onApply={onApply} onResync={onResync} />
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="group border-t border-hairline px-4 py-2.5 text-left transition-colors hover:bg-surface-3/40"
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">
              {billableItems(order.items)
                .map((i) => `${i.quantity}× ${i.dishNameSnapshot}`)
                .join(', ')}
            </span>
            <ChevronRight size={14} className="shrink-0 text-ink-4 transition-move group-hover:translate-x-0.5" />
          </span>
          {noted && <span className="mt-1 block truncate text-[12px] italic text-gold">“{noted.notes}”</span>}
          {order.acceptedAt && progress.total > 0 && (
            <span className="mt-1 block text-[12px] font-semibold text-ink-3">
              {progress.ready}/{progress.total} ready — open to move a dish
            </span>
          )}
        </button>
      )}

      {/* Add, commented out for now — see `adding` state above.
      {adding && (
        <DishPicker
          menu={menu}
          busy={pending !== null}
          onClose={() => setAdding(false)}
          onPick={(dish) => apply(`add:${dish.id}`, () => addOrderItem(staff, order.tableId, dish.id), `${dish.name} added`)}
        />
      )}
      */}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        {canAdvance ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => apply(order.id, () => acceptOrder(staff, order.id, 'PENDING'), `${order.reference} accepted`)}
          >
            {pending === order.id ? 'Working…' : ADVANCE_LABEL.PENDING}
          </button>
        ) : bulk && live ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => advanceAll(bulk.stage, bulk.items)}
          >
            {pending === `bulk:${order.id}` ? 'Working…' : `${ITEM_ADVANCE_LABEL[bulk.stage]} all ${bulk.items.length}`}
          </button>
        ) : canDispatch ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => apply(order.id, () => advanceDeliveryOrder(staff, order.id, 'READY'), `${order.reference} out for delivery`)}
          >
            {pending === order.id ? 'Working…' : DELIVERY_ADVANCE_LABEL.READY}
          </button>
        ) : canSettleDelivery ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => apply(order.id, () => settleDeliveryOrder(staff, order.id), `${order.reference} delivered`)}
          >
            {pending === order.id ? 'Working…' : DELIVERY_ADVANCE_LABEL.OUT_FOR_DELIVERY}
          </button>
        ) : (
          <span className="flex-1 text-[12px] text-ink-4">{open ? 'Move each dish above' : 'Nothing to press'}</span>
        )}

        {/* Add, commented out for now — see `adding` state above.
        {live && canAdd && (
          <button
            type="button"
            disabled={pending !== null}
            aria-expanded={adding}
            className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset')}
            onClick={() => {
              setAdding((on) => !on);
              setOpened(true);
            }}
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? 'Close' : 'Add'}
          </button>
        )}
        */}

        {open && (
          <button
            type="button"
            className={cx(ADMIN_TINY, 'px-2 text-ink-4 hover:text-ink-2')}
            onClick={() => setOpened(false)}
          >
            Fold
          </button>
        )}

        {canCancelHere && (
          <Confirm
            label="Cancel"
            question="Cancel this order?"
            confirmLabel="Cancel it"
            disabled={pending !== null}
            onConfirm={() =>
              apply(order.id, () => rejectOrder(staff, order.id, 'Cancelled from the dashboard'), `${order.reference} cancelled`)
            }
          />
        )}
      </div>
    </article>
  );
}
