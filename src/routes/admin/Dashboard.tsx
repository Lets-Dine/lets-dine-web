import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allOrders } from '../../api/admin';
import { acceptOrder, advanceOrderItem, rejectOrder } from '../../api/staff';
import { funnel } from '../../domain/analytics';
import {
  ADVANCE_LABEL,
  ITEM_ADVANCE_LABEL,
  STATUS_LABEL,
  billableItems,
  byUrgencyThenAge,
  canCancelOrder,
  focusMap,
  itemStatusSummary,
  newestOrderPerTable,
} from '../../domain/orderStatus';
import type { Focus } from '../../domain/orderStatus';
import {
  dishPerformance,
  feedbackSummary,
  periodReport,
  windowFor,
} from '../../domain/adminMetrics';
import { formatMoney } from '../../domain/money';
import type { ItemStatus, Menu, Order, OrderItem, OrderStatus } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useNow } from '../../state/useNow';
import { relativeTime } from '../../components/time';
import {
  ADMIN_TINY,
  Confirm,
  Loading,
  PageTitle,
  Panel,
  Row,
  Segmented,
  StatTile,
  StatusPill,
  useCommand,
} from '../../components/admin/kit';
import { BULK_DONE, FocusRibbon, ItemRow, Progress, nextBulkStage } from '../../components/admin/OrderLines';
import { DISPLAY, cx } from '../../components/ui';
import { ChevronRight } from '../../components/icons';
import { useDashboard } from './AdminLayout';

/** How many of the oldest working tickets the hero grid shows before pointing to the full pass. */
const PASS_GRID_SIZE = 9;

/** How often the ages on screen re-read the clock. */
const TICK_MS = 15_000;

type Lane = 'all' | 'focus' | 'new' | 'kitchen' | 'ready';

/** `statuses: null` means the lane is not about status — see `inLane` below. */
const LANES: { value: Lane; label: string; statuses: OrderStatus[] | null }[] = [
  { value: 'all', label: 'All', statuses: null },
  { value: 'focus', label: 'Needs you', statuses: null },
  { value: 'new', label: 'New', statuses: ['PENDING'] },
  { value: 'kitchen', label: 'In the kitchen', statuses: ['ACCEPTED', 'PREPARING'] },
  { value: 'ready', label: 'Ready', statuses: ['READY'] },
];

/**
 * The status color language, borrowed for each ticket card's border. Tailwind only generates CSS
 * for class names it can find as literal text in source — `border-${ACCENT[status]}` would build a
 * string it can never see, so these are whole class names, not fragments assembled at runtime.
 */
const ACCENT_BORDER: Record<OrderStatus, string> = {
  PENDING: 'border-flame-3',
  ACCEPTED: 'border-gold',
  PREPARING: 'border-[#7e9bff]',
  READY: 'border-mint',
  COMPLETED: 'border-ink-4',
  CANCELLED: 'border-berry',
};

const ACCENT_BUTTON: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-3',
  ACCEPTED: 'bg-gold',
  PREPARING: 'bg-[#7e9bff]',
  READY: 'bg-mint',
  COMPLETED: 'bg-ink-4',
  CANCELLED: 'bg-berry',
};

/**
 * §26. The opening screen answers three questions in the order a restaurant
 * asks them: is anything waiting on me, how is today going, and is anything
 * about the menu quietly broken. Nothing here is a number for its own sake —
 * every tile is either an action or a comparison.
 *
 * The pass is the one question that never waits, so it leads: a full-width
 * hero, not a panel sharing a row with sales figures, with the same
 * accept/advance/cancel moves the full queue has — nobody should have to
 * leave the dashboard to touch a ticket.
 */
