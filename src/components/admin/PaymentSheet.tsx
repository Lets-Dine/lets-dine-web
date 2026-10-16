import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isTableOpen } from '../../api/admin';
import { fetchCustomerLoyalty, listCustomers } from '../../api/customers';
import { STATUS_LABEL } from '../../domain/orderStatus';
import type { BillLine, Dish, Order, OrderStatus, PaymentMethod } from '../../domain/types';
import { formatMoney, percentOf, symbolFor } from '../../domain/money';
import { can } from '../../domain/permissions';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { Cash, Check, ChevronLeft, Contact, Qr, Receipt, Search, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { QrImage } from './QrCard';
import { useDiscardBack } from './useDiscardBack';
import { printReceipt } from './receipt';
import type { ReceiptLine, ReceiptTotals } from './receipt';

/**
 * The bill for one table's visit — read, add, remove, take payment — shared
 * by the floor plan's quick-look modal (`Tables.tsx`), the table detail page,
 * and a single floor order's own bill (`FloorDetail`), so a cashier gets the
 * exact same screen wherever they opened it from.
 */

/** Everything this sheet actually needs from whatever it's billing — a `DiningTable` satisfies
 *  this structurally, and a floor order gets its own lightweight stand-in (see `FloorDetail`). */
export interface BillSubject {
  id: string;
  name: string;
  qrToken: string;
  capacity?: number;
}

/** How long the QR step waits before it settles on its own — a cashier who'd rather not wait can always skip it. */
const QR_AUTO_MS = 8000;

/**
 * There's no payment gateway behind this yet (§ take-payment flow — front end
 * only for now), so this isn't a real charge link. "Dynamic" is what still
 * matters for the till: a fresh reference baked in per attempt, so the code
 * on screen changes every time a payment is started, the way a real one would.
 */
// function paymentQrPayload(subject: BillSubject, amount: number, currency: string): string {
//   const ref = `${subject.qrToken.slice(0, 6)}${Date.now().toString(36)}`.toUpperCase();
//   return `FeastoX-pay://charge?table=${encodeURIComponent(subject.name)}&amount=${amount}&currency=${currency}&ref=${ref}`;
// }

/** One underlying order item a displayed bill line is backed by — a served line can merge several of these. */
interface DraftLineSource {
  orderId: string;
  itemId: string | null;
  quantity: number;
}

interface DraftLine {
  rowId: string;
  dishId: string;
  /** The size and extras this line was ordered with — what it is priced by, and what it must be charged as. */
  variantId: string | null;
  addOnIds: string[];
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
  items: BillLine[];
  method: PaymentMethod;
  /** The cashier's own discount only. Points are sent as points, never folded in here: the server prices them. */
  discount: number;
  redeemPoints: number;
  endSession: boolean;
  /** Left out unless the cashier chose: an id names who the bill is for, null takes it off its customer. */
  customerId?: string | null;
  /** Leave the whole bill owed by the customer instead of taking money now. */
  credit?: boolean;
}

/** What's actually being charged, frozen the moment "Take payment" is tapped — so an in-flight QR
 *  wait (or the reload that follows a successful cash payment) can never shift the total underfoot. */
interface CommittedBill {
  items: BillLine[];
  lines: ReceiptLine[];
  totals: ReceiptTotals;
  /** The part of `totals.discount` the cashier typed; the rest is points. */
  manualDiscount: number;
  redeemPoints: number;
  customerName: string | null;
  customerId?: string | null;
}

/** What makes two bill lines the same thing to charge: the dish *and* the size and extras it came with. */
function lineKey(line: { dishId: string; variantId: string | null; addOnIds: string[] }): string {
  return `${line.dishId}|${line.variantId ?? ''}|${[...line.addOnIds].sort().join(',')}`;
}

type PayStep = 'bill' | 'method' | 'qr' | 'done';

export function PaymentSheet({
  table,
  orders,
  dishes,
  restaurantName,
  vatPanNumber,
  serviceChargeRate,
  taxRate,
  pending,
  onClose,
  onSettle,
  onEndSession,
}: {
  table: BillSubject | null;
  orders: Order[];
  dishes: Dish[];
  restaurantName: string;
  vatPanNumber: string | null;
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

  // Whoever the table's orders were placed for — a linked customer, a delivery recipient or a floor visitor.
  const orderCustomerName = orders.map((o) => o.customerName ?? o.deliveryCustomerName ?? o.floorVisitorName).find((n) => !!n?.trim()) ?? null;

  // Who the cashier chose to bill instead (`null` = nobody); `undefined` means they haven't, so the orders' own customer stands.
  const [picked, setPicked] = useState<{ id: string; name: string } | null | undefined>(undefined);

  const [adding, setAdding] = useState(false);
  // Edits made in the sheet are a draft until "Take payment" — closing without
  // paying (or backdrop-clicking) discards them, nothing was ever sent.
  const [pendingAdds, setPendingAdds] = useState<string[]>([]);
  const [pendingRemoves, setPendingRemoves] = useState<{ orderId: string; itemId: string }[]>([]);
  const [_endSessionOnPay, setEndSessionOnPay] = useState(false);
  // A flat minor-unit reduction the cashier can dial in before taking payment — Manager/Owner only.
  const [discount, setDiscount] = useState(0);
  const [discountText, setDiscountText] = useState('0.00');
  // Points the cashier typed ('' for none). What is actually spent is this, held to what the bill can take.
  const [pointsText, setPointsText] = useState('');
  const pointsId = useId();


  // "Take payment" no longer settles directly — it freezes the bill into `committed` and hands off
  // to a payment-method step. Nothing is charged until cash is confirmed or the QR step resolves.
  const [step, setStep] = useState<PayStep>('bill');
  const [method, setMethod] = useState<'cash' | 'qr' | 'credit' | null>(null);
  const [committed, setCommitted] = useState<CommittedBill | null>(null);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrProgress, setQrProgress] = useState(false);

  // The customer the server will spend points for: the most recent order that has one (it reads the session's orders newest first).
  const orderCustomerId = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find((o) => o.customerId)?.customerId ?? null;
  const customerId = picked === undefined ? orderCustomerId : (picked?.id ?? null);
  // Points typed for one customer are not another's to spend.
  useEffect(() => setPointsText(''), [customerId]);
  const loyalty = useAsync(() => (customerId ? fetchCustomerLoyalty(customerId) : Promise.resolve(null)), [customerId, table?.id, step === 'done']);
  // Orders often carry only the customer's id, so fall back to the name the loyalty lookup returns for it.
  const customerName = picked === undefined ? (orderCustomerName ?? (loyalty.data?.customerId === customerId ? loyalty.data?.name : null) ?? null) : (picked?.name ?? null);

  // The sheet stays mounted (just hidden) between tables, so its own UI state
  // — the dish picker being expanded, any unsent edits, which step of taking
  // payment it's on — has to be reset by hand on every close or table switch,
  // or it carries over into whatever opens next.
  useEffect(() => {
    setPicked(undefined);
    setAdding(false);
    setPendingAdds([]);
    setPendingRemoves([]);
    setEndSessionOnPay(false);
    setDiscount(0);
    setDiscountText('0.00');
    setPointsText('');
    setStep('bill');
    setMethod(null);
    setCommitted(null);
    setQrPayload(null);
    setQrProgress(false);
  }, [table?.id]);

  // `onSettle` runs the real mutation and is closed over freshly every render — a ref keeps the
  // QR auto-advance timer below from needing it in its dependency array (same trick as useAsync).
  const finalize = async (chosenMethod: 'cash' | 'qr' | 'credit') => {
    if (!committed) return;
    setMethod(chosenMethod);
    const ok = await onSettle({
      items: committed.items,
      method: chosenMethod === 'qr' ? 'QR' : 'CASH',
      credit: chosenMethod === 'credit',
      discount: committed.manualDiscount,
      redeemPoints: committed.redeemPoints,
      endSession: true,
      customerId: committed.customerId,
    });
    // A refusal may mean the balance moved: read it again so the next try starts from what is true.
    if (!ok) loyalty.reload();
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
    variantId: string | null;
    addOnIds: string[];
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
        variantId: item.variantId,
        addOnIds: item.addOns.map((a) => a.addOnId),
        // The same dish ordered as Large and as Small must not read as one line.
        dishNameSnapshot: [
          item.dishNameSnapshot,
          item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : '',
          item.addOns.length ? ` + ${item.addOns.map((a) => a.nameSnapshot).join(', ')}` : '',
        ].join(''),
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
        variantId: null,
        addOnIds: [],
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
        variantId: raw.variantId,
        addOnIds: raw.addOnIds,
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

    const group = servedGroups.get(lineKey(raw));
    if (group) {
      group.quantity += raw.quantity;
      group.total += raw.unitPrice * raw.quantity;
      group.sources.push({ orderId: raw.orderId, itemId: raw.itemId, quantity: raw.quantity });
    } else {
      const line: DraftLine = {
        rowId: `served-${lineKey(raw)}`,
        dishId: raw.dishId,
        variantId: raw.variantId,
        addOnIds: raw.addOnIds,
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
      servedGroups.set(lineKey(raw), line);
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
  // Never let a stale discount (typed against a bigger bill, before an item was pulled off) push the subtotal negative.
  const appliedDiscount = canDiscount ? Math.min(discount, subtotal) : 0;
  // Points the customer on this bill can spend: what they hold, or what the restaurant's cap allows if less.
  // The server decides again; this only shows the cashier what to expect. A failed lookup just hides the row.
  // `useAsync` keeps the last answer while the next loads or fails, so only trust one that is for this customer.
  const points = loyalty.data?.customerId === customerId ? loyalty.data : null;
  const program = points?.program;
  const maxPoints =
    points && program?.enabled && program.redeemValue > 0
      ? Math.max(Math.min(points.balance, Math.floor(Math.floor(((subtotal - appliedDiscount) * program.maxRedeemPct) / 100) / program.redeemValue)), 0)
      : 0;
  const redeemPoints = Math.min(Number.parseInt(pointsText, 10) || 0, maxPoints);
  const pointsDiscount = redeemPoints * (program?.redeemValue ?? 0);
  const discountedSubtotal = subtotal - appliedDiscount - pointsDiscount;
  const serviceCharge = percentOf(discountedSubtotal, serviceChargeRate);
  const tax = percentOf(discountedSubtotal + serviceCharge, taxRate);
  const total = discountedSubtotal + serviceCharge + tax;
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
      <HoldBack />
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
            {table.capacity !== undefined && (
              <p className="text-[10px] tracking-wide text-[oklch(0.463_0.031_74)] uppercase">
                {table.capacity} seat{table.capacity === 1 ? '' : 's'}
              </p>
            )}
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
              {table.capacity !== undefined ? 'End table session' : 'Close'}
            </button>
          </div>
        )}

        <button
          type="button"
          disabled={busy || !latestOrder}
          onClick={() => setAdding(true)}
          className="mt-3 w-full rounded-2xl border border-dashed border-[oklch(0.232_0.019_70)]/30 py-2.5 text-[11px] font-bold tracking-[0.14em] text-[oklch(0.463_0.031_74)] uppercase active:translate-y-px disabled:opacity-40"
        >
          + Add item
        </button>

        {adding && (
          <PickerModal title="Add items" onClose={() => setAdding(false)}>
            <DishList dishes={dishes} added={pendingAdds} disabled={busy} onAdd={queueAdd} onDone={() => setAdding(false)} />
          </PickerModal>
        )}

        <div className="my-3 border-t border-dashed border-[oklch(0.232_0.019_70)]/25" />

        <div className="space-y-1 text-[12px] text-[oklch(0.463_0.031_74)]">
          <div className="flex items-baseline justify-between">
            <span>Subtotal</span>
            <span className="tnum">{formatMoney(subtotal, currency)}</span>
          </div>
          {appliedDiscount > 0 && (
            <div className="flex items-baseline justify-between">
              <span>Discount</span>
              <span className="tnum">−{formatMoney(appliedDiscount, currency)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div className="flex items-baseline justify-between">
              <span>{redeemPoints} points</span>
              <span className="tnum">−{formatMoney(pointsDiscount, currency)}</span>
            </div>
          )}
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

        {hasItems && <CustomerPicker name={customerName} disabled={busy} onPick={setPicked} />}

        {canDiscount && hasItems && (
          <label className="mt-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">
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

        {hasItems && maxPoints > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">
            <label htmlFor={pointsId}>
              Points
              <span className="ml-1 font-normal">
                (up to {maxPoints} · {formatMoney(program?.redeemValue ?? 0, currency)} each)
              </span>
            </label>
            <span className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy || redeemPoints === maxPoints}
                aria-label={`Use the most points, ${maxPoints}`}
                onClick={() => setPointsText(String(maxPoints))}
                className="rounded-full px-2.5 py-1.5 text-[11.5px] font-bold text-[oklch(0.539_0.163_36)] disabled:opacity-40"
              >
                Max
              </button>
              <input
                id={pointsId}
                type="text"
                inputMode="numeric"
                // Always what is actually spent: the number is held to what the bill can take as it is typed,
                // and again whenever the bill changes under it.
                value={pointsText === '' ? '' : String(redeemPoints)}
                placeholder="0"
                disabled={busy}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 7);
                  setPointsText(digits === '' ? '' : String(Math.min(Number.parseInt(digits, 10), maxPoints)));
                }}
                className="w-20 rounded-full bg-[oklch(0.879_0.033_85)] px-3 py-1.5 text-right text-[12.5px] font-bold tnum text-[oklch(0.232_0.019_70)] outline-none disabled:opacity-40"
              />
            </span>
          </div>
        )}

        <div className="mt-2 grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={busy || !hasItems}
            onClick={() => {
              // The draft, collapsed to what's actually being charged — dish + quantity, nothing
              // tied to a specific order row, since the cashier's edits are what defines the bill.
              // Frozen into `committed` rather than settled right away: the next step is picking
              // cash or QR, and neither should let the live bill shift underneath the total shown.
              const merged = new Map<string, BillLine>();
              for (const line of draftLines) {
                const key = lineKey(line);
                const seen = merged.get(key);
                if (seen) seen.quantity += line.quantity;
                else merged.set(key, { dishId: line.dishId, variantId: line.variantId, addOnIds: line.addOnIds, quantity: line.quantity });
              }
              const items = [...merged.values()];

              setCommitted({
                items,
                lines: draftLines.map((l) => ({ dishNameSnapshot: l.dishNameSnapshot, quantity: l.quantity, total: l.total })),
                totals: { currency, subtotal, serviceCharge, tax, discount: appliedDiscount + pointsDiscount, total },
                manualDiscount: appliedDiscount,
                redeemPoints,
                customerName,
                customerId: picked === undefined ? undefined : (picked?.id ?? null),
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
                { currency, subtotal, serviceCharge, tax, discount: appliedDiscount + pointsDiscount, total },
                { name: restaurantName, vatPanNumber },
                undefined,
                customerName,
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
              {/* QR: the guest paid by scanning the restaurant's own QR; staff just record it, and it settles as a card payment. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => void finalize('qr')}
                className="flex flex-col items-center gap-2 rounded-2xl bg-[oklch(0.879_0.033_85)] py-6 text-[oklch(0.232_0.019_70)] ring-2 ring-transparent transition-move active:scale-[0.97] disabled:opacity-40"
              >
                <Qr size={26} />
                <span className="text-[13px] font-bold tracking-wide uppercase">
                  {busy && method === 'qr' ? 'Processing…' : 'QR'}
                </span>
              </button>
              {/* On credit: nothing is taken now; the bill stays owed by this customer and is settled from Sales. Needs someone to owe it. */}
              {committed.customerId && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finalize('credit')}
                  className="col-span-2 flex items-center justify-center gap-2 rounded-2xl py-4 text-[oklch(0.232_0.019_70)] ring-1 ring-[oklch(0.232_0.019_70)]/25 transition-move active:scale-[0.98] disabled:opacity-40"
                >
                  <Receipt size={20} />
                  <span className="text-[13px] font-bold tracking-wide uppercase">
                    {busy && method === 'credit' ? 'Recording…' : `On credit — ${committed.customerName ?? 'customer'} owes it`}
                  </span>
                </button>
              )}
              {/* Scan to pay (generated QR with a waiting step), off for now:
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
              */}
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

            <div className="flex items-center gap-2 text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">
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
              className="rounded-full px-5 py-2 text-[12px] font-bold tracking-wide text-[oklch(0.539_0.163_36)] uppercase ring-1 ring-[oklch(0.539_0.163_36)]/40 active:translate-y-px disabled:opacity-40"
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
                {method === 'cash' ? 'Collected in cash' : method === 'credit' ? 'Left on credit, nothing collected' : 'Paid by QR'} ·{' '}
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </p>
            </div>

            <div className="mt-1 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  printReceipt(table, committed.lines, committed.totals, { name: restaurantName, vatPanNumber }, {
                    method: method === 'qr' ? 'QR' : 'CASH',
                    label: method === 'credit' ? 'On credit — unpaid' : undefined,
                    takenBy: staff.name,
                  }, committed.customerName)
                }
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

