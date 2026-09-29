import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { isTableOpen } from '../../api/admin';
import { IS_LIVE_API } from '../../api/http';
import {
  addOrderItem,
  completePayment,
  endTableSession,
  fetchOrdersBySession,
  listTables,
  regenerateQr,
  setTableActive,
  startTableSession,
  subscribeToTables,
  updateTable,
} from '../../api/staff';
import { STATUS_LABEL } from '../../domain/orderStatus';
import { useAuth, useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { useNow } from '../../state/useNow';
import { relativeTime } from '../../components/time';
import { QrDialog, printSingleQr, tableUrl } from '../../components/admin/QrCard';
import { PaymentSheet } from '../../components/admin/PaymentSheet';
import { DishPicker, ItemRow, Progress } from '../../components/admin/OrderLines';
import {
  ADMIN_GHOST,
  ADMIN_PRIMARY,
  ADMIN_TINY,
  Confirm,
  Empty,
  Loading,
  PageTitle,
  Panel,
  StatusPill,
  useCommand,
} from '../../components/admin/kit';
import { ChevronLeft, Receipt } from '../../components/icons';
import { SessionCode } from '../../components/Bits';
import { DISPLAY, cx } from '../../components/ui';
import { isOccupied, RenameForm } from './Tables';
import { useDashboard } from './AdminLayout';

/**
 * §29 continued. One table, every action a shift needs on it in one place —
 * including the one the floor plan's cards never offered: seating a table
 * and placing its first order for a diner who can't or won't scan the QR
 * themselves. Everything else here is the exact same handler `Tables.tsx`
 * uses, just scoped to a single table instead of a grid of them.
 */

const TABLE_POLL_MS = 8000;

export function TableDetail() {
  const { tableId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, reloadOrders } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();
  const now = useNow();

  const tables = useAsync(() => listTables(staff), [staff]);
  const reloadTables = tables.reload;

  // Same live-push-or-poll fallback the floor plan uses — a diner scanning in
  // (or another device settling the bill) has to show up here too.
  useEffect(() => {
    if (IS_LIVE_API) return subscribeToTables(reloadTables, reloadTables);
    const timer = setInterval(reloadTables, TABLE_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadTables]);

  const table = tables.data?.find((t) => t.id === tableId) ?? null;
  const editable = allows('tables:edit');
  const canOrder = allows('orders:advance');

  const sessionId = table?.currentSessionId ?? null;
  const visit = useAsync(() => (sessionId ? fetchOrdersBySession(staff, sessionId) : Promise.resolve([])), [sessionId]);
  const visitOrders = visit.data ?? [];
  const openCount = visitOrders.filter((o) => isTableOpen(o.status)).length;
  // Newest round first — one separated section per order, the same separation Payments gives each day.
  const orderedVisitOrders = useMemo(
    () => [...visitOrders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [visitOrders],
  );

  const [renaming, setRenaming] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [billing, setBilling] = useState(false);
  const [pickingDish, setPickingDish] = useState(false);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then((ok) => {
      if (!ok) return;
      tables.reload();
      visit.reload();
      reloadOrders();
    });

  const endSession = () => {
    if (!table) return;
    void run(table.id, () => endTableSession(staff, table.id), `${table.name}'s visit ended`).then((ok) => {
      if (!ok) return;
      setBilling(false);
      tables.reload();
      visit.reload();
    });
  };

  if (tables.loading && !table) return <Loading label="Opening the table…" />;

  if (!table) {
    return (
      <Empty
        emoji="🔍"
        title="This table doesn't exist"
        message="It may have been renamed or removed. Head back to the floor plan to find it."
        action={
          <Link to="/admin/tables" className={ADMIN_PRIMARY}>
            Back to tables
          </Link>
        }
      />
    );
  }

  const occupied = isOccupied(table);
  const disabled = !table.isActive;
  const url = tableUrl(menu.restaurant.slug, table);
  const menuDishes = menu.dishes.filter((d) => !d.isArchived && d.isAvailable);
  const oldest = visitOrders.reduce<string | null>(
    (min, o) => (min === null || o.createdAt < min ? o.createdAt : min),
    null,
  );
  const elapsedMinutes = oldest ? Math.max(0, Math.floor((Date.now() - Date.parse(oldest)) / 60_000)) : 0;

  return (
    <>
      <PageTitle
        title={table.name}
        subtitle={`${table.capacity} seat${table.capacity === 1 ? '' : 's'} · ${
          disabled ? 'Disabled' : occupied ? `Occupied · ${elapsedMinutes}m elapsed` : 'Free'
        }`}
        action={
          <Link to="/admin/tables" className={cx(ADMIN_GHOST, 'gap-1.5')}>
            <ChevronLeft size={15} /> All tables
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="grid gap-4">
          {!occupied ? (
            <Panel title="No one seated here yet">
              <Empty
                emoji="🪑"
                title={disabled ? 'This table is disabled' : 'This table is free'}
                message={
                  disabled
                    ? 'Enable it from the panel on the right before seating anyone.'
                    : canOrder
                      ? "If a diner can't or won't scan the QR themselves, seat them here and place their order on their behalf — the same visit a scan would have started."
                      : 'Ask a manager to seat this table.'
                }
                action={
                  canOrder &&
                  !disabled && (
                    <button
                      type="button"
                      className={ADMIN_PRIMARY}
                      disabled={busy}
                      onClick={() => act('seat', () => startTableSession(staff, table.id), `${table.name} seated`)}
                    >
                      {pending === 'seat' ? 'Seating…' : 'Seat this table'}
                    </button>
                  )
                }
              />
            </Panel>
          ) : (
            <>
              <Panel
                title="Current visit"
                hint={`${openCount} open order${openCount === 1 ? '' : 's'}`}
                action={
                  canOrder && (
                    <button type="button" className={cx(ADMIN_PRIMARY, 'gap-1.5')} onClick={() => setBilling(true)}>
                      <Receipt size={14} /> Bill / settle
                    </button>
                  )
                }
                bare
              >
                {canOrder && (
                  <div className="p-4">
                    {pickingDish ? (
                      <DishPicker
                        menu={menu}
                        busy={busy}
                        onClose={() => setPickingDish(false)}
                        onPick={(dish) =>
                          act(`add:${dish.id}`, () => addOrderItem(staff, table.id, dish.id), `${dish.name} added for the table`)
                        }
                      />
                    ) : (
                      <button type="button" className={cx(ADMIN_GHOST, 'w-full justify-center')} onClick={() => setPickingDish(true)}>
                        + Add a dish for the diner
                      </button>
                    )}
                  </div>
                )}
                </Panel>
                <div className="">
                {visit.loading && visitOrders.length === 0 ? (
                  <Loading label="Reading the visit…" />
                ) : visitOrders.length === 0 ? (
                  <div className={cx(canOrder && 'border-t border-hairline', 'p-4')}>
                    <Empty title="Nothing ordered yet" message="Add the diner's first dish above and it starts their order." />
                  </div>
                ) : (
                  // Each order is its own separated section — a stronger divider and its own
                  // heading + item count, the same separation Payments gives each day.
                  <>
                    {orderedVisitOrders.map((order) => (
                      <div key={order.id} className="overflow-hidden rounded-[28px] bg-docket-surface text-docket-ink ring-1 ring-docket-line p-6 mb-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <h3 className={cx(DISPLAY, 'text-[15px] tnum')}>{order.reference}</h3>
                          <span className="shrink-0 text-[11px] font-bold tracking-wide text-ink-4 uppercase">
                            {order.items.length} item{order.items.length === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-3">
                          <span className="text-[12px] text-ink-4">{relativeTime(order.createdAt)}</span>
                          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
                        </div>
                        <Progress order={order} className="mt-2 rounded-full" />
                        <ul className="mt-2 divide-y divide-hairline">
                          {order.items.map((item) => (
                            <ItemRow
                              key={item.id}
                              order={order}
                              item={item}
                              now={now}
                              canEdit={isTableOpen(order.status) && canOrder}
                              onApply={() => {
                                visit.reload();
                                reloadOrders();
                              }}
                              onResync={() => visit.reload()}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4">
          {occupied && table.currentSessionToken && (
            <Panel title="Session code" hint="What a diner reads back to join from their own phone">
              <SessionCode label="Session code" token={table.currentSessionToken} />
            </Panel>
          )}

          <Panel title="QR code">
            <div className="grid gap-2">
              <button type="button" className={ADMIN_GHOST} onClick={() => setShowQr(true)}>
                Show QR
              </button>
              <button
                type="button"
                className={ADMIN_GHOST}
                onClick={() => {
                  void navigator.clipboard?.writeText(url);
                  push('Table link copied');
                }}
              >
                Copy link
              </button>
              <button type="button" className={ADMIN_GHOST} onClick={() => printSingleQr(table, menu.restaurant.name, url)}>
                Print this code
              </button>
              {editable && (
                <Confirm
                  label="Regenerate code"
                  question="Void the printed code?"
                  confirmLabel="Regenerate"
                  disabled={busy}
                  className="justify-center"
                  onConfirm={() =>
                    act(table.id, () => regenerateQr(staff, table.id), `${table.name} has a new code — reprint it`)
                  }
                />
              )}
            </div>
          </Panel>

          {editable && (
            <Panel title="Table settings">
              {renaming ? (
                <RenameForm
                  table={table}
                  onCancel={() => setRenaming(false)}
                  onSave={(nextName, nextCapacity) => {
                    setRenaming(false);
                    act(table.id, () => updateTable(staff, table.id, { name: nextName, capacity: nextCapacity }), 'Table updated');
                  }}
                />
              ) : (
                <div className="grid gap-2">
                  <button type="button" className={ADMIN_GHOST} onClick={() => setRenaming(true)}>
                    Rename / change seats
                  </button>
                  <button
                    type="button"
                    className={ADMIN_GHOST}
                    disabled={busy}
                    onClick={() =>
                      act(
                        table.id,
                        () => setTableActive(staff, table.id, !table.isActive),
                        table.isActive ? `${table.name} disabled` : `${table.name} is seating again`,
                      )
                    }
                  >
                    {disabled ? 'Enable table' : 'Disable table'}
                  </button>
                </div>
              )}
            </Panel>
          )}

          {occupied && (
            <Panel title="End this visit" hint="Clears the table for the next party">
              <Confirm
                label="End session"
                question="End the visit with the bill still open?"
                confirmLabel="End it"
                disabled={busy}
                className={cx(ADMIN_TINY, 'w-full justify-center bg-berry/10 text-berry ring-1 ring-berry/25 ring-inset')}
                onConfirm={endSession}
              />
            </Panel>
          )}
        </div>
      </div>

      <QrDialog
        table={showQr ? table : null}
        url={url}
        restaurantName={menu.restaurant.name}
        onClose={() => setShowQr(false)}
        onCopy={(copied) => {
          void navigator.clipboard?.writeText(copied);
          push('Table link copied');
        }}
      />

      <PaymentSheet
        table={billing ? table : null}
        orders={visitOrders}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setBilling(false)}
        onSettle={(changes) => {
          if (!table.currentSessionId) return Promise.resolve(false);
          const currentSessionId = table.currentSessionId;
          return run(
            table.id,
            () => completePayment(staff, currentSessionId, changes.items, changes.method, changes.discount, changes.endSession),
            changes.endSession ? `${table.name} paid up and cleared` : `${table.name} paid up`,
          ).then((ok) => {
            if (ok) {
              reloadOrders();
              visit.reload();
              if (changes.endSession) tables.reload();
            }
            return ok;
          });
        }}
        onEndSession={endSession}
        onShowQr={() => {
          setBilling(false);
          setShowQr(true);
        }}
      />
    </>
  );
}
