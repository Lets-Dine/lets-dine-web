import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { createOrder } from '../api/diner';
import { track } from '../domain/analytics';
import { formatMoney } from '../domain/money';
import { haptic } from '../platform/haptics';
import { BTN, BTN_FLAME, BTN_SIZE, DISPLAY, EYEBROW, GLASS, SHELL, cx } from '../components/ui';
import { Check } from '../components/icons';
import { requestNotifyPermission } from '../platform/notify';
import { useCart } from '../state/CartContext';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { useToast } from '../state/ToastContext';
import { BillLines, PAGE, SPLIT, useBill } from './Cart';
import { useRestaurant } from './RestaurantLayout';
import { TopBar } from './Shell';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash at the table', hint: 'Pay the server when you are done' },
  { id: 'card', label: 'Card at the counter', hint: 'The restaurant brings the machine over' },
] as const;

export function Checkout() {
  const { menu, table, session, base } = useRestaurant();
  const cart = useCart();
  const { rememberOrder } = useSessionOrders();
  const navigate = useNavigate();
  const toast = useToast();

  const [method, setMethod] = useState<string>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(menu.dishes.map((d) => [d.id, d]));
  const bill = useBill(cart.lines, menu.dishes);
  const currency = menu.restaurant.currency;

  // Emptying the cart on success must not trip this guard and bounce the diner
  // back to an empty cart instead of their new order.
  if (cart.lines.length === 0 && !placed) return <Navigate to={`${base}/cart`} replace />;

  const placeOrder = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await createOrder({
        session,
        lines: cart.lines,
        // Stable across retries of this same cart, so a double tap or a flaky
        // connection can never produce two orders.
        idempotencyKey: cart.idempotencyKey,
      });
      track('order_placed', { orderId: order.id, total: order.total, items: cart.count });
      setPlaced(true);
      cart.clear();
      cart.rotateIdempotencyKey();
      rememberOrder(order);
      requestNotifyPermission();
      haptic.success();
      toast('Order sent to the kitchen', '🔥');
      navigate(`${base}/order/${order.id}`, { replace: true });
    } catch (e) {
      haptic.warn();
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  };

  return (
    <main className={SHELL}>
      <TopBar title="Confirm your order" subtitle={table.name} fallbackTo={`${base}/cart`} width={PAGE} />

      <div className={cx(PAGE, SPLIT, 'pt-5')}>
        <div className="flex flex-col gap-7">
          <section className="animate-rise">
            <div className="flex flex-col gap-1 rounded-3xl bg-surface bg-flame-dim p-4.5 ring-1 ring-flame-2/35 ring-inset">
              <span className={cx(EYEBROW, 'text-flame-1/80')}>Serving to</span>
              <b className={cx(DISPLAY, 'text-[27px]')}>{table.name}</b>
              <span className="text-[13px] text-ink-3">{menu.restaurant.name} · dine in</span>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className={EYEBROW}>
              {cart.count} {cart.count === 1 ? 'item' : 'items'}
            </h2>
            <ul className="flex flex-col gap-3">
              {cart.lines.map((line) => {
                const dish = byId.get(line.dishId);
                if (!dish) return null;
                return (
                  <li className="flex items-start gap-3 text-[14px]" key={line.dishId}>
                    <span className="min-w-6 font-bold text-flame-1 tnum">{line.quantity}×</span>
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold">{dish.name}</b>
                      {line.note && <em className="mt-0.5 block text-[12px] italic text-ink-4">“{line.note}”</em>}
                    </span>
                    <span className="tnum">{formatMoney(dish.price * line.quantity, currency)}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className={EYEBROW}>How you'll pay</h2>
            <div className="flex flex-col gap-2.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    setMethod(m.id);
                  }}
                  aria-pressed={method === m.id}
                  className={cx(
                    'flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-colors duration-150',
                    method === m.id
                      ? 'bg-flame-2/14 ring-[1.5px] ring-flame-2/35 ring-inset'
                      : 'bg-surface ring-1 ring-hairline ring-inset hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-5.5 shrink-0 place-items-center rounded-full text-ember transition-colors duration-150',
                      method === m.id ? 'bg-flame' : 'ring-[1.5px] ring-hairline-strong ring-inset',
                    )}
                    aria-hidden
                  >
                    {method === m.id && <Check size={13} />}
                  </span>
                  <span className="flex-1">
                    <b className="block text-[14.5px] font-semibold">{m.label}</b>
                    <span className="text-[12.5px] text-ink-4">{m.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {error && (
            <p className="rounded-2xl bg-berry/12 px-3.5 py-3 text-[13.5px] font-semibold text-[#ff90a4]" role="alert">
              {error}
            </p>
          )}
        </div>

        <aside className="pt-7 lg:sticky lg:top-24 lg:pt-0">
          <div className="flex flex-col gap-3 lg:rounded-3xl lg:bg-surface lg:p-5 lg:ring-1 lg:ring-hairline lg:ring-inset">
            <h2 className={EYEBROW}>Bill</h2>
            <BillLines
              bill={bill}
              currency={currency}
              serviceRate={menu.restaurant.serviceChargeRate}
              taxRate={menu.restaurant.taxRate}
            />
            <button
              type="button"
              className={cx(BTN_FLAME, 'mt-1 hidden! w-full lg:inline-flex!')}
              onClick={placeOrder}
              disabled={submitting}
            >
              {submitting ? 'Sending…' : 'Place order'}
            </button>
          </div>
        </aside>
      </div>

      <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-10" />

      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2.5">
          <div className="flex flex-col pl-1 leading-tight">
            <span className="text-[11px] font-semibold text-ink-3">Pay at restaurant</span>
            <b className="text-[17px] font-bold tracking-tight tnum">{formatMoney(bill.total, currency)}</b>
          </div>
          <button
            type="button"
            className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-ember shadow-flame')}
            onClick={placeOrder}
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Place order'}
          </button>
        </div>
      </div>
    </main>
  );
}
