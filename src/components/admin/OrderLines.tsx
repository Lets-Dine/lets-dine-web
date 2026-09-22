import { useMemo, useState } from 'react';
import { advanceOrderItem, removeOrderItem } from '../../api/staff';
import {
  ITEM_ADVANCE_LABEL,
  ITEM_STATUS_LABEL,
  billableItems,
  canCancelItem,
  itemFocus,
  minutesSince,
  nextItemStatus,
} from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import { formatMoney } from '../../domain/money';
import type { Dish, ItemStatus, Menu, Order, OrderItem } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { cx } from '../ui';
import { Minus, Plus } from '../icons';
// `Confirm` only backs the Void action below, which is commented out for now.
import { ADMIN_TINY, INPUT_BOX, useCommand } from './kit';

/**
 * The line-level half of a ticket, shared by the full pass (`admin/Orders`)
 * and the dashboard's hero (`admin/Dashboard`) so a dish behaves identically
 * wherever a person happens to be standing. Both screens show the same cards
 * at the same width; only the surrounding chrome differs.
 *
 * Everything here answers with the updated order, and hands it straight back
 * through `onApply` — a press should land on the card before the queue's next
 * poll, not after it.
 */

const ITEM_DOT: Record<ItemStatus, string> = {
  PENDING: 'bg-ink-4',
  PREPARING: 'bg-[#7e9bff]',
  READY: 'bg-mint',
  SERVED: 'bg-mint/40',
  CANCELLED: 'bg-berry',
};

/** The colour of the *next* move, so the button says what it does before it is read. */
const ITEM_ACTION: Partial<Record<ItemStatus, string>> = {
  PENDING: 'bg-flame-2/18 text-flame-1 ring-1 ring-flame-2/35 ring-inset',
  PREPARING: 'bg-mint/16 text-[#6fd7a4] ring-1 ring-mint/30 ring-inset',
  READY: 'bg-flame text-white shadow-flame',
};

/** Past tense of each item transition, for the toast after a whole stage moves at once. */
export const BULK_DONE: Partial<Record<ItemStatus, string>> = {
  PENDING: 'started',
  PREPARING: 'plated',
  READY: 'served',
};

/**
 * The ticket-level shortcut: the earliest stage holding more than one dish. A
 * table's four starters going on together is one press, not four — while a
 * stage with a single dish in it already has its button on the row.
 */
export function nextBulkStage(order: Order): { stage: ItemStatus; items: OrderItem[] } | null {
  const live = billableItems(order.items);
  return (
    (['PENDING', 'PREPARING', 'READY'] as ItemStatus[])
      .map((stage) => ({ stage, items: live.filter((i) => i.status === stage) }))
      .find((group) => group.items.length > 1) ?? null
  );
}

/** Why this ticket is lit, in the ticket's own words. */
export function FocusRibbon({ focus, className }: { focus: Focus; className?: string }) {
  return (
    <div
      className={cx(
        'flex items-center gap-2 text-[12.5px] font-semibold',
        focus.level === 'critical' ? 'bg-berry/14 text-[#ff8098]' : 'bg-gold/12 text-[#ffd479]',
        className,
      )}
    >
      <span
        className={cx('size-1.5 shrink-0 rounded-full', focus.level === 'critical' ? 'bg-berry animate-breathe' : 'bg-gold')}
        aria-hidden
      />
      {focus.reason}
    </div>
  );
}

/**
 * Where the ticket has got to, in one 3px line: served, plated, cooking, not
 * started. Weighted by quantity, because four of one dish is four plates of
 * work however few lines it takes up.
 */
export function Progress({ order, className }: { order: Order; className?: string }) {
  const items = billableItems(order.items);
  const units = items.reduce((n, i) => n + i.quantity, 0);
  if (units === 0) return null;
  const share = (status: ItemStatus) =>
    (items.filter((i) => i.status === status).reduce((n, i) => n + i.quantity, 0) / units) * 100;

  return (
    <div className={cx('flex h-[3px] w-full overflow-hidden bg-surface-2', className)} role="presentation">
      <span className="bg-mint/40" style={{ width: `${share('SERVED')}%` }} />
      <span className="bg-mint" style={{ width: `${share('READY')}%` }} />
      <span className="bg-[#7e9bff]" style={{ width: `${share('PREPARING')}%` }} />
    </div>
  );
}

/**
 * One dish, one obvious next move — the item-level version of the ticket's
 * own rule. Actions only appear once the order has been accepted; before
 * that, every item is implicitly waiting and there's nothing to press yet.
 *
 * The line is also where a ticket gets corrected. A dish the table sent back
 * or never ordered comes off here, one plate at a time or the whole line at
 * once — but only while the kitchen has not started it, because after that
 * the food exists whether or not it is on the bill.
 */
