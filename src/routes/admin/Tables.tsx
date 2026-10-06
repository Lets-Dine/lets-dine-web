import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isTableOpen } from '../../api/admin';
import { IS_LIVE_API } from '../../api/http';
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
import type { DiningTable, Order } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { QrDialog, printQrSheet, tableUrl } from '../../components/admin/QrCard';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
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
import { Receipt } from '../../components/icons';
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
export function isOccupied(table: DiningTable): boolean {
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
      if (!order.tableId || !isTableOpen(order.status)) continue;
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
                const opened = printQrSheet(active, menu.restaurant.name, menu.restaurant.slug, menu.restaurant.logoUrl || undefined);
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
        logoUrl={menu.restaurant.logoUrl || undefined}
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
        vatPanNumber={menu.restaurant.vatPanNumber}
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
        <Link
          to={`/admin/tables/${table.id}`}
          className={cx(
            DISPLAY,
            'truncate text-[26px] leading-none font-black transition-colors hover:text-flame-2',
            occupied ? 'text-ink' : 'text-ink-2',
          )}
        >
          {table.name}
        </Link>
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
          <Link
            to={`/admin/tables/${table.id}`}
            className="rounded-md px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-ink-4 uppercase ring-1 ring-hairline ring-inset transition-colors hover:text-flame-1 hover:ring-flame-2/40"
          >
            Details
          </Link>
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


export function RenameForm({
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
