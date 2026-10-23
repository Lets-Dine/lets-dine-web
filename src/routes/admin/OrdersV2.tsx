import { useMemo, useState } from 'react';
import { completeOrderPayment } from '../../api/staff';
import { byUrgencyThenAge, floorBillSubject, focusMap } from '../../domain/orderStatus';
import type { Order, OrderStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useNow } from '../../state/useNow';
import { useCommand } from '../../components/admin/kit';
import { PassCardV2 } from '../../components/admin/PassCardV2';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useOrderSheet } from '../../components/admin/OrderSheet';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { useDashboard } from './AdminLayout';

/*
 * Orders, take two — the pass with plain stage chips (as Profit & loss's period picker) and
 * quieter tickets (`PassCardV2`). Same lanes, flags, moves and payment flow as `Orders`.
 */

type Lane = 'focus' | 'new' | 'kitchen' | 'ready' | 'unpaid' | 'done';

const LANES: { value: Lane; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'focus', label: 'Needs you', statuses: null },
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  // Covers a delivery ticket already dispatched too, or it would fall out of every lane once it leaves READY.
  { value: 'ready', label: 'Ready to serve', statuses: ['READY', 'OUT_FOR_DELIVERY'] },
  // Every dish is out and the money isn't in yet: a dine-in table that hasn't paid (`TableDetail`/`FloorDetail`), or a
  // delivery that has arrived and is waiting to be settled with its courier.
  { value: 'unpaid', label: 'Awaiting payment', statuses: ['UNPAID', 'SETTLE'] },
  { value: 'done', label: 'Finished', statuses: ['COMPLETED', 'CANCELLED'] },
];

/** How often the ages on screen re-read the clock. Fast enough that a "5m" is never a lie by much. */
const TICK_MS = 15_000;

export function OrdersV2() {
  const { menu, orders, reloadOrders, applyOrder } = useDashboard();
  const staff = useStaff();
  const now = useNow(TICK_MS);
  const [lane, setLane] = useState<Lane>('new');
  const { pending, run } = useCommand();
  const [payingId, setPayingId] = useState<string | null>(null);
  const payingOrder = orders.find((o) => o.id === payingId) ?? null;
  const menuDishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);

  /** One pass over the queue per tick — every lane, count and card reads its flag from here. */
  const flags = useMemo(() => focusMap(orders, now), [orders, now]);
  const orderSheet = useOrderSheet({ orders, flags, now, onApply: applyOrder, onResync: reloadOrders, onTakePayment: (o) => setPayingId(o.id) });

  const inLane = useMemo(
    () => (value: Lane, order: Order) => {
      const definition = LANES.find((l) => l.value === value)!;
      return definition.statuses ? definition.statuses.includes(order.status) : flags.has(order.id);
    },
    [flags],
  );

  const counts = useMemo(() => {
    const map = {} as Record<Lane, number>;
    for (const l of LANES) map[l.value] = orders.filter((o) => inLane(l.value, o)).length;
    return map;
  }, [orders, inLane]);

  const shown = useMemo(() => {
    const list = orders.filter((o) => inLane(lane, o));
    if (lane === 'done') return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return list.sort(byUrgencyThenAge(flags));
  }, [orders, inLane, lane, flags]);

  const overdue = counts.focus;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-8 animate-rise">
        <h1 className={cx(DISPLAY, 'text-[clamp(38px,7vw,64px)] leading-[0.98] tracking-[-0.03em]')}>Orders</h1>
        <p className="mt-3 text-[14px] text-ink-3 tnum">
          {counts.new > 0 ? (
            <>
              <span className="font-semibold text-flame-1">{counts.new} waiting to be accepted</span> · {counts.kitchen} in the kitchen
            </>
          ) : (
            <>Nothing waiting · {counts.kitchen} in the kitchen</>
          )}
        </p>
      </header>

      {overdue > 0 && lane !== 'focus' && (
        <button
          type="button"
          onClick={() => setLane('focus')}
          className="group mb-5 flex w-full animate-rise items-center gap-3 rounded-2xl bg-berry/10 px-4 py-3 text-left ring-1 ring-berry/25 ring-inset transition-[scale,background-color] duration-200 hover:bg-berry/15 active:scale-[0.99]"
        >
          <span className="size-2.5 shrink-0 animate-breathe rounded-full bg-berry" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-berry-ink">
            {overdue} ticket{overdue === 1 ? '' : 's'} past due
            <span className="ml-2 hidden font-normal tnum sm:inline">
              {orders
                .filter((o) => flags.has(o.id))
                .slice(0, 4)
                .map((o) => o.reference)
                .join(' · ')}
            </span>
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5">Show →</span>
        </button>
      )}

      <div className="mb-6 flex animate-rise flex-wrap items-center gap-2 [animation-delay:60ms]" role="group" aria-label="Order stage">
        {LANES.map((l) => (
          <button key={l.value} type="button" aria-pressed={lane === l.value} className={cx(CHIP, lane === l.value ? CHIP_ON : CHIP_OFF)} onClick={() => setLane(l.value)}>
            {l.label}
            {counts[l.value] > 0 && <span className="tnum"> · {counts[l.value]}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="animate-rise rounded-3xl bg-surface px-6 py-14 text-center ring-1 ring-hairline ring-inset [animation-delay:120ms]">
          <h2 className={cx(DISPLAY, 'text-[24px]')}>{lane === 'focus' ? 'Nothing is overdue' : lane === 'new' ? 'Nothing waiting' : 'Nothing here'}</h2>
          <p className="mx-auto mt-3 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-3">
            {lane === 'focus'
              ? 'Every ticket is inside its clock. Anything that runs late shows up here on its own.'
              : lane === 'new'
                ? 'Every order that came in has been accepted. New tickets appear here on their own.'
                : 'Orders show up in this lane as they move through the kitchen.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((order, i) => (
            <PassCardV2
              key={order.id}
              order={order}
              index={i}
              focus={flags.get(order.id) ?? null}
              now={now}
              onApply={applyOrder}
              onResync={reloadOrders}
              onTakePayment={(o) => setPayingId(o.id)}
              onOpenDetail={orderSheet.open}
            />
          ))}
        </div>
      )}

      {orderSheet.sheet}

      <PaymentSheet
        table={payingOrder ? floorBillSubject(payingOrder) : null}
        orders={payingOrder ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder) return Promise.resolve(false);
          const order = payingOrder;
          return run(
            order.id,
            () => completeOrderPayment(staff, order, changes.items, changes.method, changes.discount, changes.redeemPoints, changes.customerId, changes.credit),
            `${order.reference} paid up`,
          ).then((ok) => {
            if (ok) reloadOrders();
            return ok;
          });
        }}
        onEndSession={() => setPayingId(null)}
        onShowQr={() => setPayingId(null)}
      />
    </div>
  );
}
