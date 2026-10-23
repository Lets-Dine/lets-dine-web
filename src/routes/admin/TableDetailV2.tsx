import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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
import type { Dish } from '../../domain/types';
import { DishOptionsDialog, orderableOptions } from '../../components/admin/DishOptionsDialog';
import type { DishSelection } from '../../components/admin/DishOptionsDialog';
import { ItemRow, Progress } from '../../components/admin/OrderLines';
import { DishTilePicker } from '../../components/admin/DishTilePicker';
import { useCountUp } from '../../components/admin/profile';
import { formatMoney } from '../../domain/money';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Confirm, Empty, Loading, StatusPill, useCommand } from '../../components/admin/kit';
import { Check, ChevronLeft, Plus, Receipt, X } from '../../components/icons';
import { QuantityStepper, SessionCode } from '../../components/Bits';
import { DISPLAY, cx } from '../../components/ui';
import { haptic } from '../../platform/haptics';
import { isOccupied, RenameForm } from './Tables';
import { useDashboard } from './AdminLayout';

/*
 * Table detail, take two.
 *
 * Same handlers as `TableDetail` — seat, order on a diner's behalf, bill, end the
 * visit, QR, rename, disable — arranged by how a shift actually uses them: what is
 * happening at the table first (add to it, see its rounds), the table's own
 * housekeeping off to the side in one quiet column.
 */

