import { MapLink } from './MapLink';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { formatMoney } from '../../domain/money';
import { STATUS_LABEL, STATUS_ORDER, itemStatusSummary } from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import type { Order, OrderStatus } from '../../domain/types';
import { Contact, X } from '../icons';
import { relativeTime } from '../time';
import { DISPLAY, cx } from '../ui';
import { CourierTag } from './delivery';
import { StatusPill } from './kit';
import { FocusRibbon, ItemRow } from './OrderLines';
import { useOrderMoves } from './OrderMoves';
import { Sheet } from './Sheet';

const stamp = (iso: string) =>
  `${new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · ${relativeTime(iso)}`;

/** The stages this kind of ticket actually passes through — a table never goes out for delivery, a delivery never sits unpaid. */
function stagesFor(order: Order): OrderStatus[] {
  const skip: OrderStatus[] = order.orderType === 'DELIVERY' ? ['UNPAID'] : order.floorVisitorName ? ['OUT_FOR_DELIVERY', 'SETTLE'] : ['OUT_FOR_DELIVERY', 'SETTLE', 'UNPAID'];
  return STATUS_ORDER.filter((s) => !skip.includes(s));
}

/**
 * One order, all of it, worked from a sheet. Read top to bottom the way a waiter asks the questions:
 * where does this go, what is on it and what is each dish doing, who is it for, what is the bill.
 * The one move the order is waiting on lives in the footer, under the thumb, so it never scrolls away.
 * The sheet reads the live order, so a press lands here the instant the server answers.
 */