export function Dashboard() {
  const staff = useStaff();
  const { menu, orders: queue, reloadOrders, applyOrder } = useDashboard();
  const history = useAsync(() => allOrders(staff), [staff]);
  const now = useNow(TICK_MS);
  const [lane, setLane] = useState<Lane>('all');

  const orders = history.data;
  const today = useMemo(() => (orders ? periodReport(orders, 'today') : null), [orders]);
  const bestSellers = useMemo(() => {
    if (!orders) return [];
    const w = windowFor('today');
    return dishPerformance(orders, menu.dishes, w.from, w.to)
      .filter((d) => d.units > 0)
      .sort((a, b) => b.units - a.units)
      .slice(0, 5);
  }, [orders, menu.dishes]);

  const feedback = useMemo(() => feedbackSummary(menu.dishes), [menu.dishes]);
  const { dishDecisionRate } = funnel();

  const working = useMemo(
    () => queue.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED'),
    [queue],
  );
  const waiting = working.filter((o) => o.status === 'PENDING');

  /** The same clocks the full pass runs on — one sweep per tick, read by every lane and card. */
  const flags = useMemo(() => focusMap(working, now), [working, now]);
  const newestPerTable = useMemo(() => newestOrderPerTable(queue), [queue]);

  const inLane = useMemo(
    () => (value: Lane, order: Order) => {
      if (value === 'focus') return flags.has(order.id);
      const definition = LANES.find((l) => l.value === value)!;
      return definition.statuses ? definition.statuses.includes(order.status) : true;
    },
    [flags],
  );

  const laneCounts = useMemo(() => {
    const counts = {} as Record<Lane, number>;
    for (const l of LANES) counts[l.value] = working.filter((o) => inLane(l.value, o)).length;
    return counts;
  }, [working, inLane]);

  const filtered = useMemo(
    () => working.filter((o) => inLane(lane, o)).sort(byUrgencyThenAge(flags)),
    [working, inLane, lane, flags],
  );

  const shown = filtered.slice(0, PASS_GRID_SIZE);
  const hiddenCount = filtered.length - shown.length;
  const overdue = laneCounts.focus;

  const unavailable = menu.dishes.filter((d) => !d.isArchived && !d.isAvailable);
  const weakest = menu.dishes
    .filter((d) => !d.isArchived && d.stats.ratingCount >= 20 && (d.stats.avgRating ?? 5) < 4.2)
    .sort((a, b) => (a.stats.avgRating ?? 5) - (b.stats.avgRating ?? 5))
    .slice(0, 3);

  return (
    <>
      <PageTitle
        title={greeting(staff.name)}
        subtitle={
          overdue > 0
            ? `${overdue} ticket${overdue === 1 ? '' : 's'} past due on the pass.`
            : waiting.length > 0
              ? `${waiting.length} order${waiting.length === 1 ? '' : 's'} waiting to be accepted.`
              : 'Nothing is waiting to be accepted right now.'
        }
        action={
          <Link
            to="/admin/orders"
            className={cx(
              'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-move active:scale-95',
              waiting.length > 0 ? 'bg-flame shadow-flame' : 'bg-surface-2 text-ink ring-1 ring-hairline ring-inset',
            )}
          >
            Open the pass
            {waiting.length > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bg/30 px-1.5 text-[11px] font-bold tnum">
                {waiting.length}
              </span>
            )}
          </Link>
        }
      />

      {/* ── The pass: full-width, decorated, the first thing a shift sees ── */}
      <section className="relative mb-5 overflow-hidden rounded-3xl bg-surface ring-1 ring-hairline ring-inset">
        <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-flame-3/18 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-flame-2/10 blur-3xl" aria-hidden />

        <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="relative flex size-2.5 shrink-0" aria-hidden>
              <span className={cx('absolute inline-flex size-full animate-breathe rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
              <span className={cx('relative inline-flex size-2.5 rounded-full', overdue > 0 ? 'bg-berry' : 'bg-mint')} />
            </span>
            <div>
              <h2 className={cx(DISPLAY, 'text-[19px] sm:text-[22px]')}>On the pass</h2>
              <p className={cx('mt-0.5 text-[12.5px]', overdue > 0 ? 'font-semibold text-[#ff8098]' : 'text-ink-3')}>
                {overdue > 0 ? `${overdue} past due · overdue tickets first` : 'Live tickets, oldest first'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="overflow-x-auto no-scrollbar">
              <Segmented
                label="Lane"
                value={lane}
                onChange={setLane}
                options={LANES.map((l) => ({
                  value: l.value,
                  label: `${l.label}${laneCounts[l.value] ? ` (${laneCounts[l.value]})` : ''}`,
                }))}
              />
            </div>
            <Link to="/admin/orders" className="hidden shrink-0 text-[13px] font-semibold text-flame-1 sm:inline">
              All orders
            </Link>
          </div>
        </div>

        <div className="relative p-4 sm:p-5">
          {working.length === 0 ? (
            <div className="grid place-items-center gap-2 px-4 py-14 text-center">
              <div className="text-3xl" aria-hidden>
                ✅
              </div>
              <p className="text-[14.5px] font-semibold">The kitchen is clear</p>
              <p className="max-w-[36ch] text-[13px] text-ink-3">A new ticket will appear here the moment a table orders.</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-14 text-center text-[13.5px] text-ink-3">Nothing in this lane right now.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((order, i) => (
                <PassCard
                  key={order.id}
                  order={order}
                  index={i}
                  focus={flags.get(order.id) ?? null}
                  menu={menu}
                  canAdd={newestPerTable.get(order.tableId) === order.id}
                  now={now}
                  onApply={applyOrder}
                  onResync={reloadOrders}
                />
              ))}
              {hiddenCount > 0 && (
                <Link
                  to="/admin/orders"
                  className="grid place-items-center gap-1 rounded-2xl border border-dashed border-hairline-strong px-4 py-6 text-center transition-move hover:bg-surface-2 active:scale-[0.98]"
                >
                  <span className="text-[16px] font-bold tnum text-flame-1">+{hiddenCount}</span>
                  <span className="text-[12.5px] font-semibold text-ink-3">more on the pass</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatTile
          label="Orders today"
          value={today ? String(today.current.orders) : '—'}
          change={today?.orderChange}
          sub="vs yesterday"
        />
        <StatTile
          label="Revenue today"
          value={today ? formatMoney(today.current.revenue, menu.restaurant.currency) : '—'}
          change={today?.revenueChange}
          sub="vs yesterday"
        />
        <StatTile
          label="Average order"
          value={today ? formatMoney(today.current.averageOrder, menu.restaurant.currency) : '—'}
          sub={today ? `${today.current.covers} dishes served` : undefined}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Selling today" hint="By dishes served" bare>
          {history.loading ? (
            <Loading label="Counting today…" />
          ) : bestSellers.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">Nothing has sold yet today.</p>
          ) : (
            bestSellers.map((dish) => (
              <Row key={dish.dishId}>
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{dish.name}</span>
                <span className="shrink-0 text-[13.5px] tnum text-ink-3">
                  {formatMoney(dish.revenue, menu.restaurant.currency)}
                </span>
                <span className="w-12 shrink-0 text-right text-[14px] font-bold tnum text-flame-1">×{dish.units}</span>
              </Row>
            ))
          )}
        </Panel>

        <Panel title="Worth a look" bare>
          {unavailable.length === 0 && weakest.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-ink-3">
              Everything is on the menu and rating well.
            </p>
          ) : (
            <>
              {unavailable.length > 0 && (
                <Row>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">
                      {unavailable.length} dish{unavailable.length === 1 ? '' : 'es'} marked unavailable
                    </span>
                    <span className="block truncate text-[12.5px] text-ink-4">
                      {unavailable.map((d) => d.name).join(', ')}
                    </span>
                  </span>
                  <Link to="/admin/menu" className="shrink-0 text-[13px] font-semibold text-flame-1">
                    Menu
                  </Link>
                </Row>
              )}
              {weakest.map((dish) => (
                <Row key={dish.id}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{dish.name}</span>
                    <span className="block text-[12.5px] text-ink-4">
                      {dish.stats.avgRating?.toFixed(1)} ★ from {dish.stats.ratingCount} diners
                    </span>
                  </span>
                  <Link to="/admin/reviews" className="shrink-0 text-[13px] font-semibold text-flame-1">
                    Reviews
                  </Link>
                </Row>
              ))}
            </>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Restaurant rating"
          value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
          sub={`${feedback.reviewCount.toLocaleString()} verified reviews`}
        />
        <StatTile
          label="Would order again"
          value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
          sub="across rated dishes"
        />
        <StatTile
          label="Dishes without ratings"
          value={String(feedback.unratedDishes)}
          sub={`of ${feedback.ratedDishes + feedback.unratedDishes} on the menu`}
        />
        <StatTile
          label="Dish decision rate"
          value={dishDecisionRate !== null ? `${Math.round(dishDecisionRate * 100)}%` : '—'}
          sub="dish page → added to cart"
        />
      </div>
    </>
  );
}

/**
 * A ticket on the pass hero. It is the same card the full queue shows — same
 * width, same rows, same rules (§27) — because a shift's eyes are already
 * here and sending someone to /admin/orders to move one dish is a trip, not
 * a workflow.
 *
 * What differs is restraint: the lines stay folded behind a summary so nine
 * tickets still fit on one screen. A ticket that is overdue unfolds itself,
 * since the whole reason it is lit is that somebody needs to look inside it.
 */
function PassCard({
  order,
  index,
  focus,
  now,
  onApply,
  onResync,
}: {
  order: Order;
  index: number;
  focus: Focus | null;
  /** Kept in the type for when Add returns — see `menu`/`canAdd` below. */
  menu: Menu;
  canAdd: boolean;
  now: number;
  onApply: (order: Order) => void;
  onResync: () => void;
}) {
  const staff = useStaff();
  const { allows } = useAuth();
  const { pending, run } = useCommand();
  /** `null` means "nobody has decided" — an overdue ticket then opens on its own. */
  const [opened, setOpened] = useState<boolean | null>(null);
  // Add is commented out for now — see the footer button below.
  // const [adding, setAdding] = useState(false);
  const open = opened ?? focus !== null;

  const noted = order.items.find((i) => i.notes);
  const live = allows('orders:advance') && order.status !== 'COMPLETED' && order.status !== 'CANCELLED';
  const canAdvance = order.status === 'PENDING' && allows('orders:advance');
  const canCancelHere = canCancelOrder(order) && allows('orders:cancel');
  const progress = itemStatusSummary(order);
  const bulk = nextBulkStage(order);

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
        'animate-rise relative flex flex-col overflow-hidden rounded-2xl bg-surface-2/60',
        'transition-move hover:-translate-y-0.5 hover:shadow-lift border',
        ACCENT_BORDER[order.status],
        focus?.level === 'critical' && 'ring-[1.5px] ring-berry/40',
        focus?.level === 'warn' && 'ring-[1.5px] ring-gold/35',
      )}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[14px] font-bold tnum">{order.reference}</span>
              <span className="truncate text-[13px] font-semibold text-ink-2">{order.tableName}</span>
            </div>
            <div className={cx('mt-0.5 text-[11.5px] tnum', focus ? 'font-semibold text-[#ff8098]' : 'text-ink-4')}>
              {relativeTime(order.createdAt)}
            </div>
          </div>
          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
        </div>
      </div>

      <Progress order={order} />

      {focus && <FocusRibbon focus={focus} className="px-4 py-1.5" />}

      {open ? (
        <ul className="divide-y divide-hairline border-t border-hairline px-4">
          {order.items.map((item) => (
            <ItemRow key={item.id} order={order} item={item} now={now} canEdit={live} onApply={onApply} onResync={onResync} />
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => setOpened(true)}
          className="group border-t border-hairline px-4 py-2.5 text-left transition-colors hover:bg-surface-3/40"
        >
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-3">
              {billableItems(order.items)
                .map((i) => `${i.quantity}× ${i.dishNameSnapshot}`)
                .join(', ')}
            </span>
            <ChevronRight size={14} className="shrink-0 text-ink-4 transition-move group-hover:translate-x-0.5" />
          </span>
          {noted && <span className="mt-1 block truncate text-[12px] italic text-gold">“{noted.notes}”</span>}
          {order.acceptedAt && progress.total > 0 && (
            <span className="mt-1 block text-[12px] font-semibold text-ink-3">
              {progress.ready}/{progress.total} ready — open to move a dish
            </span>
          )}
        </button>
      )}

      {/* Add, commented out for now — see `adding` state above.
      {adding && (
        <DishPicker
          menu={menu}
          busy={pending !== null}
          onClose={() => setAdding(false)}
          onPick={(dish) => apply(`add:${dish.id}`, () => addOrderItem(staff, order.tableId, dish.id), `${dish.name} added`)}
        />
      )}
      */}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline px-4 py-3">
        {canAdvance ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => apply(order.id, () => acceptOrder(staff, order.id, 'PENDING'), `${order.reference} accepted`)}
          >
            {pending === order.id ? 'Working…' : ADVANCE_LABEL.PENDING}
          </button>
        ) : bulk && live ? (
          <button
            type="button"
            disabled={pending !== null}
            className={cx(ADMIN_TINY, 'flex-1 justify-center text-white', ACCENT_BUTTON[order.status])}
            onClick={() => advanceAll(bulk.stage, bulk.items)}
          >
            {pending === `bulk:${order.id}` ? 'Working…' : `${ITEM_ADVANCE_LABEL[bulk.stage]} all ${bulk.items.length}`}
          </button>
        ) : (
          <span className="flex-1 text-[12px] text-ink-4">{open ? 'Move each dish above' : 'Nothing to press'}</span>
        )}

        {/* Add, commented out for now — see `adding` state above.
        {live && canAdd && (
          <button
            type="button"
            disabled={pending !== null}
            aria-expanded={adding}
            className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset')}
            onClick={() => {
              setAdding((on) => !on);
              setOpened(true);
            }}
          >
            {adding ? <X size={13} /> : <Plus size={13} />}
            {adding ? 'Close' : 'Add'}
          </button>
        )}
        */}

        {open && (
          <button
            type="button"
            className={cx(ADMIN_TINY, 'px-2 text-ink-4 hover:text-ink-2')}
            onClick={() => setOpened(false)}
          >
            Fold
          </button>
        )}

        {canCancelHere && (
          <Confirm
            label="Cancel"
            question="Cancel this order?"
            confirmLabel="Cancel it"
            disabled={pending !== null}
            onConfirm={() =>
              apply(order.id, () => rejectOrder(staff, order.id, 'Cancelled from the dashboard'), `${order.reference} cancelled`)
            }
          />
        )}
      </div>
    </article>
  );
}

function greeting(name: string): string {
  const hour = new Date().getHours();
  const first = name.split(' ')[0];
  if (hour < 11) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}