export function ItemRow({
  order,
  item,
  now,
  canEdit,
  onApply,
  onResync,
}: {
  order: Order;
  item: OrderItem;
  now: number;
  canEdit: boolean;
  onApply: (order: Order) => void;
  onResync: () => void;
}) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  const next = nextItemStatus(item.status);
  const started = Boolean(order.acceptedAt);
  const flag = itemFocus(item, order, now);
  const cancelled = item.status === 'CANCELLED';
  const editable = canEdit && canCancelItem(item) && allows('orders:advance');

  const apply = (key: string, action: () => Promise<Order>, success?: string) =>
    void run(key, async () => onApply(await action()), success).then((ok) => {
      if (!ok) onResync();
    });

  // /** Removing takes one plate off; a whole line is just that, repeated. */
  // const voidLine = () =>
  //   void run(
  //     `void:${item.id}`,
  //     async () => {
  //       let latest = order;
  //       for (let i = 0; i < item.quantity; i++) latest = await removeOrderItem(staff, order.id, item.id);
  //       onApply(latest);
  //     },
  //     `${item.dishNameSnapshot} taken off`,
  //   ).then((ok) => {
  //     if (!ok) onResync();
  //   });

  return (
    <li className={cx('py-2.5', cancelled && 'opacity-40')}>
      <div className="flex items-baseline gap-3">
        <span className="min-w-6 shrink-0 text-[14.5px] font-bold tnum text-flame-1">{item.quantity}×</span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-[14.5px] font-semibold leading-snug', cancelled && 'line-through')}>
            {item.dishNameSnapshot}
          </span>
          {item.notes && <span className="mt-0.5 block text-[12.5px] italic leading-snug text-gold">“{item.notes}”</span>}
        </span>
        <span className="shrink-0 text-[13.5px] tnum text-ink-3">
          {formatMoney(item.unitPrice * item.quantity, order.currency)}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-9">
        <span className={cx('size-1.5 shrink-0 rounded-full', ITEM_DOT[item.status])} aria-hidden />
        <span
          className={cx(
            'text-[12px] font-semibold',
            flag?.level === 'critical' ? 'text-[#ff8098]' : flag ? 'text-[#ffd479]' : 'text-ink-4',
          )}
        >
          {ITEM_STATUS_LABEL[item.status]}
          {flag && ` · ${flag.reason}`}
          {!flag && started && !cancelled && item.status !== 'SERVED' && ` · ${minutesSince(item.statusUpdatedAt, now)}m`}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {editable && item.quantity > 1 && (
            <button
              type="button"
              disabled={pending !== null}
              aria-label={`One fewer ${item.dishNameSnapshot}`}
              className={cx(ADMIN_TINY, 'px-2 text-ink-3 ring-1 ring-hairline ring-inset hover:text-ink')}
              onClick={() =>
                apply(`less:${item.id}`, () => removeOrderItem(staff, order.id, item.id), `One ${item.dishNameSnapshot} removed`)
              }
            >
              <Minus size={13} />
            </button>
          )}

          {/* Void, commented out for now — see `voidLine` above.
          {editable && (
            <Confirm label="Void" question="Take it off?" confirmLabel="Void" disabled={pending !== null} onConfirm={voidLine} />
          )}
          */}

          {cancelled ? (
            <span className="text-[12px] font-semibold text-ink-4">Cancelled</span>
          ) : item.status === 'SERVED' ? (
            <span className="text-[12px] font-semibold text-mint">Served</span>
          ) : !started ? null : (
            next &&
            allows('orders:advance') && (
              <button
                type="button"
                disabled={pending !== null}
                className={cx(ADMIN_TINY, ITEM_ACTION[item.status])}
                onClick={() => apply(item.id, () => advanceOrderItem(staff, order.id, item.id, item.status))}
              >
                {pending === item.id ? '…' : ITEM_ADVANCE_LABEL[item.status]}
              </button>
            )
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * The menu, narrowed to what the kitchen can actually cook right now. A dish
 * that is archived or marked unavailable is not offered — the pass should not
 * be the place that discovers the kitchen ran out.
 */
export function DishPicker({
  menu,
  busy,
  onPick,
  onClose,
}: {
  menu: Menu;
  busy: boolean;
  onPick: (dish: Dish) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return menu.dishes
      .filter((d) => !d.isArchived && d.isAvailable)
      .filter((d) => (needle ? d.name.toLowerCase().includes(needle) : true))
      .slice(0, 40);
  }, [menu.dishes, query]);

  return (
    <div className="border-t border-hairline bg-surface-2/60 px-4 py-3">
      <input
        className={cx(INPUT_BOX, 'h-9 py-0 text-[13.5px]')}
        value={query}
        autoFocus
        placeholder="Add a dish to this ticket…"
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="mt-2 max-h-52 overflow-y-auto">
        {matches.length === 0 ? (
          <li className="py-3 text-center text-[12.5px] text-ink-4">Nothing on the menu matches that.</li>
        ) : (
          matches.map((dish) => (
            <li key={dish.id}>
              <button
                type="button"
                disabled={busy}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-surface-3 disabled:opacity-40"
                onClick={() => {
                  onPick(dish);
                  onClose();
                }}
              >
                <Plus size={13} className="shrink-0 text-flame-1" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{dish.name}</span>
                <span className="shrink-0 text-[13px] tnum text-ink-3">{formatMoney(dish.price, menu.restaurant.currency)}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
