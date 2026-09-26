import { useEffect, useMemo, useRef, useState } from 'react';
import { isTableOpen } from '../../api/admin';
import { IS_LIVE_API } from '../../api/http';
import { STATUS_LABEL } from '../../domain/orderStatus';
import {
  completePayment,
  createTable,
  endTableSession,
  fetchOrdersBySession,
  listTables,
  regenerateQr,
  setTableActive,
  subscribeToTables,
  updateTable,
} from '../../api/staff';
import type { DiningTable, Dish, Order, OrderStatus, PaymentMethod } from '../../domain/types';
import { formatMoney, percentOf, symbolFor } from '../../domain/money';
import { can } from '../../domain/permissions';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { QrDialog, QrImage, printQrSheet, tableUrl } from '../../components/admin/QrCard';
import { printReceipt } from '../../components/admin/receipt';
import type { ReceiptLine, ReceiptTotals } from '../../components/admin/receipt';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Field,
  INPUT_BOX,
  Loading,
  PANEL,
  PageTitle,
  Panel,
  Segmented,
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { Cash, Check, ChevronLeft, Qr, Receipt } from '../../components/icons';
import { SessionCode } from '../../components/Bits';
import { DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

/**
 * §29. Tables and their codes.
 *
 * The QR is generated here rather than fetched, so a restaurant can print the
 * whole floor in one go without an internet round trip per table. Regenerating
 * a token is the one destructive action on this screen — every printed copy of
 * that code stops working the moment it happens — so it is the one that asks.
 */

/** Occupied means someone is actually seated there — driven by the session, not by whether the bill is settled yet. */
function isOccupied(table: DiningTable): boolean {
  return table.currentSessionId != null;
}

/** How often the floor plan re-reads itself when there's no socket to push it a change. */
const TABLES_POLL_MS = 8000;

export function Tables() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, orders, reloadOrders } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();

  const tables = useAsync(() => listTables(staff), [staff]);
  const reloadTables = tables.reload;

  // A diner's QR scan can open a session, and another staff member's device
  // can end one, on any device that isn't this one — the floor plan has to
  // notice either without someone refreshing it. Live, the socket pushes
  // `table.updated` the moment a session starts or ends; the mock has no
  // server to push from, so it keeps polling instead.
  useEffect(() => {
    if (IS_LIVE_API) {
      return subscribeToTables(reloadTables, reloadTables);
    }
    const timer = setInterval(reloadTables, TABLES_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadTables]);

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [qrId, setQrId] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'free' | 'occupied'>('all');

  const editable = allows('tables:edit');
  const canSettle = allows('orders:advance');
  const rows = tables.data ?? [];
  const active = rows.filter((t) => t.isActive);

  const openByTable = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const order of orders) {
      if (!isTableOpen(order.status)) continue;
      const list = map.get(order.tableId) ?? [];
      list.push(order);
      map.set(order.tableId, list);
    }
    return map;
  }, [orders]);
  const occupiedCount = rows.filter((t) => isOccupied(t)).length;
  const visibleRows = rows.filter((t) => {
    const occupied = isOccupied(t);
    if (filter === 'free') return !occupied;
    if (filter === 'occupied') return occupied;
    return true;
  });

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then(tables.reload);

  const endSession = (table: DiningTable) => {
    void run(table.id, () => endTableSession(staff, table.id), `${table.name}'s visit ended`).then((ok) => {
      if (!ok) return;
      setBillId(null);
      tables.reload();
    });
  };

  const qrTable = rows.find((t) => t.id === qrId) ?? null;
  const billTable = rows.find((t) => t.id === billId) ?? null;
  const sessionId = billTable?.currentSessionId ?? null;
  const bill = useAsync(() => (sessionId ? fetchOrdersBySession(staff, sessionId) : Promise.resolve([])), [sessionId]);
  // The full visit, completed rounds included — PaymentSheet only bills what's still open,
  // but a cashier should still see what was already served and paid for this session.
  const billOrders = bill.data ?? [];
  const menuDishes = menu.dishes.filter((d) => !d.isArchived && d.isAvailable);

  return (
    <>
      <PageTitle
        title="Tables"
        subtitle={`${active.length} seating · ${occupiedCount} occupied · ${rows.length - active.length} disabled`}
        action={
          rows.length > 0 && (
            <button
              type="button"
              className={ADMIN_GHOST}
              onClick={() => {
                const opened = printQrSheet(active, menu.restaurant.name, menu.restaurant.slug);
                if (!opened) push('Allow pop-ups to print the QR sheet.', '⚠️');
              }}
            >
              Print all codes
            </button>
          )
        }
      />

      {rows.length > 0 && (
        <div className="mb-3 overflow-x-auto no-scrollbar">
          <Segmented
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: `All · ${rows.length}` },
              { value: 'free', label: `Free · ${rows.length - occupiedCount}` },
              { value: 'occupied', label: `Occupied · ${occupiedCount}` },
            ]}
          />
        </div>
      )}

      {tables.loading && rows.length === 0 ? (
        <Loading label="Reading the floor plan…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleRows.length === 0 && (
              <p className="col-span-full py-6 text-center text-[13px] text-ink-4">No tables match this filter.</p>
            )}
            {visibleRows.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                slug={menu.restaurant.slug}
                restaurantName={menu.restaurant.name}
                editable={editable}
                canSettle={canSettle}
                openOrders={openByTable.get(table.id) ?? []}
                pending={pending}
                renaming={renaming === table.id}
                onRename={() => setRenaming(table.id)}
                onCancelRename={() => setRenaming(null)}
                onSaveRename={(nextName, nextCapacity) => {
                  setRenaming(null);
                  act(table.id, () => updateTable(staff, table.id, { name: nextName, capacity: nextCapacity }), 'Table updated');
                }}
                onToggle={() =>
                  act(
                    table.id,
                    () => setTableActive(staff, table.id, !table.isActive),
                    table.isActive ? `${table.name} disabled` : `${table.name} is seating again`,
                  )
                }
                onRegenerate={() =>
                  act(table.id, () => regenerateQr(staff, table.id), `${table.name} has a new code — reprint it`)
                }
                onOpenBill={() => setBillId(table.id)}
                onCopy={(url) => {
                  void navigator.clipboard?.writeText(url);
                  push('Table link copied');
                }}
                onShowQr={() => setQrId(table.id)}
                onEndSession={() => endSession(table)}
              />
            ))}
          </div>

          {editable && (
            <Panel title="Add a table">
              <form
                className="grid gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  act('new', () => createTable(staff, name, Number(capacity)), `${name.trim()} added`);
                  setName('');
                }}
              >
                <Field label="Name">
                  <TextInput value={name} onChange={setName} maxLength={30} placeholder="Table 15" />
                </Field>
                <Field label="Seats">
                  <input
                    className={cx(INPUT_BOX, 'tnum')}
                    value={capacity}
                    inputMode="numeric"
                    onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
                  />
                </Field>
                <button type="submit" className={ADMIN_PRIMARY} disabled={busy || name.trim().length < 1}>
                  {pending === 'new' ? 'Adding…' : 'Add table'}
                </button>
                <p className="text-[12.5px] leading-relaxed text-ink-4">
                  A new table gets its own token straight away. Print its code before the next service.
                </p>
              </form>
            </Panel>
          )}
        </div>
      )}

      <QrDialog
        table={qrTable}
        url={qrTable ? tableUrl(menu.restaurant.slug, qrTable) : ''}
        restaurantName={menu.restaurant.name}
        onClose={() => setQrId(null)}
        onCopy={(url) => {
          void navigator.clipboard?.writeText(url);
          push('Table link copied');
        }}
      />

      <PaymentSheet
        table={billTable}
        orders={billOrders}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setBillId(null)}
        onSettle={(changes) => {
          if (!billTable || !billTable.currentSessionId) return Promise.resolve(false);
          const sessionId = billTable.currentSessionId;
          return run(
            billTable.id,
            () => completePayment(staff, sessionId, changes.items, changes.method, changes.discount, changes.endSession),
            changes.endSession ? `${billTable.name} paid up and cleared` : `${billTable.name} paid up`,
          ).then((ok) => {
            if (ok) {
              reloadOrders();
              bill.reload();
              if (changes.endSession) tables.reload();
            }
            return ok;
          });
        }}
        onEndSession={() => {
          if (!billTable) return;
          endSession(billTable);
        }}
        onShowQr={() => {
          if (!billTable) return;
          setBillId(null);
          setQrId(billTable.id);
        }}
      />
    </>
  );
}

