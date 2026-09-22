import { useMemo, useState } from 'react';
import { acceptOrder, advanceOrderItem, rejectOrder } from '../../api/staff';
import {
  ADVANCE_LABEL,
  ITEM_ADVANCE_LABEL,
  STATUS_LABEL,
  billableItems,
  byUrgencyThenAge,
  canCancelOrder,
  focusMap,
  newestOrderPerTable,
} from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import { formatMoney } from '../../domain/money';
import type { ItemStatus, Menu, Order, OrderItem, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useNow } from '../../state/useNow';
import { clockTime, relativeTime } from '../../components/time';
import {
  ADMIN_PRIMARY,
  Confirm,
  Empty,
  PANEL,
  PageTitle,
  Panel,
  Segmented,
  StatusPill,
  useCommand,
} from '../../components/admin/kit';
import { BULK_DONE, FocusRibbon, ItemRow, Progress, nextBulkStage } from '../../components/admin/OrderLines';
import { DISPLAY, cx } from '../../components/ui';
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
  { value: 'ready', label: 'Ready to serve', statuses: ['READY'] },
  { value: 'done', label: 'Finished', statuses: ['COMPLETED', 'CANCELLED'] },
];

/** How often the ages on screen re-read the clock. Fast enough that a "5m" is never a lie by much. */
const TICK_MS = 15_000;

/**
 * The status colour language, borrowed for each ticket's left edge so a lane
 * of cards is readable at arm's length. Tailwind only emits CSS for class
 * names it can find as literal text, so these are whole classes.
 */
const ACCENT: Record<OrderStatus, string> = {
  PENDING: 'border-l-flame-3',
  ACCEPTED: 'border-l-gold',
  PREPARING: 'border-l-[#7e9bff]',
  READY: 'border-l-mint',
  COMPLETED: 'border-l-ink-4',
  CANCELLED: 'border-l-berry',
};

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
          <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#ff8098]">
            {overdue} ticket{overdue === 1 ? '' : 's'} past due
          </span>
          <span className="hidden shrink-0 gap-1.5 sm:flex">
            {orders
              .filter((o) => flags.has(o.id))
              .slice(0, 4)
              .map((o) => (
                <span key={o.id} className="rounded-md bg-berry/15 px-1.5 py-0.5 text-[11.5px] font-bold tnum text-[#ff8098]">
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
            emoji={lane === 'focus' ? '🎯' : lane === 'new' ? '✅' : '🍽️'}
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
          {shown.map((order) => (
            <Ticket
              key={order.id}
              order={order}
              focus={flags.get(order.id) ?? null}
              menu={menu}
              canAdd={newestPerTable.get(order.tableId) === order.id}
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

interface TicketProps {
  order: Order;
  focus: Focus | null;
  menu: Menu;
  canAdd: boolean;
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
}

function Ticket({ order, focus, now, onApply, onResync }: TicketProps) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  // Add dish is commented out for now — see the footer button and `menu`/`canAdd` in TicketProps.
  // const [adding, setAdding] = useState(false);

  const units = billableItems(order.items).reduce((n, i) => n + i.quantity, 0);
  const open = order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const canEdit = open && allows('orders:advance');
  const bulk = nextBulkStage(order);

  /** Every mutation here answers with the new ticket, so the card repaints before the next poll. */
  const apply = (key: string, action: () => Promise<Order>, success?: string) =>
    void run(key, async () => onApply(await action()), success).then((ok) => {
      if (!ok) onResync();
    });

  const advanceAll = (stage: ItemStatus, items: OrderItem[]) =>
    void run(
      `bulk:${order.id}`,
      async () => {
        let latest = order;
        for (const item of items) latest = await advanceOrderItem(staff, order.id, item.id, stage);
        onApply(latest);
      },
      `${items.length} dishes ${BULK_DONE[stage]}`,
    ).then((ok) => {
      if (!ok) onResync();
    });

  return (
    <article
      className={cx(
        PANEL,
        'flex flex-col overflow-hidden border-l-[3px]',
        ACCENT[order.status],
        focus?.level === 'critical' && 'ring-[1.5px] ring-berry/40',
        focus?.level === 'warn' && 'ring-[1.5px] ring-gold/35',
      )}
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className={cx(DISPLAY, 'text-[19px] tnum')}>Order {order.reference}</div>
          <div className="mt-0.5 truncate text-[13px] text-ink-3">
            {order.tableName} · {units} item{units === 1 ? '' : 's'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
          <div className={cx('mt-1 text-[12px] tnum', focus ? 'font-semibold text-[#ff8098]' : 'text-ink-4')}>
            {clockTime(order.createdAt)} · {relativeTime(order.createdAt)}
          </div>
        </div>
      </header>

      <Progress order={order} />

      {focus && <FocusRibbon focus={focus} className="px-4 py-1.5" />}

      <ul className="flex-1 divide-y divide-hairline border-t border-hairline px-4">
        {order.items.map((item) => (
          <ItemRow key={item.id} order={order} item={item} now={now} canEdit={canEdit} onApply={onApply} onResync={onResync} />
        ))}
      </ul>

      {/* Add dish, commented out for now — see `adding` state above.
      {adding && (
        <DishPicker
          menu={menu}
          busy={pending !== null}
          onClose={() => setAdding(false)}
          onPick={(dish) => apply(`add:${dish.id}`, () => addOrderItem(staff, order.tableId, dish.id), `${dish.name} added`)}
        />
      )}
      */}

      <footer className="border-t border-hairline px-4 py-3">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Total</span>
          <span className={cx(DISPLAY, 'text-[19px] tnum')}>{formatMoney(order.total, order.currency)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {order.status === 'PENDING' && allows('orders:advance') ? (
            <button
              type="button"
              disabled={pending !== null}
              className={cx(ADMIN_PRIMARY, 'flex-1')}
              onClick={() => apply(order.id, () => acceptOrder(staff, order.id, 'PENDING'), `${order.reference} accepted`)}
            >
              {pending === order.id ? 'Working…' : ADVANCE_LABEL.PENDING}
            </button>
          ) : bulk && allows('orders:advance') ? (
            <button
              type="button"
              disabled={pending !== null}
              className={cx(ADMIN_PRIMARY, 'flex-1')}
              onClick={() => advanceAll(bulk.stage, bulk.items)}
            >
              {pending === `bulk:${order.id}` ? 'Working…' : `${ITEM_ADVANCE_LABEL[bulk.stage]} all ${bulk.items.length}`}
            </button>
          ) : (
            <span className="flex-1 text-[13px] text-ink-4">
              {order.status === 'COMPLETED'
                ? `Served ${order.completedAt ? relativeTime(order.completedAt) : ''}`
                : order.status === 'CANCELLED'
                  ? 'Cancelled'
                  : 'In the kitchen — move each dish above'}
            </span>
          )}

          {/* Add dish, commented out for now — see `adding` state above.
          {canEdit && canAdd && (
            <button
              type="button"
              disabled={pending !== null}
              aria-expanded={adding}
              className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset')}
              onClick={() => setAdding((on) => !on)}
            >
              {adding ? <X size={13} /> : <Plus size={13} />}
              {adding ? 'Close' : 'Add dish'}
            </button>
          )}
          */}

          {canCancelOrder(order) && allows('orders:cancel') && (
            <Confirm
              label="Cancel"
              question="Cancel this order?"
              confirmLabel="Cancel it"
              disabled={pending !== null}
              onConfirm={() =>
                apply(order.id, () => rejectOrder(staff, order.id, 'Cancelled from the pass'), `${order.reference} cancelled`)
              }
            />
          )}
        </div>
      </footer>
    </article>
  );
}
