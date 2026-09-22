import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cancelOrder } from '../api/client';
import { cancelOrderItem, getOrder } from '../api/diner';
import { IS_LIVE_API } from '../api/http';
import { formatMoney } from '../domain/money';
import {
  DINER_STATUS_HINT,
  ITEM_STATUS_LABEL,
  canCancelItem,
  itemStatusSummary,
  needsReview,
  reviewableItems,
} from '../domain/orderStatus';
import type { Order, OrderItem } from '../domain/types';
import { haptic } from '../platform/haptics';
import { Skeleton } from '../components/Bits';
import { BTN, BTN_FLAME, BTN_GHOST, BTN_SIZE, EYEBROW, SHELL, cx } from '../components/ui';
import { Check, Clock, Sparkle, X } from '../components/icons';
import { clockTime } from '../components/time';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { useToast } from '../state/ToastContext';
import { PAGE, SPLIT } from './Cart';
import { useRestaurant } from './RestaurantLayout';
import { ErrorScreen, TopBar } from './Shell';

const ITEM_PILL_STYLE: Record<OrderItem['status'], string> = {
  PENDING: 'bg-surface-3 text-ink-3',
  PREPARING: 'bg-[#7e9bff]/16 text-[#a4b6ff]',
  READY: 'bg-flame-3/18 text-[#ff9270]',
  SERVED: 'bg-mint/16 text-[#6fd7a4]',
  CANCELLED: 'bg-berry/14 text-[#ff8098]',
};

