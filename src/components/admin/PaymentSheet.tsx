import { AnimatedMoney } from './AnimatedMoney';
import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isTableOpen } from '../../api/admin';
import { randomId } from '../../api/store';
import { fetchCustomerLoyalty, listCustomers } from '../../api/customers';
import { STATUS_LABEL } from '../../domain/orderStatus';
import type { BilledItem, BillLine, Dish, Order, OrderStatus, PaymentMethod, SplitLine } from '../../domain/types';
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
  /** A split-by-item share: order lines and how many of each, sent instead of `items`. */
  split?: SplitLine[];
  /** Fresh per share, so retrying one never answers for another that looks the same. */
  shareId?: string;
  method: PaymentMethod;
  /** The cashier's own discount only. Points are sent as points, never folded in here: the server prices them. */
  discount: number;
  redeemPoints: number;
  endSession: boolean;
  /** Left out unless the cashier chose: an id names who the bill is for, null takes it off its customer. */
  customerId?: string | null;
  /** Leave the whole bill owed by the customer instead of taking money now. */
  credit?: boolean;
  /** With `credit`: taken now by `method`; the rest stays owed. */
  paidNow?: number;
  /** With `credit`: days until the rest is due; left out, it counts from the bill date. */
  dueInDays?: number;
}

/** What's actually being charged, frozen the moment "Take payment" is tapped — so an in-flight QR
 *  wait (or the reload that follows a successful cash payment) can never shift the total underfoot. */