const TABLE_POLL_MS = 8000;

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-hairline py-8 first:border-t-0 first:pt-0">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className={cx(DISPLAY, 'text-[24px]')}>{title}</h2>
        {aside && <span className="text-[13px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export function TableDetailV2() {
  const { tableId = '' } = useParams();
  const staff = useStaff();
  const { allows } = useAuth();
  const { menu, reloadOrders, tablesTick } = useDashboard();
  const { pending, busy, run } = useCommand();
  const push = useToast();
  const now = useNow(30_000);

  const tables = useAsync(() => listTables(staff), [staff]);
  const reloadTables = tables.reload;

  // Same live-push-or-poll fallback the floor plan uses — a diner scanning in
  // (or another device settling the bill) has to show up here too.
  useEffect(() => {
    if (IS_LIVE_API) return;
    const timer = setInterval(reloadTables, TABLE_POLL_MS);
    return () => clearInterval(timer);
  }, [reloadTables]);
  useEffect(() => {
    if (tablesTick) reloadTables();
  }, [tablesTick, reloadTables]);

  const table = tables.data?.find((t) => t.id === tableId) ?? null;
  const editable = allows('tables:edit');
  const canOrder = allows('orders:advance');

  const sessionId = table?.currentSessionId ?? null;
  const visit = useAsync(() => (sessionId ? fetchOrdersBySession(staff, sessionId) : Promise.resolve([])), [sessionId]);
  const visitOrders = visit.data ?? [];
  const openCount = visitOrders.filter((o) => isTableOpen(o.status)).length;
  // Newest round first.
  const orderedVisitOrders = useMemo(
    () => [...visitOrders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [visitOrders],
  );

  const [renaming, setRenaming] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [billing, setBilling] = useState(false);
  const [pickingDish, setPickingDish] = useState(false);
  const [copied, setCopied] = useState(false);
  // Dishes staff are still lining up for the diner — nothing exists server-side until "Place order".
  // A line is a dish *and* its variant and extras: a large and a small of the same dish are two lines.
  const [draft, setDraft] = useState<{ key: string; dish: Dish; variantId: string | null; addOnIds: string[]; qty: number }[]>([]);
  // A dish with sizes or extras opens the options dialog first; a plain one goes straight on the ticket.
  const [configuring, setConfiguring] = useState<Dish | null>(null);
  const addToDraft = (dish: Dish, sel: Partial<DishSelection> = {}) => {
    const variantId = sel.variantId ?? null;
    const addOnIds = [...(sel.addOnIds ?? [])].sort();
    const key = [dish.id, variantId, addOnIds.join(',')].join('|');
    const qty = sel.quantity ?? 1;
    setDraft((d) =>
      d.some((l) => l.key === key) ? d.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...d, { key, dish, variantId, addOnIds, qty }],
    );
    haptic.select();
  };
  const pickDish = (dish: Dish) => {
    const { variants, addOns } = orderableOptions(dish, menu);
    if (variants.length > 0 || addOns.length > 0) setConfiguring(dish);
    else addToDraft(dish);
  };
  const changeQty = (key: string, by: number) =>
    setDraft((d) => d.flatMap((l) => (l.key !== key ? [l] : l.qty + by > 0 ? [{ ...l, qty: l.qty + by }] : [])));
  /** "Large · 2× Extra cheese" — what makes two lines of the same dish tell apart. */
  const describe = (l: (typeof draft)[number]) => {
    const parts: string[] = [];
    const variant = l.dish.variants.find((v) => v.id === l.variantId);
    if (variant) parts.push(variant.name);
    for (const id of new Set(l.addOnIds)) {
      const n = l.addOnIds.filter((a) => a === id).length;
      const name = menu.addOns.find((a) => a.id === id)?.name ?? 'Extra';
      parts.push(n > 1 ? `${n}× ${name}` : name);
    }
    return parts.join(' · ');
  };

  // What is already on the ticket, per dish (a large and a small count toward the same tile), and a rough total.
  // Estimate only — the server prices the order when it is placed.
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of draft) c[l.dish.id] = (c[l.dish.id] ?? 0) + l.qty;
    return c;
  }, [draft]);
  const draftTotal = draft.reduce((sum, l) => {
    const unit =
      (l.variantId ? (l.dish.variants.find((v) => v.id === l.variantId)?.price ?? 0) : l.dish.price) +
      l.addOnIds.reduce((a, id) => a + (menu.addOns.find((x) => x.id === id)?.price ?? 0), 0);
    return sum + unit * l.qty;
  }, 0);
  const shownTotal = useCountUp(draftTotal, 400);

  const act = (key: string, action: () => Promise<unknown>, message: string) =>
    void run(key, action, message).then((ok) => {
      if (!ok) return;
      tables.reload();
      visit.reload();
      reloadOrders();
    });

  // The API adds one unit per call and lands on the table's open order (creating it on the first), so commit is a sequence.
  const placeDraft = () =>
    act(
      'place',
      async () => {
        for (const { dish, qty, variantId, addOnIds } of draft)
          for (let i = 0; i < qty; i++) await addOrderItem(staff, table!.id, dish.id, { variantId, addOnIds });
      },
      'Order placed for the table',
    );

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
  const oldest = visitOrders.reduce<string | null>((min, o) => (min === null || o.createdAt < min ? o.createdAt : min), null);
  const elapsedMinutes = oldest ? Math.max(0, Math.floor((now - Date.parse(oldest)) / 60_000)) : 0;
  const draftCount = draft.reduce((n, l) => n + l.qty, 0);

  const copyLink = () => {
    void navigator.clipboard?.writeText(url);
    push('Table link copied');
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="mx-auto w-full max-w-5xl">
      <Link to="/admin/tables" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink">
        <ChevronLeft size={15} /> All tables
      </Link>

      {/* ── Masthead ── */}
      <header className="mb-10 flex animate-rise flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className={cx(DISPLAY, 'wrap-break-word text-[clamp(38px,7vw,64px)] leading-[0.98] tracking-[-0.03em]')}>{table.name}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-3">
            <span className="inline-flex items-center gap-2 font-medium text-ink-2">
              <span
                aria-hidden
                className={cx('size-2.5 rounded-full', disabled ? 'bg-ink-4' : occupied ? 'animate-breathe bg-flame-2' : 'bg-mint')}
              />
              {disabled ? 'Disabled' : occupied ? 'Occupied' : 'Free'}
            </span>
            {occupied && <span className="tnum">{elapsedMinutes}m elapsed</span>}
            <span>
              {table.capacity} seat{table.capacity === 1 ? '' : 's'}
            </span>
          </p>
        </div>
        {occupied && canOrder && (
          <button type="button" className={cx(ADMIN_PRIMARY, 'h-12 gap-2 px-6 text-[15px]')} onClick={() => setBilling(true)}>
            <Receipt size={16} /> Bill / settle
          </button>
        )}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_16rem]">
        {/* ── What is happening at the table ── */}
        <div className="min-w-0">
          {!occupied ? (
            <div className="animate-rise rounded-3xl bg-surface px-6 py-14 text-center ring-1 ring-hairline ring-inset">
              <h2 className={cx(DISPLAY, 'text-[26px]')}>{disabled ? 'This table is disabled' : 'No one seated here yet'}</h2>
              <p className="mx-auto mt-3 max-w-[44ch] text-[14.5px] leading-relaxed text-ink-3">
                {disabled
                  ? 'Enable it from the panel beside this one before seating anyone.'
                  : canOrder
                    ? "If a diner can't or won't scan the QR themselves, seat them here and place their order on their behalf — the same visit a scan would have started."
                    : 'Ask a manager to seat this table.'}
              </p>
              {canOrder && !disabled && (
                <button
                  type="button"
                  className={cx(ADMIN_PRIMARY, 'mt-7 h-12 px-7 text-[15px]')}
                  disabled={busy}
                  onClick={() => {
                    haptic.commit();
                    act('seat', () => startTableSession(staff, table.id), `${table.name} seated`);
                  }}
                >
                  {pending === 'seat' ? 'Seating…' : 'Seat this table'}
                </button>
              )}
            </div>
          ) : (
            <>
              {canOrder && (
                <Section title="Add to the table" aside={draftCount > 0 ? `${draftCount} on the ticket` : undefined}>
                  {pickingDish ? (
                    <DishTilePicker menu={menu} busy={busy} counts={counts} onPick={pickDish} onDone={() => setPickingDish(false)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPickingDish(true)}
                      className="group flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-hairline-strong text-[14.5px] font-semibold text-ink-2 transition-[color,border-color,background-color] duration-200 hover:border-flame-2/60 hover:bg-flame-2/5 hover:text-ink"
                    >
                      <span className="grid size-6 place-items-center rounded-full bg-flame-2/15 text-flame-1 transition-transform duration-300 ease-spring group-hover:rotate-90">
                        <Plus size={14} />
                      </span>
                      Add a dish for the diner
                    </button>
                  )}

                  {draft.length > 0 && (
                    <div className="mt-4 animate-rise rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset">
                      <ul className="divide-y divide-hairline">
                        {draft.map((line) => {
                          const detail = describe(line);
                          return (
                            <li key={line.key} className="flex animate-rise items-center gap-3 py-2.5 first:pt-0">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14.5px] font-semibold">{line.dish.name}</span>
                                {detail && <span className="block truncate text-[12.5px] text-ink-3">{detail}</span>}
                              </span>
                              <QuantityStepper value={line.qty} onChange={(n) => changeQty(line.key, n - line.qty)} size="sm" min={1} />
                              <button
                                type="button"
                                aria-label={`Remove ${line.dish.name}`}
                                onClick={() => changeQty(line.key, -line.qty)}
                                className="grid size-8 place-items-center rounded-full text-ink-4 transition-[color,background-color,scale] hover:bg-surface-2 hover:text-berry active:scale-90"
                              >
                                <X size={15} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="mt-3 flex items-baseline justify-between border-t border-hairline pt-3 text-[13px] text-ink-3">
                        Estimated total
                        <b className="text-[17px] font-bold text-ink tnum">{formatMoney(shownTotal, menu.restaurant.currency)}</b>
                      </p>
                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          className={cx(ADMIN_PRIMARY, 'relative h-11 flex-1 justify-center overflow-hidden')}
                          disabled={busy}
                          onClick={() => {
                            haptic.commit();
                            placeDraft();
                            setDraft([]);
                            setPickingDish(false);
                          }}
                        >
                          <span className="inline-flex items-center gap-2">
                            {pending === 'place' ? 'Placing…' : 'Place order'}
                            <span key={draftCount} className="grid min-w-6 animate-bump place-items-center rounded-full bg-white/20 px-1.5 text-[12.5px] tnum">
                              {draftCount}
                            </span>
                          </span>
                        </button>
                        <button type="button" className={cx(ADMIN_GHOST, 'h-11')} disabled={busy} onClick={() => setDraft([])}>
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              )}

              <Section title="This visit" aside={`${openCount} open order${openCount === 1 ? '' : 's'}`}>
                {visit.loading && visitOrders.length === 0 ? (
                  <Loading label="Reading the visit…" />
                ) : visitOrders.length === 0 ? (
                  <p className="text-[14px] leading-relaxed text-ink-3">Nothing ordered yet. Add dishes above, then place the order when the diner is ready.</p>
                ) : (
                  <div className="grid gap-4">
                    {orderedVisitOrders.map((order, i) => (
                      <article
                        key={order.id}
                        className="animate-rise rounded-3xl bg-docket-surface p-5 text-docket-ink ring-1 ring-docket-line sm:p-6"
                        style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
                      >
                        <header className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className={cx(DISPLAY, 'text-[16px] tnum')}>{order.reference}</h3>
                            <p className="mt-0.5 text-[12.5px] text-ink-4">
                              {relativeTime(order.createdAt)} · {order.items.length} item{order.items.length === 1 ? '' : 's'}
                            </p>
                          </div>
                          <StatusPill status={order.status} label={STATUS_LABEL[order.status]} />
                        </header>
                        <Progress order={order} className="mt-3 rounded-full" />
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
                      </article>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>

        {/* ── The table itself: quiet housekeeping ── */}
        <aside className="grid content-start gap-8 lg:sticky lg:top-24 lg:self-start">
          {occupied && table.currentSessionToken && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold text-ink-3">Session code</h2>
              <SessionCode label="Session code" token={table.currentSessionToken} />
              <p className="mt-2 text-[12.5px] leading-snug text-ink-4">What a diner reads back to join from their own phone.</p>
            </div>
          )}

          <div>
            <h2 className="mb-3 text-[13px] font-semibold text-ink-3">QR code</h2>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-3.5 text-[13px]')} onClick={() => setShowQr(true)}>
                Show
              </button>
              <button type="button" className={cx(ADMIN_GHOST, 'h-9 gap-1.5 px-3.5 text-[13px]', copied && 'text-mint')} onClick={copyLink}>
                {copied ? (
                  <>
                    <Check size={13} /> Copied
                  </>
                ) : (
                  'Copy link'
                )}
              </button>
              <button
                type="button"
                className={cx(ADMIN_GHOST, 'h-9 px-3.5 text-[13px]')}
                onClick={() => printSingleQr(table, menu.restaurant.name, url, menu.restaurant.logoUrl || undefined)}
              >
                Print
              </button>
            </div>
            {editable && (
              <div className="mt-3">
                <Confirm
                  label="Regenerate code"
                  question="Void the printed code?"
                  confirmLabel="Regenerate"
                  disabled={busy}
                  onConfirm={() => act(table.id, () => regenerateQr(staff, table.id), `${table.name} has a new code — reprint it`)}
                />
              </div>
            )}
          </div>

          {editable && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold text-ink-3">Table settings</h2>
              {renaming ? (
                <div className="animate-rise">
                  <RenameForm
                    table={table}
                    onCancel={() => setRenaming(false)}
                    onSave={(nextName, nextCapacity) => {
                      setRenaming(false);
                      act(table.id, () => updateTable(staff, table.id, { name: nextName, capacity: nextCapacity }), 'Table updated');
                    }}
                  />
                </div>
              ) : (
                <ul className="divide-y divide-hairline text-[14px] font-semibold">
                  <li>
                    <button type="button" className="flex h-11 w-full items-center text-ink-2 transition-colors hover:text-ink" onClick={() => setRenaming(true)}>
                      Rename / change seats
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      disabled={busy}
                      className="flex h-11 w-full items-center text-ink-2 transition-colors hover:text-ink disabled:opacity-50"
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
                  </li>
                </ul>
              )}
            </div>
          )}

          {occupied && (
            <div className="border-t border-hairline pt-6">
              <p className="mb-3 text-[12.5px] leading-snug text-ink-4">Ending the visit clears the table for the next party.</p>
              <Confirm
                label="End session"
                question="End the visit with the bill still open?"
                confirmLabel="End it"
                disabled={busy}
                className={cx(ADMIN_TINY, 'w-full justify-center bg-berry/10 text-berry ring-1 ring-berry/25 ring-inset')}
                onConfirm={endSession}
              />
            </div>
          )}
        </aside>
      </div>

      <QrDialog
        table={showQr ? table : null}
        url={url}
        restaurantName={menu.restaurant.name}
        logoUrl={menu.restaurant.logoUrl || undefined}
        onClose={() => setShowQr(false)}
        onCopy={(text) => {
          void navigator.clipboard?.writeText(text);
          push('Table link copied');
        }}
      />

      {configuring && (
        <DishOptionsDialog
          dish={configuring}
          menu={menu}
          onClose={() => setConfiguring(null)}
          onAdd={(sel) => {
            addToDraft(configuring, sel);
            setConfiguring(null);
          }}
        />
      )}
      <PaymentSheet
        table={billing ? table : null}
        orders={visitOrders}
        dishes={menuDishes}
        restaurantName={menu.restaurant.name}
        vatPanNumber={menu.restaurant.vatPanNumber}
        serviceChargeRate={menu.restaurant.serviceChargeRate}
        taxRate={menu.restaurant.taxRate}
        pending={pending}
        onClose={() => setBilling(false)}
        onSettle={(changes) => {
          if (!table.currentSessionId) return Promise.resolve(false);
          const currentSessionId = table.currentSessionId;
          return run(
            table.id,
            () => completePayment(staff, currentSessionId, changes.items, changes.method, changes.discount, changes.endSession, changes.redeemPoints, changes.customerId, changes.credit, changes.paidNow, changes.dueInDays),
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
    </div>
  );
}
