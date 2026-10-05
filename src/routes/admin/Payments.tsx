import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listPayments, listTables } from '../../api/staff';
import { printReceipt } from '../../components/admin/receipt';
import { formatMoney, symbolFor } from '../../domain/money';
import type { Payment, PaymentMethod } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { clockTime, relativeTime } from '../../components/time';
import { DOCKET_CARD, DocketDaySection, DocketEmpty, INPUT_BOX, LedgerStat, Loading, PageTitle, Perforation, Segmented, dayLabel, groupByDay } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { Cash, Check, ChevronRight, Qr, Receipt, X } from '../../components/icons';
import { useDashboard } from './AdminLayout';

/**
 * The till's own ledger — every settled table, newest first, read straight
 * off `restaurant/payments` (the history the settle-table flow in Tables.tsx
 * writes to). Styled as the docket roll it actually is: one continuous strip
 * of paper, the same stock `printReceipt` puts through the printer, rather
 * than another dashboard table.
 */

type MethodFilter = 'all' | PaymentMethod;

const PAYMENTS_PER_PAGE = 50;
const METHOD_OPTIONS: { value: MethodFilter; label: string }[] = [
  { value: 'all', label: 'All methods' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
];

export function Payments() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const tables = useAsync(() => listTables(staff), [staff]);
  const tablesById = useMemo(() => new Map((tables.data ?? []).map((t) => [t.id, t])), [tables.data]);
  const tableName = (tableId: string | null) => (tableId ? (tablesById.get(tableId)?.name ?? 'Deleted table') : 'Delivery');

  const [tableId, setTableId] = useState('all');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [selected, setSelected] = useState<Payment | null>(null);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  // Bumped by the reset effect below every time it runs — including React
  // StrictMode's dev double-invoke of that effect, which re-clears `loadingRef`
  // out from under a fetch that's still in flight and would otherwise let a
  // second, redundant request land on top of the first and double-advance
  // `offsetRef`. A fetch that resolves under a stale generation is a no-op.
  const generationRef = useRef(0);

  const loadMorePayments = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    const generation = generationRef.current;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const { rows: nextPayments, count } = await listPayments(staff, offsetRef.current, PAYMENTS_PER_PAGE);
      if (generation !== generationRef.current) return;
      offsetRef.current += nextPayments.length;
      setHasMore(nextPayments.length > 0 && offsetRef.current < count);
      setAllPayments((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...nextPayments.filter((p) => !seen.has(p.id))];
      });
    } finally {
      if (generation === generationRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [staff, hasMore]);

  // A callback ref, not a plain ref + effect: the sentinel <div> only enters the DOM
  // once the first page has loaded, so an effect keyed on `loadMorePayments` can miss
  // that mount entirely if `hasMore` (and so the callback's identity) never changes
  // again — leaving the observer permanently attached to nothing. A callback ref fires
  // exactly when the node mounts or unmounts, so it can't miss that moment.
  const attachSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      sentinelObserverRef.current?.disconnect();
      sentinelObserverRef.current = null;
      if (!node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting && !loadingRef.current) {
            void loadMorePayments();
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(node);
      sentinelObserverRef.current = observer;
    },
    [loadMorePayments],
  );

  useEffect(() => {
    generationRef.current += 1;
    offsetRef.current = 0;
    setAllPayments([]);
    setHasMore(true);
    loadingRef.current = false;
  }, [staff]);

  useEffect(() => {
    if (allPayments.length === 0) {
      void loadMorePayments();
    }
  }, [staff]);

  const rows = allPayments;
  const tableOptions = useMemo(() => {
    const byId = new Map<string, string>();
    let hasDelivery = false;
    for (const p of rows) {
      if (p.tableId === null) {
        hasDelivery = true;
        continue;
      }
      byId.set(p.tableId, tablesById.get(p.tableId)?.name ?? 'Deleted table');
    }
    const sorted = [...byId.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return hasDelivery ? [['delivery', 'Delivery'] as [string, string], ...sorted] : sorted;
  }, [rows, tablesById]);

  const byTable = useMemo(
    () =>
      rows.filter((p) => {
        if (tableId === 'all') return true;
        if (tableId === 'delivery') return p.tableId === null;
        return p.tableId === tableId;
      }),
    [rows, tableId],
  );

  const methodCounts = useMemo(() => {
    const counts: Record<MethodFilter, number> = { all: byTable.length, CASH: 0, CARD: 0 };
    for (const p of byTable) counts[p.method] += 1;
    return counts;
  }, [byTable]);

  const filtered = useMemo(
    () => (method === 'all' ? byTable : byTable.filter((p) => p.method === method)),
    [byTable, method],
  );

  const groups = useMemo(() => groupByDay(filtered, (p) => p.createdAt), [filtered]);

  const collected = useMemo(() => rows.reduce((sum, p) => sum + p.total, 0), [rows]);
  const discounted = useMemo(() => rows.reduce((sum, p) => sum + p.discount, 0), [rows]);
  const cashCount = useMemo(() => rows.filter((p) => p.method === 'CASH').length, [rows]);
  const currency = rows[0]?.currency ?? '';
  const filtering = tableId !== 'all' || method !== 'all';

  const printPayment = (payment: Payment) => {
    const table = payment.tableId ? tablesById.get(payment.tableId) : undefined;
    printReceipt(
      { name: table?.name ?? tableName(payment.tableId), capacity: table?.capacity },
      payment.items.map((i) => ({ dishNameSnapshot: i.dishNameSnapshot, quantity: i.quantity, total: i.unitPrice * i.quantity })),
      { currency: payment.currency, subtotal: payment.subtotal, serviceCharge: payment.serviceCharge, tax: payment.tax, discount: payment.discount, total: payment.total },
      menu.restaurant,
      { method: payment.method, takenBy: payment.createdByName },
      payment.customerName,
    );
  };

  return (
    <>
      <PageTitle title="Payments" subtitle="Every table settled, with what it was actually charged and how." />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented
            label="Method"
            value={method}
            onChange={setMethod}
            options={METHOD_OPTIONS.map((o) => ({
              value: o.value,
              label: `${o.label}${methodCounts[o.value] ? ` (${methodCounts[o.value]})` : ''}`,
            }))}
          />
        </div>

        <select
          className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          aria-label="Filter by table"
        >
          <option value="all">Every table</option>
          {tableOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {rows.length > 0 && (
        <div className={cx('mb-4', DOCKET_CARD)}>
          {/* ── The roll's own header — the same document a reprint would show. ── */}
          <div className="px-6 pt-7 pb-5 text-center">
            <p className="text-[10.5px] font-bold tracking-[0.24em] text-docket-inksoft uppercase">{menu.restaurant.name}</p>
            <h2 className="font-display mt-1 text-[26px] font-black tracking-tight">Till ledger</h2>
            <p className="mt-1 text-[12px] text-docket-inksoft">
              {filtering
                ? `${filtered.length} of ${rows.length} payment${rows.length === 1 ? '' : 's'} shown`
                : `${rows.length} payment${rows.length === 1 ? '' : 's'} on record`}
            </p>
          </div>

          <Perforation />
          <div className="grid grid-cols-2 divide-x divide-dashed divide-docket-line sm:grid-cols-4">
            <LedgerStat label="Avg ticket" value={formatMoney(rows.length ? Math.round(collected / rows.length) : 0, currency)} />
            <LedgerStat label="Cash" value={`${cashCount}`} sub={`of ${rows.length}`} />
            <LedgerStat label="Card" value={`${rows.length - cashCount}`} sub={`of ${rows.length}`} />
            <LedgerStat label="Discounts" value={discounted ? formatMoney(discounted, currency) : symbolFor(currency) + '0'} />
          </div>
          <Perforation thick />
          <div className="flex items-baseline justify-between px-6 py-4">
            <span className="font-display text-[13px] font-bold tracking-[0.1em] uppercase">Total collected</span>
            <span className="font-display text-[30px] leading-none font-black tnum">{formatMoney(collected, currency)}</span>
          </div>
        </div>
      )}

      {/* ── The roll itself — every settled table, grouped one box per day. ── */}
      {rows.length === 0 && loadingMore ? (
        <div className={DOCKET_CARD}>
          <Loading label="Loading the till ledger…" />
        </div>
      ) : rows.length === 0 ? (
        <DocketEmpty
          icon={<Receipt size={28} className="text-docket-inksoft/70" />}
          title="No payments yet"
          message="Once a table is settled from the Tables screen, the charge lands here."
        />
      ) : filtered.length === 0 ? (
        <DocketEmpty
          icon={<Receipt size={28} className="text-docket-inksoft/70" />}
          title="No matches on this roll"
          message="Try a different table or method."
        />
      ) : (
        <>
          <div className="grid gap-4">
            {groups.map((group) => (
              <DocketDaySection key={group[0].id} label={dayLabel(group[0].createdAt)} count={group.length} itemLabel="payment">
                {group.map((payment) => (
                  <PaymentStub
                    key={payment.id}
                    payment={payment}
                    tableName={tableName(payment.tableId)}
                    onOpen={() => setSelected(payment)}
                  />
                ))}
              </DocketDaySection>
            ))}
          </div>

          {loadingMore && <div className="mt-4 flex justify-center"><Loading label="Loading more payments…" /></div>}

          <div ref={attachSentinel} className="mt-8 h-4" />
        </>
      )}

      {selected && (
        <PaymentDetail
          payment={selected}
          tableName={tableName(selected.tableId)}
          onClose={() => setSelected(null)}
          onPrint={() => printPayment(selected)}
        />
      )}
    </>
  );
}

function MethodStamp({ method, size = 'sm' }: { method: PaymentMethod; size?: 'sm' | 'lg' }) {
  const Icon = method === 'CASH' ? Cash : Qr;
  const big = size === 'lg';
  return (
    <span
      className={cx(
        'grid shrink-0 -rotate-6 place-items-center gap-0.5 rounded-full border-[1.5px] border-docket-ink/55 text-docket-ink/80',
        big ? 'size-16' : 'size-11',
      )}
      aria-hidden
    >
      <Icon size={big ? 20 : 14} />
      <span className={cx('font-black tracking-[0.08em] uppercase', big ? 'text-[9px]' : 'text-[7px]')}>{method}</span>
    </span>
  );
}

function PaymentStub({ payment, tableName, onOpen }: { payment: Payment; tableName: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex w-full items-center gap-3.5 border-t border-dashed border-docket-line px-6 py-4 text-left transition-colors first:border-t-0 hover:bg-docket-line/35"
    >
      <MethodStamp method={payment.method} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className="text-[14px] font-bold">{tableName}</b>
          <span className="text-[11px] text-docket-inksoft tnum">{clockTime(payment.createdAt)}</span>
        </span>
        <span className="mt-0.5 block truncate text-[12.5px] text-docket-inksoft">
          {payment.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <div className="font-display text-[16px] font-black tnum">{formatMoney(payment.total, payment.currency)}</div>
        {payment.discount > 0 ? (
          <div className="mt-0.5 text-[10.5px] text-docket-inksoft">−{formatMoney(payment.discount, payment.currency)} off</div>
        ) : (
          <div className="mt-0.5 text-[10.5px] text-docket-inksoft">{relativeTime(payment.createdAt)}</div>
        )}
      </span>
      <ChevronRight size={16} className="shrink-0 text-docket-inksoft/60 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function PaymentDetail({
  payment,
  tableName,
  onClose,
  onPrint,
}: {
  payment: Payment;
  tableName: string;
  onClose: () => void;
  onPrint: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-pop mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-[28px] bg-docket-surface text-docket-ink shadow-deep"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${tableName} receipt`}
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <p className="text-[10.5px] font-bold tracking-[0.2em] text-docket-inksoft uppercase">Receipt</p>
            <h2 className="font-display mt-0.5 text-[26px] font-black tracking-tight">{tableName}</h2>
            <p className="mt-0.5 text-[12px] text-docket-inksoft">{new Date(payment.createdAt).toLocaleString()}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full text-docket-inksoft transition-colors hover:bg-docket-line/50 hover:text-docket-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 pt-5">
          <MethodStamp method={payment.method} size="lg" />
          <span className="text-[12.5px] leading-snug text-docket-inksoft">
            Charged via <b className="text-docket-ink">{payment.method === 'CASH' ? 'cash' : 'card'}</b>
            <br />
            Reference <span className="tnum">{payment.id.slice(0, 8).toUpperCase()}</span>
          </span>
        </div>

        <div className="mx-6 mt-5 border-t border-dashed border-docket-line" />

        <ul className="px-6 py-4">
          {payment.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 py-1.5 text-[13.5px]">
              <span className="min-w-0 flex-1">
                <span className="mr-1.5 font-bold tnum">{item.quantity}×</span>
                {item.dishNameSnapshot}
              </span>
              <span className="tnum">{formatMoney(item.unitPrice * item.quantity, payment.currency)}</span>
            </li>
          ))}
        </ul>

        <div className="mx-6 border-t border-dashed border-docket-line" />

        <div className="space-y-1.5 px-6 py-4 text-[13px] text-docket-inksoft">
          <div className="flex items-center justify-between">
            <span>Subtotal</span>
            <span className="tnum">{formatMoney(payment.subtotal, payment.currency)}</span>
          </div>
          {payment.discount > 0 && (
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span className="tnum">−{formatMoney(payment.discount, payment.currency)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Service</span>
            <span className="tnum">{formatMoney(payment.serviceCharge, payment.currency)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tax</span>
            <span className="tnum">{formatMoney(payment.tax, payment.currency)}</span>
          </div>
        </div>

        <div className="mx-6 border-t-2 border-dashed border-docket-line" />

        <div className="flex items-baseline justify-between px-6 py-4">
          <span className="font-display text-[15px] font-black tracking-tight uppercase">Total</span>
          <span className="font-display text-[28px] leading-none font-black tnum">{formatMoney(payment.total, payment.currency)}</span>
        </div>

        <div className="mx-6 border-t border-dashed border-docket-line" />

        <div className="flex items-center justify-center gap-1.5 py-4 text-[11px] font-semibold text-docket-inksoft">
          <Check size={12} className="text-docket-mint" />
          Settled and closed out
        </div>

        <div className="grid grid-cols-2 gap-2.5 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[14px] bg-docket-line/70 py-3 text-[13px] font-bold tracking-wide text-docket-ink transition-transform active:translate-y-px"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onPrint}
            className="rounded-[14px] bg-flame py-3 text-[13px] font-bold tracking-wide text-white shadow-flame transition-transform active:translate-y-px"
          >
            Print receipt
          </button>
        </div>
      </div>
    </div>
  );
}
