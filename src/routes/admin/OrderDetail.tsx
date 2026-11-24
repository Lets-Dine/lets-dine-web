import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchOrder, listPayments } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import { STATUS_LABEL, focusMap, itemStatusSummary, unpaidTotal } from '../../domain/orderStatus';
import type { Order, Payment } from '../../domain/types';
import { Contact } from '../../components/icons';
import { MapLink } from '../../components/admin/MapLink';
import { CourierTag } from '../../components/admin/delivery';
import { ADMIN_GHOST, Loading, StatusPill } from '../../components/admin/kit';
import { FocusRibbon, ItemRow, useBilledQuantities } from '../../components/admin/OrderLines';
import { useOrderMoves } from '../../components/admin/OrderMoves';
import { Line, Section, stagesFor, stamp } from '../../components/admin/OrderSheet';
import { printOrderSlip } from '../../components/admin/orderSlip';
import { printReceipt } from '../../components/admin/receipt';
import { PayOrderHost } from '../../components/admin/PayOrderHost';
import { useCanPayTableOrder } from '../../components/admin/TablePaySheet';
import { usePayingOrder } from '../../components/admin/usePayingOrder';
import { DISPLAY, cx } from '../../components/ui';
import { relativeTime } from '../../components/time';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useNow } from '../../state/useNow';
import { useDashboard } from './AdminLayout';

/**
 * One order as a page of its own: the same reading order as the quick sheet (what is on it, who it is for,
 * the bill, the timeline) with the move the order is waiting on pinned under it. Linked from the sheet and the pass.
 */
export function OrderDetail() {
  const { orderId = '' } = useParams();
  const staff = useStaff();
  const { orders, applyOrder, reloadOrders } = useDashboard();
  const fetched = useAsync(() => fetchOrder(staff, orderId), [staff, orderId]);
  // Open orders live in the dashboard (pushed updates land there); a finished one only comes from the fetch.
  const [local, setLocal] = useState<Order | null>(null);
  const order = orders.find((o) => o.id === orderId) ?? (local?.id === orderId ? local : null) ?? fetched.data;

  if (!order) {
    if (fetched.loading) return <Loading label="Reading the order…" />;
    return (
      <div className="animate-rise rounded-3xl bg-surface px-6 py-14 text-center ring-1 ring-hairline ring-inset">
        <h1 className={cx(DISPLAY, 'text-[24px]')}>Order not found</h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-[14.5px] text-ink-3">It may belong to another branch, or the link is out of date.</p>
        <Link to="/admin/orders" className={cx(ADMIN_GHOST, 'mt-6 inline-flex')}>
          Back to orders
        </Link>
      </div>
    );
  }
  return (
    <Page
      order={order}
      onApply={(o) => {
        setLocal(o);
        applyOrder(o);
      }}
      onResync={() => {
        reloadOrders();
        fetched.reload();
      }}
    />
  );
}

