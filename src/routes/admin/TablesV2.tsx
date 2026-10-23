import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { isTableOpen } from '../../api/admin';
import { IS_LIVE_API } from '../../api/http';
import { completePayment, createTable, endTableSession, fetchOrdersBySession, listTables } from '../../api/staff';
import type { DiningTable, Order } from '../../domain/types';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { useNow } from '../../state/useNow';
import { QrDialog, printQrSheet, tableUrl } from '../../components/admin/QrCard';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { ADMIN_GHOST, ADMIN_PRIMARY, INPUT_BOX, Loading, useCommand } from '../../components/admin/kit';
import { Plus, Qr, Receipt } from '../../components/icons';
import { QuantityStepper } from '../../components/Bits';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { haptic } from '../../platform/haptics';
import { isOccupied } from './Tables';
import { useDashboard } from './AdminLayout';

/*
 * Tables, take two.
 *
 * The floor as a set of plain tiles — a table's name, whether someone is at it,
 * and for how long. The whole tile opens the table; the only buttons left on it
 * are the two a shift reaches for from the floor (settle, QR). Everything else
 * (rename, disable, end the visit) lives on the table's own page, and adding a
 * table is just the last tile opening into a form.
 */

const TABLES_POLL_MS = 8000;

type Floor = 'all' | 'free' | 'occupied';

/** The floor filter — the same chips as Profit & loss's period picker. */
function FloorFilter({
  value,
  onChange,
  options,
}: {
  value: Floor;
  onChange: (v: Floor) => void;
  options: { value: Floor; label: string; count: number }[];
}) {
  return (
    <div className="mb-6 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]" role="group" aria-label="Filter tables">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} className={cx(CHIP, value === o.value ? CHIP_ON : CHIP_OFF)} onClick={() => onChange(o.value)}>
          {o.label} · {o.count}
        </button>
      ))}
    </div>
  );
}