interface CommittedBill {
  items: BillLine[];
  split?: SplitLine[];
  shareId?: string;
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

const BILL_PRIMARY =
  'w-full rounded-[14px] bg-[oklch(0.539_0.163_36)] px-4 py-4 text-[15px] font-bold text-[oklch(0.985_0.01_85)] ring-2 ring-[oklch(0.539_0.163_36)]/30 transition-transform active:translate-y-px disabled:opacity-40';
const BILL_SECONDARY =
  'w-full rounded-[14px] bg-[oklch(0.232_0.019_70)] px-4 py-3.5 text-[13px] font-bold text-[oklch(0.943_0.024_85)] transition-transform active:translate-y-px disabled:opacity-40';

type PayStep = 'bill' | 'method' | 'credit' | 'qr' | 'done';

export function PaymentSheet({
  table,
  orders,
  dishes,
  restaurantName,
  legalName,
  vatPanNumber,
  serviceChargeRate,
  taxRate,
  pending,
  billed,
  payOrderId,
  onClose,
  onSettle,
  onEndSession,
}: {
  table: BillSubject | null;
  orders: Order[];
  dishes: Dish[];
  restaurantName: string;
  legalName: string;
  vatPanNumber: string | null;
  serviceChargeRate: number;
  taxRate: number;
  pending: string | null;
  /** What the table's split bills already cover. Given only where splitting is offered (a live table visit); left out, the sheet bills the whole table as before. */
  billed?: BilledItem[];
  /** Opens straight into a split share covering just this order (needs `billed`, and the split permission). */
  payOrderId?: string | null;
  onClose: () => void;
  onSettle: (changes: PendingBillChanges) => Promise<boolean>;
  onShowQr: () => void;
  onEndSession: () => void;
}) {
  const staff = useStaff();
  const canDiscount = can(staff.role, 'payments:discount');
  const canSplit = billed !== undefined && can(staff.role, 'payments:split');
  const [splitOn, setSplitOn] = useState(false);
  // Reading the bill is the default; changing the order (± and add item) is a deliberate mode.
  const [editing, setEditing] = useState(false);
  // How many of each order line (by item id) the cashier is taking on this share.
  const [take, setTake] = useState<Record<string, number>>({});
  // Once part of the table was billed by item the rest has to go the same way: the server refuses a whole-table bill.
  const inSplit = canSplit && (splitOn || (billed?.length ?? 0) > 0);

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
  const [discountText, setDiscountText] = useState('');
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
  // Credit with part paid up front: the amount (minor units), its text, and how it was taken.
  const [paidNow, setPaidNow] = useState(0);
  const [paidNowText, setPaidNowText] = useState('');
  const [paidNowQr, setPaidNowQr] = useState(false);
  const [dueInDays, setDueInDays] = useState<number | null>(14);

  // The customer the server will spend points for: the most recent order that has one (it reads the session's orders newest first).
  const orderCustomerId = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).find((o) => o.customerId)?.customerId ?? null;
  // A split share starts on the table's customer too; the cashier can swap or clear it per share.
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
    setSplitOn(false);
    setEditing(false);
    setTake({});
    setAdding(false);
    setPendingAdds([]);
    setPendingRemoves([]);
    setEndSessionOnPay(false);
    setDiscount(0);
    setDiscountText('');
    setPointsText('');
    setStep('bill');
    setMethod(null);
    setCommitted(null);
    setQrPayload(null);
    setQrProgress(false);
    setPaidNow(0);
    setPaidNowText('');
    setPaidNowQr(false);
    setDueInDays(14);
    // Opened from one order's "Pay this order": start in split mode with that order's lines taken (clamped to what's unbilled below),
    // unless that order is the whole bill.
    const only = payOrderId && canSplit ? orders.find((o) => o.id === payOrderId) : undefined;
    // If this order is all that is left to pay (nothing billed, no other order on the table), the whole bill is the order: open on that.
    const wholeBillIsThisOrder = (billed?.length ?? 0) === 0 && orders.every((o) => o.id === payOrderId || o.status === 'CANCELLED' || o.items.every((i) => i.status === 'CANCELLED'));
    if (only && !wholeBillIsThisOrder) {
      setSplitOn(true);
      setTake(Object.fromEntries(only.items.filter((i) => i.status !== 'CANCELLED').map((i) => [i.id, i.quantity])));
    }
  }, [table?.id]);

  // `onSettle` runs the real mutation and is closed over freshly every render — a ref keeps the
  // QR auto-advance timer below from needing it in its dependency array (same trick as useAsync).
  const finalize = async (chosenMethod: 'cash' | 'qr' | 'credit') => {
    if (!committed) return;
    setMethod(chosenMethod);
    const ok = await onSettle({
      items: committed.items,
      split: committed.split,
      shareId: committed.shareId,
      method: chosenMethod === 'qr' || (chosenMethod === 'credit' && paidNowQr) ? 'QR' : 'CASH',
      credit: chosenMethod === 'credit',
      dueInDays: chosenMethod === 'credit' && dueInDays ? dueInDays : undefined,
      paidNow: chosenMethod === 'credit' ? Math.min(paidNow, committed.totals.total - 1) : undefined,
      discount: committed.manualDiscount,
      redeemPoints: committed.redeemPoints,
      endSession: true,
      customerId: committed.customerId,
    });
    // A refusal may mean the balance moved: read it again so the next try starts from what is true.
    if (!ok) loyalty.reload();
    setStep(ok ? 'done' : chosenMethod === 'credit' ? 'credit' : 'method');
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

  // Who would owe a credit: the cashier's pick if made, else the orders' own customer.
  const owedBy = committed ? (committed.customerId === undefined ? customerId : committed.customerId) : null;
  const owedByName = customerName ?? committed?.customerName ?? null;
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
  // Split mode lists order lines one by one (an order line is what a share names), each with what is still unbilled.
  const billedBy = new Map((billed ?? []).map((b) => [b.orderItemId, b.quantity]));
  const allSplitRows = !inSplit
    ? []
    : orders
        .filter((o) => o.status !== 'CANCELLED')
        .flatMap((o) => o.items.filter((i) => i.status !== 'CANCELLED'))
        .map((item) => {
          const paid = Math.min(billedBy.get(item.id) ?? 0, item.quantity);
          const left = item.quantity - paid;
          return {
            id: item.id,
            name: [item.dishNameSnapshot, item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : '', item.addOns.length ? ` + ${item.addOns.map((a) => a.nameSnapshot).join(', ')}` : ''].join(''),
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            paid,
            left,
            taken: Math.min(take[item.id] ?? 0, left),
          };
        });
  const splitRows = allSplitRows.filter((row) => row.left > 0);
  const paidRows = allSplitRows.filter((row) => row.paid > 0);
  // Dish value (before fees) the earlier shares have already covered.
  const paidBefore = paidRows.reduce((sum, r) => sum + r.unitPrice * r.paid, 0);
  const takenRows = splitRows.filter((row) => row.taken > 0);
  const hasItems = inSplit ? splitRows.length > 0 : draftLines.length > 0;
  const canTake = inSplit ? takenRows.length > 0 : hasItems;
  const subtotal = inSplit ? takenRows.reduce((sum, r) => sum + r.unitPrice * r.taken, 0) : draftLines.reduce((sum, l) => sum + l.total, 0);
  // Never let a stale discount (typed against a bigger bill, before an item was pulled off) push the subtotal negative.
  const appliedDiscount = Math.min(discount, subtotal);
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
  const unitsLeft = splitRows.reduce((sum, r) => sum + r.left, 0);
  const takenUnits = takenRows.reduce((sum, r) => sum + r.taken, 0);
  // What the rest of the table still owes, before fees: unchanged by this share's discount or points.
  const unbilledAfter = splitRows.reduce((sum, r) => sum + r.unitPrice * (r.left - r.taken), 0);
  const takeLabel = (
    <>
      {inSplit ? 'Take this share' : 'Take payment'} · <AnimatedMoney value={total} currency={currency} />
    </>
  );
  const billLines: ReceiptLine[] = inSplit
    ? takenRows.map((r) => ({ dishNameSnapshot: r.name, quantity: r.taken, total: r.unitPrice * r.taken }))
    : draftLines.map((l) => ({ dishNameSnapshot: l.dishNameSnapshot, quantity: l.quantity, total: l.total }));
  const billTotals: ReceiptTotals = { currency, subtotal, serviceCharge, tax, discount: appliedDiscount + pointsDiscount, total };
  const printBill = () => printReceipt(table, billLines, billTotals, { name: restaurantName, legalName, vatPanNumber }, undefined, customerName);

  // "Take payment" freezes the bill into `committed` and hands off to the method step. Nothing is charged until then.
  const takePayment = () => {
    setEditing(false);
    if (inSplit) {
      setCommitted({
        items: [],
        shareId: randomId(),
        split: takenRows.map((r) => ({ orderItemId: r.id, quantity: r.taken })),
        lines: billLines,
        totals: billTotals,
        manualDiscount: appliedDiscount,
        redeemPoints,
        customerName,
        // Always explicit: the server never defaults a split share to anyone.
        customerId,
      });
      setStep('method');
      return;
    }
    // The draft, collapsed to what's actually being charged — dish + quantity, nothing tied to a specific order row,
    // since the cashier's edits are what defines the bill.
    const merged = new Map<string, BillLine>();
    for (const line of draftLines) {
      const key = lineKey(line);
      const seen = merged.get(key);
      if (seen) seen.quantity += line.quantity;
      else merged.set(key, { dishId: line.dishId, variantId: line.variantId, addOnIds: line.addOnIds, quantity: line.quantity });
    }
    setCommitted({
      items: [...merged.values()],
      lines: billLines,
      totals: billTotals,
      manualDiscount: appliedDiscount,
      redeemPoints,
      customerName,
      customerId: picked === undefined ? undefined : (picked?.id ?? null),
    });
    setPendingAdds([]);
    setPendingRemoves([]);
    setEndSessionOnPay(false);
    setStep('method');
  };
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
        className={cx('animate-pop mx-auto max-h-[90vh] w-full overflow-y-auto rounded-4xl bg-[oklch(0.943_0.024_85)] px-4 pt-4 pb-5 font-mono shadow-deep', step === 'bill' ? 'max-w-5xl' : 'max-w-2xl')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${table.name} bill`}
      >
        {step === 'bill' && (
          <>
            <div className="flex items-start justify-between gap-3 pt-1">
              <div className="min-w-0">
                <h2 className={cx(DISPLAY, 'text-[30px] leading-none font-black text-[oklch(0.232_0.019_70)]')}>{table.name}</h2>
                <p className="mt-1.5 text-[13px] text-[oklch(0.463_0.031_74)]">
                  {openOrderCount} open order{openOrderCount === 1 ? '' : 's'} · {elapsedMinutes}m elapsed
                  {table.capacity !== undefined && ` · ${table.capacity} seat${table.capacity === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close bill"
                onClick={() => {
                  setAdding(false);
                  onClose();
                }}
                className="grid size-10 shrink-0 place-items-center rounded-full bg-[oklch(0.879_0.033_85)] text-[oklch(0.232_0.019_70)] active:translate-y-px"
              >
                <X size={16} />
              </button>
            </div>

            <div className="my-3 border-t border-dashed border-[oklch(0.232_0.019_70)]/25" />

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start lg:gap-8">
              {/* Left: what is being paid for. Reading first; changing the order is a separate, deliberate mode. */}
              <div className="min-w-0">
                {inSplit && (
                  <div className="mb-3 rounded-2xl bg-[oklch(0.879_0.033_85)] p-3.5 text-[13px] text-[oklch(0.232_0.019_70)]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold">
                        Splitting by item · {unitsLeft} item{unitsLeft === 1 ? '' : 's'} left
                      </p>
                      <span className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busy || unitsLeft === 0}
                          onClick={() => setTake(Object.fromEntries(splitRows.map((r) => [r.id, r.left])))}
                          className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-[oklch(0.42_0.13_36)] disabled:opacity-40"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          disabled={busy || takenUnits === 0}
                          onClick={() => setTake({})}
                          className="rounded-full px-3 py-1.5 text-[12.5px] font-bold text-[oklch(0.42_0.13_36)] disabled:opacity-40"
                        >
                          Clear
                        </button>
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-3 gap-2 text-[12px] text-[oklch(0.463_0.031_74)]">
                      <div className="rounded-xl bg-[oklch(0.943_0.024_85)] px-2.5 py-2">
                        <dt>Already paid</dt>
                        <dd className="text-[14px] font-bold tnum text-[oklch(0.42_0.1_150)]"><AnimatedMoney value={paidBefore} currency={currency} /></dd>
                      </div>
                      <div className="rounded-xl bg-[oklch(0.539_0.163_36)]/15 px-2.5 py-2 ring-1 ring-[oklch(0.539_0.163_36)]/40 ring-inset">
                        <dt>Paying now</dt>
                        <dd className="text-[14px] font-bold tnum text-[oklch(0.232_0.019_70)]"><AnimatedMoney value={subtotal} currency={currency} /></dd>
                      </div>
                      <div className="rounded-xl bg-[oklch(0.943_0.024_85)] px-2.5 py-2">
                        <dt>Left after this</dt>
                        <dd className="text-[14px] font-bold tnum text-[oklch(0.232_0.019_70)]"><AnimatedMoney value={unbilledAfter} currency={currency} /></dd>
                      </div>
                    </dl>
                  </div>
                )}

                {hasItems && !inSplit && (
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-bold text-[oklch(0.463_0.031_74)]">Order</h3>
                    <button
                      type="button"
                      disabled={busy || !latestOrder}
                      aria-pressed={editing}
                      onClick={() => {
                        setEditing((on) => !on);
                        setAdding(false);
                      }}
                      className={cx(
                        'rounded-full px-3.5 py-1.5 text-[12.5px] font-bold active:translate-y-px disabled:opacity-40',
                        editing ? 'bg-[oklch(0.232_0.019_70)] text-[oklch(0.943_0.024_85)]' : 'bg-[oklch(0.879_0.033_85)] text-[oklch(0.232_0.019_70)]',
                      )}
                    >
                      {editing ? 'Done editing' : 'Edit items'}
                    </button>
                  </div>
                )}

                {hasItems && inSplit && (
                  <ul className="grid gap-2 text-[14px]">
                    {splitRows.map((row) => {
                      const picked = row.taken > 0;
                      const toggle = () => setTake((prev) => ({ ...prev, [row.id]: picked ? 0 : row.left }));
                      return (
                        <li
                          key={row.id}
                          className={cx(
                            'flex items-center gap-3 rounded-2xl p-2.5 ring-1 ring-inset transition-colors',
                            picked ? 'bg-[oklch(0.539_0.163_36)]/12 ring-[oklch(0.539_0.163_36)]/50' : 'ring-[oklch(0.232_0.019_70)]/15',
                          )}
                        >
                          <button
                            type="button"
                            disabled={busy}
                            role="checkbox"
                            aria-checked={picked}
                            aria-label={`${picked ? 'Remove' : 'Add'} ${row.name} ${picked ? 'from' : 'to'} this share`}
                            onClick={toggle}
                            className={cx(
                              'grid size-7 shrink-0 place-items-center rounded-full text-[15px] font-bold ring-2 ring-inset active:translate-y-px disabled:opacity-40',
                              picked ? 'bg-[oklch(0.539_0.163_36)] text-white ring-[oklch(0.539_0.163_36)]' : 'ring-[oklch(0.232_0.019_70)]/30',
                            )}
                          >
                            {picked && '✓'}
                          </button>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold text-[oklch(0.232_0.019_70)]">{row.name}</span>
                            <span className="block text-[12.5px] text-[oklch(0.463_0.031_74)] tnum">
                              {formatMoney(row.unitPrice, currency)} each
                              {row.paid > 0 && <span className="ml-1.5 font-semibold text-[oklch(0.42_0.1_150)]">· {row.paid} of {row.quantity} already paid</span>}
                            </span>
                          </span>
                          {row.left > 1 && (
                            <span className="flex shrink-0 items-center gap-1.5">
                              <button
                                type="button"
                                disabled={busy || row.taken === 0}
                                aria-label={`Take one fewer ${row.name}`}
                                onClick={() => setTake((prev) => ({ ...prev, [row.id]: row.taken - 1 }))}
                                className="size-8 rounded-full bg-[oklch(0.879_0.033_85)] text-[17px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="w-12 text-center leading-tight">
                                <span className="block text-[15px] font-bold text-[oklch(0.232_0.019_70)] tnum">{row.taken}</span>
                                <span className="block text-[11.5px] text-[oklch(0.463_0.031_74)]">of {row.left}</span>
                              </span>
                              <button
                                type="button"
                                disabled={busy || row.taken >= row.left}
                                aria-label={`Take one more ${row.name}`}
                                onClick={() => setTake((prev) => ({ ...prev, [row.id]: row.taken + 1 }))}
                                className="size-8 rounded-full bg-[oklch(0.879_0.033_85)] text-[17px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                              >
                                +
                              </button>
                            </span>
                          )}
                          <span className={cx('w-20 shrink-0 text-right font-bold tnum', picked ? 'text-[oklch(0.232_0.019_70)]' : 'text-[oklch(0.463_0.031_74)]')}>
                            {formatMoney(row.unitPrice * (picked ? row.taken : row.left), currency)}
                          </span>
                        </li>
                      );
                    })}
                    {paidRows.filter((r) => r.left === 0).map((row) => (
                      <li key={row.id} className="flex items-center gap-3 rounded-2xl bg-[oklch(0.42_0.1_150)]/8 p-2.5 text-[oklch(0.463_0.031_74)]">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[oklch(0.42_0.1_150)] text-[15px] font-bold text-white" aria-hidden>✓</span>
                        <span className="min-w-0 flex-1 truncate">{row.quantity}× {row.name}</span>
                        <span className="shrink-0 text-[12.5px] font-bold text-[oklch(0.42_0.1_150)]">Paid</span>
                        <span className="w-20 shrink-0 text-right tnum">{formatMoney(row.unitPrice * row.quantity, currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {hasItems && !inSplit && (
                  <ul className="divide-y divide-dashed divide-[oklch(0.232_0.019_70)]/20 text-[14px]">
                    {draftLines.map((line) => (
                      <li key={line.rowId} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-[oklch(0.232_0.019_70)]">
                              {!editing && <span className="mr-1.5 tnum">{line.quantity}×</span>}
                              {line.dishNameSnapshot}
                            </span>
                            {!line.served && (
                              <span className="rounded-full bg-[oklch(0.539_0.163_36)]/15 px-2 py-0.5 text-[12px] font-semibold text-[oklch(0.42_0.13_36)]">
                                {STATUS_LABEL[line.orderStatus]}
                              </span>
                            )}
                          </span>
                          <span className="block text-[12.5px] text-[oklch(0.463_0.031_74)] tnum">
                            {formatMoney(line.unitPrice, currency)} each
                            {line.notes && <span className="ml-2 italic">“{line.notes}”</span>}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {editing && (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Remove one ${line.dishNameSnapshot}`}
                                onClick={() => queueRemove(line)}
                                className="size-9 rounded-full bg-[oklch(0.879_0.033_85)] text-[18px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-[15px] font-bold text-[oklch(0.232_0.019_70)] tnum">{line.quantity}</span>
                              <button
                                type="button"
                                disabled={busy}
                                aria-label={`Add one ${line.dishNameSnapshot}`}
                                onClick={() => queueAdd(line.dishId)}
                                className="size-9 rounded-full bg-[oklch(0.879_0.033_85)] text-[18px] leading-none font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                              >
                                +
                              </button>
                            </>
                          )}
                          <span className="w-20 text-right font-bold tnum text-[oklch(0.232_0.019_70)]">{formatMoney(line.total, currency)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {!hasItems && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <p className="text-[13px] text-[oklch(0.463_0.031_74)]">No items on this bill.</p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={onEndSession}
                      className="rounded-full bg-[oklch(0.879_0.033_85)] px-5 py-2.5 text-[13px] font-bold text-[oklch(0.232_0.019_70)] active:translate-y-px disabled:opacity-40"
                    >
                      {table.capacity !== undefined ? 'End table session' : 'Close'}
                    </button>
                  </div>
                )}

                {editing && !inSplit && (
                  <button
                    type="button"
                    disabled={busy || !latestOrder}
                    onClick={() => setAdding(true)}
                    className="mt-3 w-full rounded-2xl border border-dashed border-[oklch(0.232_0.019_70)]/35 py-3 text-[13px] font-bold text-[oklch(0.463_0.031_74)] active:translate-y-px disabled:opacity-40"
                  >
                    + Add item
                  </button>
                )}

                {adding && (
                  <PickerModal title="Add items" onClose={() => setAdding(false)}>
                    <DishList dishes={dishes} added={pendingAdds} disabled={busy} onAdd={queueAdd} onDone={() => setAdding(false)} />
                  </PickerModal>
                )}

                {canSplit && (inSplit || hasItems) && (
                  <div className="mt-4 flex items-center justify-between gap-3 text-[13px] text-[oklch(0.463_0.031_74)]">
                    <span>
                      {(billed?.length ?? 0) > 0 ? 'Shares already paid are off this list.' : inSplit ? 'Pick what this share pays for.' : 'Each guest paying for their own items?'}
                    </span>
                    {(billed?.length ?? 0) === 0 && (
                      <button
                        type="button"
                        disabled={busy || pendingAdds.length > 0 || pendingRemoves.length > 0}
                        onClick={() => {
                          setSplitOn((on) => !on);
                          setTake({});
                          setEditing(false);
                        }}
                        className="shrink-0 rounded-full bg-[oklch(0.879_0.033_85)] px-3.5 py-1.5 text-[12.5px] font-bold text-[oklch(0.42_0.13_36)] disabled:opacity-40"
                      >
                        {inSplit ? 'Bill the whole table' : 'Split by item'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: the figure and what changes it, kept in view while the lines scroll. */}
              <aside className="mt-5 lg:sticky lg:top-0 lg:mt-0">
                <div className="rounded-3xl bg-[oklch(0.965_0.016_85)] p-4 ring-1 ring-[oklch(0.232_0.019_70)]/10">
                  <dl className="space-y-1.5 text-[13px] text-[oklch(0.463_0.031_74)]">
                    <div className="flex items-baseline justify-between">
                      <dt>{inSplit ? 'Subtotal (this share)' : 'Subtotal'}</dt>
                      <dd className="tnum">{formatMoney(subtotal, currency)}</dd>
                    </div>
                    {appliedDiscount > 0 && (
                      <div className="flex items-baseline justify-between">
                        <dt>Discount</dt>
                        <dd className="tnum">−{formatMoney(appliedDiscount, currency)}</dd>
                      </div>
                    )}
                    {pointsDiscount > 0 && (
                      <div className="flex items-baseline justify-between">
                        <dt>{redeemPoints} points</dt>
                        <dd className="tnum">−{formatMoney(pointsDiscount, currency)}</dd>
                      </div>
                    )}
                    <div className="flex items-baseline justify-between">
                      <dt>Service</dt>
                      <dd className="tnum">{formatMoney(serviceCharge, currency)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <dt>Tax</dt>
                      <dd className="tnum">{formatMoney(tax, currency)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-dashed border-[oklch(0.232_0.019_70)]/25 pt-3">
                    <span className={cx(DISPLAY, 'text-[18px] font-black text-[oklch(0.232_0.019_70)]')}>{inSplit ? 'This share' : 'Total'}</span>
                    <span className={cx(DISPLAY, 'text-[32px] leading-none font-black tnum text-[oklch(0.5_0.12_70)]')}><AnimatedMoney value={total} currency={currency} /></span>
                  </div>
                </div>

                {hasItems && (
                  <div className="mt-4">
                    <h3 className="mb-1 text-[13px] font-bold text-[oklch(0.463_0.031_74)]">Adjustments</h3>
                    <div className="divide-y divide-dashed divide-[oklch(0.232_0.019_70)]/20">
                      <div className="py-3">
                        <CustomerPicker name={customerName} disabled={busy} onPick={setPicked} />
                      </div>

                      <label className="flex items-center justify-between gap-3 py-3 text-[13px] font-semibold text-[oklch(0.463_0.031_74)]">
                        <span>
                          Discount
                          {!canDiscount && <span className="block text-[11.5px] font-normal">A manager approves it when you take payment</span>}
                        </span>
                        <span className="relative">
                          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[13px] font-semibold text-[oklch(0.463_0.031_74)]">{symbolFor(currency)}</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={discountText}
                            placeholder="0.00"
                            disabled={busy}
                            onChange={(e) => {
                              const next = e.target.value.replace(/[^0-9.]/g, '');
                              setDiscountText(next);
                              const parsed = Number.parseFloat(next);
                              setDiscount(Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0);
                            }}
                            onBlur={() => setDiscountText(appliedDiscount > 0 ? (appliedDiscount / 100).toFixed(2) : '')}
                            className="w-28 rounded-full bg-[oklch(0.879_0.033_85)] py-2 pr-3 pl-7 text-right text-[13.5px] font-bold tnum text-[oklch(0.232_0.019_70)] outline-none placeholder:font-normal placeholder:text-[oklch(0.463_0.031_74)]/60 disabled:opacity-40"
                          />
                        </span>
                      </label>

                      {maxPoints > 0 && (
                        <div className="flex items-center justify-between gap-3 py-3 text-[13px] font-semibold text-[oklch(0.463_0.031_74)]">
                          <label htmlFor={pointsId} className="min-w-0">
                            Points
                            <span className="block text-[12px] font-normal">
                              up to {maxPoints} · {formatMoney(program?.redeemValue ?? 0, currency)} each
                            </span>
                          </label>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy || redeemPoints === maxPoints}
                              aria-label={`Use the most points, ${maxPoints}`}
                              onClick={() => setPointsText(String(maxPoints))}
                              className="rounded-full px-2.5 py-2 text-[12.5px] font-bold text-[oklch(0.42_0.13_36)] disabled:opacity-40"
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
                              className="w-20 rounded-full bg-[oklch(0.879_0.033_85)] px-3 py-2 text-right text-[13.5px] font-bold tnum text-[oklch(0.232_0.019_70)] outline-none disabled:opacity-40"
                            />
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Wide screens keep the action in the column; narrow ones get the sticky bar below. */}
                <div className="mt-4 hidden gap-2 lg:grid">
                  <button type="button" disabled={busy || !canTake} onClick={takePayment} className={BILL_PRIMARY}>
                    {takeLabel}
                  </button>
                  <button type="button" disabled={!canTake} onClick={printBill} className={BILL_SECONDARY}>
                    Print bill
                  </button>
                </div>
              </aside>
            </div>

            <div className="sticky bottom-0 -mx-4 mt-4 flex items-center gap-2 border-t border-dashed border-[oklch(0.232_0.019_70)]/25 bg-[oklch(0.943_0.024_85)] px-4 pt-3 pb-1 lg:hidden">
              <button type="button" disabled={!canTake} onClick={printBill} className={cx(BILL_SECONDARY, 'w-auto shrink-0 px-5')}>
                Print
              </button>
              <button type="button" disabled={busy || !canTake} onClick={takePayment} className={BILL_PRIMARY}>
                {takeLabel}
              </button>
            </div>
          </>
        )}

        {step === 'method' && committed && (
          <div className="flex flex-col gap-5 py-2">
            <button
              type="button"
              onClick={() => setStep('bill')}
              className="flex w-fit items-center gap-1 text-[13px] font-bold text-[oklch(0.463_0.031_74)] active:translate-y-px"
            >
              <ChevronLeft size={14} /> Back to bill
            </button>

            <div className="flex flex-col items-center gap-1 py-1 text-center">
              <span className="text-[13px] text-[oklch(0.463_0.031_74)]">
                {table.name} · {committed.split ? 'this share' : 'total due'}
              </span>
              <span className={cx(DISPLAY, 'text-[34px] leading-none font-black tnum text-[oklch(0.232_0.019_70)]')}>
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </span>
            </div>

            <CommittedSummary committed={committed} />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void finalize('cash')}
                className="flex flex-col items-center gap-2 rounded-2xl bg-[oklch(0.879_0.033_85)] py-6 text-[oklch(0.232_0.019_70)] ring-2 ring-transparent transition-move active:scale-[0.97] disabled:opacity-40"
              >
                <Cash size={26} />
                <span className="text-[13px] font-bold tracking-wide uppercase">
                  {busy && method === 'cash' ? 'Processing…' : 'Paid in cash'}
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
                  {busy && method === 'qr' ? 'Processing…' : 'Paid by QR'}
                </span>
              </button>
              {/* Credit has its own step: the cashier either settles now (above) or leaves some of it owed (next screen). */}
              <button
                type="button"
                disabled={busy || !owedBy}
                onClick={() => setStep('credit')}
                className="col-span-2 flex items-center justify-center gap-2 rounded-2xl py-4 text-[oklch(0.232_0.019_70)] ring-1 ring-[oklch(0.232_0.019_70)]/25 transition-move active:scale-[0.98] disabled:opacity-40"
              >
                <Receipt size={20} />
                <span className="text-[13px] font-bold tracking-wide uppercase">Pay later / on credit</span>
              </button>
              {!owedBy && <p className="col-span-2 -mt-1 text-center text-[13px] text-[oklch(0.463_0.031_74)]">Credit needs a customer — go back and add one to the bill.</p>}
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

        {step === 'credit' && committed && owedBy && (
          <div className="flex flex-col gap-5 py-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStep('method')}
              className="flex w-fit items-center gap-1 text-[13px] font-bold text-[oklch(0.463_0.031_74)] active:translate-y-px disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Back to payment methods
            </button>

            <div className="flex flex-col items-center gap-1 py-1 text-center">
              <span className="text-[13px] text-[oklch(0.463_0.031_74)]">{owedByName ?? 'Customer'} · on credit</span>
              <span className={cx(DISPLAY, 'text-[34px] leading-none font-black tnum text-[oklch(0.232_0.019_70)]')}>
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </span>
              <span className="mt-1 text-[13px] text-[oklch(0.463_0.031_74)]">How much are they paying today? Leave it empty to owe all of it.</span>
            </div>

            <CommittedSummary committed={committed} />

            <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Amount paid now</span>
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[13px] font-semibold text-[oklch(0.463_0.031_74)]">{symbolFor(committed.totals.currency)}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={paidNowText}
                  placeholder="Paid now, e.g. 500"
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value.replace(/[^0-9.]/g, '');
                    const cents = Math.max(0, Math.round((Number.parseFloat(next) || 0) * 100));
                    // Paying the whole bill is not credit; hold it just under.
                    const capped = Math.min(cents, committed.totals.total - 1);
                    setPaidNow(capped);
                    setPaidNowText(capped < cents ? (capped / 100).toFixed(2) : next);
                  }}
                  className="w-full rounded-full bg-[oklch(0.879_0.033_85)] py-3 pr-3 pl-9 text-[14px] font-bold tnum text-[oklch(0.232_0.019_70)] outline-none placeholder:font-normal placeholder:text-[oklch(0.463_0.031_74)]/70 disabled:opacity-40"
                />
              </label>
              <div role="radiogroup" aria-label="Paid now by" className="flex shrink-0 rounded-full bg-[oklch(0.879_0.033_85)] p-1">
                {(['Cash', 'QR'] as const).map((m) => {
                  const on = (m === 'QR') === paidNowQr;
                  return (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => setPaidNowQr(m === 'QR')}
                      className={cx('rounded-full px-3.5 py-2 text-[12px] font-bold disabled:opacity-40', on ? 'bg-[oklch(0.232_0.019_70)] text-[oklch(0.943_0.024_85)]' : 'text-[oklch(0.463_0.031_74)]')}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>
            <div role="radiogroup" aria-label="Rest is due" className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[oklch(0.463_0.031_74)]">Rest is due</span>
              {([7, 14, 30, null] as const).map((d) => {
                const on = dueInDays === d;
                return (
                  <button
                    key={String(d)}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={busy}
                    onClick={() => setDueInDays(d)}
                    className={cx('rounded-full px-3.5 py-2 text-[12px] font-bold disabled:opacity-40', on ? 'bg-[oklch(0.232_0.019_70)] text-[oklch(0.943_0.024_85)]' : 'bg-[oklch(0.879_0.033_85)] text-[oklch(0.463_0.031_74)]')}
                  >
                    {d === null ? 'No date' : `In ${d} days`}
                  </button>
                );
              })}
            </div>
            <dl className="space-y-1 text-[12px] text-[oklch(0.463_0.031_74)]">
              <div className="flex items-baseline justify-between">
                <dt>Paid now{paidNow > 0 ? ` by ${paidNowQr ? 'QR' : 'cash'}` : ''}</dt>
                <dd className="tnum font-bold text-[oklch(0.232_0.019_70)]">{formatMoney(paidNow, committed.totals.currency)}</dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>On credit</dt>
                <dd className="tnum font-bold text-[oklch(0.539_0.163_36)]">{formatMoney(committed.totals.total - paidNow, committed.totals.currency)}</dd>
              </div>
            </dl>
            <button
              type="button"
              disabled={busy}
              onClick={() => void finalize('credit')}
              className="flex items-center justify-center gap-2 rounded-2xl py-3.5 text-[oklch(0.232_0.019_70)] ring-1 ring-[oklch(0.232_0.019_70)]/30 transition-move active:scale-[0.98] disabled:opacity-40"
            >
              <Receipt size={18} />
              <span className="text-[13px] font-bold tracking-wide">
                {busy && method === 'credit' ? 'Recording…' : paidNow > 0 ? `Take ${formatMoney(paidNow, committed.totals.currency)}, put the rest on credit` : 'Put all of it on credit'}
              </span>
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
              className="flex w-fit items-center gap-1 self-start text-[13px] font-bold text-[oklch(0.463_0.031_74)] active:translate-y-px disabled:opacity-40"
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
                {method === 'cash' ? 'Collected in cash' : method === 'credit' ? (paidNow > 0 ? `${formatMoney(paidNow, committed.totals.currency)} collected, rest on credit` : 'Left on credit, nothing collected') : 'Paid by QR'} ·{' '}
                {formatMoney(committed.totals.total, committed.totals.currency)}
              </p>
            </div>

            <div className="mt-1 grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  printReceipt(table, committed.lines, committed.totals, { name: restaurantName, legalName, vatPanNumber }, {
                    method: method === 'qr' ? 'QR' : 'CASH',
                    label: method === 'credit' ? (paidNow > 0 ? 'Part paid — rest on credit' : 'On credit — unpaid') : undefined,
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
/** What this payment is for, shown before the money is taken — for a split share, the items it covers. */
function CommittedSummary({ committed }: { committed: CommittedBill }) {
  const money = (v: number) => formatMoney(v, committed.totals.currency);
  const shown = committed.lines.slice(0, 6);
  const more = committed.lines.length - shown.length;
  return (
    <div className="rounded-2xl bg-[oklch(0.965_0.016_85)] p-4 text-[13px] ring-1 ring-[oklch(0.232_0.019_70)]/10">
      <p className="mb-2 font-bold text-[oklch(0.463_0.031_74)]">{committed.split ? 'Items in this share' : 'Paying for'}</p>
      <ul className="space-y-1 text-[oklch(0.232_0.019_70)]">
        {shown.map((l, i) => (
          <li key={`${l.dishNameSnapshot}-${i}`} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="tnum">{l.quantity}×</span> {l.dishNameSnapshot}
            </span>
            <span className="shrink-0 tnum">{money(l.total)}</span>
          </li>
        ))}
        {more > 0 && <li className="text-[oklch(0.463_0.031_74)]">+ {more} more</li>}
      </ul>
      <dl className="mt-3 space-y-1 border-t border-dashed border-[oklch(0.232_0.019_70)]/25 pt-3 text-[oklch(0.463_0.031_74)]">
        <div className="flex items-baseline justify-between gap-3">
          <dt>Customer</dt>
          <dd className="truncate font-semibold text-[oklch(0.232_0.019_70)]">{committed.customerName ?? 'None'}</dd>
        </div>
        {committed.totals.discount > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt>Discount and points</dt>
            <dd className="tnum">−{money(committed.totals.discount)}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function HoldBack() {
  useDiscardBack();
  return null;
}

/** A second modal over the bill, for picking one thing. Its own backdrop swallows clicks so the bill beneath stays open. */
export function PickerModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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

export const PICKER_SEARCH =
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
                  {n > 0 && <span className="ml-2 rounded-full bg-[oklch(0.539_0.163_36)] px-2 py-0.5 text-[12px] font-bold text-[oklch(0.985_0.01_85)]">+{n}</span>}
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
    <div className="text-[13px] font-semibold text-[oklch(0.463_0.031_74)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <Contact size={14} className="shrink-0" />
          <span className="truncate">{name ? <span className="text-[oklch(0.232_0.019_70)]">{name}</span> : 'No customer on this bill'}</span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-full bg-[oklch(0.879_0.033_85)] px-3.5 py-2 text-[12.5px] font-bold text-[oklch(0.232_0.019_70)] disabled:opacity-40"
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
