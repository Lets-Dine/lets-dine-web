import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { DINER_STATUS_HINT, DINER_STATUS_LABEL, followOrder, needsReview } from '../domain/orderStatus';
import { useCart } from '../state/CartContext';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { cartDockHidden } from './CartDock';
import { ChevronRight, Clock, Sparkle } from './icons';
import { cx } from './ui';

/**
 * A way back to the ticket the kitchen is working on — or, once it has been
 * served, a one-tap path to rate it — without having to stay on the status
 * screen. Hidden there, and on the review flow itself.
 */
export function OrderDock({ base }: { base: string }) {
  const { orders } = useSessionOrders();
  const cart = useCart();
  const { pathname } = useLocation();
  const order = followOrder(orders);
  const cartUp = cart.count > 0 && !cartDockHidden(pathname);
  const reviewing = order ? needsReview(order) : false;
  const hidden =
    !order ||
    pathname.includes(`/order/${order.id}`) ||
    pathname.includes('/checkout') ||
    pathname.includes('/cart');

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--dock-h', !hidden && cartUp ? '140px' : '76px');
    return () => root.style.setProperty('--dock-h', '76px');
  }, [hidden, cartUp]);

  if (hidden) return null;

  const ready = order.status === 'READY';
  const href = reviewing ? `${base}/order/${order.id}/review` : `${base}/order/${order.id}`;
  const loud = ready || reviewing;

  return (
    <div
      className={cx(
        'pointer-events-none fixed inset-x-0 z-58 animate-dock-in px-4 sm:px-6 lg:inset-x-auto lg:right-8 lg:px-0',
        cartUp
          ? 'bottom-[calc(var(--safe-b)+90px)] lg:bottom-28'
          : 'bottom-0 pb-[calc(14px+var(--safe-b))] lg:bottom-8 lg:pb-0',
      )}
    >
      <Link
        to={href}
        className={cx(
          'pointer-events-auto mx-auto flex max-w-lg items-center gap-3.5 rounded-full pl-3.5 pr-4.5 text-white shadow-flame-lg transition-move active:scale-[0.975] lg:mx-0 lg:hover:scale-[1.03]',
          loud ? 'h-15 bg-flame lg:h-16 lg:pr-6' : 'h-13 bg-surface-3/92 ring-1 ring-hairline-strong ring-inset backdrop-blur-lg lg:h-14',
        )}
      >
        <span
          className={cx(
            'grid size-9 place-items-center rounded-full',
            loud ? 'bg-ember/15' : 'bg-flame text-white',
          )}
        >
          {reviewing ? <Sparkle size={18} /> : <Clock size={18} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <b className={cx('truncate text-[15px] font-bold tracking-tight', !loud && 'text-ink')}>
            {reviewing
              ? 'How was your meal?'
              : ready
                ? 'Your order is ready'
                : `Order ${order.reference} · ${DINER_STATUS_LABEL[order.status]}`}
          </b>
          <span className={cx('truncate text-[12px] font-semibold', loud ? 'opacity-70' : 'text-ink-3')}>
            {reviewing ? 'Rate it when you are done — it takes 20 seconds' : DINER_STATUS_HINT[order.status]}
          </span>
        </span>
        <ChevronRight size={18} className={loud ? undefined : 'text-ink-3'} />
      </Link>
    </div>
  );
}