export function TablesV2() {
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, orders, reloadOrders, tablesTick } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();
  const now = useNow(30_000);

  const tables = useAsync(() => listTables(staff), [staff]);
  const reloadTables = tables.reload;

  // Live, `AdminLayout` bumps `tablesTick` the moment a session starts or ends; the mock has no server to push from, so it polls.
  useEffect(() => {
    if (IS_LIVE_API) return;
    const timer = setInterval(reloadTables, TABLES_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadTables]);
  useEffect(() => {
    if (tablesTick) reloadTables();
  }, [tablesTick, reloadTables]);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [seats, setSeats] = useState(4);
  const [qrId, setQrId] = useState<string | null>(null);
  const [billId, setBillId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Floor>('all');

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
  const visibleRows = rows.filter((t) => (filter === 'free' ? !isOccupied(t) : filter === 'occupied' ? isOccupied(t) : true));

  const act = (key: string, action: () => Promise<unknown>, message: string) => void run(key, action, message).then(tables.reload);

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
  // The full visit, completed rounds included — a cashier should see what was already served and paid this session.
  const billOrders = bill.data ?? [];
  const menuDishes = menu.dishes.filter((d) => !d.isArchived && d.isAvailable);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8 flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div>
          <h1 className={cx(DISPLAY, 'text-[clamp(38px,7vw,64px)] leading-[0.98] tracking-[-0.03em]')}>Tables</h1>
          <p className="mt-3 text-[14px] text-ink-3 tnum">
            {active.length} seating · <span className={occupiedCount > 0 ? 'font-semibold text-flame-1' : undefined}>{occupiedCount} occupied</span>
            {rows.length - active.length > 0 && ` · ${rows.length - active.length} disabled`}
          </p>
        </div>
        {rows.length > 0 && (
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
        )}
      </header>

      {rows.length > 0 && (
        <FloorFilter
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All', count: rows.length },
            { value: 'free', label: 'Free', count: rows.length - occupiedCount },
            { value: 'occupied', label: 'Occupied', count: occupiedCount },
          ]}
        />
      )}

      {tables.loading && rows.length === 0 ? (
        <Loading label="Reading the floor plan…" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleRows.length === 0 && rows.length > 0 && (
            <li className="col-span-full py-10 text-center text-[13.5px] text-ink-3">No tables match this filter.</li>
          )}
          {visibleRows.map((table, n) => {
            const occupied = isOccupied(table);
            const disabled = !table.isActive;
            const open = openByTable.get(table.id) ?? [];
            const oldest = open.reduce<number | null>((min, o) => {
              const t = Date.parse(o.createdAt);
              return min === null || t < min ? t : min;
            }, null);
            const minutes = oldest === null ? null : Math.max(0, Math.floor((now - oldest) / 60_000));
            return (
              <li key={table.id} className="animate-rise" style={{ animationDelay: `${Math.min(n, 12) * 40}ms` }}>
                <article
                  className={cx(
                    'group relative flex aspect-[4/3] flex-col justify-between rounded-3xl p-4 transition-[translate,box-shadow,background-color] duration-300 ease-out-quart hover:-translate-y-0.5',
                    occupied ? 'bg-flame-2/10 ring-1 ring-flame-2/35 ring-inset' : 'bg-surface ring-1 ring-hairline ring-inset hover:bg-surface-2',
                    disabled && 'opacity-55',
                    pending === table.id && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/admin/tables/${table.id}`}
                      className={cx(DISPLAY, 'min-w-0 truncate text-[26px] leading-none after:absolute after:inset-0 after:rounded-3xl sm:text-[30px]', !occupied && 'text-ink-2')}
                    >
                      {table.name}
                    </Link>
                    <span
                      aria-hidden
                      className={cx('mt-1.5 size-2.5 shrink-0 rounded-full', disabled ? 'bg-ink-4/50' : occupied ? 'animate-breathe bg-flame-2' : 'bg-mint')}
                    />
                  </div>

                  <div className="flex items-end justify-between gap-2">
                    <p className="min-w-0 text-[12.5px] leading-snug text-ink-3">
                      <span className={cx('block font-semibold', disabled ? 'text-ink-4' : occupied ? 'text-flame-1' : 'text-mint')}>
                        {disabled ? 'Off' : occupied ? (minutes !== null ? `${minutes}m` : 'Seated') : 'Free'}
                      </span>
                      <span className="tnum">
                        {table.capacity} seat{table.capacity === 1 ? '' : 's'}
                        {occupied && open.length > 0 && ` · ${open.length} open`}
                      </span>
                    </p>
                    <span className="relative z-10 flex shrink-0 gap-1.5">
                      {occupied && canSettle && (
                        <button
                          type="button"
                          aria-label={`Settle ${table.name}`}
                          title="Settle payment"
                          disabled={pending === table.id}
                          onClick={() => {
                            haptic.select();
                            setBillId(table.id);
                          }}
                          className="grid size-9 place-items-center rounded-full bg-flame text-white shadow-flame transition-transform duration-200 ease-spring hover:scale-110 active:scale-90"
                        >
                          <Receipt size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        data-tour="table-qr"
                        aria-label={`QR code for ${table.name}`}
                        title="QR code"
                        onClick={() => setQrId(table.id)}
                        className="grid size-9 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-[color,scale] duration-200 ease-spring hover:scale-110 hover:text-ink active:scale-90"
                      >
                        <Qr size={16} />
                      </button>
                    </span>
                  </div>
                </article>
              </li>
            );
          })}

          {editable && filter === 'all' && (
            <li className="animate-rise" style={{ animationDelay: `${Math.min(visibleRows.length, 12) * 40}ms` }}>
              {adding ? (
                <form
                  data-tour="add-table"
                  className="flex aspect-[4/3] min-h-44 animate-pop flex-col justify-between gap-2 rounded-3xl bg-surface p-4 ring-1 ring-flame-2/40 ring-inset max-sm:col-span-2 max-sm:aspect-auto"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (name.trim().length < 1) return;
                    act('new', () => createTable(staff, name, seats), `${name.trim()} added`);
                    setName('');
                    setSeats(4);
                    setAdding(false);
                  }}
                >
                  <input
                    className={cx(INPUT_BOX, 'py-2')}
                    value={name}
                    maxLength={30}
                    autoFocus
                    placeholder="Table 15"
                    aria-label="Table name"
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-ink-3">Seats</span>
                    <QuantityStepper value={seats} onChange={setSeats} size="sm" min={1} />
                  </div>
                  <button type="submit" className={cx(ADMIN_PRIMARY, 'h-9 w-full')} disabled={busy || name.trim().length < 1}>
                    {pending === 'new' ? 'Adding…' : 'Add table'}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  data-tour="add-table"
                  onClick={() => setAdding(true)}
                  className="group flex aspect-[4/3] w-full flex-col items-center justify-center gap-2.5 rounded-3xl border border-dashed border-hairline-strong text-[14px] font-semibold text-ink-3 transition-[color,border-color,background-color] duration-200 hover:border-flame-2/60 hover:bg-flame-2/5 hover:text-ink max-sm:aspect-auto max-sm:min-h-32"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-flame-2/15 text-flame-1 transition-transform duration-300 ease-spring group-hover:rotate-90">
                    <Plus size={16} />
                  </span>
                  Add a table
                </button>
              )}
            </li>
          )}
        </ul>
      )}

      {editable && adding && (
        <p className="mt-4 animate-rise text-[12.5px] leading-relaxed text-ink-4">
          A new table gets its own token straight away. Print its code before the next service.
        </p>
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
          const currentSessionId = billTable.currentSessionId;
          return run(
            billTable.id,
            () => completePayment(staff, currentSessionId, changes.items, changes.method, changes.discount, changes.endSession, changes.redeemPoints, changes.customerId, changes.credit, changes.paidNow, changes.dueInDays),
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
    </div>
  );
}
