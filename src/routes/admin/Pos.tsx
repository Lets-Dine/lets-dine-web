import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { StaffOrderInput } from '../../api/live-admin';
import { STAFF_ORDERS_ENABLED, completeOrderPayment, createStaffOrder, listFloors, listTables, reprintKitchenTickets } from '../../api/staff';
import { randomId } from '../../api/store';
import { formatMoney } from '../../domain/money';
import { ITEM_STATUS_LABEL, STATUS_LABEL, floorBillSubject } from '../../domain/orderStatus';
import type { DiningTable, Floor, Order } from '../../domain/types';
import { exitFullscreenIfTaken, isFullscreen, toggleFullscreen } from '../../platform/fullscreen';
import { haptic } from '../../platform/haptics';
import { isSoundOn, playTick, setSoundOn } from '../../platform/sound';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { useHeldTickets } from '../../state/useHeldTickets';
import type { HeldTicket } from '../../state/useHeldTickets';
import { Avatar } from '../../components/admin/Avatar';
import { Tip } from '../../components/admin/Tip';
import { DishOptionsDialog, orderableOptions } from '../../components/admin/DishOptionsDialog';
import { DishMenu, useTicketDraft } from '../../components/admin/DishTilePicker';
import { Empty, Loading, Select, TextInput, useCommand } from '../../components/admin/kit';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { HeldSheet, ReceiptsSheet } from '../../components/admin/PosSheets';
import { TablePaySheet } from '../../components/admin/TablePaySheet';
import { PosCustomer } from '../../components/admin/PosCustomer';
import type { Guest } from '../../components/admin/PosCustomer';
import { QuantityStepper } from '../../components/Bits';
import { BrandName } from '../../components/BrandName';
import { Bell, Check, ChevronLeft, Maximize, Minimize, Volume, VolumeOff } from '../../components/icons';
import { BTN_FLAME, BTN_GHOST, CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

type Mode = 'tables' | 'new';
type Kind = 'TABLE' | 'FLOOR' | 'DELIVERY' | 'QUICK';
type Target = { kind: 'TABLE'; table: DiningTable } | { kind: 'FLOOR'; floor: Floor } | { kind: 'DELIVERY' }
  /** A sale at the till with no table, floor or delivery: billed on its own, like a floor order. */
  | { kind: 'QUICK' }
  /** The New tab with no table (or floor) to put the order on: dishes can be browsed and chosen, but not sent. */
  | { kind: 'NONE'; missing: 'TABLE' | 'FLOOR' };
/** What stops someone walking away from a terminal: a send in flight, unsent dishes, or a counter sale nobody has paid. */
interface Guard {
  busy: boolean;
  reason: string;
}

/**
 * POS mode: a full-screen, touch-first way to take orders and money during service. Tables is for the floor
 * (open a table, add to its visit, pay it); Quick sale is for the counter (a walk-in on a floor, paid on the spot).
 * Both are the same terminal — menu on the left, the ticket on the right — over the order, table and payment
 * calls the dashboard already uses.
 */
export function Pos() {
  // Reached from the Orders button (`?enter=1`, its own tab) or an in-app link that carries state. A reload keeps either.
  // Anything else, a typed address or an old bookmark, goes back to Orders.
  const location = useLocation();
  const entered = (location.state as { pos?: boolean } | null)?.pos === true || new URLSearchParams(location.search).get('enter') === '1';
  return entered ? <PosScreen /> : <Navigate to="/admin/orders" replace />;
}

function PosScreen() {
  const { menu, orders, tablesTick } = useDashboard();
  const staff = useStaff();
  const { allows } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('tables');
  const [open, setOpen] = useState<string | null>(null);
  const [floorId, setFloorId] = useState<string | null>(null);
  /** The New tab: what the order being built is for. */
  const [newKind, setNewKind] = useState<Kind>('TABLE');
  const [newTableId, setNewTableId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [guard, setGuard] = useState<Guard | null>(null);
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [sheet, setSheet] = useState<'held' | 'receipts' | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [sound, setSound] = useState(isSoundOn);
  const push = useToast();
  const heldStore = useHeldTickets(staff.branchId ?? 'main');
  /** A held ticket on its way back: carried to the terminal it belongs to, which takes the dishes and releases it. */
  const [recall, setRecall] = useState<HeldTicket | null>(null);

  const tables = useAsync(() => listTables(staff), [staff, tablesTick]);
  const floors = useAsync(() => listFloors(staff), [staff]);
  const activeFloors = useMemo(() => (floors.data ?? []).filter((f) => f.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [floors.data]);
  const floor = activeFloors.find((f) => f.id === floorId) ?? activeFloors[0] ?? null;
  const table = (tables.data ?? []).find((t) => t.id === open) ?? null;
  const activeTables = useMemo(() => (tables.data ?? []).filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [tables.data]);
  // A restaurant with no tables or floors should land on what works, not on a dead end.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current || !tables.data || !floors.data) return;
    settled.current = true;
    setNewKind((k) => (k !== 'TABLE' || activeTables.length > 0 ? k : activeFloors.length > 0 ? 'FLOOR' : 'QUICK'));
  }, [tables.data, floors.data, activeTables.length, activeFloors.length]);
  const newTable = activeTables.find((t) => t.id === newTableId) ?? activeTables[0] ?? null;
  const waiting = orders.filter((o) => o.status === 'PENDING').length;

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

  /** Anything that unmounts the terminal goes through here, so a ticket is never dropped by a stray tap. A send in flight cannot be left. */
  const leave = (go: () => void) => {
    if (guard?.busy) return;
    if (guard) setLeaving(() => go);
    else go();
  };

  const switchMode = (value: Mode) => (value === mode && !open ? undefined : leave(() => (setMode(value), setOpen(null))));

  const recallHeld = (ticket: HeldTicket) => {
    // A table or floor taken out of service since the ticket was held has nowhere to put it: say so, and keep it held.
    const there = ticket.kind === 'TABLE' ? (tables.data ?? []).some((t) => t.id === ticket.targetId && t.isActive) : activeFloors.some((f) => f.id === ticket.targetId);
    if (!there) {
      push(`${ticket.label} isn't available any more. The ticket stays held.`, '⚠️');
      return;
    }
    const open_ = ticket.kind === 'TABLE' ? mode === 'tables' && open === ticket.targetId : mode === 'new' && newKind === 'FLOOR' && floor?.id === ticket.targetId;
    const go = () => {
      if (ticket.kind === 'TABLE') {
        setMode('tables');
        setOpen(ticket.targetId);
      } else {
        setMode('new');
        setOpen(null);
        setNewKind('FLOOR');
        setFloorId(ticket.targetId);
      }
      setRecall(ticket);
    };
    // Coming back to the terminal that is already open leaves nothing behind, so there is nothing to confirm.
    if (open_) go();
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 pt-[calc(10px+var(--safe-t))]">
        <span className={cx(DISPLAY, 'truncate text-[22px]')}><BrandName /> <span className="text-flame-3">POS</span></span>

        <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="tablist" aria-label="Service style">
          {(
            [
              ['new', 'New'],
              ['orders', 'Orders'],
              ['tables', 'Table'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={value !== 'orders' && mode === value}
              onClick={() => (value === 'orders' ? leave(() => navigate('/admin/orders')) : switchMode(value))}
              className={cx('h-11 rounded-lg px-5 text-[15px] font-semibold transition-colors', value !== 'orders' && mode === value ? 'bg-flame text-white' : 'text-ink-2 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto flex items-center gap-2">
          <Tip label="Full screen" tip={fullscreen ? 'On · tap to exit' : 'Off · tap to enter'} className="cursor-pointer">
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-pressed={fullscreen}
              aria-label="Full screen"
              className={cx('grid size-11 place-items-center rounded-lg ring-1 ring-inset', fullscreen ? 'bg-flame text-white ring-white/15' : 'bg-surface-2 text-ink-2 ring-hairline')}
            >
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </Tip>
          <Tip label="New order sound" tip={sound ? 'On · tap to mute' : 'Muted · tap to turn on'} className="cursor-pointer">
            <button
              type="button"
              onClick={() => {
                setSoundOn(!sound);
                setSound(!sound);
              }}
              aria-pressed={sound}
              aria-label="New order sound"
              className={cx('grid size-11 place-items-center rounded-lg ring-1 ring-inset', sound ? 'bg-surface-2 text-ink-2 ring-hairline' : 'bg-flame/15 text-flame-3 ring-flame/40')}
            >
              {sound ? <Volume size={18} /> : <VolumeOff size={18} />}
            </button>
          </Tip>
          <span
            role="status"
            aria-label={`${waiting} waiting on the pass`}
            className="relative grid size-11 place-items-center rounded-lg bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset"
          >
            <Bell size={18} />
            {waiting > 0 && <span className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full bg-flame px-1 text-[11px] font-bold text-white tnum">{waiting}</span>}
          </span>
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-ink px-4 text-[15px] font-semibold text-surface"
          >
            More <Avatar name={staff.name} src={staff.avatarUrl} className="size-6 text-[11px]" />
          </button>

          {moreOpen && (
            <>
              <div className="fixed inset-0 z-40" role="presentation" onClick={() => setMoreOpen(false)} />
              <div role="menu" className="animate-pop absolute top-full right-0 z-50 mt-2 w-[min(92vw,360px)] rounded-2xl bg-surface p-4 shadow-deep ring-1 ring-hairline ring-inset">
                <h2 className={cx(DISPLAY, 'mb-3 text-[20px]')}>Actions</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  <MoreItem onClick={() => void toggleFullscreen()}>{fullscreen ? 'Exit full screen' : 'Full screen'}</MoreItem>
                  <MoreItem
                    onClick={() => {
                      setMoreOpen(false);
                      setSheet('receipts');
                    }}
                  >
                    Receipts
                  </MoreItem>
                  <MoreItem
                    disabled={heldStore.held.length === 0}
                    onClick={() => {
                      setMoreOpen(false);
                      setSheet('held');
                    }}
                  >
                    Held · {heldStore.held.length}
                  </MoreItem>
                  <MoreItem
                    danger
                    onClick={() => {
                      setMoreOpen(false);
                      leave(() => navigate('/admin/orders'));
                    }}
                  >
                    Exit POS mode
                  </MoreItem>
                </div>
              </div>
            </>
          )}
        </div>
      </header>

      {mode === 'tables' ? (
        table ? (
          <Terminal
            key={table.id}
            target={{ kind: 'TABLE', table }}
            tables={activeTables}
            onSwitchTable={(id) => leave(() => setOpen(id))}
            onExit={() => leave(() => setOpen(null))}
            onChanged={tables.reload}
            onGuard={setGuard}
            onHold={heldStore.hold}
            recall={recall?.kind === 'TABLE' && recall.targetId === table.id ? recall : null}
            onRecalled={(id) => {
              heldStore.release(id);
              setRecall(null);
            }}
          />
        ) : (
          <TableGrid
            tables={activeTables}
            loading={!tables.data && !tables.error}
            error={tables.error ? tables.error.message : null}
            onRetry={tables.reload}
            onOpen={(t) => setOpen(t.id)}
            onQuickSale={() => switchMode('new')}
          />
        )
      ) : (
        <NewOrder
          kind={newKind}
          onKind={setNewKind}
          table={newTable}
          tables={activeTables}
          onTable={setNewTableId}
          floor={floor}
          floors={activeFloors}
          onFloor={setFloorId}
          loading={(!tables.data && !tables.error) || (!floors.data && !floors.error)}
          error={tables.error?.message ?? floors.error?.message ?? null}
          onRetry={() => (tables.reload(), floors.reload())}
          onChanged={tables.reload}
          onGuard={setGuard}
          onHold={heldStore.hold}
          recall={recall && ((recall.kind === 'TABLE' && newKind === 'TABLE' && recall.targetId === newTable?.id) || (recall.kind === 'FLOOR' && newKind === 'FLOOR' && recall.targetId === floor?.id)) ? recall : null}
          onRecalled={(id) => {
            heldStore.release(id);
            setRecall(null);
          }}
        />
      )}

      {sheet === 'held' && <HeldSheet held={heldStore.held} menu={menu} onRecall={recallHeld} onDiscard={heldStore.release} onClose={() => setSheet(null)} />}
      {sheet === 'receipts' && <ReceiptsSheet tables={tables.data ?? []} menu={menu} onClose={() => setSheet(null)} />}

      {leaving && guard && (
        <div className="fixed inset-0 z-60 grid place-items-center bg-black/50 p-4" role="presentation" onClick={() => setLeaving(null)}>
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

function MoreItem({ children, onClick, disabled, danger }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cx('min-h-12 rounded-xl bg-surface-2 px-3 text-left text-[14px] font-semibold ring-1 ring-hairline ring-inset disabled:opacity-40', danger ? 'text-flame-3' : 'text-ink')}
    >
      {children}
    </button>
  );
}

function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid flex-1 place-items-center p-6">
      <Empty
        emoji="📡"
        title="Couldn't load this"
        message={message}
        action={
          <button type="button" className={BTN_FLAME} onClick={onRetry}>
            Try again
          </button>
        }
      />
    </div>
  );
}

/* ── Tables ───────────────────────────────────────────────────────── */

function TableGrid({
  tables,
  loading,
  error,
  onRetry,
  onOpen,
  onQuickSale,
}: {
  tables: DiningTable[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpen: (t: DiningTable) => void;
  onQuickSale: () => void;
}) {
  const { menu, orders } = useDashboard();
  const [show, setShow] = useState<'all' | 'free' | 'busy'>('all');
  const currency = menu.restaurant.currency;

  // What each seated table owes so far, from the live queue: its current visit's orders, less anything cancelled.
  const running = useMemo(() => {
    const byTable = new Map<string, { total: number; lines: number }>();
    for (const t of tables) {
      if (!t.currentSessionId) continue;
      const mine = orders.filter((o) => o.sessionId === t.currentSessionId && o.status !== 'CANCELLED');
      byTable.set(t.id, {
        total: mine.reduce((n, o) => n + o.total, 0),
        lines: mine.reduce((n, o) => n + o.items.filter((i) => i.status !== 'CANCELLED').reduce((m, i) => m + i.quantity, 0), 0),
      });
    }
    return byTable;
  }, [tables, orders]);

  const busy = tables.filter((t) => t.currentSessionId);
  const shown = [...tables].sort((a, b) => a.sortOrder - b.sortOrder).filter((t) => (show === 'all' ? true : show === 'busy' ? t.currentSessionId : !t.currentSessionId));

  if (error && tables.length === 0) return <LoadFailed message={error} onRetry={onRetry} />;
  if (loading) return <Loading />;
  if (tables.length === 0)
    return (
      <div className="grid flex-1 place-items-center p-6">
        <Empty
          emoji="🪑"
          title="No tables yet"
          message="Add tables under Table & spaces, or take counter orders with Quick sale."
          action={
            <button type="button" className={BTN_FLAME} onClick={onQuickSale}>
              Start a quick sale
            </button>
          }
        />
      </div>
    );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Show tables">
        {(
          [
            ['all', `All ${tables.length}`],
            ['free', `Free ${tables.length - busy.length}`],
            ['busy', `In use ${busy.length}`],
          ] as const
        ).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)} className={cx(CHIP, 'h-10', show === value ? CHIP_ON : CHIP_OFF)}>
            {label}
          </button>
        ))}
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
        {shown.map((t) => {
          const seated = Boolean(t.currentSessionId);
          const owes = running.get(t.id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  haptic.select();
                  onOpen(t);
                }}
                className={cx(
                  'flex h-32 w-full flex-col justify-between rounded-2xl p-4 text-left ring-1 ring-inset transition-[scale,background-color] duration-150 active:scale-[0.97]',
                  seated ? 'bg-flame/10 ring-flame/45' : 'bg-surface-2 ring-hairline hover:bg-surface-3',
                )}
              >
                <span className={cx(DISPLAY, 'truncate text-[24px]')}>{t.name}</span>
                <span className="grid gap-0.5 text-[13px]">
                  <span className="flex items-center gap-2 font-semibold">
                    <span aria-hidden className={cx('size-2 rounded-full', seated ? 'bg-flame' : 'bg-mint')} />
                    {seated ? 'In use' : 'Free'}
                    <span className="font-normal text-ink-3">· {t.capacity} seats</span>
                  </span>
                  {seated && owes && owes.lines > 0 && (
                    <span className="text-ink-2 tnum">
                      {owes.lines} item{owes.lines === 1 ? '' : 's'} · {formatMoney(owes.total, currency)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── New: dishes on the left, and on the right what the order is for ─ */

const KINDS: readonly (readonly [Kind, string])[] = [
  ['TABLE', 'Table'],
  ['FLOOR', 'Floor'],
  ['DELIVERY', 'Delivery'],
  ['QUICK', 'Quick bill'],
];

function NewOrder({
  kind,
  onKind,
  table,
  tables,
  onTable,
  floor,
  floors,
  onFloor,
  loading,
  error,
  onRetry,
  ...terminal
}: {
  kind: Kind;
  onKind: (k: Kind) => void;
  table: DiningTable | null;
  tables: DiningTable[];
  onTable: (id: string) => void;
  floor: Floor | null;
  floors: Floor[];
  onFloor: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
} & Pick<Parameters<typeof Terminal>[0], 'onChanged' | 'onGuard' | 'onHold' | 'recall' | 'onRecalled'>) {
  const target: Target = kind === 'DELIVERY' || kind === 'QUICK' ? { kind } : kind === 'TABLE' ? (table ? { kind, table } : { kind: 'NONE', missing: 'TABLE' }) : floor ? { kind, floor } : { kind: 'NONE', missing: 'FLOOR' };

  const switcher = (
    <div className="flex gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Order is for">
      {KINDS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={kind === value}
          onClick={() => onKind(value)}
          className={cx('h-11 flex-1 rounded-lg text-[15px] font-semibold transition-colors', kind === value ? 'bg-flame text-white' : 'text-ink-2 hover:text-ink')}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const chooser = (
    <>
      {switcher}
      {target.kind === 'TABLE' && (
        <Select
          value={target.table.id}
          onChange={onTable}
          options={tables.map((t) => ({ value: t.id, label: t.name + (t.currentSessionId ? ' · in use' : '') }))}
          aria-label="Table"
        />
      )}
      {target.kind === 'NONE' && (
        <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink-3" role="status">
          {error ?? (loading ? 'Loading…' : `No ${target.missing === 'TABLE' ? 'tables' : 'floors'} yet: add one under Table & spaces to send this order, or use Quick bill. You can still pick dishes.`)}
          {error && (
            <button type="button" onClick={onRetry} className="ml-2 font-semibold text-ink underline underline-offset-4">
              Try again
            </button>
          )}
        </p>
      )}
      {target.kind === 'FLOOR' && (
        <Select value={target.floor.id} onChange={onFloor} options={floors.map((f) => ({ value: f.id, label: f.name }))} aria-label="Floor" />
      )}
    </>
  );

  // One terminal for all three: the dishes already chosen stay when the order's destination changes.
  return <Terminal key="new" target={target} chooser={chooser} {...terminal} />;
}

/* ── The terminal: menu on the left, the ticket on the right ──────── */

function Terminal({
  target,
  chooser,
  tables = [],
  onSwitchTable,
  onExit,
  onChanged,
  onGuard,
  onHold,
  recall,
  onRecalled,
}: {
  target: Target;
  /** The New tab's "what is this order for" controls; the Table tab shows a back button and table picker instead. */
  chooser?: ReactNode;
  tables?: DiningTable[];
  onSwitchTable?: (id: string) => void;
  onExit?: () => void;
  onChanged: () => void;
  onGuard: (guard: Guard | null) => void;
  onHold: (ticket: Omit<HeldTicket, 'id' | 'at'>) => void;
  /** A held ticket for this terminal: its dishes go back on the ticket, then it is released. */
  recall: HeldTicket | null;
  onRecalled: (id: string) => void;
}) {
  const staff = useStaff();
  const push = useToast();
  const { menu, orders, applyOrder, reloadOrders } = useDashboard();
  const { pending, busy, run } = useCommand();
  const ticket = useTicketDraft(menu);
  const currency = menu.restaurant.currency;
  const isTable = target.kind === 'TABLE';
  const isDelivery = target.kind === 'DELIVERY';
  const tableId = target.kind === 'TABLE' ? target.table.id : null;
  const session = target.kind === 'TABLE' ? target.table.currentSessionId : null;

  // One per order as typed: a double tap or a retry after a dropped connection lands as the same order. It is renewed once
  // an order is in, because the server answers a key it has seen with the order it made, whatever is being sent now.
  const idempotency = useRef({ payload: '', key: '' });
  const [spot, setSpot] = useState('');
  const [guest, setGuest] = useState<Guest | null>(null);
  const [address, setAddress] = useState('');
  const deliveryReady = !isDelivery || (guest !== null && address.trim() !== '');
  /** Floor and quick orders are each billed on their own; a table settles as a whole. */
  const billedAlone = target.kind === 'FLOOR' || target.kind === 'QUICK';
  const canHold = target.kind === 'TABLE' || target.kind === 'FLOOR';
  /** Orders placed from this screen. The live queue catches up a moment later; until then these are what is on the ticket. */
  const [placed, setPlaced] = useState<Order[]>([]);
  /** Counter orders settled from this screen: a paid ticket can leave the queue, so its own copy would otherwise read as unpaid. */
  const [paidIds, setPaidIds] = useState<string[]>([]);
  /** The order whose payment sheet is open. Held here, not derived, so the sheet stays through its own "paid" screen. */
  const [paying, setPaying] = useState<Order | null>(null);
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
    const fromHere = placed.filter((o) => (target.kind === 'TABLE' ? o.tableId === target.table.id && (!session || o.sessionId === session) : target.kind === 'FLOOR' ? o.floorName !== null : target.kind === 'QUICK' && o.tableId === null && o.floorName === null && o.orderType === 'DINE_IN'));
    const all = new Map<string, Order>();
    for (const o of [...fromHere.map((p) => live.get(p.id) ?? p), ...mine]) all.set(o.id, o);
    return [...all.values()].filter((o) => o.status !== 'CANCELLED').sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, placed, target, session]);
  const isPaid = (o: Order) => paidIds.includes(o.id) || Boolean(o.paidAt);
  const owing = isTable ? sent : sent.filter((o) => !isPaid(o));
  /** A table's visit belongs to whoever the first order was for, so once something is sent there is nobody to choose. */
  const guestShown = target.kind !== 'NONE' && !(isTable && sent.length > 0);
  /** What is being paid decides the sheet, not the tab: a quick bill must keep its own sheet if the tab changes under a send. */
  const payAlone = paying ? paying.tableId === null : billedAlone;
  const sentTotal = sent.reduce((n, o) => n + o.total, 0);

  // Tell the screen when walking away would cost something.
  const unsent = ticket.draft.reduce((n, l) => n + l.qty, 0);
  const unpaid = !isTable ? owing.map((o) => o.reference).join(', ') : '';
  useEffect(() => {
    if (busy) onGuard({ busy: true, reason: 'An order is being sent.' });
    else if (unsent > 0) onGuard({ busy: false, reason: `${unsent} item${unsent === 1 ? '' : 's'} on the ticket haven't been sent to the kitchen, and will be lost.` });
    else if (unpaid) onGuard({ busy: false, reason: `${unpaid} hasn't been paid. Once it's served you can take payment from Orders.` });
    else onGuard(null);
    return () => onGuard(null);
  }, [busy, unsent, unpaid, onGuard]);

  const place = () => {
    if (ticket.draft.length === 0 || busy || !deliveryReady || target.kind === 'NONE') return;
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
      // A delivery leaves the counter for good: it is followed from Orders, not paid here.
      if (!isDelivery) setPlaced((p) => [...p, order]);
      // A quick bill is paid as it is rung up: straight to the payment sheet.
      if (target.kind === 'QUICK') setPaying(order);
      ticket.setDraft([]);
      setSpot('');
      setGuest(null);
      setAddress('');
      onChanged();
      haptic.success();
      push(`${order.reference} placed · ${order.status === 'PENDING' ? 'waiting on the pass' : order.status === 'UNPAID' ? 'awaiting payment' : 'sent to the kitchen'}`, <Check size={16} />);
    });
  };

  const hold = () => {
    if (ticket.draft.length === 0 || busy || !canHold) return;
    if (target.kind !== 'TABLE' && target.kind !== 'FLOOR') return;
    onHold({
      kind: target.kind,
      targetId: target.kind === 'TABLE' ? target.table.id : target.floor.id,
      label: target.kind === 'TABLE' ? target.table.name : target.floor.name,
      spot: spot.trim(),
      lines: ticket.draft.map((l) => ({ dishId: l.dish.id, variantId: l.variantId, addOnIds: l.addOnIds, qty: l.qty })),
    });
    idempotency.current = { payload: '', key: '' };
    ticket.setDraft([]);
    setSpot('');
    setGuest(null);
    setAddress('');
    haptic.select();
    push('Ticket held', <Check size={16} />);
  };

  // Strict mode runs effects twice on mount; the id guard keeps a recall from adding its dishes twice.
  const recalled = useRef<string | null>(null);
  useEffect(() => {
    if (!recall || recalled.current === recall.id) return;
    recalled.current = recall.id;
    // Each line must still be orderable as held: a dish that is off or 86'd, or a size or extra that no longer exists, cannot go
    // on a ticket. What cannot come back is held again rather than dropped, so nothing disappears without a word.
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
      onHold({ kind: recall.kind, targetId: recall.targetId, label: recall.label, spot: '', lines: left });
      const names = left.map((l) => menu.dishes.find((d) => d.id === l.dishId)?.name ?? 'A removed dish');
      push(`${names.join(', ')} can't be ordered right now. ${left.length === 1 ? 'It stays' : 'They stay'} held.`, '⚠️');
    }
    onRecalled(recall.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recall]);

  const pickDish = (dish: Parameters<typeof ticket.pick>[0]) => {
    playTick('add');
    ticket.pick(dish);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <DishMenu pos menu={menu} busy={busy} counts={ticket.counts} lines={ticket.draft} onPick={pickDish} onQty={changeQty} autoFocusSearch={false} />

      <aside className="m-3 flex max-h-[48dvh] min-h-0 shrink-0 flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-hairline ring-inset lg:mt-0 lg:max-h-none lg:w-97.5">
        <div className="grid gap-2 p-3">
          {chooser ??
            (target.kind === 'TABLE' && (
              <div className="flex gap-2">
                {onExit && (
                  <button type="button" onClick={onExit} aria-label="Back to tables" className="grid size-11 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset">
                    <ChevronLeft size={18} />
                  </button>
                )}
                <Select
                  value={target.table.id}
                  onChange={(id) => onSwitchTable?.(id)}
                  options={tables.map((t) => ({ value: t.id, label: t.name + (t.currentSessionId ? ' · in use' : '') }))}
                  className="min-w-0 flex-1"
                  aria-label="Table"
                />
              </div>
            ))}
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
          {guestShown && <PosCustomer value={guest} onChange={setGuest} required={isDelivery} disabled={busy} />}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {sent.length > 0 && (
            <section aria-label="Already sent">
              <h3 className="mb-1 text-[13px] font-semibold text-ink-3">Sent</h3>
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
                          {pending === `reprint-${o.id}` ? 'Sending…' : 'Reprint ticket'}
                        </button>
                      )}
                      <span className="tnum">{formatMoney(o.total, currency)}</span>
                    </span>
                  </p>
                  <ul className="mt-1">
                    {o.items
                      .filter((i) => i.status !== 'CANCELLED')
                      .map((i) => (
                        <li key={i.id} className="flex items-baseline justify-between gap-3 py-0.5 text-[14.5px]">
                          <span className="min-w-0">
                            <span className="tnum font-semibold">{i.quantity}×</span> {i.dishNameSnapshot}
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
            <h3 className="mb-1 flex items-center justify-between text-[13px] font-semibold text-ink-3">
              <span>{sent.length > 0 ? 'Adding' : 'Ticket'}</span>
              {ticket.draft.length > 0 && (
                <button type="button" onClick={() => ticket.setDraft([])} className="text-[12.5px] font-semibold text-ink-3 underline decoration-hairline-strong underline-offset-4 hover:text-ink">
                  Clear
                </button>
              )}
            </h3>
            {ticket.draft.length === 0 ? (
              <p className="py-6 text-center text-[14px] text-ink-3">Tap a dish to add it.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {ticket.draft.map((line) => {
                  const detail = ticket.describe(line);
                  return (
                    <li key={line.key} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{line.dish.name}</span>
                        {detail && <span className="block truncate text-[12.5px] text-ink-3">{detail}</span>}
                      </span>
                      <span className="shrink-0 text-[13px] text-ink-3 tnum">{formatMoney(ticket.priceOf(line) * line.qty, currency)}</span>
                      <QuantityStepper value={line.qty} onChange={(n) => changeQty(line.key, n - line.qty)} size="sm" min={0} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-2.5 border-t border-hairline bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <dl className="grid gap-1 text-[14px]">
            <div className="flex items-baseline justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tnum">QTY: {unsent}</dd>
            </div>
            {sent.length > 0 && (
              <div className="flex justify-between text-ink-2">
                <dt>Sent so far</dt>
                <dd className="tnum">{formatMoney(sentTotal, currency)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <dt className="text-ink-2">{ticket.draft.length > 0 ? 'Adding (estimate)' : 'Nothing new'}</dt>
              <dd className="text-[20px] font-bold tnum">{formatMoney(ticket.total, currency)}</dd>
            </div>
          </dl>
          <div className="flex gap-2.5">
            <button type="button" disabled={busy || ticket.draft.length === 0 || !deliveryReady || target.kind === 'NONE'} onClick={place} className={cx(BTN_FLAME, 'h-14 flex-1 text-[16.5px]')}>
              {pending === 'place' ? 'Sending…' : isDelivery ? 'Place delivery' : target.kind === 'QUICK' ? 'Send & bill' : 'Send to kitchen'}
            </button>
            {canHold && (
              <button type="button" disabled={busy || ticket.draft.length === 0} onClick={hold} className={cx(BTN_GHOST, 'h-14 px-5 text-[15px]')}>
                Hold
              </button>
            )}
          </div>
          {canPay && (
            <button type="button" disabled={busy} onClick={() => setPaying(payNext)} className={cx(BTN_GHOST, 'h-13 w-full')}>
              {isTable ? 'Pay the bill' : `Pay ${payNext!.reference} · ${formatMoney(payNext!.total, currency)}`}
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
          onClose={() => ticket.setConfiguring(null)}
          onAdd={(sel) => {
            ticket.add(ticket.configuring!, sel);
            ticket.setConfiguring(null);
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
          vatRegistered={menu.restaurant.vatRegistered}
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
        />
      )}
    </div>
  );
}
