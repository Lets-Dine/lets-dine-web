import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSessionPayment } from '../api/diner';
import { formatMoney } from '../domain/money';
import { DINER_STATUS_LABEL, needsReview } from '../domain/orderStatus';
import type { OrderStatus, Payment } from '../domain/types';
import { Skeleton } from '../components/Bits';
import { Check } from '../components/icons';
import { EYEBROW, SHELL, cx } from '../components/ui';
import { clockTime, relativeTime } from '../components/time';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { PAGE } from './Cart';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState, TopBar } from './Shell';

/**
 * §21 — a dining session can carry more than one order (a round of drinks
 * after the mains, a dessert added later), so leaving the status screen for
 * the one just placed must not lose the way back to the others.
 */

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-2/14 text-flame-1',
  ACCEPTED: 'bg-flame-2/14 text-flame-1',
  PREPARING: 'bg-flame-2/14 text-flame-1',
  READY: 'bg-gold/16 text-gold',
  COMPLETED: 'bg-mint/14 text-mint',
  CANCELLED: 'bg-berry/13 text-[#ff90a4]',
};

export function OrderHistory() {
  const { table, session, base } = useRestaurant();
  const { orders, ready } = useSessionOrders();
  const [payment, setPayment] = useState<Payment | null>(null);

  // Staff settle a table from the dashboard, off-screen for the diner — polling once on
  // arrival is enough to pick that up, since this screen isn't watched live like order status is.
  useEffect(() => {
    void getSessionPayment(session).then(setPayment);
  }, [session]);

  return (
    <main className={SHELL}>
      <TopBar title="Your orders" subtitle={`${table.name} · this visit`} fallbackTo={base} width={PAGE} />

      <div className={cx(PAGE, 'flex flex-col gap-3 pt-4')}>
        {payment && (
          <div className="flex flex-col gap-2.5 rounded-3xl bg-surface bg-mint/8 p-4.5 ring-1 ring-mint/30 ring-inset">
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-mint text-white" aria-hidden>
                <Check size={14} />
              </span>
              <div className="flex-1">
                <b className="block text-[14.5px] font-bold tracking-tight">Table settled</b>
                <span className={cx(EYEBROW, 'text-mint/90')}>
                  Paid {payment.method === 'CASH' ? 'in cash' : 'by card'} · {clockTime(payment.createdAt)}
                </span>
              </div>
              <span className="text-[17px] font-bold tnum">{formatMoney(payment.total, payment.currency)}</span>
            </div>
            {payment.discount > 0 && (
              <p className="text-[12px] text-ink-3">
                Includes a {formatMoney(payment.discount, payment.currency)} discount.
              </p>
            )}
          </div>
        )}

        {!ready ? (
          <>
            <Skeleton className="h-24 rounded-3xl" />
            <Skeleton className="h-24 rounded-3xl" />
          </>
        ) : orders.length === 0 ? (
          <EmptyState
            emoji="🧾"
            title="No orders yet"
            message="Once you place an order this visit, it shows up here so you can find your way back to it."
          />
        ) : (
          orders.map((order) => (
            <Link
              key={order.id}
              to={needsReview(order) ? `${base}/order/${order.id}/review` : `${base}/order/${order.id}`}
              className="flex flex-col gap-2 rounded-3xl bg-surface p-4.5 ring-1 ring-hairline ring-inset transition-move active:scale-[0.99]"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-bold tracking-tight tnum">Order {order.reference}</span>
                <span
                  className={cx(
                    'shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold',
                    needsReview(order) ? 'bg-flame-2/14 text-flame-1' : STATUS_TONE[order.status],
                  )}
                >
                  {needsReview(order) ? 'Rate this meal' : DINER_STATUS_LABEL[order.status]}
                </span>
              </div>
              <p className="truncate text-[13px] text-ink-3">
                {order.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}
              </p>
              <div className="flex items-center justify-between text-[12.5px] text-ink-4">
                <span className="tnum">
                  {clockTime(order.createdAt)} · {relativeTime(order.createdAt)}
                </span>
                <span className="text-[14px] font-bold tnum text-ink-2">{formatMoney(order.total, order.currency)}</span>
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="h-10" />
    </main>
  );
}