export function OrderSheet({
  order,
  focus,
  now,
  onApply,
  onResync,
  onTakePayment,
  onClose,
}: {
  order: Order;
  focus: Focus | null;
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
  onTakePayment: (order: Order) => void;
  onClose: () => void;
}) {
  const { move, cancel, sheets, courierRun, live } = useOrderMoves(
    order,
    { onApply, onResync, onTakePayment },
    {
      moveClass:
        'inline-flex h-11 flex-1 items-center gap-2 rounded-full px-5 text-[15px] font-semibold shadow-lift transition-move active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35',
      cancelLabel: 'Cancel order',
    },
  );

  const isDelivery = order.orderType === 'DELIVERY';
  const money = (n: number) => formatMoney(n, order.currency);
  const place = isDelivery ? order.deliveryCustomerName || 'Guest' : (order.tableName ?? order.floorVisitorName ?? 'Floor order');
  const kind = isDelivery ? 'Delivery' : order.floorName || (order.floorVisitorName ? 'Floor' : 'Dine-in');
  const cancelled = order.status === 'CANCELLED';
  const stages = stagesFor(order);
  const at = Math.max(0, stages.indexOf(order.status));
  const { ready, total } = itemStatusSummary(order);
  const guest = isDelivery ? order.deliveryCustomerName : order.customerName;
  const phone = isDelivery ? order.deliveryPhone : order.customerPhone;
  const digits = phone?.replace(/[^\d+]/g, '') ?? '';
  const where = isDelivery ? order.deliveryAddress : [order.floorName, order.floorVisitorName, order.tableName].filter(Boolean).join(' · ');
  const events = [
    { label: 'Placed', at: order.createdAt },
    { label: 'Accepted', at: order.acceptedAt },
    { label: 'Paid', at: order.paidAt },
    { label: 'Completed', at: order.completedAt },
    { label: 'Cancelled', at: order.cancelledAt },
  ].filter((e): e is { label: string; at: string } => Boolean(e.at));

  return (
    <Sheet label={`Order ${order.reference}`} onClose={onClose} wide>
      {(close) => (
        <>
          <div className="flex justify-end px-3 pt-3">
            <button
              type="button"
              aria-label="Close"
              onClick={() => close()}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90"
            >
              <X size={16} />
            </button>
          </div>

          {/* The place leads, a sentence says what it is, and where it stands sits under it — as on the stock sheet. */}
          <header className="px-5 pt-2 pb-5">
            <h2 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(30px,6vw,44px)] leading-[1] tracking-[-0.03em]')}>{place}</h2>
            <p className="mt-3 max-w-[40ch] animate-rise text-[clamp(17px,2.2vw,21px)] font-medium leading-[1.35] text-ink-2 [animation-delay:80ms]">
              {order.reference} · {kind}, placed {relativeTime(order.createdAt)}.
            </p>
            <div className="mt-5 animate-rise [animation-delay:160ms]">
              <div className="flex items-center gap-3">
                <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
                {!cancelled && total > 0 && order.acceptedAt && (
                  <span className="text-[13px] font-semibold text-ink-3 tnum">
                    {ready} of {total} dishes out
                  </span>
                )}
              </div>
              {!cancelled && (
                <div role="progressbar" aria-label="Order stage" aria-valuemin={1} aria-valuenow={at + 1} aria-valuemax={stages.length} aria-valuetext={`Stage ${at + 1} of ${stages.length}: ${STATUS_LABEL[order.status]}`} className="mt-3 flex gap-1.5">
                  {stages.map((s, i) => (
                    <span key={s} aria-hidden className={cx('h-1.5 flex-1 rounded-full', i <= at ? 'bg-flame-2' : 'bg-ink/12', i === at && order.status !== 'COMPLETED' && 'motion-safe:animate-pulse')} />
                  ))}
                </div>
              )}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <div className="grid gap-3.5">
            {focus && <FocusRibbon focus={focus} className="animate-rise rounded-xl px-3.5 py-2.5" />}

            <Section delay={240} title="Dishes" hint={`${order.items.length} ${order.items.length === 1 ? 'line' : 'lines'}`}>
              <ul className="divide-y divide-hairline">
                {order.items.map((item) => (
                  <ItemRow key={item.id} order={order} item={item} now={now} canEdit={live} onApply={onApply} onResync={onResync} />
                ))}
              </ul>
            </Section>

            <Section delay={300} title={isDelivery ? 'Deliver to' : 'Guest'}>
              <dl className="grid gap-2.5 text-[14px]">
                <Line k={isDelivery ? 'Address' : 'Seat'} v={where} />
                {isDelivery && <Line k="Map" v={<MapLink order={order} />} />}
                {guest && <Line k="Name" v={guest} />}
                {phone && (
                  <Line
                    k="Phone"
                    v={
                      <a href={`tel:${digits}`} className="inline-flex items-center gap-1.5 font-semibold text-flame-1 hover:underline">
                        <Contact size={14} /> {phone}
                      </a>
                    }
                  />
                )}
                {order.customerId && (
                  <Line
                    k="Customer"
                    v={
                      <a href={`/admin/customers/${order.customerId}`} target="_blank" rel="noreferrer" className="font-semibold text-flame-1 hover:underline">
                        View customer ↗
                      </a>
                    }
                  />
                )}
                {isDelivery && order.deliveryNote &&<Line k="Note" v={<span className="italic text-gold">“{order.deliveryNote}”</span>} />}
                {isDelivery && courierRun && (
                  <Line
                    k="Courier"
                    v={
                      <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
                        <CourierTag run={courierRun} />
                        {courierRun.status === 'ASSIGNED' && courierRun.cashToCollect > 0 && <span className="text-[12.5px] text-ink-3">{money(courierRun.cashToCollect)} cash</span>}
                      </span>
                    }
                  />
                )}
              </dl>
            </Section>

            <Section delay={360} title="Bill" hint={order.paidAt ? 'Paid' : undefined}>
              <dl className="grid gap-2 text-[14px]">
                <Line k="Subtotal" v={money(order.subtotal)} />
                {order.serviceCharge > 0 && <Line k="Service charge" v={money(order.serviceCharge)} />}
                {order.tax > 0 && <Line k="Tax" v={money(order.tax)} />}
                {order.deliveryFee > 0 && <Line k="Delivery fee" v={money(order.deliveryFee)} />}
                {order.discount > 0 && <Line k="Discount" v={`−${money(order.discount)}`} />}
              </dl>
              <p className="mt-3 flex items-baseline justify-between gap-4 border-t border-hairline pt-3">
                <span className="text-[14px] font-semibold text-ink-2">Total</span>
                <span className={cx(DISPLAY, 'text-[28px] tnum')}>{money(order.total)}</span>
              </p>
            </Section>

            <Section delay={420} title="Timeline">
              <ol className="grid gap-2.5 text-[14px]">
                {events.map((e) => (
                  <li key={e.label} className="flex items-baseline gap-3">
                    <span className={cx('size-1.5 shrink-0 translate-y-[-1px] rounded-full', e.label === 'Cancelled' ? 'bg-berry' : 'bg-ink-4')} aria-hidden />
                    <span className="font-semibold">{e.label}</span>
                    <span className="ml-auto text-right text-ink-3 tnum">{stamp(e.at)}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-t border-hairline bg-surface px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {move ?? (
              <span className="flex-1 text-[13.5px] text-ink-3">
                {order.status === 'COMPLETED' ? 'This order is complete.' : cancelled ? 'This order was cancelled.' : 'Move each dish above — the order follows.'}
              </span>
            )}
            {cancel}
          </div>

          {sheets}
        </>
      )}
    </Sheet>
  );
}

function Section({ title, hint, delay, children }: { title: string; hint?: string; delay: number; children: ReactNode }) {
  return (
    <section aria-label={title} className="animate-rise rounded-3xl bg-surface-2/50 px-5 py-5 ring-1 ring-hairline ring-inset sm:px-6" style={{ animationDelay: `${delay}ms` }}>
      <h3 className="mb-4 flex items-baseline justify-between gap-3 text-[17px] font-semibold tracking-tight">
        {title}
        {hint && <span className="text-[12.5px] font-normal text-ink-3">{hint}</span>}
      </h3>
      {children}
    </section>
  );
}

function Line({ k, v }: { k: string; v: ReactNode }) {
  if (!v) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-ink-3">{k}</dt>
      <dd className="min-w-0 text-right font-medium tnum">{v}</dd>
    </div>
  );
}

/**
 * The sheet's state, kept by the screen rather than the card: a ticket moves lane the moment you
 * accept it, and the card would unmount (taking the sheet with it) mid-action.
 */
export function useOrderSheet({
  orders,
  flags,
  now,
  onApply,
  onResync,
  onTakePayment,
}: {
  orders: Order[];
  flags?: Map<string, Focus>;
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
  onTakePayment: (order: Order) => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const order = orders.find((o) => o.id === id) ?? null;
  const sheet = order && (
    <OrderSheet
      order={order}
      focus={flags?.get(order.id) ?? null}
      now={now}
      onApply={onApply}
      onResync={onResync}
      // Payment has its own sheet — step out of this one rather than stacking two dialogs.
      onTakePayment={(o) => {
        setId(null);
        onTakePayment(o);
      }}
      onClose={() => setId(null)}
    />
  );
  return { open: (o: Order) => setId(o.id), sheet };
}
