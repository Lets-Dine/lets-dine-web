import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { StaffOrderInput } from '../../api/live-admin';
import { STAFF_ORDERS_ENABLED, completeOrderPayment, createStaffOrder, listFloors, listTables, reprintKitchenTickets } from '../../api/staff';
import { randomId } from '../../api/store';
import { formatMoney } from '../../domain/money';
import { ITEM_STATUS_LABEL, STATUS_LABEL, byUrgencyThenAge, floorBillSubject, focusMap } from '../../domain/orderStatus';
import { tableService } from '../../domain/posBoard';
import type { Dish, DiningTable, Floor, Order } from '../../domain/types';
import { openCustomerDisplay, usePublishCustomerDisplay } from '../../platform/customerDisplay';
import { exitFullscreenIfTaken, enterFullscreen, isFullscreen, toggleFullscreen } from '../../platform/fullscreen';
import { haptic } from '../../platform/haptics';
import { isSoundOn, playTick, setSoundOn } from '../../platform/sound';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useNow } from '../../state/useNow';
import { useToast } from '../../state/ToastContext';
import { useHeldTickets } from '../../state/useHeldTickets';
import type { HeldTicket } from '../../state/useHeldTickets';
import { Avatar } from '../../components/admin/Avatar';
import { DishOptionsDialog, orderableOptions } from '../../components/admin/DishOptionsDialog';
import { useTicketDraft } from '../../components/admin/DishTilePicker';
import { Empty, Loading, Select, TextInput, useCommand } from '../../components/admin/kit';
import { useOrderSheet } from '../../components/admin/OrderSheet';
import { PassCardV2 } from '../../components/admin/PassCardV2';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import type { CustomerPayQr } from '../../components/admin/PaymentSheet';
import { Key, PosGrid, usePosMenu } from '../../components/admin/PosV2Grid';
import { HeldSheet, ReceiptsSheet } from '../../components/admin/PosSheets';
import { TablePaySheet } from '../../components/admin/TablePaySheet';
import { PosCustomer } from '../../components/admin/PosCustomer';
import type { Guest } from '../../components/admin/PosCustomer';
import { QuantityStepper } from '../../components/Bits';
import { Bell, Bike, Check, ChevronLeft, Clock, Eye, Maximize, Minimize, Receipt, Ticket, Volume, VolumeOff } from '../../components/icons';
import { BrandName } from '../../components/BrandName';
import { BTN_FLAME, BTN_GHOST, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/*
 * POS mode, take two.
 *
 * What v1 got wrong, and what this answers:
 *
 * 1. Two ways in. v1 split the screen into a "Tables" tab and a "New" tab, and the New tab then asked
 *    again whether the order was for a table, a floor, a delivery or the counter — so a table order had
 *    two different routes and the counter was a setting inside a tab. v2 has one home, the service board:
 *    every table and every counter target side by side, one tap each, nothing nested.
 *
 * 2. Mouse-shaped on a keyboard machine. v1 is tap-only, and the pass is a laptop. Here the keyboard is
 *    the fast path and the screen is the confirmation: you type the dish, a bare number is a quantity,
 *    Enter rings it up, F2 sends it. Every key is printed next to the thing it does, so it is learned by
 *    working rather than by being trained.
 *
 * 3. Plate photographs on a till. A round plate shot at 68% of a 160px tile is for a diner deciding what
 *    they want; the person at the pass already knows. v2 is text-first and roughly three times as dense.
 *
 * 4. A board that knew nothing. v1's table cards said "In use · 4 seats". A floor is run on time and
 *    state, so v2's cards carry minutes since the first order, what is still coming, what is plated and
 *    waiting, the running total, and the same overdue flags the pass uses.
 *
 * 5. A modal in the way. v1 asked "Leave this ticket?" every time, which is a dialog staff learn to
 *    dismiss. A table or floor ticket now parks itself on the way out and says where it went; only the
 *    two kinds that cannot be parked, and money nobody has taken, are worth stopping someone for.
 *
 * Everything below the interface is v1's: the same order, table and payment calls, the same held-ticket
 * shelf, the same payment sheets. This is a redesign of the flow, not of the plumbing.
 */

type Target =
  | { kind: 'TABLE'; table: DiningTable }
  | { kind: 'FLOOR'; floor: Floor }
  | { kind: 'DELIVERY' }
  | { kind: 'PICKUP' }
  | { kind: 'QUICK' };

/**
 * What terminal is open, by id rather than by object. A table's record changes under the terminal all the time — a
 * first order seats it, a settled bill ends its visit — so holding the `DiningTable` that was clicked would freeze
 * `currentSessionId` at whatever it was then, and the ticket would go on showing the party that has already left.
 */
type Opened = { kind: 'TABLE' | 'FLOOR'; id: string } | { kind: 'DELIVERY' | 'PICKUP' | 'QUICK' };

const openedOf = (t: Target): Opened => (t.kind === 'TABLE' ? { kind: 'TABLE', id: t.table.id } : t.kind === 'FLOOR' ? { kind: 'FLOOR', id: t.floor.id } : { kind: t.kind });

/** What stops someone walking away from a terminal: a send in flight, unsent dishes nowhere to park, or money nobody took. */
interface Guard {
  busy: boolean;
  reason: string;
}

/** How often the ages on the board re-read the clock. Fast enough that a "12m" is never a lie by much. */
const TICK_MS = 15_000;

export function PosV2() {
  // Reached from the Orders button (`?enter=1`, its own tab) or an in-app link that carries state. A reload keeps either.
  // Anything else, a typed address or an old bookmark, goes back to Orders.
  const location = useLocation();
  const entered = (location.state as { pos?: boolean } | null)?.pos === true || new URLSearchParams(location.search).get('enter') === '1';
  return entered ? <PosV2Screen /> : <Navigate to="/admin/orders" replace />;
}

function PosV2Screen() {
  const { menu, orders, tablesTick } = useDashboard();
  const staff = useStaff();
  const { allows } = useAuth();
  const navigate = useNavigate();
  const push = useToast();
  const [open, setOpen] = useState<Opened | null>(null);
  /** New is a blank sale. Orders is the open tickets, still inside POS. */
  const [mode, setMode] = useState<'new' | 'orders'>('new');
  const [fullscreen, setFullscreen] = useState(false);
  const [sound, setSound] = useState(isSoundOn);
  const [guard, setGuard] = useState<Guard | null>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [sheet, setSheet] = useState<'held' | 'receipts' | 'keys' | null>(null);
  const heldStore = useHeldTickets(staff.branchId ?? 'main');
  /** A parked ticket on its way back: carried to the terminal it belongs to, which takes the dishes and releases it. */
  const [recall, setRecall] = useState<HeldTicket | null>(null);

  const tables = useAsync(() => listTables(staff), [staff, tablesTick]);
  const floors = useAsync(() => listFloors(staff), [staff]);
  const activeTables = useMemo(() => (tables.data ?? []).filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [tables.data]);
  const activeFloors = useMemo(() => (floors.data ?? []).filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [floors.data]);
  const waiting = orders.filter((o) => o.status === 'PENDING').length;
  /**
   * The open terminal, re-read from the current tables and floors on every render. A table or floor taken out of
   * service while someone is standing at it drops them back on the board rather than onto a stale record.
   */
  const target = useMemo<Target | null>(() => {
    if (!open) return null;
    if (open.kind === 'TABLE') {
      const table = activeTables.find((t) => t.id === open.id);
      return table ? { kind: 'TABLE', table } : null;
    }
    if (open.kind === 'FLOOR') {
      const floor = activeFloors.find((f) => f.id === open.id);
      return floor ? { kind: 'FLOOR', floor } : null;
    }
    return { kind: open.kind };
  }, [open, activeTables, activeFloors]);

  useEffect(() => {
    // A new tab does not inherit the click that opened it, so this ask is refused until the first tap or key in the tab.
    void enterFullscreen();
    const ask = () => void enterFullscreen();
    window.addEventListener('pointerdown', ask, { once: true });
    window.addEventListener('keydown', ask, { once: true });
    return () => {
      window.removeEventListener('pointerdown', ask);
      window.removeEventListener('keydown', ask);
    };
  }, []);
  useEffect(() => {
    const sync = () => setFullscreen(isFullscreen());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  // However POS is left (the back button, the browser's Back, a sign-out), full screen goes back to how it was.
  useEffect(() => () => void exitFullscreenIfTaken(), []);

  /**
   * Anything that unmounts a terminal goes through here, so a ticket is never dropped by a stray tap. A send in flight
   * cannot be left, and a table or floor draft is parked on the way rather than being made into a question.
   */
  const onLeave = useRef<() => void>(() => {});
  const leave = (go: () => void) => {
    if (guard?.busy) return;
    if (guard) setLeaving(() => go);
    else {
      onLeave.current();
      go();
    }
  };

  // F1 is the one key that works everywhere, including with a sheet up: it is how someone who is lost gets unlost.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // F1 on a Mac is a brightness key unless fn is held, so Option+H is the twin that always arrives.
      if (e.key !== 'F1' && !(e.altKey && e.code === 'KeyH')) return;
      e.preventDefault();
      setSheet((s) => (s === 'keys' ? null : 'keys'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const recallHeld = (ticket: HeldTicket) => {
    // A table or floor taken out of service since the ticket was parked has nowhere to put it: say so, and keep it parked.
    const table = ticket.kind === 'TABLE' ? activeTables.find((t) => t.id === ticket.targetId) : null;
    const floor = ticket.kind === 'FLOOR' ? activeFloors.find((f) => f.id === ticket.targetId) : null;
    if (!table && !floor) {
      push(`${ticket.label} isn't available any more. The ticket stays parked.`, '⚠️');
      return;
    }
    const want: Opened = { kind: ticket.kind, id: ticket.targetId };
    const already = open !== null && open.kind === want.kind && open.id === want.id;
    const go = () => {
      setOpen(want);
      setRecall(ticket);
    };
    // Coming back to the terminal that is already open leaves nothing behind, so there is nothing to confirm.
    if (already) go();
    else leave(go);
  };

  if (!STAFF_ORDERS_ENABLED || !allows('orders:advance')) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Empty
          emoji="🧾"
          title="POS mode isn't available here"
          message={STAFF_ORDERS_ENABLED ? 'Your role cannot place orders.' : 'It needs the live backend: the offline demo cannot place orders.'}
          action={
            <Link to="/admin/orders" className={BTN_GHOST}>
              Back to orders
            </Link>
          }
        />
      </div>
    );
  }

  const exit = () => leave(() => navigate('/admin/orders'));
  const goNew = () => leave(() => { setMode('new'); setOpen(null); });
  const goOrders = () => leave(() => { setMode('orders'); setOpen(null); });
  const blocked = sheet !== null || leaving !== null;
  const openCount = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-4 px-5 py-3 pt-[calc(12px+var(--safe-t))]">
        <span className={cx(DISPLAY, 'truncate text-[28px]')}>
          <BrandName /> <span className="text-2xl">POS</span>
        </span>
        <ModeSwitch mode={mode} openCount={openCount} onNew={goNew} onOrders={goOrders} />

        <div className="ml-auto flex items-center gap-1.5">
          <HeaderButton label="Shortcuts" onClick={() => setSheet('keys')}>
            <span className="font-mono text-[12px] font-bold">F1</span>
          </HeaderButton>
          <HeaderButton label="Customer screen" onClick={openCustomerDisplay}>
            <Eye size={16} />
          </HeaderButton>
          <HeaderButton label="Receipts" onClick={() => setSheet('receipts')}>
            <Receipt size={16} />
          </HeaderButton>
          <HeaderButton label={`Parked tickets: ${heldStore.held.length}`} onClick={() => setSheet('held')} badge={heldStore.held.length || undefined}>
            <Ticket size={16} />
          </HeaderButton>
          <HeaderButton
            label={sound ? 'New order sound on' : 'New order sound muted'}
            onClick={() => {
              setSoundOn(!sound);
              setSound(!sound);
            }}
            pressed={sound}
            lit={!sound}
          >
            {sound ? <Volume size={16} /> : <VolumeOff size={16} />}
          </HeaderButton>
          <HeaderButton label="Full screen" onClick={() => void toggleFullscreen()} pressed={fullscreen} lit={fullscreen}>
            {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </HeaderButton>
          <span
            role="status"
            aria-label={`${waiting} waiting on the pass`}
            className="relative grid size-12 place-items-center rounded-lg bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset"
          >
            <Bell size={16} />
            {waiting > 0 && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-flame px-1 text-[11px] font-bold text-white tnum">{waiting}</span>}
          </span>
          <button
            type="button"
            onClick={exit}
            // Red, as the way out of the till: the house danger tint rather than a solid fill, which at this size reads
            // as an error the screen is reporting instead of a button someone has to mean to press.
            className="ml-1 inline-flex h-12 items-center gap-2 rounded-lg bg-berry/14 px-4 text-[15px] font-semibold text-berry-ink ring-1 ring-berry/35 ring-inset transition-colors hover:bg-berry/20"
          >
            <Avatar name={staff.name} src={staff.avatarUrl} className="size-5 text-[10px]" />
            Exit
          </button>
        </div>
      </header>

      {mode === 'orders' ? (
        <PosOrders />
      ) : target ? (
        <Terminal
          key={`${open!.kind}:${open!.kind === 'TABLE' || open!.kind === 'FLOOR' ? open!.id : ''}`}
          target={target}
          tables={activeTables}
          floors={activeFloors}
          onTarget={(t) => leave(() => setOpen(openedOf(t)))}
          onBack={() => leave(() => setOpen(null))}
          onChanged={tables.reload}
          onGuard={setGuard}
          onLeave={onLeave}
          onPark={heldStore.hold}
          blocked={blocked}
          recall={recall && open!.kind === recall.kind && (open!.kind === 'TABLE' || open!.kind === 'FLOOR') && open!.id === recall.targetId ? recall : null}
          onRecalled={(id) => {
            heldStore.release(id);
            setRecall(null);
          }}
        />
      ) : (
        <ServiceBoard
          tables={activeTables}
          floors={activeFloors}
          held={heldStore.held}
          loading={(!tables.data && !tables.error) || (!floors.data && !floors.error)}
          error={tables.error?.message ?? floors.error?.message ?? null}
          onRetry={() => (tables.reload(), floors.reload())}
          onOpen={(t) => setOpen(openedOf(t))}
          onParked={() => setSheet('held')}
          onExit={exit}
          blocked={blocked}
        />
      )}

      {sheet === 'held' && (
        <HeldSheet
          held={heldStore.held}
          menu={menu}
          onRecall={recallHeld}
          onDiscard={heldStore.release}
          onClose={() => setSheet(null)}
          title="Parked tickets"
          intro="Set aside, not sent. They stay on this device until you recall or discard them."
        />
      )}
      {sheet === 'receipts' && <ReceiptsSheet tables={tables.data ?? []} menu={menu} onClose={() => setSheet(null)} />}
      {sheet === 'keys' && (
        <Shortcuts
          onClose={() => setSheet(null)}
          // The classic terminal is a route change like any other: whatever is on the ticket is parked or asked about first.
          onClassic={() => {
            setSheet(null);
            leave(() => navigate('/admin/pos?v=1', { state: { pos: true } }));
          }}
        />
      )}

      {leaving && guard && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4" role="presentation" onClick={() => setLeaving(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Leave this ticket?"
            className="animate-pop w-full max-w-sm rounded-3xl bg-surface p-6 text-ink shadow-deep ring-1 ring-hairline ring-inset"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className={cx(DISPLAY, 'text-[22px]')}>Leave this ticket?</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">{guard.reason}</p>
            <div className="mt-5 grid gap-2.5">
              <button type="button" autoFocus className={cx(BTN_FLAME, 'h-13 w-full')} onClick={() => setLeaving(null)}>
                Stay
              </button>
              <button
                type="button"
                className={cx(BTN_GHOST, 'h-13 w-full')}
                onClick={() => {
                  const go = leaving;
                  setLeaving(null);
                  setGuard(null);
                  // "Leave anyway" is about the thing the dialog named — an unpaid bill, a draft with no shelf. Anything
                  // on the same ticket that *can* be parked still is, or a floor's unsent dishes would go with it.
                  onLeave.current();
                  go();
                }}
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeSwitch({ mode, openCount, onNew, onOrders }: { mode: 'new' | 'orders'; openCount: number; onNew: () => void; onOrders: () => void }) {
  const newRef = useRef<HTMLButtonElement>(null);
  const ordersRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [slide, setSlide] = useState(false);
  useLayoutEffect(() => {
    const el = mode === 'new' ? newRef.current : ordersRef.current;
    if (!el) return;
    setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [mode, openCount]);
  useEffect(() => {
    if (box) setSlide(true);
  }, [box]);
  const label = 'relative z-10 inline-flex h-10 items-center whitespace-nowrap rounded-lg px-4 text-[15px] font-semibold transition-colors duration-300 ease-out-quart active:scale-95';
  return (
    <div className="relative flex items-center gap-2">
      <span
        aria-hidden
        className={cx('pointer-events-none absolute top-0 h-10 rounded-lg', CHIP_ON, slide && 'motion-safe:transition-[left,width] motion-safe:duration-300 motion-safe:ease-out-quart')}
        style={{ left: box?.left ?? 0, width: box?.width ?? 0, opacity: box ? 1 : 0 }}
      />
      <button ref={newRef} type="button" aria-pressed={mode === 'new'} onClick={onNew} className={cx(label, mode === 'new' ? 'text-white' : 'text-ink-2')}>
        New
      </button>
      <button ref={ordersRef} type="button" aria-pressed={mode === 'orders'} onClick={onOrders} className={cx(label, mode === 'orders' ? 'text-white' : 'text-ink-2')}>
        Orders
        {openCount > 0 && <span className="tnum"> · {openCount}</span>}
      </button>
    </div>
  );
}

function HeaderButton({ label, onClick, pressed, lit, badge, children }: { label: string; onClick: () => void; pressed?: boolean; lit?: boolean; badge?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'relative grid size-12 place-items-center rounded-lg ring-1 ring-inset transition-colors',
        lit ? 'bg-flame/15 text-flame-3 ring-flame/40' : 'bg-surface-2 text-ink-2 ring-hairline hover:text-ink',
      )}
    >
      {children}
      {badge !== undefined && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-ink px-1 text-[11px] font-bold text-surface tnum">{badge}</span>}
    </button>
  );
}

/* ── Open tickets, still inside POS ─────────────────────────────────────────── */

function PosOrders() {
  const { menu, orders, applyOrder, reloadOrders } = useDashboard();
  const staff = useStaff();
  const now = useNow(TICK_MS);
  const { pending, run } = useCommand();
  const [payingId, setPayingId] = useState<string | null>(null);
  const flags = useMemo(() => focusMap(orders, now), [orders, now]);
  const orderSheet = useOrderSheet({ orders, flags, now, onApply: applyOrder, onResync: reloadOrders, onTakePayment: (o) => setPayingId(o.id) });
  const openOrders = useMemo(
    () => orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').sort(byUrgencyThenAge(flags)),
    [orders, flags],
  );
  const payingOrder = orders.find((o) => o.id === payingId) ?? null;
  const menuDishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6">
      <h2 className={cx(DISPLAY, 'py-3 text-[19px]')}>
        Open orders <span className="font-mono text-[14px] font-normal text-ink-3 tnum">{openOrders.length}</span>
      </h2>
      {openOrders.length === 0 ? (
        <p className="rounded-xl bg-surface-2/60 px-3.5 py-3 text-[13px] leading-relaxed text-ink-4 ring-1 ring-hairline ring-inset">
          Nothing open. A new sale starts under New.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {openOrders.map((order, i) => (
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
      {payingOrder?.tableId && <TablePaySheet order={payingOrder} onClose={() => setPayingId(null)} onPaid={reloadOrders} />}
      <PaymentSheet
        table={payingOrder && !payingOrder.tableId ? floorBillSubject(payingOrder) : null}
        orders={payingOrder && !payingOrder.tableId ? [payingOrder] : []}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        legalName={menu.restaurant.legalName}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setPayingId(null)}
        onSettle={(changes) => {
          if (!payingOrder || payingOrder.tableId) return Promise.resolve(false);
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

/* ── The board: every table and every counter target on one screen ──────────── */

function ServiceBoard({
  tables,
  floors,
  held,
  loading,
  error,
  onRetry,
  onOpen,
  onParked,
  onExit,
  blocked,
}: {
  tables: DiningTable[];
  floors: Floor[];
  held: HeldTicket[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (t: Target) => void;
  onParked: () => void;
  onExit: () => void;
  blocked: boolean;
}) {
  const { menu, orders } = useDashboard();
  const now = useNow(TICK_MS);
  const currency = menu.restaurant.currency;
  const [find, setFind] = useState('');
  const findRef = useRef<HTMLInputElement>(null);

  const flags = useMemo(() => focusMap(orders, now), [orders, now]);
  /** Where each seated table has got to: how long, how much, how much still coming, and anything overdue. */
  const service = useMemo(() => tableService(tables, orders, flags, now), [tables, orders, flags, now]);

  const needle = find.trim().toLowerCase();
  const shown = needle ? tables.filter((t) => t.name.toLowerCase().includes(needle)) : tables;

  // The keyboard owns this screen: type to narrow, Enter to open, a function key for each counter target.
  useEffect(() => {
    if (blocked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) return;
      const el = document.activeElement;
      // A focused control keeps its own keys. A sheet hands focus back to the button that opened it, and Enter there must
      // press that button, not open a table.
      const loose = el === findRef.current || el === document.body || el === null;
      // macOS gives F1–F8 to the system unless fn is held, so every command key has an Option twin. `code` not `key`,
      // because Option+Q on a Mac arrives as "œ".
      const alt = (code: string, go: () => void) => {
        if (!e.altKey || e.code !== code) return false;
        e.preventDefault();
        go();
        return true;
      };
      const on = (key: string, go: () => void) => {
        if (e.altKey || e.key !== key) return false;
        e.preventDefault();
        go();
        return true;
      };
      const quick = () => onOpen({ kind: 'QUICK' });
      const delivery = () => onOpen({ kind: 'DELIVERY' });
      if (on('F2', quick) || alt('KeyQ', quick)) return;
      const pickup = () => onOpen({ kind: 'PICKUP' });
      if (on('F3', pickup) || alt('KeyP', pickup)) return;
      if (on('F4', delivery) || alt('KeyD', delivery)) return;
      if (on('F8', onParked) || alt('KeyK', onParked)) return;
      if (e.altKey) return;
      if (loose && shown[0] && on('Enter', () => onOpen({ kind: 'TABLE', table: shown[0] }))) return;
      if (on('Escape', () => (find ? setFind('') : onExit()))) return;
      // Typing anywhere is typing at the filter. The character has to be carried over by hand: by the time focus moves,
      // this keydown has already missed the input, and a dropped first letter is how staff learn not to trust the box.
      if (loose && e.key.length === 1 && e.key !== ' ' && el !== findRef.current) {
        e.preventDefault();
        setFind((f) => f + e.key);
        findRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [blocked, shown, find, onOpen, onParked, onExit]);

  if (error && tables.length === 0 && floors.length === 0) {
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Empty emoji="📡" title="Couldn't load the floor" message={error} action={<button type="button" className={BTN_FLAME} onClick={onRetry}>Try again</button>} />
      </div>
    );
  }
  if (loading) return <Loading />;

  // Counted off the tables themselves, not off `service`: a seated table whose orders have not arrived yet is still in use.
  const busyCount = tables.filter((t) => t.currentSessionId).length;

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto overscroll-contain px-4 pb-6 xl:grid-cols-[1fr_450px] xl:overflow-hidden">
      <section aria-label="Tables" className="flex min-h-0 flex-col xl:overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 py-3">
          <h2 className={cx(DISPLAY, 'text-[19px]')}>
            Floor <span className="font-mono text-[14px] font-normal text-ink-3 tnum">{busyCount}/{tables.length} in use</span>
          </h2>
          <label className="ml-auto flex min-w-0 flex-1 items-center gap-2 sm:max-w-xs">
            <span className="sr-only">Find a table</span>
            <input
              ref={findRef}
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Type a table name"
              className="h-10 w-full rounded-lg bg-surface-2 px-3.5 text-[14px] text-ink caret-flame-2 outline-none ring-1 ring-hairline ring-inset selection:bg-flame/25 placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/50"
            />
          </label>
        </div>

        {tables.length === 0 ? (
          <Empty
            emoji="🪑"
            title="No tables yet"
            message="Add tables under Table & spaces, or ring up a counter sale on the right."
            action={<button type="button" className={BTN_FLAME} onClick={() => onOpen({ kind: 'QUICK' })}>Start a quick bill</button>}
          />
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-ink-3">
            No table matches <b className="font-semibold text-ink">“{find.trim()}”</b>.
          </p>
        ) : (
          <ul className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(176px,1fr))] content-start gap-2.5 xl:overflow-y-auto xl:overscroll-contain xl:pb-4">
            {shown.map((t) => {
              const s = service.get(t.id) ?? null;
              const seated = Boolean(t.currentSessionId);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic.select();
                      onOpen({ kind: 'TABLE', table: t });
                    }}
                    className={cx(
                      'flex h-[122px] w-full flex-col justify-between rounded-xl p-3.5 text-left ring-1 ring-inset',
                      'transition-[background-color,scale,box-shadow] duration-150 ease-out-quart active:scale-[0.97]',
                      'outline-none focus-visible:ring-2 focus-visible:ring-flame',
                      s?.urgent === 'critical'
                        ? 'bg-berry/12 ring-berry/45 hover:bg-berry/[0.16]'
                        : s?.urgent === 'warn'
                          ? 'bg-gold/12 ring-gold/45 hover:bg-gold/[0.16]'
                          : seated
                            ? 'bg-flame/10 ring-flame/40 hover:bg-flame/[0.14]'
                            : 'bg-surface-2 ring-hairline hover:bg-surface-3',
                    )}
                  >
                    <span className="flex w-full items-start justify-between gap-2">
                      <span className={cx(DISPLAY, 'min-w-0 truncate text-[21px]')}>{t.name}</span>
                      {s && (
                        <span className="flex shrink-0 items-center gap-1 font-mono text-[12px] text-ink-2 tnum">
                          <Clock size={11} />
                          {s.minutes}m
                        </span>
                      )}
                    </span>
                    {s ? (
                      <span className="grid gap-1 text-[12.5px]">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold">
                          {s.ready > 0 && <span className="text-mint-ink">{s.ready} to serve</span>}
                          {s.coming > 0 && <span className="text-ink-2">{s.coming} coming</span>}
                          {s.ready === 0 && s.coming === 0 && <span className="text-ink-2">All served</span>}
                        </span>
                        <span className="font-mono text-[15px] font-bold text-ink tnum">{formatMoney(s.total, currency)}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2 text-[12.5px] text-ink-3">
                        <span aria-hidden className={cx('size-2 rounded-full', seated ? 'bg-flame' : 'bg-mint')} />
                        {seated ? 'Seated' : 'Free'} · {t.capacity} seats
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Below xl the board stacks: the counter comes first, so ringing a sale never means scrolling past every table. */}
      <section aria-label="Counter" className="order-first flex min-h-0 flex-col xl:order-none xl:overflow-hidden xl:border-l xl:border-hairline xl:pl-4">
        <h2 className={cx(DISPLAY, 'py-3 text-[19px]')}>Counter</h2>
        <div className="grid gap-2.5 sm:grid-cols-3 xl:grid-cols-1">
          <CounterCard
            title="Quick bill"
            detail="Rung up and paid on the spot"
            shortcut="F2"
            icon={<Receipt size={17} />}
            onClick={() => onOpen({ kind: 'QUICK' })}
          />
          <CounterCard
            title="Pick up"
            detail="Collected at the counter — paid then"
            shortcut="F3"
            icon={<Ticket size={17} />}
            onClick={() => onOpen({ kind: 'PICKUP' })}
          />
          <CounterCard
            title="Delivery"
            detail="Needs a customer and an address"
            shortcut="F4"
            icon={<Bike size={17} />}
            onClick={() => onOpen({ kind: 'DELIVERY' })}
          />
        </div>

        <div className="mt-5 flex min-h-0 flex-col">
          <h3 className="flex items-baseline justify-between pb-2 text-[13px] font-semibold text-ink-3">
            <span>Parked tickets</span>
            <Key>F8</Key>
          </h3>
          {held.length === 0 ? (
            <p className="rounded-xl bg-surface-2/60 px-3.5 py-3 text-[13px] leading-relaxed text-ink-4 ring-1 ring-hairline ring-inset">
              Leave a table with dishes you haven't sent and the ticket parks itself here.
            </p>
          ) : (
            <button
              type="button"
              onClick={onParked}
              className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-left ring-1 ring-hairline ring-inset transition-colors hover:bg-surface-3"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-flame/15 text-flame-3">
                <Ticket size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">
                  {held.length} ticket{held.length === 1 ? '' : 's'} waiting
                </span>
                <span className="block truncate text-[12.5px] text-ink-3">{held.map((t) => t.label).join(', ')}</span>
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function CounterCard({ title, detail, shortcut, icon, onClick, disabled }: { title: string; detail: string; shortcut: string; icon: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'flex items-center gap-3 rounded-xl bg-surface-2 p-3.5 text-left ring-1 ring-hairline ring-inset',
        'transition-[background-color,scale] duration-150 ease-out-quart active:scale-[0.98] disabled:opacity-40',
        'outline-none focus-visible:ring-2 focus-visible:ring-flame enabled:hover:bg-surface-3',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-flame/12 text-flame-3">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        <span className="block truncate text-[12.5px] text-ink-3">{detail}</span>
      </span>
      <Key>{shortcut}</Key>
    </button>
  );
}

/* ── The terminal: dishes on the left, the ticket on the right ──────────────── */

function Terminal({
  target,
  tables,
  floors,
  onTarget,
  onBack,
  onChanged,
  onGuard,
  onLeave,
  onPark,
  recall,
  onRecalled,
  blocked,
}: {
  target: Target;
  tables: DiningTable[];
  floors: Floor[];
  onTarget: (t: Target) => void;
  onBack: () => void;
  onChanged: () => void;
  onGuard: (guard: Guard | null) => void;
  /** What the screen must run before it unmounts this terminal, whichever way out was taken. */
  onLeave: RefObject<() => void>;
  onPark: (ticket: Omit<HeldTicket, 'id' | 'at'>) => void;
  /** A parked ticket for this terminal: its dishes go back on the ticket, then it is released. */
  recall: HeldTicket | null;
  onRecalled: (id: string) => void;
  /** A sheet or dialog is up: the keyboard belongs to it, not to us. */
  blocked: boolean;
}) {
  const staff = useStaff();
  const push = useToast();
  const { menu, orders, applyOrder, reloadOrders } = useDashboard();
  const { pending, busy, run } = useCommand();
  const ticket = useTicketDraft(menu);
  const currency = menu.restaurant.currency;
  const isTable = target.kind === 'TABLE';
  const isDelivery = target.kind === 'DELIVERY';
  const isPickup = target.kind === 'PICKUP';
  const tableId = target.kind === 'TABLE' ? target.table.id : null;
  const session = target.kind === 'TABLE' ? target.table.currentSessionId : null;

  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  /** The quantity typed before a dish is chosen: the till habit of "three, coke". */
  const [multiplier, setMultiplier] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  /** The quantity typed before a dish that turned out to have options: it becomes the dialog's starting quantity. */
  const pendingQty = useRef(1);
  const { categories, matches } = usePosMenu(menu, query, categoryId);

  // One per order as typed: a double tap or a retry after a dropped connection lands as the same order. It is renewed once
  // an order is in, because the server answers a key it has seen with the order it made, whatever is being sent now.
  const idempotency = useRef({ payload: '', key: '' });
  const [spot, setSpot] = useState('');
  const [guest, setGuest] = useState<Guest | null>(null);
  const [address, setAddress] = useState('');
  const deliveryReady = isPickup ? guest !== null : !isDelivery || (guest !== null && address.trim() !== '');
  /** Floor, quick and pick-up are each billed on their own; a table settles as a whole. A delivery is settled after its courier run. */
  const billedAlone = target.kind === 'FLOOR' || target.kind === 'QUICK' || target.kind === 'PICKUP';
  /** The shelf only holds tickets that have somewhere to go back to, so a delivery or a counter sale cannot park. */
  const canPark = target.kind === 'TABLE' || target.kind === 'FLOOR';
  /** Orders placed from this screen. The live queue catches up a moment later; until then these are what is on the ticket. */
  const [placed, setPlaced] = useState<Order[]>([]);
  /** Counter orders settled from this screen: a paid ticket can leave the queue, so its own copy would otherwise read as unpaid. */
  const [paidIds, setPaidIds] = useState<string[]>([]);
  /** The order whose payment sheet is open. Held here, not derived, so the sheet stays through its own "paid" screen. */
  const [paying, setPaying] = useState<Order | null>(null);
  /** The QR the customer screen should be showing, or null while they are just watching the bill. */
  const [payQr, setPayQr] = useState<CustomerPayQr | null>(null);
  const menuDishes = useMemo(() => menu.dishes.filter((d) => !d.isArchived && d.isAvailable), [menu.dishes]);

  // A visit that has ended takes its orders off this table's ticket.
  const lastSession = useRef({ tableId, session });
  useEffect(() => {
    const last = lastSession.current;
    if (last.tableId === tableId && last.session && !session) setPlaced([]);
    lastSession.current = { tableId, session };
  }, [tableId, session]);

  const sent = useMemo(() => {
    const live = new Map(orders.map((o) => [o.id, o]));
    const mine = target.kind === 'TABLE' && session ? orders.filter((o) => o.sessionId === session) : [];
    // A first order seats a free table, and the table's own record lags the order by a moment.
    const fromHere = placed.filter((o) =>
      target.kind === 'TABLE'
        ? o.tableId === target.table.id && (!session || o.sessionId === session)
        : target.kind === 'FLOOR'
          ? o.floorName !== null
          : target.kind === 'PICKUP'
            ? o.orderType === 'PICKUP'
            : target.kind === 'QUICK' && o.tableId === null && o.floorName === null && o.orderType === 'DINE_IN',
    );
    const all = new Map<string, Order>();
    for (const o of [...fromHere.map((p) => live.get(p.id) ?? p), ...mine]) all.set(o.id, o);
    return [...all.values()].filter((o) => o.status !== 'CANCELLED').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, placed, target, session]);
  const isPaid = (o: Order) => paidIds.includes(o.id) || Boolean(o.paidAt);
  const owing = isTable ? sent : sent.filter((o) => !isPaid(o));
  /** A table's visit belongs to whoever the first order was for, so once something is sent there is nobody to choose. */
  const guestShown = !(isTable && sent.length > 0);
  /** What is being paid decides the sheet, not the target: a quick bill must keep its own sheet if the target changes under a send. */
  const payAlone = paying ? paying.tableId === null : billedAlone;
  const sentTotal = sent.reduce((n, o) => n + o.total, 0);
  /**
   * What is still owed on this terminal. A table settles as a whole, so everything sent counts; a counter or floor
   * ticket is billed one order at a time, and a bill already paid must not be added into the next customer's total.
   */
  const dueTotal = (isTable ? sent : owing).reduce((n, o) => n + o.total, 0) + ticket.total;
  const unsent = ticket.draft.reduce((n, l) => n + l.qty, 0);

  // What the customer screen shows: the dishes being added and what is owed. Guest name and phone stay here.
  usePublishCustomerDisplay({
    restaurant: menu.restaurant.name,
    label: target.kind === 'TABLE' ? target.table.name : target.kind === 'FLOOR' ? target.floor.name : target.kind === 'DELIVERY' ? 'Delivery' : target.kind === 'PICKUP' ? 'Pick up' : 'Quick bill',
    currency,
    lines: ticket.draft.map((l) => ({ key: l.key, name: l.dish.name, detail: ticket.describe(l), qty: l.qty, amount: ticket.priceOf(l) * l.qty })),
    total: dueTotal,
    payQr: payQr?.url ?? null,
    payAmount: payQr?.amount ?? null,
  });

  /** Taking the draft off the screen and onto the shelf. Used by the Park button and by walking away. */
  const park = (quiet = false) => {
    if (ticket.draft.length === 0 || busy || !canPark) return false;
    onPark({
      kind: target.kind as 'TABLE' | 'FLOOR',
      targetId: target.kind === 'TABLE' ? target.table.id : target.kind === 'FLOOR' ? target.floor.id : '',
      label: target.kind === 'TABLE' ? target.table.name : target.kind === 'FLOOR' ? target.floor.name : '',
      spot: spot.trim(),
      lines: ticket.draft.map((l) => ({ dishId: l.dish.id, variantId: l.variantId, addOnIds: l.addOnIds, qty: l.qty })),
    });
    idempotency.current = { payload: '', key: '' };
    ticket.setDraft([]);
    setSpot('');
    setGuest(null);
    setAddress('');
    haptic.select();
    if (!quiet) push('Ticket parked', <Check size={16} />);
    return true;
  };

  // Tell the screen when walking away would cost something. A table or floor ticket parks itself on the way out, so the only
  // things worth a dialog are the two kinds with no shelf to park on, and money nobody has taken.
  // A pick-up is paid when it is collected, so leaving with one still owing is expected, not a slip.
  const unpaid = !isTable && !isPickup ? owing.map((o) => o.reference).join(', ') : '';
  const parkOnLeave = useRef<() => boolean>(() => false);
  parkOnLeave.current = () => park(true);
  useEffect(() => {
    if (busy) onGuard({ busy: true, reason: 'An order is being sent.' });
    else if (unpaid) onGuard({ busy: false, reason: `${unpaid} hasn't been paid. Once it's served you can take payment from Orders.` });
    else if (unsent > 0 && !canPark) onGuard({ busy: false, reason: `${unsent} item${unsent === 1 ? '' : 's'} on the ticket haven't been sent, and a ${isDelivery ? 'delivery' : isPickup ? 'pick-up' : 'counter sale'} can't be parked — they will be lost.` });
    else onGuard(null);
    return () => onGuard(null);
  }, [busy, unsent, unpaid, canPark, isDelivery, onGuard]);

  // A table or floor ticket is never thrown away by leaving: the shelf takes it, and the board says where it went. The
  // screen runs this on every way out — the header's back button, Esc, and leaving POS altogether — not just this one.
  useEffect(() => {
    onLeave.current = () => {
      if (parkOnLeave.current()) push('Ticket parked — find it under Parked tickets', <Check size={16} />);
    };
    return () => {
      onLeave.current = () => {};
    };
  }, [onLeave, push]);
  const back = () => {
    if (busy) return;
    onBack();
  };

  const place = () => {
    if (ticket.draft.length === 0 || busy || !deliveryReady) return;
    const input: StaffOrderInput = {
      type: target.kind,
      tableId: target.kind === 'TABLE' ? target.table.id : undefined,
      floorId: target.kind === 'FLOOR' ? target.floor.id : undefined,
      customer: guest && guestShown ? { phone: guest.phone, name: guest.name } : undefined,
      deliveryAddress: isDelivery ? address.trim() : undefined,
      lines: ticket.draft.map((l) => ({ dishId: l.dish.id, quantity: l.qty, variantId: l.variantId ?? undefined, addOnIds: l.addOnIds })),
      floorVisitorName: target.kind === 'FLOOR' && spot.trim() ? spot.trim() : undefined,
    };
    const payload = JSON.stringify(input);
    if (idempotency.current.payload !== payload) idempotency.current = { payload, key: randomId() };
    const { key } = idempotency.current;
    let made: Order | null = null;
    void run('place', async () => {
      made = await createStaffOrder(input, key);
    }).then((ok) => {
      const order = made as Order | null;
      if (!ok || !order) return;
      idempotency.current = { payload: '', key: '' };
      applyOrder(order);
      reloadOrders();
      // A delivery leaves the counter for the courier run: assign, deliver, then settle. It is not paid here.
      if (!isDelivery) setPlaced((p) => [...p, order]);
      // A quick bill is paid as it is rung up: straight to the payment sheet.
      if (target.kind === 'QUICK') setPaying(order);
      ticket.setDraft([]);
      setSpot('');
      setGuest(null);
      setAddress('');
      setQuery('');
      setMultiplier(null);
      onChanged();
      haptic.success();
      push(`${order.reference} placed · ${order.status === 'PENDING' ? 'waiting on the pass' : order.status === 'UNPAID' ? 'awaiting payment' : 'sent to the kitchen'}`, <Check size={16} />);
    });
  };

  // Strict mode runs effects twice on mount; the id guard keeps a recall from adding its dishes twice.
  const recalled = useRef<string | null>(null);
  useEffect(() => {
    if (!recall || recalled.current === recall.id) return;
    recalled.current = recall.id;
    // Each line must still be orderable as parked: a dish that is off or 86'd, or a size or extra that no longer exists,
    // cannot go on a ticket. What cannot come back is parked again rather than dropped, so nothing disappears without a word.
    const left: HeldTicket['lines'] = [];
    for (const line of recall.lines) {
      const dish = menu.dishes.find((d) => d.id === line.dishId && !d.isArchived && d.isAvailable);
      const options = dish ? orderableOptions(dish, menu) : null;
      const fits =
        dish &&
        options &&
        (line.variantId === null || options.variants.some((v) => v.id === line.variantId)) &&
        line.addOnIds.every((id) => options.addOns.some((a) => a.id === id));
      if (fits) ticket.add(dish, { variantId: line.variantId, addOnIds: line.addOnIds, quantity: line.qty });
      else left.push(line);
    }
    if (recall.spot) setSpot(recall.spot);
    if (left.length > 0) {
      onPark({ kind: recall.kind, targetId: recall.targetId, label: recall.label, spot: '', lines: left });
      const names = left.map((l) => menu.dishes.find((d) => d.id === l.dishId)?.name ?? 'A removed dish');
      push(`${names.join(', ')} can't be ordered right now. ${left.length === 1 ? 'It stays' : 'They stay'} parked.`, '⚠️');
    }
    onRecalled(recall.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recall]);

  const pickDish = (dish: Dish) => {
    if (busy) return;
    playTick('add');
    const { variants, addOns } = orderableOptions(dish, menu);
    // A dish with sizes or extras has a question to answer first. The typed quantity is not thrown away for it: the
    // options form opens already set to it, so "3, large chips" reads the same whether or not chips have sizes.
    if (variants.length > 0 || addOns.length > 0) {
      pendingQty.current = multiplier ?? 1;
      ticket.setConfiguring(dish);
    } else {
      ticket.add(dish, { quantity: multiplier ?? 1 });
      // The search survives the dish, selected rather than emptied. The list stays filtered, so the rest of the order
      // from the same search is an arrow and an Enter away — "momo" gives up both the chicken and the veg — while
      // typing anything at all replaces the selection, so moving on costs exactly what an empty box would have.
      // Only when it already had focus: a tile tapped with a finger must not throw a keyboard up over the menu.
      if (document.activeElement === searchRef.current) searchRef.current?.select();
    }
    setMultiplier(null);
  };
  const lessOf = (dish: Dish) => {
    const line = [...ticket.draft].reverse().find((l) => l.dish.id === dish.id);
    if (!line || busy) return;
    playTick('remove');
    ticket.changeQty(line.key, -1);
  };
  const changeQty = (key: string, by: number) => {
    playTick(by > 0 ? 'add' : 'remove');
    ticket.changeQty(key, by);
  };

  const reprint = (order: Order) => void run(`reprint-${order.id}`, () => reprintKitchenTickets(order.id), `${order.reference} ticket sent to the printer again`);

  const payNext = isTable ? sent[sent.length - 1] : owing[0];
  // Anyone who can place orders can take payment. The server holds a bill that is not exactly what was ordered, or carries a
  // discount, until a manager approves it with their PIN, so a cashier cannot undercharge.
  const canPay = Boolean(payNext);
  const justFinished = !isTable && sent.length > 0 && owing.length === 0;
  const canSend = !busy && ticket.draft.length > 0 && deliveryReady;
  const reset = () => {
    idempotency.current = { payload: '', key: '' };
    setPlaced([]);
    setPaidIds([]);
    setPaying(null);
    ticket.setDraft([]);
    setSpot('');
    setGuest(null);
    setAddress('');
  };

  // The keyboard layer. One listener, because the terminal is the only thing on screen that owns keys, and because the
  // search box, the cursor and the multiplier have to agree about what Enter means.
  useEffect(() => {
    if (blocked || ticket.configuring || paying) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el?.isContentEditable === true;
      const inSearch = el === searchRef.current;
      // A guest's name, a delivery address or a spot is ordinary typing: the shortcuts stay out of it.
      if (typing && !inSearch) {
        if (e.key === 'Escape') el?.blur();
        return;
      }
      // `inert` on the ticket is DOM-deep only, and a window listener walks straight past it. While a send is in flight
      // nothing here may touch the draft: F8 during a send would put the same lines on the shelf *and* in the kitchen,
      // and recalling that ticket would send them a second time.
      if (busy) return;
      // A focused control keeps its own keys. A sheet hands focus back to the button that opened it, so after closing the
      // payment sheet Enter must press "Pay the bill" again, not ring up whatever the cursor is sitting on.
      const loose = inSearch || el === document.body || el === null;

      // The command keys are reachable two ways. macOS gives F1–F8 to the system unless fn is held, so each has an
      // Option twin, matched on `code` because Option+P on a Mac arrives as "π".
      const alt = (code: string, go: () => void) => {
        if (!e.altKey || e.code !== code) return false;
        e.preventDefault();
        go();
        return true;
      };
      const command = (key: string, go: () => void) => {
        if (e.altKey || e.key !== key) return false;
        e.preventDefault();
        go();
        return true;
      };
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'Enter' && canSend) (e.preventDefault(), place());
        return;
      }
      const send = () => canSend && place();
      const pay = () => canPay && !busy && setPaying(payNext);
      if (command('F2', send) || alt('KeyS', send)) return;
      if (command('F4', pay) || alt('KeyP', pay)) return;
      if (command('F8', () => void park()) || alt('KeyK', () => void park())) return;
      if (e.altKey) return;
      if (command('[', () => stepCategory(-1))) return;
      if (command(']', () => stepCategory(1))) return;
      if (!loose) return;
      if (command('ArrowRight', () => setCursor((c) => Math.min(matches.length - 1, c + 1)))) return;
      if (command('ArrowLeft', () => setCursor((c) => Math.max(0, c - 1)))) return;
      if (command('ArrowDown', () => setCursor((c) => Math.min(matches.length - 1, c + columns())))) return;
      if (command('ArrowUp', () => setCursor((c) => Math.max(0, c - columns())))) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (matches[cursor]) pickDish(matches[cursor]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (multiplier !== null) setMultiplier(null);
        else if (query) setQuery('');
        else back();
        return;
      }
      // A bare number on an empty search box is a quantity, the way every till in the world reads it: 3, then Coke.
      if (query === '' && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        setMultiplier((m) => Math.min(99, (m ?? 0) * 10 + Number(e.key)) || null);
        return;
      }
      if (query === '' && (e.key === 'Backspace' || e.key === '-')) {
        e.preventDefault();
        // Held down, these auto-repeat. Clearing a typed dish name by holding Backspace must not run on past the empty
        // box and take the ticket with it — one line per press, and the press has to end first.
        if (e.repeat) return;
        if (multiplier !== null) setMultiplier(null);
        else if (e.key === '-' && matches[cursor]) lessOf(matches[cursor]);
        else if (ticket.draft.length > 0) changeQty(ticket.draft[ticket.draft.length - 1].key, -ticket.draft[ticket.draft.length - 1].qty);
        return;
      }
      // Anything else printable belongs in the search box, whether or not it had focus. The character is carried over by
      // hand because this keydown has already missed the input that is about to take focus. Space is left alone: it is
      // how a focused button is pressed, and a leading space would only stop the next digit being read as a quantity.
      if (!inSearch && e.key.length === 1 && e.key !== ' ') {
        e.preventDefault();
        setQuery((q) => q + e.key);
        setCategoryId(null);
        setCursor(0);
        searchRef.current?.focus();
      }
    };

    const columns = () => {
      const list = listRef.current;
      if (!list) return 1;
      return Math.max(1, getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length);
    };
    const stepCategory = (by: number) => {
      const ids = [null, ...categories.map((c) => c.id)];
      const at = ids.indexOf(categoryId);
      setCategoryId(ids[(at + by + ids.length) % ids.length]);
      setQuery('');
      setCursor(0);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // A changed filter must not leave the cursor pointing past the end of the list.
  useEffect(() => {
    setCursor((c) => (c < matches.length ? c : 0));
  }, [matches.length]);

  // The laptop at the pass starts ready to type. A tablet does not, or the keyboard covers the menu.
  useEffect(() => {
    if (matchMedia('(pointer: fine)').matches) searchRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <PosGrid
        menu={menu}
        categories={categories}
        matches={matches}
        counts={ticket.counts}
        busy={busy}
        query={query}
        // Searching and browsing a category are two ways of narrowing the same list, and a search deliberately reaches
        // across the whole menu — so one always cancels the other, whichever way round, and the screen never holds a
        // filter it isn't showing. Typing with "Drinks" still lit would otherwise look like the search had missed.
        onQuery={(q) => {
          setQuery(q);
          if (q) setCategoryId(null);
          setCursor(0);
        }}
        categoryId={categoryId}
        onCategory={(id) => {
          setCategoryId(id);
          setQuery('');
          setCursor(0);
        }}
        cursor={cursor}
        multiplier={multiplier}
        onPick={pickDish}
        onLess={lessOf}
        searchRef={searchRef}
        listRef={listRef}
      />

      <aside className="m-3 flex max-h-[52dvh] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline ring-inset lg:m-0 lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-hairline lg:ring-0">
        <div className="grid gap-2 border-b border-hairline p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              disabled={busy}
              aria-label="Back to the board"
              className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset transition-colors hover:text-ink disabled:opacity-40"
            >
              <ChevronLeft size={17} />
            </button>
            {target.kind === 'TABLE' ? (
              <Select
                value={target.table.id}
                onChange={(id) => {
                  const next = tables.find((t) => t.id === id);
                  if (next) onTarget({ kind: 'TABLE', table: next });
                }}
                options={tables.map((t) => ({ value: t.id, label: t.name + (t.currentSessionId ? ' · in use' : '') }))}
                className="min-w-0 flex-1"
                aria-label="Table"
              />
            ) : target.kind === 'FLOOR' && floors.length > 1 ? (
              <Select
                value={target.floor.id}
                onChange={(id) => {
                  const next = floors.find((f) => f.id === id);
                  if (next) onTarget({ kind: 'FLOOR', floor: next });
                }}
                options={floors.map((f) => ({ value: f.id, label: f.name }))}
                className="min-w-0 flex-1"
                aria-label="Floor"
              />
            ) : (
              <span className={cx(DISPLAY, 'min-w-0 flex-1 truncate text-[19px]')}>{target.kind === 'DELIVERY' ? 'Delivery' : target.kind === 'PICKUP' ? 'Pick up' : target.kind === 'FLOOR' ? target.floor.name : 'Quick bill'}</span>
            )}
          </div>
          {target.kind === 'FLOOR' && (
            <div inert={busy}>
              <TextInput value={spot} onChange={setSpot} maxLength={40} placeholder="Name or number (optional)" />
            </div>
          )}
          {isDelivery && (
            <div inert={busy}>
              <TextInput value={address} onChange={setAddress} maxLength={200} placeholder="Delivery address" autoComplete="off" />
            </div>
          )}
          {guestShown && <PosCustomer value={guest} onChange={setGuest} required={isDelivery || isPickup} disabled={busy} />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {sent.length > 0 && (
            <section aria-label="Already sent">
              <h3 className="mb-1 text-[12.5px] font-semibold text-ink-3">Sent</h3>
              {sent.map((o) => (
                <div key={o.id} className="border-b border-dashed border-hairline py-2.5 last:border-b-0">
                  <p className="flex items-center justify-between gap-3 text-[12.5px] text-ink-3">
                    <span>
                      {o.reference} · {isPaid(o) ? 'Paid' : STATUS_LABEL[o.status]}
                    </span>
                    <span className="flex items-center gap-3">
                      {(o.status === 'ACCEPTED' || o.status === 'PREPARING') && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => reprint(o)}
                          className="font-semibold text-ink-3 underline decoration-hairline-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-flame disabled:opacity-50"
                        >
                          {pending === `reprint-${o.id}` ? 'Sending…' : 'Reprint'}
                        </button>
                      )}
                      <span className="font-mono tnum">{formatMoney(o.total, currency)}</span>
                    </span>
                  </p>
                  <ul className="mt-1">
                    {o.items
                      .filter((i) => i.status !== 'CANCELLED')
                      .map((i) => (
                        <li key={i.id} className="flex items-baseline justify-between gap-3 py-0.5 text-[14.5px]">
                          <span className="min-w-0">
                            <span className="font-mono font-semibold tnum">{i.quantity}×</span> {i.dishNameSnapshot}
                            {i.variantNameSnapshot && <span className="text-ink-3"> · {i.variantNameSnapshot}</span>}
                          </span>
                          <span className="shrink-0 text-[11.5px] text-ink-4">{ITEM_STATUS_LABEL[i.status]}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {/* Frozen while a send is in flight: an edit made now would be wiped when the send lands. */}
          <section aria-label="New items" className={cx(sent.length > 0 && 'mt-4')} inert={busy}>
            <h3 className="mb-1 flex items-center justify-between text-[12.5px] font-semibold text-ink-3">
              <span>{sent.length > 0 ? 'Adding' : 'Ticket'}</span>
              {ticket.draft.length > 0 && (
                <button type="button" onClick={() => ticket.setDraft([])} className="text-[12.5px] font-semibold text-ink-3 underline decoration-hairline-strong underline-offset-4 hover:text-ink">
                  Clear
                </button>
              )}
            </h3>
            {ticket.draft.length === 0 ? (
              <p className="py-8 text-center text-[13.5px] leading-relaxed text-ink-3">
                Type a dish and press <Key>Enter</Key>.
                <br />A bare number first is a quantity.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {ticket.draft.map((line) => {
                  const detail = ticket.describe(line);
                  return (
                    <li key={line.key} className="flex animate-rise items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{line.dish.name}</span>
                        {detail && <span className="block truncate text-[12.5px] text-ink-3">{detail}</span>}
                      </span>
                      <span className="shrink-0 font-mono text-[13px] text-ink-3 tnum">{formatMoney(ticket.priceOf(line) * line.qty, currency)}</span>
                      <QuantityStepper value={line.qty} onChange={(n) => changeQty(line.key, n - line.qty)} size="sm" min={0} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-2.5 border-t border-hairline bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {/* One number, and it is what this customer still owes. v1 printed "Total / QTY: 3" here, which is neither. */}
          <dl className="grid gap-1">
            <div className="flex items-baseline justify-between">
              <dt className={cx(DISPLAY, 'text-[18px]')}>{isTable && sent.length > 0 ? 'Table total' : 'Ticket'}</dt>
              <dd className="font-mono text-[26px] leading-none font-bold tnum">{formatMoney(dueTotal, currency)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-[12.5px] text-ink-3">
              <dt>
                {sent.length > 0 && <span>Sent {formatMoney(sentTotal, currency)}</span>}
                {sent.length > 0 && unsent > 0 && <span aria-hidden> · </span>}
                {unsent > 0 && (
                  <span>
                    Adding {unsent} item{unsent === 1 ? '' : 's'}, {formatMoney(ticket.total, currency)}
                  </span>
                )}
                {sent.length === 0 && unsent === 0 && <span>Nothing on it yet</span>}
              </dt>
              <dd>{unsent > 0 && 'estimate'}</dd>
            </div>
          </dl>

          {(isDelivery || isPickup) && !deliveryReady && (
            <p role="status" className="rounded-lg bg-flame/10 px-3 py-2 text-[12.5px] text-flame-3 ring-1 ring-flame/30 ring-inset">
              {isPickup ? 'A pick-up needs a customer to call when it is ready.' : 'A delivery needs a customer and an address before it can go.'}
            </p>
          )}

          <div className="flex gap-2.5">
            <button type="button" disabled={!canSend} onClick={place} className={cx(BTN_FLAME, 'h-14 flex-1 gap-2 text-[16.5px]')}>
              {pending === 'place' ? 'Sending…' : isDelivery ? 'Place delivery' : target.kind === 'QUICK' ? 'Send & bill' : 'Send to kitchen'}
              {canSend && <Key>F2</Key>}
            </button>
            {canPark && (
              <button type="button" disabled={busy || ticket.draft.length === 0} onClick={() => void park()} className={cx(BTN_GHOST, 'h-14 gap-2 px-4 text-[15px]')}>
                Park <Key>F8</Key>
              </button>
            )}
          </div>
          {canPay && (
            <button type="button" disabled={busy} onClick={() => setPaying(payNext)} className={cx(BTN_GHOST, 'h-13 w-full gap-2')}>
              {isTable ? 'Pay the bill' : `Pay ${payNext!.reference} · ${formatMoney(payNext!.total, currency)}`}
              <Key>F4</Key>
            </button>
          )}
          {justFinished && (
            <button type="button" onClick={reset} className={cx(BTN_FLAME, 'h-13 w-full')}>
              New sale
            </button>
          )}
        </div>
      </aside>

      {ticket.configuring && (
        <DishOptionsDialog
          dish={ticket.configuring}
          menu={menu}
          startQuantity={pendingQty.current}
          onClose={() => ticket.setConfiguring(null)}
          onAdd={(sel) => {
            ticket.add(ticket.configuring!, sel);
            ticket.setConfiguring(null);
            // Back to where the dish was chosen from, search and all, as a dish with no options leaves it.
            searchRef.current?.select();
          }}
        />
      )}

      {paying && !payAlone && (
        <TablePaySheet
          wholeVisit
          order={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            reloadOrders();
            onChanged();
          }}
          onCustomerQr={setPayQr}
        />
      )}

      {payAlone && (
        <PaymentSheet
          table={paying ? floorBillSubject(paying) : null}
          orders={paying ? [paying] : []}
          dishes={menuDishes}
          restaurantName={menu.restaurant.name}
          legalName={menu.restaurant.legalName}
          vatPanNumber={menu.restaurant.vatPanNumber}
          serviceChargeRate={menu.restaurant.serviceChargeRate}
          taxRate={menu.restaurant.taxRate}
          pending={pending}
          onClose={() => setPaying(null)}
          onSettle={(c) => {
            const order = paying;
            if (!order) return Promise.resolve(false);
            return run(order.id, () => completeOrderPayment(staff, order, c.items, c.method, c.discount, c.redeemPoints, c.customerId, c.credit), `${order.reference} paid up`).then((ok) => {
              if (ok) {
                setPaidIds((ids) => [...ids, order.id]);
                reloadOrders();
              }
              return ok;
            });
          }}
          onEndSession={() => setPaying(null)}
          onShowQr={() => setPaying(null)}
          onCustomerQr={setPayQr}
        />
      )}
    </div>
  );
}

/* ── The key map, written down ──────────────────────────────────────────────── */

const KEYS: { group: string; rows: [string[], string][] }[] = [
  {
    group: 'The board',
    rows: [
      [['type'], 'narrow the tables'],
      [['Enter'], 'open the first table'],
      [['F2', '⌥Q'], 'quick bill'],
      [['F3', '⌥P'], 'pick up'],
      [['F4', '⌥D'], 'delivery'],
      [['F8', '⌥K'], 'parked tickets'],
      [['Esc'], 'leave POS mode'],
    ],
  },
  {
    group: 'The terminal',
    rows: [
      [['type'], 'search the menu'],
      [['0–9'], 'quantity for the next dish'],
      [['Enter'], 'ring up the highlighted dish'],
      [['←', '→', '↑', '↓'], 'move the highlight'],
      [['[', ']'], 'previous / next category'],
      [['-'], 'one fewer of the highlighted dish'],
      [['Backspace'], 'drop the last line'],
      [['F2', '⌥S', '⌘⏎'], 'send to the kitchen'],
      [['F4', '⌥P'], 'take payment'],
      [['F8', '⌥K'], 'park the ticket'],
      [['Esc'], 'clear, then go back'],
    ],
  },
];

function Shortcuts({ onClose, onClassic }: { onClose: () => void; onClassic: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'F1') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/55 p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="animate-pop grid w-full max-w-2xl gap-6 rounded-3xl bg-surface p-6 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:grid-cols-2 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        {KEYS.map((section) => (
          <section key={section.group}>
            <h2 className={cx(DISPLAY, 'mb-3 text-[20px]')}>{section.group}</h2>
            <dl className="grid gap-1.5">
              {section.rows.map(([keys, what]) => (
                <div key={what} className="flex items-baseline justify-between gap-4">
                  <dt className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <Key key={k}>{k}</Key>
                    ))}
                  </dt>
                  <dd className="min-w-0 text-right text-[13.5px] text-ink-2">{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <div className="grid gap-2 text-[12.5px] text-ink-4 sm:col-span-2">
          <p>
            <Key>F1</Key> or <Key>⌥H</Key> opens and closes this. On a Mac the function keys belong to the system unless
            you hold <Key>fn</Key>, so each one here has an <Key>⌥</Key> twin that always works. Every button on screen
            still works with a mouse or a finger.
          </p>
          <button type="button" onClick={onClassic} className="justify-self-start font-semibold text-ink-3 underline decoration-hairline-strong underline-offset-4 hover:text-ink">
            Use the classic POS
          </button>
        </div>
      </div>
    </div>
  );
}
