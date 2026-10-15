import { useState } from 'react';
import { formatMoney } from '../../domain/money';
import { STATUS_LABEL, billableItems, itemStatusSummary } from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import type { Menu, Order, OrderStatus } from '../../domain/types';
import { relativeTime } from '../time';
import { cx } from '../ui';
import { Bike, ChevronRight } from '../icons';
import { CourierTag } from './delivery';
import { ADMIN_TINY, StatusPill } from './kit';
import { FocusRibbon, ItemRow, Progress } from './OrderLines';
import { useOrderMoves } from './OrderMoves';

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
  SETTLE: 'border-flame-2',
  UNPAID: 'border-flame-2',
  COMPLETED: 'border-ink-4',
  CANCELLED: 'border-berry',
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
  onTakePayment,
  onOpenDetail,
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
  /** A floor order (§16b) sits at `UNPAID` once every dish is served — omitted by callers (the
   *  kitchen dashboard, the full pass) that have nowhere for a payment to go. */
  onTakePayment?: (order: Order) => void;
  /** When given, the reference opens the order's sheet. */
  onOpenDetail?: (order: Order) => void;
}) {
  /** `null` means "nobody has decided" — an overdue ticket then opens on its own. */
  const [opened, setOpened] = useState<boolean | null>(null);
  // Add is commented out for now — see the footer button below.
  // const [adding, setAdding] = useState(false);
  const open = opened ?? focus !== null;
  const { move, cancel, sheets, courierRun, live } = useOrderMoves(order, { onApply, onResync, onTakePayment }, { moveClass: cx(ADMIN_TINY, 'flex-1') });

  const noted = order.items.find((i) => i.notes);
  const progress = itemStatusSummary(order);
  const isDelivery = order.orderType === 'DELIVERY';

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
              {onOpenDetail ? (
                <button
                  type="button"
                  onClick={() => onOpenDetail(order)}
                  aria-label={`Open order ${order.reference}`}
                  className="group/ref -ml-1 inline-flex shrink-0 items-center gap-0.5 self-center rounded-lg bg-flame-2/12 py-0.5 pl-2 pr-1 text-[14px] font-bold text-flame-1 ring-1 ring-flame-2/30 ring-inset transition-move hover:bg-flame-2/20 hover:ring-flame-2/50 active:scale-95"
                >
                  <span className="tnum">{order.reference}</span>
                  <ChevronRight size={14} className="transition-move group-hover/ref:translate-x-0.5" />
                </button>
              ) : (
                <span className="text-[14px] font-bold tnum">{order.reference}</span>
              )}
              {isDelivery && (
                <span className="shrink-0 self-center text-mint-ink" role="img" aria-label="Delivery">
                  <Bike size={15} />
                </span>
              )}
              {!isDelivery && order.floorVisitorName && (
                <span className="shrink-0 rounded-full bg-gold/14 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold-ink">
                  {order.floorName || 'Floor'}
                </span>
              )}
              {!isDelivery && (
                <span className="truncate text-[13px] font-semibold text-ink-2">{order.tableName ?? order.floorVisitorName ?? 'Floor order'}</span>
              )}
            </div>
            {isDelivery && (
              <div className="mt-0.5 truncate text-[13px] text-ink-3">
                <span className="font-semibold text-ink-2">{order.deliveryCustomerName || 'Guest'}</span>
                {(order.deliveryAddress || order.deliveryPhone) && <> · {order.deliveryAddress || order.deliveryPhone}</>}
              </div>
            )}
            {!isDelivery && order.customerName && (
              <div className="mt-0.5 truncate text-[13px] font-semibold text-ink-2">{order.customerName}</div>
            )}
            {/* One quiet line: who has it, the cash they carry, and how long ago it was placed. */}
            <div className="mt-1 flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12px] tnum">
              {isDelivery && courierRun && (
                <>
                  <CourierTag run={courierRun} />
                  {courierRun.status === 'ASSIGNED' && courierRun.cashToCollect > 0 && (
                    <span className="text-ink-4">{formatMoney(courierRun.cashToCollect, order.currency)} cash</span>
                  )}
                  <span className="text-ink-4" aria-hidden>·</span>
                </>
              )}
              <span className={focus ? 'font-semibold text-berry-ink' : 'text-ink-4'}>{relativeTime(order.createdAt)}</span>
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
        {move ?? <span className="flex-1 text-[12px] text-ink-4">{open ? 'Move each dish above' : 'Nothing to press'}</span>}

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

        {cancel}
      </div>

      {sheets}
    </article>
  );
}