function Page({ order, onApply, onResync }: { order: Order; onApply: (o: Order) => void; onResync: () => void }) {
  const now = useNow(15_000);
  const payAtTable = useCanPayTableOrder(order);
  const paidQty = useBilledQuantities(order, true);
  const { setPayingId, payingOrder } = usePayingOrder([order]);
  const { menu } = useDashboard();
  const { allows } = useAuth();
  const staff = useStaff();
  // The bills this order's visit produced — paying raises the invoice, so ask once it is paid. A delivery's cash-on-delivery
  // bill opens when it goes out, before anyone has paid it, so ask from then on.
  const billed = Boolean(order.paidAt) || (order.orderType === 'DELIVERY' && (order.status === 'OUT_FOR_DELIVERY' || order.status === 'SETTLE'));
  const bills = useAsync(
    () =>
      allows('payments:view') && billed
        ? listPayments(staff, 0, 10, { sessionId: order.sessionId }).then((p) => p.rows)
        : Promise.resolve([] as Payment[]),
    [staff, order.sessionId, billed, order.status],
  );
  const { move, cancel, sheets, courierRun, live } = useOrderMoves(
    order,
    {
      onApply,
      onResync,
      onTakePayment: payAtTable ? undefined : () => setPayingId(order.id),
      paid: paidQty,
    },
    {
      moveClass:
        'inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-semibold shadow-lift transition-move active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35',
      cancelLabel: 'Cancel order',
    },
  );
  const printBill = (bill: Payment) =>
    printReceipt(
      {
        name:
          order.orderType === 'DELIVERY'
            ? 'Delivery'
            : order.orderType === 'PICKUP'
              ? 'Pick up'
              : (order.tableName ?? order.floorVisitorName ?? 'Quick sale'),
      },
      bill.items.map((i) => ({ dishNameSnapshot: i.dishNameSnapshot, quantity: i.quantity, total: i.unitPrice * i.quantity })),
      { currency: bill.currency, subtotal: bill.subtotal, serviceCharge: bill.serviceCharge, tax: bill.tax, discount: bill.discount, total: bill.total },
      menu.restaurant,
      // Nothing collected yet (a delivery bill still out with the courier): no "Paid by" line to print.
      bill.paidAmount > 0 ? { method: bill.method, takenBy: bill.createdByName } : undefined,
      bill.customerName,
      bill,
    );
  const focus = useMemo(() => focusMap([order], now).get(order.id) ?? null, [order, now]);

  const isDelivery = order.orderType === 'DELIVERY';
  const money = (n: number) => formatMoney(n, order.currency);
  const place = isDelivery
    ? order.deliveryCustomerName || 'Guest'
    : order.orderType === 'PICKUP'
      ? 'Pick up'
      : (order.tableName ?? order.floorVisitorName ?? (order.floorName ? 'Floor order' : 'Quick sale'));
  const kind = isDelivery ? 'Delivery' : order.orderType === 'PICKUP' ? 'Pick up' : order.floorName || (order.floorVisitorName ? 'Floor' : 'Dine-in');
  const cancelled = order.status === 'CANCELLED';
  const stages = stagesFor(order);
  const at = Math.max(0, stages.indexOf(order.status));
  const { ready, total } = itemStatusSummary(order);
  const guest = isDelivery ? order.deliveryCustomerName : order.customerName;
  const phone = isDelivery ? order.deliveryPhone : order.customerPhone;
  const where = isDelivery ? order.deliveryAddress : [order.floorName, order.floorVisitorName, order.tableName].filter(Boolean).join(' · ');
  const events = [
    { label: 'Placed', at: order.createdAt },
    { label: 'Accepted', at: order.acceptedAt },
    { label: 'Paid', at: order.paidAt },
    { label: 'Completed', at: order.completedAt },
    { label: 'Cancelled', at: order.cancelledAt },
  ].filter((e): e is { label: string; at: string } => Boolean(e.at));

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link to="/admin/orders" className="mb-4 inline-flex animate-rise items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        ← Orders
      </Link>

      <header className="mb-6 flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-5 [animation-delay:40ms]">
        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'wrap-break-word text-[clamp(34px,6vw,56px)] leading-none tracking-[-0.03em]')}>{place}</h1>
          <p className="mt-3 text-[15px] text-ink-2 tnum">
            {order.reference} · {kind}, placed {relativeTime(order.createdAt)}
          </p>
          <div className="mt-5 flex items-center gap-3">
            <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
            {!cancelled && total > 0 && order.acceptedAt && (
              <span className="text-[13px] font-semibold text-ink-3 tnum">
                {ready} of {total} dishes out
              </span>
            )}
          </div>
          {!cancelled && (
            <div
              role="progressbar"
              aria-label="Order stage"
              aria-valuemin={1}
              aria-valuenow={at + 1}
              aria-valuemax={stages.length}
              aria-valuetext={`Stage ${at + 1} of ${stages.length}: ${STATUS_LABEL[order.status]}`}
              className="mt-3 flex max-w-md gap-1.5"
            >
              {stages.map((s, i) => (
                <span
                  key={s}
                  aria-hidden
                  className={cx(
                    'h-1.5 flex-1 rounded-full transition-colors duration-300 ease-out',
                    i <= at ? 'bg-flame-2' : 'bg-ink/12',
                    i === at && order.status !== 'COMPLETED' && 'motion-safe:animate-pulse',
                  )}
                />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {move}
          {payAtTable && (
            <button
              type="button"
              className="inline-flex h-11 shrink-0 items-center rounded-full px-5 text-[15px] font-semibold text-flame-3 ring-1 ring-flame-2/40 ring-inset transition-transform active:scale-[0.98]"
              onClick={() => setPayingId(order.id)}
            >
              Pay this order · {formatMoney(unpaidTotal(order, paidQty), order.currency)}
            </button>
          )}
          <button type="button" onClick={() => void printOrderSlip(order)} className={cx(ADMIN_GHOST, 'h-11 px-5 text-[15px]')}>
            Print slip
          </button>
          {cancel}
        </div>
      </header>

      {focus && <FocusRibbon focus={focus} className="mb-4 animate-rise rounded-xl px-3.5 py-2.5" />}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-4">
          <Section delay={80} title="Dishes" hint={`${order.items.length} ${order.items.length === 1 ? 'line' : 'lines'}`}>
            <ul className="divide-y divide-hairline">
              {order.items.map((item) => (
                <ItemRow key={item.id} order={order} item={item} now={now} canEdit={live} paid={paidQty.get(item.id)} onApply={onApply} onResync={onResync} />
              ))}
            </ul>
          </Section>
          <Section delay={160} title="Timeline">
            <ol className="grid gap-2.5 text-[14px]">
              {events.map((e) => (
                <li key={e.label} className="flex items-baseline gap-3">
                  <span className={cx('size-1.5 shrink-0 -translate-y-px rounded-full', e.label === 'Cancelled' ? 'bg-berry' : 'bg-ink-4')} aria-hidden />
                  <span className="font-semibold">{e.label}</span>
                  <span className="ml-auto text-right text-ink-3 tnum">{stamp(e.at)}</span>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        <div className="grid gap-4 lg:sticky lg:top-4">
          <Section delay={120} title={isDelivery ? 'Deliver to' : 'Guest'}>
            <dl className="grid gap-2.5 text-[14px]">
              <Line k={isDelivery ? 'Address' : 'Seat'} v={where} />
              {isDelivery && <Line k="Map" v={<MapLink order={order} />} />}
              {guest && <Line k="Name" v={guest} />}
              {phone && (
                <Line
                  k="Phone"
                  v={
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-semibold text-flame-1 hover:underline">
                      <Contact size={14} /> {phone}
                    </a>
                  }
                />
              )}
              {order.customerId && (
                <Line
                  k="Customer"
                  v={
                    <Link to={`/admin/customers/${order.customerId}`} className="font-semibold text-flame-1 hover:underline">
                      View customer
                    </Link>
                  }
                />
              )}
              {isDelivery && order.deliveryNote && <Line k="Note" v={<span className="italic text-gold">“{order.deliveryNote}”</span>} />}
              {isDelivery && courierRun && (
                <Line
                  k="Courier"
                  v={
                    <span className="inline-flex flex-wrap items-center justify-end gap-x-2">
                      <CourierTag run={courierRun} />
                      {courierRun.status === 'ASSIGNED' && courierRun.cashToCollect > 0 && (
                        <span className="text-[12.5px] text-ink-3">{money(courierRun.cashToCollect)} cash</span>
                      )}
                    </span>
                  }
                />
              )}
            </dl>
          </Section>

          <Section delay={200} title="Bill" hint={order.paidAt ? 'Paid' : undefined}>
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
            {(bills.data ?? []).map((bill) => (
              <div key={bill.id} className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3 text-[14px]">
                <span className="font-semibold tnum">
                  {bill.invoiceNumber != null && bill.fiscalYear ? `Invoice ${bill.invoiceNumber} · ${bill.fiscalYear}` : 'Bill'}
                  {bill.paymentStatus !== 'PAID' && <span className="ml-2 font-normal text-gold">{money(bill.total - bill.paidAmount)} owed</span>}
                </span>
                <button type="button" onClick={() => void printBill(bill)} className="font-semibold text-flame-1 hover:underline">
                  Print
                </button>
              </div>
            ))}
          </Section>
        </div>
      </div>

      {sheets}
      <PayOrderHost order={payingOrder} onClose={() => setPayingId(null)} onPaid={onResync} />
    </div>
  );
}
