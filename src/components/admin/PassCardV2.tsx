import { useState } from 'react';
import { formatMoney } from '../../domain/money';
import { STATUS_LABEL, billableItems, itemStatusSummary } from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import type { Order } from '../../domain/types';
import { relativeTime } from '../time';
import { DISPLAY, cx } from '../ui';
import { Bike, ChevronDown } from '../icons';
import { CourierTag } from './delivery';
import { ADMIN_TINY, StatusPill } from './kit';
import { MapLink } from './MapLink';
import { FocusRibbon, ItemRow, Progress } from './OrderLines';
import { useOrderMoves } from './OrderMoves';

/**
 * A ticket, take two — the pass's card with only what the next decision needs:
 * which ticket, where, how long, what's in it, and the one move. The dishes read
 * as a short summary and unfold on request (or on their own when the ticket is
 * overdue, since that is exactly when someone needs to look inside).
 */
export function PassCardV2({
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
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
  onTakePayment?: (order: Order) => void;
  onOpenDetail?: (order: Order) => void;
}) {
  /** `null` means "nobody has decided" — an overdue ticket then opens on its own. */
  const [opened, setOpened] = useState<boolean | null>(null);
  const open = opened ?? focus !== null;
  const { move, cancel, sheets, courierRun, live } = useOrderMoves(order, { onApply, onResync, onTakePayment }, { moveClass: cx(ADMIN_TINY, 'h-10 flex-1 text-[13.5px]') });

  const isDelivery = order.orderType === 'DELIVERY';
  const lines = billableItems(order.items);
  const noted = order.items.find((i) => i.notes);
  const progress = itemStatusSummary(order);
  const where = isDelivery
    ? order.deliveryCustomerName || 'Guest'
    : (order.tableName ?? order.floorVisitorName ?? 'Floor order');

  return (
    <article
      className={cx(
        'animate-rise relative flex flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline ring-inset transition-[translate,box-shadow] duration-300 ease-out-quart hover:-translate-y-0.5 hover:shadow-lift',
        focus?.level === 'critical' && 'ring-[1.5px] ring-berry/45',
        focus?.level === 'warn' && 'ring-[1.5px] ring-gold/40',
      )}
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {onOpenDetail ? (
              <button
                type="button"
                onClick={() => onOpenDetail(order)}
                aria-label={`Open order ${order.reference}`}
                className={cx(DISPLAY, 'text-[22px] leading-none tnum transition-colors hover:text-flame-1')}
              >
                {order.reference}
              </button>
            ) : (
              <span className={cx(DISPLAY, 'text-[22px] leading-none tnum')}>{order.reference}</span>
            )}
            <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[13.5px] text-ink-2">
              {isDelivery && <Bike size={14} className="shrink-0 text-mint-ink" />}
              <span className="truncate font-semibold">{where}</span>
              {!isDelivery && order.floorName && order.floorVisitorName && <span className="shrink-0 text-ink-4">· {order.floorName}</span>}
            </p>
            {(isDelivery ? order.deliveryAddress || order.deliveryPhone : order.customerName) && (
              <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{isDelivery ? order.deliveryAddress || order.deliveryPhone : order.customerName}</p>
            )}
            {isDelivery && <MapLink order={order} className="mt-0.5" />}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
            <span className={cx('text-[12.5px] tnum', focus ? 'font-semibold text-berry-ink' : 'text-ink-4')}>{relativeTime(order.createdAt)}</span>
          </div>
        </div>
        {isDelivery && courierRun && (
          <p className="mt-3 flex items-center gap-1.5 whitespace-nowrap text-[12px] tnum">
            <CourierTag run={courierRun} />
            {courierRun.status === 'ASSIGNED' && courierRun.cashToCollect > 0 && (
              <span className="text-ink-4">{formatMoney(courierRun.cashToCollect, order.currency)} cash</span>
            )}
          </p>
        )}
      </div>

      <Progress order={order} />
      {focus && <FocusRibbon focus={focus} className="px-5 py-1.5" />}

      <div className="px-5 py-3.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpened(!open)}
          className="group flex w-full items-start gap-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] leading-relaxed text-ink-2">
              {lines.slice(0, 3).map((i, n) => (
                <span key={i.id} className="block truncate">
                  <span className="font-semibold tnum text-ink">{i.quantity}×</span> {i.dishNameSnapshot}
                  {n === 2 && lines.length > 3 && <span className="text-ink-4"> · +{lines.length - 3} more</span>}
                </span>
              ))}
            </span>
            {noted && <span className="mt-1 block truncate text-[12.5px] italic text-gold">“{noted.notes}”</span>}
            {order.acceptedAt && progress.total > 0 && (
              <span className="mt-1 block text-[12px] font-semibold text-ink-3 tnum">
                {progress.ready}/{progress.total} ready
              </span>
            )}
          </span>
          <ChevronDown size={16} className={cx('mt-0.5 shrink-0 text-ink-4 transition-transform duration-300 ease-out-quart group-hover:text-ink-2', open && 'rotate-180')} />
        </button>

        <div className={cx('grid transition-[grid-template-rows,opacity] duration-400 ease-out-quart', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
          <div className="min-h-0 overflow-hidden" inert={!open}>
            <ul className="mt-3 divide-y divide-hairline border-t border-hairline">
              {order.items.map((item) => (
                <ItemRow key={item.id} order={order} item={item} now={now} canEdit={live} onApply={onApply} onResync={onResync} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {(move || cancel) && (
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-5 py-3.5">
          {move}
          {cancel}
        </div>
      )}

      {sheets}
    </article>
  );
}
