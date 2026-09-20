import { useEffect, useMemo, useState } from 'react';
import { isTableOpen, STATUS_LABEL } from '../../api/admin';
import {
  completePayment,
  createTable,
  endTableSession,
  fetchOrdersBySession,
  listTables,
  regenerateQr,
  setTableActive,
  updateTable,
} from '../../api/staff';
import type { DiningTable, Dish, Order, OrderStatus } from '../../domain/types';
import { formatMoney, percentOf } from '../../domain/money';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { QrDialog, printQrSheet, tableUrl } from '../../components/admin/QrCard';
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
  TextInput,
  useCommand,
} from '../../components/admin/kit';
import { Receipt } from '../../components/icons';
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

export function Tables() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, orders, reloadOrders } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();

  const tables = useAsync(() => listTables(staff), [staff]);
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
        <div className="flex gap-1.5 pb-1">
          {(
            [
              ['all', 'All', rows.length],
              ['free', 'Free', rows.length - occupiedCount],
              ['occupied', 'Occupied', occupiedCount],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cx(
                'rounded-full px-3 py-1.5 text-[11px] font-bold tracking-wide uppercase transition-colors',
                filter === key ? 'bg-flame text-white shadow-flame' : 'bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset hover:text-ink',
              )}
            >
              {label} · {count}
            </button>
          ))}
        </div>
      )}

      {tables.loading && rows.length === 0 ? (
        <Loading label="Reading the floor plan…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
          if (!billTable || !billTable.currentSessionId) return;
          const sessionId = billTable.currentSessionId;
          void run(
            billTable.id,
            () => completePayment(staff, sessionId, changes.items, changes.endSession),
            changes.endSession ? `${billTable.name} paid up and cleared` : `${billTable.name} paid up`,
          ).then((ok) => {
            if (!ok) return;
            reloadOrders();
            bill.reload();
            if (changes.endSession) tables.reload();
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
  const due = openOrders.reduce((sum, o) => sum + o.total, 0);
  const currency = openOrders[0]?.currency;
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
        {occupied && currency ? (
          <span className={cx(DISPLAY, 'text-[16px] tnum text-flame-1')}>{formatMoney(due, currency)}</span>
        ) : (
          <span className="text-[12px] text-ink-4">—</span>
        )}
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
              <button
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
              />
              <Confirm
                label="End session"
                question={occupied ? 'End the visit with the bill still open?' : 'Clear this table for the next visit?'}
                confirmLabel="End it"
                disabled={busy}
                className="h-6 px-2 text-[10px]"
                onConfirm={on.onEndSession}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

interface ReceiptLine {
  dishNameSnapshot: string;
  quantity: number;
  unitPrice: number;
}

interface ReceiptTotals {
  currency: string;
  subtotal: number;
  serviceCharge: number;
  tax: number;
  total: number;
}

function printReceipt(table: DiningTable, lines: ReceiptLine[], totals: ReceiptTotals, restaurantName: string): boolean {
  const sheet = window.open('', '_blank', 'width=420,height=640');
  if (!sheet) return false;

  const { currency, subtotal, serviceCharge, tax, total } = totals;
  const rows = lines
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.dishNameSnapshot)}</td><td class="num">${i.quantity}</td><td class="num"><b>${formatMoney(i.unitPrice * i.quantity, currency)}</b></td></tr>`,
    )
    .join('');

  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(table.name)} receipt</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { width: 320px; margin: 0 auto; }
    .center { text-align: center; }
    .muted { color: #6a5a45; font-size: 11px; }
    .rule { border-top: 1px dashed rgba(33,26,17,.35); margin: 12px 0; }
    .row { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin: 6px 0; }
    .items { width: 100%; border-collapse: collapse; font-size: 12px; }
    .items th { padding-bottom: 6px; border-bottom: 1px dashed rgba(33,26,17,.35); text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #6a5a45; }
    .items td { padding: 6px 0; vertical-align: top; }
    .items th.num, .items td.num { text-align: right; white-space: nowrap; padding-left: 10px; }
    .total { font-weight: 900; font-size: 20px; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <div class="sheet">
    <div class="center">
      <h1 style="font-size:22px;margin:0">${escapeHtml(restaurantName)}</h1>
      <p class="muted" style="margin:6px 0 0">${escapeHtml(table.name)} · ${table.capacity} seats</p>
    </div>
    <div class="rule"></div>
    <table class="items">
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rule"></div>
    <div class="row"><span>Subtotal</span><span>${formatMoney(subtotal, currency)}</span></div>
    <div class="row"><span>Service</span><span>${formatMoney(serviceCharge, currency)}</span></div>
    <div class="row"><span>Tax</span><span>${formatMoney(tax, currency)}</span></div>
    <div class="row" style="align-items:baseline"><span style="font-size:16px;font-weight:900">Total</span><span class="total">${formatMoney(total, currency)}</span></div>
    <div class="rule"></div>
    <p class="center muted">Thank you · ${new Date().toLocaleString()}</p>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}

interface DraftLine {
  rowId: string;
  orderId: string;
  itemId: string | null;
  dishId: string;
  dishNameSnapshot: string;
  notes: string;
  unitPrice: number;
  quantity: number;
  orderStatus: OrderStatus;
  /** Already fired to the kitchen and served — anything else on the bill is still on its way out. */
  served: boolean;
}

interface PendingBillChanges {
  items: { dishId: string; quantity: number }[];
  endSession: boolean;
}

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
  onSettle: (changes: PendingBillChanges) => void;
  onShowQr: () => void;
  onEndSession: () => void;
}) {
  const [adding, setAdding] = useState(false);
  // Edits made in the sheet are a draft until "Take payment" — closing without
  // paying (or backdrop-clicking) discards them, nothing was ever sent.
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<{ orderId: string; itemId: string }[]>([]);
  const [_endSessionOnPay, setEndSessionOnPay] = useState(false);

  // The sheet stays mounted (just hidden) between tables, so its own UI state
  // — the dish picker being expanded, any unsent edits — has to be reset by
  // hand on every close or table switch, or it carries over into whatever
  // opens next.
  useEffect(() => {
    setAdding(false);
    setPendingAdds([]);
    setPendingRemoves([]);
    setEndSessionOnPay(false);
  }, [table?.id]);

  if (!table) return null;

  const currency = orders[0]?.currency ?? '';
  // Adds always land on the table's single most recent order, whatever its status — matches the backend.
  const latestOrder = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];

  const removeCounts = new Map<string, number>();
  for (const r of pendingRemoves) removeCounts.set(r.itemId, (removeCounts.get(r.itemId) ?? 0) + 1);
  const addCounts = new Map<string, number>();
  for (const dishId of pendingAdds) addCounts.set(dishId, (addCounts.get(dishId) ?? 0) + 1);

  // Everything the session order API hands back is payable — a cancelled order is the one exception,
  // since it was voided and never fulfilled. Served (COMPLETED) items and the ones still on their way
  // out both count toward the bill; they're only split into separate lines so the cashier can see what
  // hasn't reached the table yet.
  const draftLines: DraftLine[] = [];
  for (const order of orders) {
    if (order.status === 'CANCELLED') continue;
    for (const item of order.items) {
      const remaining = item.quantity - (removeCounts.get(item.id) ?? 0);
      if (remaining <= 0) continue;

      const added = order.id === latestOrder?.id ? (addCounts.get(item.dishId) ?? 0) : 0;
      if (added > 0) addCounts.delete(item.dishId);

      draftLines.push({
        rowId: item.id,
        orderId: order.id,
        itemId: item.id,
        dishId: item.dishId,
        dishNameSnapshot: item.dishNameSnapshot,
        notes: item.notes,
        unitPrice: item.unitPrice,
        quantity: remaining + added,
        orderStatus: order.status,
        served: order.status === 'COMPLETED',
      });
    }
  }
  // Whatever's left in addCounts is a dish with no existing line on the latest order yet.
  if (latestOrder) {
    for (const [dishId, quantity] of addCounts) {
      const dish = dishes.find((d) => d.id === dishId);
      if (!dish) continue;
      draftLines.push({
        rowId: `draft-${dishId}`,
        orderId: latestOrder.id,
        itemId: null,
        dishId,
        dishNameSnapshot: dish.name,
        notes: '',
        unitPrice: dish.price,
        quantity,
        orderStatus: latestOrder.status,
        served: latestOrder.status === 'COMPLETED',
      });
    }
  }

  const queueAdd = (dishId: string) => setPendingAdds((prev) => [...prev, dishId]);

  const queueRemove = (line: DraftLine) => {
    // A unit with no real item id was never sent to the server (a brand-new dish, or the fresh top-up on
    // a closed-out order) — cancel the queued add locally instead of recording a removal against nothing.
    if (!line.itemId) {
      const idx = pendingAdds.lastIndexOf(line.dishId);
      if (idx !== -1) setPendingAdds((prev) => [...prev.slice(0, idx), ...prev.slice(idx + 1)]);
      return;
    }
    setPendingRemoves((prev) => [...prev, { orderId: line.orderId, itemId: line.itemId! }]);
  };

  const openOrderCount = orders.filter((o) => isTableOpen(o.status)).length;
  const hasItems = draftLines.length > 0;
  const subtotal = draftLines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const serviceCharge = percentOf(subtotal, serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, taxRate);
  const total = subtotal + serviceCharge + tax;
  const busy = pending === table.id;
  const oldest = orders.reduce<string | null>(
    (min, o) => (min === null || o.createdAt < min ? o.createdAt : min),
    null,
  );
  const elapsedMinutes = oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 60_000)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm"
      onClick={() => {
        setAdding(false);
        onClose();
      }}
      role="presentation"
    >
      <div
        className="animate-dock-in mx-auto max-h-[88svh] w-full max-w-4xl overflow-y-auto rounded-t-4xl bg-[oklch(0.943_0.024_85)] px-4 pt-3 pb-6 font-mono shadow-[0_-8px_30px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${table.name} bill`}
      >
        <div className="mb-1 flex justify-center">
          <div className="size-3 rounded-full bg-[oklch(0.232_0.019_70)]/20 ring-4 ring-[oklch(0.943_0.024_85)]" />
        </div>

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
                      {formatMoney(line.unitPrice * line.quantity, currency)}
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
          <div className="flex items-baseline justify-between pt-1">
            <span className={cx(DISPLAY, 'text-[18px] font-black text-[oklch(0.232_0.019_70)]')}>Total</span>
            <span className={cx(DISPLAY, 'text-[26px] leading-none font-black tnum text-[oklch(0.665_0.111_70)]')}>
              {formatMoney(total, currency)}
            </span>
          </div>
        </div>

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
              const merged = new Map<string, number>();
              for (const line of draftLines) merged.set(line.dishId, (merged.get(line.dishId) ?? 0) + line.quantity);
              const items = [...merged.entries()].map(([dishId, quantity]) => ({ dishId, quantity }));

              // Cleared eagerly: once this is committed, the server owns this state — the
              // reload after settling replaces it with the real thing, not this draft again.
              setPendingAdds([]);
              setPendingRemoves([]);
              setEndSessionOnPay(false);
              onSettle({ items, endSession: true });
            }}
            className="col-span-2 rounded-[14px] bg-[oklch(0.539_0.163_36)] py-3.5 text-[14px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] ring-2 ring-[oklch(0.539_0.163_36)]/30 transition-transform active:translate-y-px disabled:opacity-40"
          >
            {busy ? 'Taking payment…' : 'Take payment'}
          </button>
          <button
            type="button"
            disabled={!hasItems}
            onClick={() =>
              printReceipt(
                table,
                draftLines.map((l) => ({ dishNameSnapshot: l.dishNameSnapshot, quantity: l.quantity, unitPrice: l.unitPrice })),
                { currency, subtotal, serviceCharge, tax, total },
                restaurantName,
              )
            }
            className="rounded-[14px] bg-[oklch(0.232_0.019_70)] py-3.5 text-[12px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] transition-transform active:translate-y-px disabled:opacity-40"
          >
            Print
          </button>
        </div>

        {/* <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onShowQr}
            className="rounded-[14px] bg-[oklch(0.879_0.033_85)] py-3 text-[12px] font-bold tracking-wide text-[oklch(0.232_0.019_70)] transition-transform active:translate-y-px"
          >
            Print table QR
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              onClose();
            }}
            className="rounded-[14px] py-3 text-[12px] font-bold tracking-wide text-[oklch(0.539_0.163_36)] ring-1 ring-[oklch(0.539_0.163_36)]/40 transition-transform active:translate-y-px"
          >
            Close
          </button>
        </div> */}
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
