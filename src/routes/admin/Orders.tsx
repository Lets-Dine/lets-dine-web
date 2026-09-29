import { useMemo, useState } from 'react';
import { byUrgencyThenAge, focusMap, newestOrderPerTable } from '../../domain/orderStatus';
import type { Order, OrderStatus } from '../../domain/types';
import { useNow } from '../../state/useNow';
import { Empty, PageTitle, Panel, Segmented } from '../../components/admin/kit';
import { PassCard } from '../../components/admin/PassCard';
import { useDashboard } from './AdminLayout';

/**
 * §27. The pass.
 *
 * One ticket, one obvious next move: a ticket only ever offers the single
 * transition that comes next, so nobody has to remember the state machine at
 * seven on a Friday. Tickets are grouped by what is being asked of the kitchen
 * rather than by status name, and the oldest waiting ticket sits first —
 * queue order is the whole point of a queue.
 *
 * Two things the pass also has to do happen at the *line* rather than the
 * ticket: move one dish without touching its siblings, and fix a ticket that
 * no longer matches the table — a dish sent back, one more plate asked for.
 * Both live on the row itself (`components/admin/OrderLines`), because that
 * is where the mistake is visible, and the dashboard's hero uses the very
 * same rows.
 *
 * And because twenty tickets all look alike, the screen stays honest about
 * which of them is actually overdue: `orderFocus` in the domain owns those
 * clocks, this file only renders them — a "Needs you" lane, a lit border, a
 * one-line reason, and the same clock again on the row that caused it.
 */

type Lane = 'focus' | 'new' | 'kitchen' | 'ready' | 'done';

const LANES: { value: Lane; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'focus', label: 'Needs you', statuses: null },
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  // Covers a delivery ticket already dispatched too, or it would fall out of every lane once it leaves READY.
  { value: 'ready', label: 'Ready to serve', statuses: ['READY', 'OUT_FOR_DELIVERY'] },
  { value: 'done', label: 'Finished', statuses: ['COMPLETED', 'CANCELLED'] },
];

/** How often the ages on screen re-read the clock. Fast enough that a "5m" is never a lie by much. */
const TICK_MS = 15_000;

export function Orders() {
  const { menu, orders, reloadOrders, applyOrder } = useDashboard();
  const now = useNow(TICK_MS);
  const [lane, setLane] = useState<Lane>('new');

  /** One pass over the queue per tick — every lane, count and card reads its flag from here. */
  const flags = useMemo(() => focusMap(orders, now), [orders, now]);

  const newestPerTable = useMemo(() => newestOrderPerTable(orders), [orders]);

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
    <>
      <PageTitle
        title="Orders"
        subtitle={
          counts.new > 0
            ? `${counts.new} waiting to be accepted · ${counts.kitchen} in the kitchen`
            : `Nothing waiting · ${counts.kitchen} in the kitchen`
        }
      />

      {overdue > 0 && lane !== 'focus' && (
        <button
          type="button"
          onClick={() => setLane('focus')}
          className="mb-3 flex w-full items-center gap-2.5 rounded-xl bg-berry/12 px-3.5 py-2.5 text-left ring-1 ring-berry/25 ring-inset transition-move active:scale-[0.99]"
        >
          <span className="size-2 shrink-0 rounded-full bg-berry animate-breathe" aria-hidden />
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-berry-ink">
            {overdue} ticket{overdue === 1 ? '' : 's'} past due
          </span>
          <span className="hidden shrink-0 gap-1.5 sm:flex">
            {orders
              .filter((o) => flags.has(o.id))
              .slice(0, 4)
              .map((o) => (
                <span key={o.id} className="rounded-md bg-berry/15 px-1.5 py-0.5 text-[11.5px] font-bold tnum text-berry-ink">
                  {o.reference}
                </span>
              ))}
          </span>
          <span className="shrink-0 text-[12.5px] font-semibold text-ink-3">Show →</span>
        </button>
      )}

      <div className="mb-5 overflow-x-auto no-scrollbar">
        <Segmented
          label="Order stage"
          value={lane}
          onChange={setLane}
          options={LANES.map((l) => ({
            value: l.value,
            label: `${l.label}${counts[l.value] ? ` (${counts[l.value]})` : ''}`,
          }))}
        />
      </div>

      {shown.length === 0 ? (
        <Panel>
          <Empty
            image="/empty.svg"
            title={lane === 'focus' ? 'Nothing is overdue' : lane === 'new' ? 'Nothing waiting' : 'Nothing here'}
            message={
              lane === 'focus'
                ? 'Every ticket is inside its clock. Anything that runs late shows up here on its own.'
                : lane === 'new'
                  ? 'Every order that came in has been accepted. New tickets appear here on their own.'
                  : 'Orders show up in this lane as they move through the kitchen.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((order, i) => (
            <PassCard
              key={order.id}
              order={order}
              index={i}
              focus={flags.get(order.id) ?? null}
              menu={menu}
              canAdd={order.tableId !== null && newestPerTable.get(order.tableId) === order.id}
              now={now}
              onApply={applyOrder}
              onResync={reloadOrders}
            />
          ))}
        </div>
      )}
    </>
  );
}