export function OrderStatus() {
  const { orderId = '' } = useParams();
  const { table, session, base } = useRestaurant();
  const navigate = useNavigate();
  const toast = useToast();
  const { orders, rememberOrder } = useSessionOrders();

  const [error, setError] = useState<Error | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [confirmingItemId, setConfirmingItemId] = useState<string | null>(null);

  // Status changes are pushed (or polled) at the visit level so a diner who
  // went back to the menu still hears them. This screen just paints the ticket.
  useEffect(() => {
    if (orders.some((o) => o.id === orderId)) return;
    void getOrder(orderId, session.anonymousSessionToken)
      .then(rememberOrder)
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, [orderId, session.anonymousSessionToken, orders, rememberOrder]);

  const order: Order | null = orders.find((o) => o.id === orderId) ?? null;

  if (error) return <ErrorScreen title="Order not found" message={error.message} />;

  if (!order) {
    return (
      <main className={SHELL}>
        <TopBar title="Your order" subtitle={table.name} fallbackTo={base} width={PAGE} />
        <div className={cx(PAGE, 'flex flex-col gap-3.5 pt-4')}>
          <Skeleton className="h-52 rounded-3xl" />
          <Skeleton className="h-36 rounded-3xl" />
        </div>
      </main>
    );
  }

  const cancelled = order.status === 'CANCELLED';
  const pendingReviews = reviewableItems(order);
  const canReview = needsReview(order);
  const summary = itemStatusSummary(order);

  const cancelItem = async (item: OrderItem) => {
    setCancellingItemId(item.id);
    try {
      rememberOrder(await cancelOrderItem(order.id, item.id, session.anonymousSessionToken));
      setConfirmingItemId(null);
    } catch (e) {
      haptic.warn();
      toast(e instanceof Error ? e.message : 'Could not cancel', '!');
    } finally {
      setCancellingItemId(null);
    }
  };

  return (
    <main className={SHELL}>
      <TopBar
        title={`Order ${order.reference}`}
        subtitle={`${table.name} · ${clockTime(order.createdAt)}`}
        fallbackTo={base}
        width={PAGE}
      />

      <div className={cx(PAGE, SPLIT, 'pt-4')}>
        <div>
          {canReview && (
            <Link
              to={`${base}/order/${order.id}/review`}
              className="relative mb-4 flex animate-rise items-center gap-3.5 overflow-hidden rounded-3xl bg-surface bg-flame-dim p-4.5 ring-1 ring-flame-2/35 ring-inset transition-move active:scale-[0.99]"
            >
              <span
                className="pointer-events-none absolute -right-10 -top-15 size-42 animate-breathe-slow rounded-full bg-[radial-gradient(circle,rgb(255_138_61/0.35),transparent_68%)]"
                aria-hidden
              />
              <Sparkle size={20} className="shrink-0 text-flame-1" />
              <span className="flex-1">
                <b className="block text-[15.5px] font-bold tracking-tight">How was your meal?</b>
                <span className="text-[12.5px] leading-snug text-ink-3">
                  Rate {pendingReviews.length} served {pendingReviews.length === 1 ? 'dish' : 'dishes'} — it takes 20
                  seconds and helps the next diner. No need to wait for the rest of the order.
                </span>
              </span>
            </Link>
          )}

          <div className="rounded-3xl bg-surface px-4.5 pb-3 pt-5 ring-1 ring-hairline ring-inset">
            {cancelled ? (
              <div className="flex flex-col gap-1 pb-3">
                <b className="text-[15.5px]">Order cancelled</b>
                <span className="text-[13px] text-ink-3">Nothing was sent to the kitchen.</span>
              </div>
            ) : (
              <>
                <Headline
                  done={Boolean(order.acceptedAt)}
                  active={!order.acceptedAt}
                  label={order.acceptedAt ? 'Restaurant accepted' : 'Order placed'}
                  hint={order.acceptedAt ? DINER_STATUS_HINT.ACCEPTED : DINER_STATUS_HINT.PENDING}
                  hasNext
                />
                {order.acceptedAt && order.status !== 'COMPLETED' && (
                  <Headline
                    done={false}
                    active
                    label={summary.total > 0 ? `${summary.ready} of ${summary.total} items ready` : 'Preparing'}
                    hint="Check the list below for what's on its way"
                    hasNext
                  />
                )}
                <Headline
                  done={order.status === 'COMPLETED'}
                  active={false}
                  label="Completed"
                  hint={DINER_STATUS_HINT.COMPLETED}
                  hasNext={false}
                />
              </>
            )}
          </div>

          {!cancelled && order.status !== 'COMPLETED' && (
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-3">
              <Clock size={14} />
              {order.status === 'READY' ? 'A server is bringing it over' : 'Typically 15–25 minutes at this time of day'}
            </p>
          )}

          {/* Cancelling is the one thing here that cannot be undone, so it is the
              one thing that asks twice. The question replaces the button in
              place — no dialog, nothing to dismiss, and the safe answer leads. */}
          {!IS_LIVE_API && order.status === 'PENDING' && confirmingCancel && (
            <div className="mt-6 flex animate-rise flex-col gap-3 rounded-3xl bg-surface p-4.5 ring-1 ring-berry/30 ring-inset">
              <div className="flex flex-col gap-1">
                <b className="text-[15px] font-bold tracking-tight">Cancel this order?</b>
                <span className="text-[13px] leading-relaxed text-ink-3">
                  The kitchen has not started it yet, so nothing is wasted — but you will have to order again from
                  scratch.
                </span>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')}
                  onClick={() => {
                    haptic.tick();
                    setConfirmingCancel(false);
                  }}
                >
                  Keep my order
                </button>
                <button
                  type="button"
                  className={cx(
                    BTN,
                    BTN_SIZE,
                    'flex-1 bg-berry/13 text-[#ff90a4] ring-1 ring-berry/35 ring-inset',
                  )}
                  disabled={cancelling}
                  onClick={async () => {
                    setCancelling(true);
                    try {
                      rememberOrder(await cancelOrder(order.id));
                      setConfirmingCancel(false);
                    } catch (e) {
                      haptic.warn();
                      toast(e instanceof Error ? e.message : 'Could not cancel', '!');
                      setCancelling(false);
                    }
                  }}
                >
                  {cancelling ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2.5 pt-6 lg:flex-row">
            {canReview && (
              <Link to={`${base}/order/${order.id}/review`} className={cx(BTN_FLAME, 'w-full lg:w-auto')}>
                Rate this meal
              </Link>
            )}
            {!IS_LIVE_API && order.status === 'PENDING' && !confirmingCancel && (
              <button
                type="button"
                className={cx(BTN_GHOST, 'w-full lg:w-auto')}
                onClick={() => setConfirmingCancel(true)}
              >
                Cancel order
              </button>
            )}
            <button type="button" className={cx(BTN_GHOST, 'w-full lg:w-auto')} onClick={() => navigate(base)}>
              Back to the menu
            </button>
          </div>
        </div>

        {/* ── Receipt ─────────────────────────────────────────── */}
        <aside className="pt-7 lg:sticky lg:top-24 lg:pt-0">
          <div className="flex flex-col gap-3 lg:rounded-3xl lg:bg-surface lg:p-5 lg:ring-1 lg:ring-hairline lg:ring-inset">
            <h2 className={EYEBROW}>What you ordered</h2>
            <ul className="flex flex-col gap-3.5">
              {order.items.map((item) => {
                const itemCancelled = item.status === 'CANCELLED';
                return (
                  <li className="flex flex-col gap-1.5 text-[14px]" key={item.id}>
                    <div className="flex items-start gap-3">
                      <span className={cx('min-w-6 font-bold tnum', itemCancelled ? 'text-ink-4' : 'text-flame-1')}>
                        {item.quantity}×
                      </span>
                      <span className="min-w-0 flex-1">
                        <b className={cx('font-semibold', itemCancelled && 'text-ink-4 line-through')}>
                          {item.dishNameSnapshot}
                        </b>
                        {item.notes && <em className="mt-0.5 block text-[12px] italic text-ink-4">“{item.notes}”</em>}
                        <span className="mt-0.5 block text-[11.5px] text-ink-4 tnum">
                          {formatMoney(item.unitPrice, order.currency)} each
                        </span>
                      </span>
                      <span className={cx('tnum', itemCancelled && 'text-ink-4 line-through')}>
                        {formatMoney(item.unitPrice * item.quantity, order.currency)}
                      </span>
                    </div>

                    {!cancelled && (
                      <div className="ml-9 flex items-center gap-2">
                        <span
                          className={cx(
                            'inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold uppercase tracking-[0.05em]',
                            ITEM_PILL_STYLE[item.status],
                          )}
                        >
                          {ITEM_STATUS_LABEL[item.status]}
                        </span>
                        {canCancelItem(item) && confirmingItemId !== item.id && (
                          <button
                            type="button"
                            className="text-[11.5px] font-semibold text-ink-4 underline-offset-2 hover:text-berry hover:underline"
                            onClick={() => setConfirmingItemId(item.id)}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}

                    {confirmingItemId === item.id && (
                      <div className="ml-9 flex items-center gap-2 rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5 ring-1 ring-hairline ring-inset">
                        <span className="flex-1 text-[12px] text-ink-2">Cancel this dish?</span>
                        <button
                          type="button"
                          className="rounded-lg px-2 py-1 text-[11.5px] font-semibold text-ink-3"
                          onClick={() => setConfirmingItemId(null)}
                        >
                          <X size={11} className="inline -mt-px mr-1" />
                          Keep
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-berry/16 px-2 py-1 text-[11.5px] font-semibold text-berry disabled:opacity-50"
                          disabled={cancellingItemId === item.id}
                          onClick={() => void cancelItem(item)}
                        >
                          {cancellingItemId === item.id ? 'Cancelling…' : 'Cancel it'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-1 flex flex-col gap-2.5">
              {(
                [
                  ['Subtotal', order.subtotal],
                  ['Service charge', order.serviceCharge],
                  ['VAT', order.tax],
                ] as const
              ).map(([label, value]) => (
                <div className="flex items-center justify-between text-[14px] text-ink-2" key={label}>
                  <span>{label}</span>
                  <span className="tnum">{formatMoney(value, order.currency)}</span>
                </div>
              ))}
              <hr className="my-1 border-hairline" />
              <div className="flex items-center justify-between text-[17px] font-bold tracking-tight">
                <span>Total</span>
                <span className="tnum">{formatMoney(order.total, order.currency)}</span>
              </div>
            </div>

            <p className="text-[11.5px] leading-relaxed text-ink-4">
              Prices are locked to what you paid — later menu changes will not rewrite this order.
            </p>
          </div>
        </aside>
      </div>

      <div className="h-10" />
    </main>
  );
}

function Headline({
  done,
  active,
  label,
  hint,
  hasNext,
}: {
  done: boolean;
  active: boolean;
  label: string;
  hint: string;
  hasNext: boolean;
}) {
  return (
    <div className="relative flex gap-3.5 pb-5.5 last:pb-3">
      <span
        className={cx(
          'relative z-1 grid size-5.5 shrink-0 place-items-center rounded-full text-white transition-colors duration-200',
          done && 'bg-mint',
          active && 'bg-flame ring-5 ring-flame-2/16',
          !done && !active && 'bg-surface-3 ring-[1.5px] ring-hairline ring-inset',
        )}
        aria-hidden
      >
        {done ? <Check size={13} /> : active ? <span className="size-2 animate-breathe rounded-full bg-ember" /> : null}
      </span>

      <span className="flex flex-col gap-px pt-px">
        <b
          className={cx(
            'text-[14.5px] transition-colors duration-200',
            active ? 'font-bold text-ink' : done ? 'font-semibold text-ink-2' : 'font-semibold text-ink-4',
          )}
        >
          {label}
        </b>
        <span className="text-[12px] text-ink-4">{active ? hint : done ? 'Done' : ''}</span>
      </span>

      {hasNext && (
        <span
          className={cx('absolute bottom-0 left-2.5 top-5.5 w-[1.5px]', done ? 'bg-mint/55' : 'bg-hairline-strong')}
          aria-hidden
        />
      )}
    </div>
  );
}