/** Mounted only while the bill is open: the browser's back button can't leave the page mid-payment, same as every other sheet. The pickers on top don't add their own hold — two would fight over the history. */
function HoldBack() {
  useDiscardBack();
  return null;
}

/** A second modal over the bill, for picking one thing. Its own backdrop swallows clicks so the bill beneath stays open. */
function PickerModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-pop flex max-h-[80vh] w-full max-w-md flex-col rounded-3xl bg-[oklch(0.943_0.024_85)] p-4 font-mono text-[oklch(0.232_0.019_70)] shadow-deep"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className={cx(DISPLAY, 'text-[18px] font-black')}>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="grid size-8 place-items-center rounded-full bg-[oklch(0.879_0.033_85)]">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const PICKER_SEARCH =
  'w-full rounded-full bg-[oklch(0.879_0.033_85)] py-2.5 pr-3 pl-9 text-[13px] font-semibold text-[oklch(0.232_0.019_70)] outline-none placeholder:text-[oklch(0.463_0.031_74)]/70';

/** The menu, searchable. Stays open while items are added, with a count on each, so a round can be built in one go. */
function DishList({ dishes, added, disabled, onAdd, onDone }: { dishes: Dish[]; added: string[]; disabled: boolean; onAdd: (dishId: string) => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const shown = dishes.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <label className="relative mb-2 block">
        <span className="sr-only">Search dishes</span>
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[oklch(0.463_0.031_74)]" />
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" className={PICKER_SEARCH} />
      </label>
      <ul className="-mx-1 min-h-0 flex-1 space-y-1.5 overflow-y-auto px-1 py-1">
        {shown.map((dish) => {
          const n = added.filter((id) => id === dish.id).length;
          return (
            <li key={dish.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAdd(dish.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl bg-[oklch(0.879_0.033_85)] px-3 py-2.5 text-left text-[13px] active:translate-y-px disabled:opacity-40"
              >
                <span className="min-w-0 truncate">
                  {dish.name}
                  {n > 0 && <span className="ml-2 rounded-full bg-[oklch(0.539_0.163_36)] px-2 py-0.5 text-[11px] font-bold text-[oklch(0.943_0.024_85)]">+{n}</span>}
                </span>
                <span className="shrink-0 font-bold tnum">{formatMoney(dish.price, dish.currency)}</span>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-1 py-3 text-[12px] text-[oklch(0.463_0.031_74)]">No dish matches that.</li>}
      </ul>
      <button type="button" onClick={onDone} className="mt-3 w-full rounded-[14px] bg-[oklch(0.539_0.163_36)] py-3 text-[13px] font-bold tracking-wide text-[oklch(0.943_0.024_85)] active:translate-y-px">
        Done
      </button>
    </>
  );
}

/** Who the bill is for. Points are earned and spent against this person, so it can be changed — or cleared — before payment. */
function CustomerPicker({ name, disabled, onPick }: { name: string | null; disabled: boolean; onPick: (c: { id: string; name: string } | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(id);
  }, [q]);
  const found = useAsync(() => (open ? listCustomers({ q: debounced, limit: 8 }) : Promise.resolve(null)), [open, debounced]);
  const choose = (c: { id: string; name: string } | null) => {
    onPick(c);
    setOpen(false);
    setQ('');
  };

  return (
    <div className="mt-3 text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <Contact size={14} className="shrink-0" />
          <span className="truncate">{name ? <span className="text-[oklch(0.232_0.019_70)]">{name}</span> : 'No customer on this bill'}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-[oklch(0.879_0.033_85)] px-3 py-1.5 text-[11.5px] font-bold text-[oklch(0.232_0.019_70)] disabled:opacity-40"
        >
          {name ? 'Change' : 'Add customer'}
        </button>
      </div>
      {open && (
        <PickerModal title="Who is this bill for?" onClose={() => setOpen(false)}>
          <label className="relative mb-2 block">
            <span className="sr-only">Search customers by name or phone</span>
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2" />
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" className={PICKER_SEARCH} />
          </label>
          <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {found.data?.rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => choose({ id: c.id, name: c.name })} className="flex w-full items-baseline justify-between gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[oklch(0.879_0.033_85)]">
                  <span className="truncate text-[13px] text-[oklch(0.232_0.019_70)]">{c.name}</span>
                  <span className="shrink-0 font-normal tnum">{c.phone}</span>
                </button>
              </li>
            ))}
            {found.data && found.data.rows.length === 0 && <li className="px-3 py-3 font-normal">Nobody matches that.</li>}
            {found.loading && !found.data && <li className="px-3 py-3 font-normal">Searching…</li>}
            {found.error && <li className="px-3 py-3 font-normal text-[oklch(0.5_0.18_25)]">Couldn't search just now.</li>}
          </ul>
          {name && (
            <button type="button" onClick={() => choose(null)} className="mt-2 w-full rounded-xl px-3 py-2.5 text-left text-[12px] font-bold text-[oklch(0.5_0.18_25)] hover:bg-[oklch(0.879_0.033_85)]">
              Take this bill off {name}
            </button>
          )}
        </PickerModal>
      )}
    </div>
  );
}
