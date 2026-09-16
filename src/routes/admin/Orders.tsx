import { useMemo, useState } from 'react';
import { ADVANCE_LABEL, STATUS_LABEL, canCancel, nextStatus } from '../../api/admin';
import { advanceOrder, rejectOrder } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import type { Order, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
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
 */

type Lane = 'new' | 'kitchen' | 'ready' | 'done';

const LANES: { value: Lane; label: string; statuses: OrderStatus[] }[] = [
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  { value: 'ready', label: 'Ready to serve', statuses: ['READY'] },
  { value: 'done', label: 'Finished', statuses: ['COMPLETED', 'CANCELLED'] },
];

/** A new ticket nobody has touched for this long is a problem worth showing. */
const STALE_MINUTES = 5;

export function Orders() {
  const { orders, reloadOrders } = useDashboard();
  const [lane, setLane] = useState<Lane>('new');

  const counts = useMemo(() => {
    const map = {} as Record<Lane, number>;
    for (const l of LANES) map[l.value] = orders.filter((o) => l.statuses.includes(o.status)).length;
    return map;
  }, [orders]);

  const active = LANES.find((l) => l.value === lane) ?? LANES[0];
  const shown = useMemo(() => {
    const list = orders.filter((o) => active.statuses.includes(o.status));
    // Working lanes run oldest first; finished ones read newest first.
    return lane === 'done'
      ? list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      : list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [orders, active, lane]);

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

      <div className="mb-5 overflow-x-auto no-scrollbar">
        <Segmented
          label="Order stage"
          value={lane}
          onChange={setLane}
          options={LANES.map((l) => ({ value: l.value, label: `${l.label}${counts[l.value] ? ` (${counts[l.value]})` : ''}` }))}
        />
      </div>

      {shown.length === 0 ? (
        <Panel>
          <Empty
            emoji={lane === 'new' ? '✅' : '🍽️'}
            title={lane === 'new' ? 'Nothing waiting' : 'Nothing here'}
            message={
              lane === 'new'
                ? 'Every order that came in has been accepted. New tickets appear here on their own.'
                : 'Orders show up in this lane as they move through the kitchen.'
            }
          />
        </Panel>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((order) => (
            <Ticket key={order.id} order={order} onChanged={reloadOrders} />
          ))}
        </div>
      )}
    </>
  );
}

function Ticket({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  const next = nextStatus(order.status);

  const waitingMinutes = Math.floor((Date.now() - Date.parse(order.createdAt)) / 60_000);
  const stale = order.status === 'PENDING' && waitingMinutes >= STALE_MINUTES;
  const units = order.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <article
      className={cx(
        PANEL,
        'flex flex-col overflow-hidden',
        order.status === 'PENDING' && 'ring-[1.5px] ring-flame-2/45',
        stale && 'shadow-flame',
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
        <div>
          <div className={cx(DISPLAY, 'text-[19px] tnum')}>Order {order.reference}</div>
          <div className="mt-0.5 text-[13px] text-ink-3">
            {order.tableName} · {units} item{units === 1 ? '' : 's'}
          </div>
        </div>
        <div className="text-right">
          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
          <div className={cx('mt-1 text-[12px] tnum', stale ? 'font-semibold text-flame-1' : 'text-ink-4')}>
            {clockTime(order.createdAt)} · {relativeTime(order.createdAt)}
          </div>
        </div>
      </header>

      <ul className="flex-1 divide-y divide-hairline px-4">
        {order.items.map((item) => (
          <li key={item.id} className="flex gap-3 py-2.5">
            <span className="min-w-6 text-[14.5px] font-bold tnum text-flame-1">{item.quantity}×</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold leading-snug">{item.dishNameSnapshot}</span>
              {item.notes && (
                <span className="mt-0.5 block text-[12.5px] italic leading-snug text-gold">“{item.notes}”</span>
              )}
            </span>
            <span className="text-[13.5px] tnum text-ink-3">
              {formatMoney(item.unitPrice * item.quantity, order.currency)}
            </span>
          </li>
        ))}
      </ul>

      <footer className="border-t border-hairline px-4 py-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">Total</span>
          <span className={cx(DISPLAY, 'text-[19px] tnum')}>{formatMoney(order.total, order.currency)}</span>
        </div>

        <div className="flex items-center gap-2">
          {next && allows('orders:advance') ? (
            <button
              type="button"
              disabled={pending !== null}
              className={cx(ADMIN_PRIMARY, 'flex-1')}
              onClick={() =>
                void run(order.id, () => advanceOrder(staff, order.id, order.status), `${order.reference} → ${STATUS_LABEL[next].toLowerCase()}`).then(
                  onChanged,
                )
              }
            >
              {pending === order.id ? 'Working…' : ADVANCE_LABEL[order.status]}
            </button>
          ) : (
            <span className="flex-1 text-[13px] text-ink-4">
              {order.status === 'COMPLETED'
                ? `Served ${order.completedAt ? relativeTime(order.completedAt) : ''}`
                : order.status === 'CANCELLED'
                  ? 'Cancelled'
                  : 'Waiting on the kitchen'}
            </span>
          )}

          {canCancel(order.status) && allows('orders:cancel') && (
            <Confirm
              label="Cancel"
              question="Cancel this order?"
              confirmLabel="Cancel it"
              disabled={pending !== null}
              onConfirm={() =>
                void run(order.id, () => rejectOrder(staff, order.id, 'Cancelled from the pass'), `${order.reference} cancelled`).then(
                  onChanged,
                )
              }
            />
          )}
        </div>
      </footer>
    </article>
  );
}