interface CardProps {
  table: DiningTable;
  slug: string;
  restaurantName: string;
  editable: boolean;
  canSettle: boolean;
  openOrders: Order[];
  pending: string | null;
  renaming: boolean;
  onRename: () => void;
  onCancelRename: () => void;
  onSaveRename: (name: string, capacity: number) => void;
  onToggle: () => void;
  onRegenerate: () => void;
  onOpenBill: () => void;
  onCopy: (url: string) => void;
  onShowQr: () => void;
  onEndSession: () => void;
}

function TableCard({ table, slug, restaurantName, editable, canSettle, openOrders, pending, renaming, ...on }: CardProps) {
  const url = tableUrl(slug, table);
  const busy = pending === table.id;
  const occupied = isOccupied(table);
  const disabled = !table.isActive;

  return (
    <article
      className={cx(
        PANEL,
        'flex flex-col gap-2.5 p-3 transition-move',
        pending === table.id && 'opacity-50',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className={cx(DISPLAY, 'truncate text-[26px] leading-none font-black', occupied ? 'text-ink' : 'text-ink-2')}>
          {table.name}
        </h3>
        <span className="mt-1 flex shrink-0 items-center gap-1.5">
          <span
            className={cx('size-2 rounded-full', disabled ? 'bg-ink-4/40' : occupied ? 'bg-flame-2 pulse-dot' : 'bg-mint')}
          />
          <span
            className={cx(
              'text-[10px] font-bold tracking-wide uppercase',
              disabled ? 'text-ink-4' : occupied ? 'text-flame-2 animate-pulse' : 'text-mint',
            )}
          >
            {disabled ? 'Off' : occupied ? 'In use' : 'Free'}
          </span>
        </span>
      </div>

      <p className="text-[12px] text-ink-4">
        {table.capacity} seat{table.capacity === 1 ? '' : 's'}
        {occupied && ` · ${openOrders.length} open order${openOrders.length === 1 ? '' : 's'}`}
      </p>


      <div className="flex items-end justify-between gap-2">
        {occupied && table.currentSessionToken && <SessionCode label="Session code" className='ring-0 bg-transparent py-0' token={table.currentSessionToken} />}
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-4 uppercase ring-1 ring-hairline ring-inset transition-colors hover:text-flame-1 hover:ring-flame-2/40"
            onClick={on.onShowQr}
          >
            QR
          </button>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-4 uppercase ring-1 ring-hairline ring-inset transition-colors hover:text-flame-1 hover:ring-flame-2/40"
            onClick={() => on.onCopy(url)}
          >
            Link
          </button>
        </span>
      </div>

      {renaming ? (
        <RenameForm table={table} onCancel={on.onCancelRename} onSave={on.onSaveRename} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {occupied && canSettle && (
            <button
              type="button"
              disabled={busy}
              className={cx(ADMIN_PRIMARY, 'flex w-full items-center justify-center gap-1.5 rounded-[10px]')}
              onClick={on.onOpenBill}
            >
              <Receipt size={15} />
              Settle payment
            </button>
          )}

          {!occupied && editable && (
            <button
              type="button"
              disabled={busy}
              className={cx(
                'w-full rounded-[10px] py-2 text-[10px] font-bold tracking-wide uppercase ring-1 ring-inset transition-move active:scale-[0.99] disabled:pointer-events-none disabled:opacity-35',
                disabled ? 'text-mint ring-mint/40' : 'text-ink-3 ring-hairline',
              )}
              onClick={on.onToggle}
            >
              {disabled ? 'Enable table' : 'Disable table'}
            </button>
          )}

          {editable && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5">
              <button
                type="button"
                disabled={busy}
                className={cx(ADMIN_TINY, 'h-6 px-2 text-[10px] text-ink-3 hover:text-ink')}
                onClick={on.onRename}
              >
                Rename
              </button>
              {/* <button
                type="button"
                className={cx(ADMIN_TINY, 'h-6 px-2 text-[10px] text-ink-3 hover:text-ink')}
                onClick={() => printQrSheet([table], restaurantName, slug)}
              >
                Print
              </button>
              <Confirm
                label="New code"
                question="Void the printed code?"
                confirmLabel="Regenerate"
                disabled={busy}
                className="h-6 px-2 text-[10px]"
                onConfirm={on.onRegenerate}
              /> */}
              {occupied && (
              <Confirm
                label="End session"
                question={occupied ? 'End the visit with the bill still open?' : 'Clear this table for the next visit?'}
                confirmLabel="End it"
                disabled={busy}
                className="h-6 px-2 text-[10px]"
                onConfirm={on.onEndSession}
              />
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/** How long the QR step waits before it settles on its own — a cashier who'd rather not wait can always skip it. */
const QR_AUTO_MS = 8000;

/**
 * There's no payment gateway behind this yet (§ take-payment flow — front end
 * only for now), so this isn't a real charge link. "Dynamic" is what still
 * matters for the till: a fresh reference baked in per attempt, so the code
 * on screen changes every time a payment is started, the way a real one would.
 */
function paymentQrPayload(table: DiningTable, amount: number, currency: string): string {
  const ref = `${table.qrToken.slice(0, 6)}${Date.now().toString(36)}`.toUpperCase();
  return `letsdine-pay://charge?table=${encodeURIComponent(table.name)}&amount=${amount}&currency=${currency}&ref=${ref}`;
}

/** One underlying order item a displayed bill line is backed by — a served line can merge several of these. */
interface DraftLineSource {
  orderId: string;
  itemId: string | null;
  quantity: number;
}

interface DraftLine {
  rowId: string;
  dishId: string;
  dishNameSnapshot: string;
  notes: string;
  /** For the "each" display only — a merged served line shows its first source's price. */
  unitPrice: number;
  quantity: number;
  /** What this line actually charges — summed from its sources, not unitPrice × quantity, so a
   *  price snapshot changing between the rounds a served line merges can never misstate the bill. */
  total: number;
  orderStatus: OrderStatus;
  /** Already fired to the kitchen and served — anything else on the bill is still on its way out. */
  served: boolean;
  /** The item(s) this line's quantity actually comes from — where +/- apply. Several only when served lines merged. */
  sources: DraftLineSource[];
}

interface PendingBillChanges {
  items: { dishId: string; quantity: number }[];
  method: PaymentMethod;
  discount: number;
  endSession: boolean;
}

/** What's actually being charged, frozen the moment "Take payment" is tapped — so an in-flight QR
 *  wait (or the reload that follows a successful cash payment) can never shift the total underfoot. */
interface CommittedBill {
  items: { dishId: string; quantity: number }[];
  lines: ReceiptLine[];
  totals: ReceiptTotals;
}

type PayStep = 'bill' | 'method' | 'qr' | 'done';

function PaymentSheet({
  table,
  orders,
  dishes,
  restaurantName,
  serviceChargeRate,
  taxRate,
  pending,
  onClose,
  onSettle,
  onEndSession,
}: {
  table: DiningTable | null;
  orders: Order[];
  dishes: Dish[];
  restaurantName: string;
  serviceChargeRate: number;
  taxRate: number;
  pending: string | null;
  onClose: () => void;
  onSettle: (changes: PendingBillChanges) => Promise<boolean>;
  onShowQr: () => void;
  onEndSession: () => void;
}) {
  const staff = useStaff();
  const canDiscount = can(staff.role, 'payments:discount');

  const [adding, setAdding] = useState(false);
  // Edits made in the sheet are a draft until "Take payment" — closing without
  // paying (or backdrop-clicking) discards them, nothing was ever sent.
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<{ orderId: string; itemId: string }[]>([]);
  const [_endSessionOnPay, setEndSessionOnPay] = useState(false);
  // A flat minor-unit reduction the cashier can dial in before taking payment — Manager/Owner only.
  const [discount, setDiscount] = useState(0);
  const [discountText, setDiscountText] = useState('0.00');

  // "Take payment" no longer settles directly — it freezes the bill into `committed` and hands off
  // to a payment-method step. Nothing is charged until cash is confirmed or the QR step resolves.
  const [step, setStep] = useState<PayStep>('bill');
  const [method, setMethod] = useState<'cash' | 'qr' | null>(null);
  const [committed, setCommitted] = useState<CommittedBill | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrProgress, setQrProgress] = useState(false);

  // The sheet stays mounted (just hidden) between tables, so its own UI state
  // — the dish picker being expanded, any unsent edits, which step of taking
  // payment it's on — has to be reset by hand on every close or table switch,
  // or it carries over into whatever opens next.
  useEffect(() => {
    setAdding(false);
    setPendingAdds([]);
    setPendingRemoves([]);
    setEndSessionOnPay(false);
    setDiscount(0);
    setDiscountText('0.00');
    setStep('bill');
    setMethod(null);
    setCommitted(null);
    setQrPayload(null);
    setQrProgress(false);
  }, [table?.id]);

  // `onSettle` runs the real mutation and is closed over freshly every render — a ref keeps the
  // QR auto-advance timer below from needing it in its dependency array (same trick as useAsync).
  const finalize = async (chosenMethod: 'cash' | 'qr') => {
    if (!committed) return;
    setMethod(chosenMethod);
    const ok = await onSettle({
      items: committed.items,
      method: chosenMethod === 'cash' ? 'CASH' : 'CARD',
      discount: committed.totals.discount,
      endSession: true,
    });
    setStep(ok ? 'done' : 'method');
  };
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;

  // The QR step is a stand-in for a real gateway callback: it counts down on its own, but "Mark as
  // paid now" lets a cashier who already has the cash in hand (or whose customer paid off-screen)
  // skip the wait instead of standing there watching a progress bar.
  useEffect(() => {
    if (step !== 'qr') return;
    const raf = requestAnimationFrame(() => setQrProgress(true));
    const timer = setTimeout(() => void finalizeRef.current('qr'), QR_AUTO_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [step]);

  if (!table) return null;

  const currency = orders[0]?.currency ?? '';
  // Adds always land on the table's single most recent order, whatever its status — matches the backend.
  const latestOrder = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  const removeCounts = new Map<string, number>();
  for (const r of pendingRemoves) removeCounts.set(r.itemId, (removeCounts.get(r.itemId) ?? 0) + 1);
  const addCounts = new Map<string, number>();
  for (const dishId of pendingAdds) addCounts.set(dishId, (addCounts.get(dishId) ?? 0) + 1);

  // Everything the session order API hands back is payable — a cancelled order is the one exception,
  // since it was voided and never fulfilled. A raw line per order item first, exactly what's on each
  // order; grouping into what the cashier actually sees happens after.
  interface RawLine {
    orderId: string;
    itemId: string | null;
    dishId: string;
    dishNameSnapshot: string;
    notes: string;
    unitPrice: number;
    quantity: number;
    orderStatus: OrderStatus;
    served: boolean;
  }
  const rawLines: RawLine[] = [];
  for (const order of orders) {
    if (order.status === 'CANCELLED') continue;
    for (const item of order.items) {
      if (item.status === 'CANCELLED') continue;
      const remaining = item.quantity - (removeCounts.get(item.id) ?? 0);
      if (remaining <= 0) continue;

      const added = order.id === latestOrder?.id ? (addCounts.get(item.dishId) ?? 0) : 0;
      if (added > 0) addCounts.delete(item.dishId);

      rawLines.push({
        orderId: order.id,
        itemId: item.id,
        dishId: item.dishId,
        dishNameSnapshot: item.dishNameSnapshot,
        notes: item.notes,
        unitPrice: item.unitPrice,
        quantity: remaining + added,
        orderStatus: order.status,
        // A dish groups the moment the kitchen marks *that item* served,
        // independent of whether the rest of the order has caught up.
        served: item.status === 'SERVED',
      });
    }
  }
  // Whatever's left in addCounts is a dish with no existing line on the latest order yet.
  if (latestOrder) {
    for (const [dishId, quantity] of addCounts) {
      const dish = dishes.find((d) => d.id === dishId);
      if (!dish) continue;
      rawLines.push({
        orderId: latestOrder.id,
        itemId: null,
        dishId,
        dishNameSnapshot: dish.name,
        notes: '',
        unitPrice: dish.price,
        quantity,
        orderStatus: latestOrder.status,
        // A freshly-queued line is always PENDING — it can't be served yet.
        served: false,
      });
    }
  }

  // The cashier's actual view: once a dish has been served, which round it came from stops
  // mattering, so every served item of the same dish collapses into one line. Anything still on
  // its way out of the kitchen hasn't earned that — it stays on its own line, one per order, so
  // it's obvious what's still outstanding.
  const draftLines: DraftLine[] = [];
  const servedGroups = new Map<string, DraftLine>();
  for (const raw of rawLines) {
    if (!raw.served) {
      draftLines.push({
        rowId: raw.itemId ?? `draft-${raw.dishId}-${raw.orderId}`,
        dishId: raw.dishId,
        dishNameSnapshot: raw.dishNameSnapshot,
        notes: raw.notes,
        unitPrice: raw.unitPrice,
        quantity: raw.quantity,
        total: raw.unitPrice * raw.quantity,
        orderStatus: raw.orderStatus,
        served: false,
        sources: [{ orderId: raw.orderId, itemId: raw.itemId, quantity: raw.quantity }],
      });
      continue;
    }

    const group = servedGroups.get(raw.dishId);
    if (group) {
      group.quantity += raw.quantity;
      group.total += raw.unitPrice * raw.quantity;
      group.sources.push({ orderId: raw.orderId, itemId: raw.itemId, quantity: raw.quantity });
    } else {
      const line: DraftLine = {
        rowId: `served-${raw.dishId}`,
        dishId: raw.dishId,
        dishNameSnapshot: raw.dishNameSnapshot,
        // Notes belong to one round, not the merged total — dropped rather than misattributed.
        notes: '',
        unitPrice: raw.unitPrice,
        quantity: raw.quantity,
        total: raw.unitPrice * raw.quantity,
        orderStatus: raw.orderStatus,
        served: true,
        sources: [{ orderId: raw.orderId, itemId: raw.itemId, quantity: raw.quantity }],
      };
      servedGroups.set(raw.dishId, line);
      draftLines.push(line);
    }
  }

  const queueAdd = (dishId: string) => setPendingAdds((prev) => [...prev, dishId]);

  const queueRemove = (line: DraftLine) => {
    // A served line may be several rounds merged into one — peel a unit off whichever source
    // still has any left. Order among them doesn't matter; the total is all that's displayed.
    const source = line.sources.find((s) => s.quantity > 0);
    if (!source) return;

    // A unit with no real item id was never sent to the server (a brand-new dish, or the fresh top-up on
    // a closed-out order) — cancel the queued add locally instead of recording a removal against nothing.
    if (!source.itemId) {
      const idx = pendingAdds.lastIndexOf(line.dishId);
      if (idx !== -1) setPendingAdds((prev) => [...prev.slice(0, idx), ...prev.slice(idx + 1)]);
      return;
    }
    setPendingRemoves((prev) => [...prev, { orderId: source.orderId, itemId: source.itemId! }]);
  };

  const openOrderCount = orders.filter((o) => isTableOpen(o.status)).length;
  const hasItems = draftLines.length > 0;
  const subtotal = draftLines.reduce((sum, l) => sum + l.total, 0);
  const serviceCharge = percentOf(subtotal, serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, taxRate);
  const preDiscountTotal = subtotal + serviceCharge + tax;
  // Never let a stale discount (typed against a bigger bill, before an item was pulled off) push the total negative.
  const appliedDiscount = canDiscount ? Math.min(discount, preDiscountTotal) : 0;
  const total = preDiscountTotal - appliedDiscount;
  const busy = pending === table.id;
  const oldest = orders.reduce<string | null>(
    (min, o) => (min === null || o.createdAt < min ? o.createdAt : min),
    null,
  );
  const elapsedMinutes = oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 60_000)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        setAdding(false);
        onClose();
      }}
      role="presentation"
    >
      <div
        className="animate-pop mx-auto max-h-[85vh] w-full max-w-4xl overflow-y-auto rounded-4xl bg-[oklch(0.943_0.024_85)] px-4 pt-4 pb-6 font-mono shadow-deep"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${table.name} bill`}
      >
        {step === 'bill' && (
        <>
        <div className="flex items-start justify-between pt-2">
          <div>
            <h2 className={cx(DISPLAY, 'mt-1 text-[30px] leading-none font-black text-[oklch(0.232_0.019_70)]')}>{table.name}</h2>
            <p className="mt-1 text-[10px] tracking-[0.14em] text-[oklch(0.463_0.031_74)] uppercase">
              {openOrderCount} open order{openOrderCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] tracking-wide text-[oklch(0.463_0.031_74)] uppercase">
              {table.capacity} seat{table.capacity === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 text-[11px] font-bold text-[oklch(0.539_0.163_36)]">{elapsedMinutes}m elapsed</p>
          </div>
        </div>

        <div className="my-3 border-t border-dashed border-[oklch(0.232_0.019_70)]/25" />

        {hasItems && (
          <div className="space-y-2.5 text-[13px]">
            {draftLines.map((line) => {
              return (
                <div key={line.rowId} className={cx('flex items-center justify-between gap-3', !line.served && 'opacity-60')}>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate font-semibold text-[oklch(0.232_0.019_70)]">
                        {line.dishNameSnapshot}
                        {line.notes && <span className="ml-2 text-[10px] italic text-[oklch(0.463_0.031_74)]">“{line.notes}”</span>}
                      </span>
                      {!line.served && (
                        <span className="shrink-0 rounded-full bg-[oklch(0.539_0.163_36)]/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-[oklch(0.539_0.163_36)] uppercase">
                          {STATUS_LABEL[line.orderStatus]}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-[oklch(0.463_0.031_74)] tnum">
                      {formatMoney(line.unitPrice, currency)} each
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Remove one ${line.dishNameSnapshot}`}
                      onClick={() => queueRemove(line)}
                      className="size-7 rounded-full bg-[oklch(0.879_0.033_85)] text-[15px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="w-4 text-center text-[13px] font-bold text-[oklch(0.232_0.019_70)]">{line.quantity}</span>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Add one ${line.dishNameSnapshot}`}
                      onClick={() => queueAdd(line.dishId)}
                      className="size-7 rounded-full bg-[oklch(0.879_0.033_85)] text-[15px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                    >
                      +
                    </button>
                    <span className="w-14 text-right font-bold tnum text-[oklch(0.232_0.019_70)]">
                      {formatMoney(line.total, currency)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!hasItems && (
          <div className="flex flex-col items-center gap-3 py-6">
            <p className="text-[12px] text-[oklch(0.463_0.031_74)]">No items on this bill.</p>
            <button
              type="button"
              disabled={busy}
              onClick={onEndSession}
              className="rounded-full bg-[oklch(0.879_0.033_85)] px-4 py-2 text-[11px] font-bold tracking-wide text-[oklch(0.232_0.019_70)] uppercase active:translate-y-px disabled:opacity-40"
            >
              End table session
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !latestOrder}
          onClick={() => setAdding((v) => !v)}
          className={cx("mt-3 w-full rounded-2xl border border-dashed border-[oklch(0.232_0.019_70)]/30 py-2.5 text-[11px] font-bold tracking-[0.14em] text-[oklch(0.463_0.031_74)] uppercase active:translate-y-px disabled:opacity-40", adding ? 'text-red-500' : '')}
        >
          {adding ? 'Close menu' : '+ Add item'}
        </button>

        {adding && (
          <div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto rounded-2xl bg-[oklch(0.879_0.033_85)] p-2">
            {dishes.map((dish) => (
              <button
                key={dish.id}
                type="button"
                disabled={busy}
                onClick={() => queueAdd(dish.id)}
                className="flex w-full items-baseline justify-between rounded-[9px] bg-[oklch(0.943_0.024_85)] px-3 py-2 text-[12px] text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
              >
                <span>{dish.name}</span>
                <span className="font-bold">{formatMoney(dish.price, dish.currency)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="my-3 border-t border-dashed border-[oklch(0.232_0.019_70)]/25" />

        <div className="space-y-1 text-[12px] text-[oklch(0.463_0.031_74)]">
          <div className="flex items-baseline justify-between">
            <span>Subtotal</span>
            <span className="tnum">{formatMoney(subtotal, currency)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span>Service</span>
            <span className="tnum">{formatMoney(serviceCharge, currency)}</span>
          </div>
          <div className="flex items-baseline justify-between">
            <span>Tax</span>
            <span className="tnum">{formatMoney(tax, currency)}</span>
          </div>
          {appliedDiscount > 0 && (
            <div className="flex items-baseline justify-between">
              <span>Discount</span>
              <span className="tnum">−{formatMoney(appliedDiscount, currency)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1">
            <span className={cx(DISPLAY, 'text-[18px] font-black text-[oklch(0.232_0.019_70)]')}>Total</span>
            <span className={cx(DISPLAY, 'text-[26px] leading-none font-black tnum text-[oklch(0.665_0.111_70)]')}>
              {formatMoney(total, currency)}
            </span>
          </div>
        </div>

        {canDiscount && hasItems && (
          <label className="mt-3 flex items-center justify-between gap-3 text-[11.5px] font-semibold text-[oklch(0.463_0.031_74)]">
            Discount
            <span className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">
                {symbolFor(currency)}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={discountText}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value.replace(/[^0-9.]/g, '');
                  setDiscountText(next);
                  const parsed = Number.parseFloat(next);
                  setDiscount(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0);
                }}
                onBlur={() => setDiscountText((appliedDiscount / 100).toFixed(2))}
                className="w-24 rounded-full bg-[oklch(0.879_0.033_85)] py-1.5 pr-3 pl-7 text-right text-[12.5px] font-bold tnum text-[oklch(0.232_0.019_70)] outline-none disabled:opacity-40"
              />
            </span>
          </label>
        )}

        {/* <label className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold text-[oklch(0.463_0.031_74)]">
          <input
            type="checkbox"
            checked={endSessionOnPay}
            disabled={busy}
            onChange={(e) => setEndSessionOnPay(e.target.checked)}
            className="size-3.5 accent-[oklch(0.539_0.163_36)]"
          />
          End this table's session once paid
        </label> */}

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={busy || !hasItems}
            onClick={() => {
              // The draft, collapsed to what's actually being charged — dish + quantity, nothing
              // tied to a specific order row, since the cashier's edits are what defines the bill.
              // Frozen into `committed` rather than settled right away: the next step is picking
              // cash or QR, and neither should let the live bill shift underneath the total shown.
              const merged = new Map<string, number>();
              for (const line of draftLines) merged.set(line.dishId, (merged.get(line.dishId) ?? 0) + line.quantity);
              const items = [...merged.entries()].map(([dishId, quantity]) => ({ dishId, quantity }));

              setCommitted({
                items,
                lines: draftLines.map((l) => ({ dishNameSnapshot: l.dishNameSnapshot, quantity: l.quantity, total: l.total })),
                totals: { currency, subtotal, serviceCharge, tax, discount: appliedDiscount, total },
              });
              setPendingAdds([]);
              setPendingRemoves([]);
              setEndSessionOnPay(false);
              setStep('method');
            }}
            className="col-span-2 rounded-[14px] bg-[oklch(0.539_0.163_36)] py-3.5 text-[14px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] ring-2 ring-[oklch(0.539_0.163_36)]/30 transition-transform active:translate-y-px disabled:opacity-40"
          >
            Take payment
          </button>
          <button
            type="button"
            disabled={!hasItems}
            onClick={() =>
              printReceipt(
                table,
                draftLines.map((l) => ({ dishNameSnapshot: l.dishNameSnapshot, quantity: l.quantity, total: l.total })),
                { currency, subtotal, serviceCharge, tax, discount: appliedDiscount, total },
                restaurantName,
              )
            }
            className="rounded-[14px] bg-[oklch(0.232_0.019_70)] py-3.5 text-[12px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] transition-transform active:translate-y-px disabled:opacity-40"
          >
            Print
          </button>
        </div>
        </>
        )}

        {step === 'method' && committed && (
          <div className="flex flex-col gap-5 py-2">
            <button
              type="button"
              onClick={() => setStep('bill')}
              className="flex w-fit items-center gap-1 text-[11px] font-bold tracking-wide text-[oklch(0.463_0.031_74)] uppercase active:translate-y-px"
            >
              <ChevronLeft size={14} /> Back to bill
            </button>

            <div className="flex flex-col items-center gap-1 py-1 text-center">
              <span className="text-[10px] tracking-[0.14em] text-[oklch(0.463_0.031_74)] uppercase">
                {table.name} · amount due
              </span>
              <span className={cx(DISPLAY, 'text-[34px] leading-none font-black tnum text-[oklch(0.232_0.019_70)]')}>
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void finalize('cash')}
                className="flex flex-col items-center gap-2 rounded-2xl bg-[oklch(0.879_0.033_85)] py-6 text-[oklch(0.232_0.019_70)] ring-2 ring-transparent transition-move active:scale-[0.97] disabled:opacity-40"
              >
                <Cash size={26} />
                <span className="text-[13px] font-bold tracking-wide uppercase">
                  {busy && method === 'cash' ? 'Processing…' : 'Cash'}
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setQrPayload(paymentQrPayload(table, committed.totals.total, committed.totals.currency));
                  setQrProgress(false);
                  setStep('qr');
                }}
                className="flex flex-col items-center gap-2 rounded-2xl bg-[oklch(0.879_0.033_85)] py-6 text-[oklch(0.232_0.019_70)] ring-2 ring-transparent transition-move active:scale-[0.97] disabled:opacity-40"
              >
                <Qr size={26} />
                <span className="text-[13px] font-bold tracking-wide uppercase">Scan to pay</span>
              </button>
            </div>
          </div>
        )}

        {step === 'qr' && committed && qrPayload && (
          <div className="flex flex-col items-center gap-4 py-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('method')}
              className="flex w-fit items-center gap-1 self-start text-[11px] font-bold tracking-wide text-[oklch(0.463_0.031_74)] uppercase active:translate-y-px disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Choose a different method
            </button>

            <span className={cx(DISPLAY, 'text-[28px] leading-none font-black tnum text-[oklch(0.232_0.019_70)]')}>
              {formatMoney(committed.totals.total, committed.totals.currency)}
            </span>

            <div className="size-60 overflow-hidden rounded-2xl">
              <QrImage value={qrPayload} className="w-full h-full" />
            </div>

            <div className="flex items-center gap-2 text-[11.5px] font-semibold text-[oklch(0.463_0.031_74)]">
              <span className="size-2 shrink-0 rounded-full bg-[oklch(0.539_0.163_36)] animate-breathe" aria-hidden />
              Waiting for the scan…
            </div>

            <div className="h-1 w-full max-w-56 overflow-hidden rounded-full bg-[oklch(0.879_0.033_85)]">
              <div
                className="h-full rounded-full bg-[oklch(0.539_0.163_36)] transition-[width] ease-linear"
                style={{ width: qrProgress ? '100%' : '0%', transitionDuration: `${QR_AUTO_MS}ms` }}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void finalize('qr')}
              className="rounded-full px-5 py-2 text-[11.5px] font-bold tracking-wide text-[oklch(0.539_0.163_36)] uppercase ring-1 ring-[oklch(0.539_0.163_36)]/40 active:translate-y-px disabled:opacity-40"
            >
              {busy ? 'Confirming…' : 'Mark as paid now'}
            </button>
          </div>
        )}

        {step === 'done' && committed && (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-[oklch(0.62_0.15_150)]/15 text-[oklch(0.62_0.15_150)]">
              <Check size={30} />
            </span>
            <div>
              <h3 className={cx(DISPLAY, 'text-[24px] font-black text-[oklch(0.232_0.019_70)]')}>Payment successful</h3>
              <p className="mt-1 text-[12.5px] text-[oklch(0.463_0.031_74)]">
                {method === 'cash' ? 'Collected in cash' : 'Paid by QR'} ·{' '}
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </p>
            </div>

            <div className="mt-1 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => printReceipt(table, committed.lines, committed.totals, restaurantName)}
                className="rounded-[14px] bg-[oklch(0.232_0.019_70)] py-3.5 text-[12px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] transition-transform active:translate-y-px"
              >
                Print receipt
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  onClose();
                }}
                className="rounded-[14px] bg-[oklch(0.539_0.163_36)] py-3.5 text-[12px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] transition-transform active:translate-y-px"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function RenameForm({
  table,
  onSave,
  onCancel,
}: {
  table: DiningTable;
  onSave: (name: string, capacity: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(table.name);
  const [capacity, setCapacity] = useState(String(table.capacity));

  return (
    <form
      className="mt-auto grid gap-2 border-t border-hairline p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(name, Number(capacity) || table.capacity);
      }}
    >
      <input
        className={cx(INPUT_BOX, 'py-2')}
        value={name}
        maxLength={30}
        aria-label="Table name"
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex gap-2">
        <input
          className={cx(INPUT_BOX, 'w-20 py-2 tnum')}
          value={capacity}
          inputMode="numeric"
          aria-label="Seats"
          onChange={(e) => setCapacity(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <button type="button" className={cx(ADMIN_GHOST, 'h-9 flex-1')} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={cx(ADMIN_PRIMARY, 'h-9 flex-1')}>
          Save
        </button>
      </div>
    </form>
  );
}
