import { shortDate, stampText } from '../../components/time';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCustomers } from '../../api/customers';
import { getPayment, listPayments, listTables } from '../../api/staff';
import { ADMIN_GHOST, Empty, INPUT_BOX, Loading, PageTitle, Segmented, Select } from '../../components/admin/kit';
import { printReceipt } from '../../components/admin/receipt';
import { Collections, METHOD_LABEL, SaleActions, StatusChip, owedOn } from '../../components/admin/SaleSettle';
import { ChevronRight } from '../../components/icons';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import type { Payment, PaymentMethod, PaymentStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const PAGE = 25;
type StatusFilter = 'all' | PaymentStatus;
type MethodFilter = 'all' | PaymentMethod;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
];

/** A day's start / end as the API's inclusive window. */
const dayStart = (v: string) => new Date(`${v}T00:00`).toISOString();
const dayEnd = (v: string) => new Date(`${v}T23:59:59.999`).toISOString();

/**
 * What was sold, what has been collected against it, and what is still owed — one row per sale, however many
 * times it was paid. Collecting the rest of a sale adds a collection to that row; it never makes a second sale,
 * so a sale is counted once as revenue and its money is counted when it arrives.
 */
export function Sales() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const [params, setParams] = useSearchParams();
  const tables = useAsync(() => listTables(staff), [staff]);
  const customers = useAsync(() => listCustomers({ limit: 100 }), []);

  const [status, setStatus] = useState<StatusFilter>('all');
  const [method, setMethod] = useState<MethodFilter>('all');
  const [customerId, setCustomerId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [rows, setRows] = useState<Payment[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const openId = params.get('sale');

  const query = useMemo(
    () => ({
      paymentStatus: status === 'all' ? undefined : status,
      method: method === 'all' ? undefined : method,
      customerId: customerId === 'all' ? undefined : customerId,
      from: from ? dayStart(from) : undefined,
      to: to ? dayEnd(to) : undefined,
    }),
    [status, method, customerId, from, to],
  );

  const load = useCallback(
    async (offset: number) => {
      setLoading(true);
      setFailed(null);
      try {
        const page = await listPayments(staff, offset, PAGE, query);
        setRows((prev) => (offset === 0 ? page.rows : [...prev, ...page.rows.filter((p) => !prev.some((q) => q.id === p.id))]));
        setCount(page.count);
      } catch (error) {
        setFailed(error instanceof Error ? error.message : 'Could not read the sales.');
      } finally {
        setLoading(false);
      }
    },
    [staff, query],
  );
  useEffect(() => void load(0), [load]);

  // A sale linked from elsewhere may be older than the first page: fetch it so the link always lands.
  const [linked, setLinked] = useState<Payment | null>(null);
  useEffect(() => {
    if (openId && !rows.some((p) => p.id === openId)) void getPayment(staff, openId).then(setLinked, () => setLinked(null));
  }, [openId, rows, staff]);

  const replace = (next: Payment) => {
    setRows((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    setLinked((prev) => (prev?.id === next.id ? next : prev));
  };

  const tableName = (id: string | null) => (id ? (tables.data?.find((t) => t.id === id)?.name ?? 'Table') : 'Delivery');
  const currency = rows[0]?.currency ?? menu?.restaurant.currency ?? '';
  const money = (v: number) => formatMoney(v, currency);

  const sold = rows.reduce((n, p) => n + p.total, 0);
  const collected = rows.reduce((n, p) => n + p.paidAmount, 0);
  const refunded = rows.reduce((n, p) => n + p.refundedAmount, 0);
  const owed = rows.reduce((n, p) => n + owedOn(p), 0);

  const shown = linked && !rows.some((p) => p.id === linked.id) ? [linked, ...rows] : rows;
  const customerOptions = [{ value: 'all', label: 'Every customer' }, ...(customers.data?.rows ?? []).map((c) => ({ value: c.id, label: c.name }))];

  const print = (p: Payment) =>
    printReceipt(
      { name: tableName(p.tableId) },
      p.items.map((i) => ({ dishNameSnapshot: i.dishNameSnapshot, quantity: i.quantity, total: i.unitPrice * i.quantity })),
      { currency: p.currency, subtotal: p.subtotal, serviceCharge: p.serviceCharge, tax: p.tax, discount: p.discount, total: p.total },
      menu.restaurant,
      {
        method: p.method,
        // What was really collected: a credit sale is unpaid, and a split bill lists each method.
        label:
          p.paymentStatus === 'UNPAID'
            ? 'On credit — unpaid'
            : [...new Set(p.tenders.filter((t) => t.status === 'SUCCEEDED').map((t) => METHOD_LABEL[t.method]))].join(' + ') || undefined,
        takenBy: p.createdByName,
      },
      p.customerName,
    );

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Sales" subtitle="What was sold, what has been collected, and what is still owed. Collecting a balance adds to the sale — it never creates a second one." />
      </div>

      <div className="mb-4 flex animate-rise flex-wrap items-center gap-3 [animation-delay:60ms]">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented label="Payment status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
        <Select<MethodFilter>
          className="w-40"
          aria-label="Filter by payment method"
          value={method}
          onChange={setMethod}
          options={[{ value: 'all', label: 'Any method' }, ...(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => ({ value: m, label: METHOD_LABEL[m] }))]}
        />
        <Select className="w-48" aria-label="Filter by customer" value={customerId} onChange={setCustomerId} options={customerOptions} />
        <input type="date" aria-label="From day" className={cx(INPUT_BOX, '!h-10 !w-auto')} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-[13px] text-ink-3">to</span>
        <input type="date" aria-label="To day" className={cx(INPUT_BOX, '!h-10 !w-auto')} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </div>

      {rows.length > 0 && (
        <dl className="mb-5 grid animate-rise [animation-delay:120ms] grid-cols-2 gap-x-6 gap-y-3 border-y border-hairline py-4 sm:grid-cols-4">
          <Figure label={`Sold (${rows.length}${count > rows.length ? ` of ${count}` : ''} sales)`} value={money(sold)} />
          <Figure label="Collected" value={money(collected)} />
          <Figure label="Refunded" value={money(refunded)} />
          <Figure label="Still owed" value={money(owed)} tone={owed > 0 ? 'owed' : undefined} />
        </dl>
      )}

      {failed ? (
        <Empty emoji="⚠️" title="Couldn't read the sales" message={failed} action={<button type="button" className={ADMIN_GHOST} onClick={() => void load(0)}>Try again</button>} />
      ) : loading && rows.length === 0 ? (
        <Loading label="Reading the sales…" />
      ) : shown.length === 0 ? (
        <Empty emoji="🧾" title="No sales match" message="Nothing was sold in these days, or none fits the filters. Try a wider range." />
      ) : (
        <ul className="divide-y divide-hairline rounded-2xl ring-1 ring-hairline ring-inset">
          {shown.map((p, n) => {
            const open = p.id === openId;
            return (
              <li key={p.id} style={{ animationDelay: `${180 + Math.min(n, 8) * 40}ms` }} className="animate-rise">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setParams(open ? {} : { sale: p.id }, { replace: true })}
                  className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto_auto]"
                >
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px]">{tableName(p.tableId)}{p.customerName ? ` · ${p.customerName}` : ''}</b>
                    <span className="block text-[12px] text-ink-3 tnum">{stampText(p.createdAt)} · #{p.id.slice(0, 8).toUpperCase()}</span>
                  </span>
                  <span className="hidden truncate text-[13px] text-ink-3 sm:block">{p.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}</span>
                  <span className="text-right text-[14px] font-semibold tnum">{money(p.total)}</span>
                  <span className="hidden text-right text-[13px] text-ink-3 tnum sm:block">{owedOn(p) > 0 ? `${money(owedOn(p))} owed` : ''}</span>
                  <StatusChip status={p.paymentStatus} />
                  <ChevronRight size={16} className={cx('hidden text-ink-4 transition-transform sm:block', open && 'rotate-90')} />
                </button>

                {open && (
                  <div className="grid gap-6 border-t border-hairline bg-surface-2/30 px-4 py-5 lg:grid-cols-2">
                    <div className="grid content-start gap-4">
                      <ul className="grid gap-1 text-[13.5px]">
                        {p.items.map((i) => (
                          <li key={i.id} className="flex justify-between gap-3">
                            <span><b className="tnum">{i.quantity}×</b> {i.dishNameSnapshot}</span>
                            <span className="tnum">{money(i.unitPrice * i.quantity)}</span>
                          </li>
                        ))}
                      </ul>
                      <dl className="grid gap-1 border-t border-hairline pt-3 text-[13px] text-ink-3">
                        <Line label="Subtotal" value={money(p.subtotal)} />
                        {p.discount > 0 && <Line label="Discount" value={`−${money(p.discount)}`} />}
                        <Line label="Service" value={money(p.serviceCharge)} />
                        <Line label="Tax" value={money(p.tax)} />
                        <Line label="Total" value={money(p.total)} strong />
                        <Line label="Collected" value={money(p.paidAmount)} />
                        {p.refundedAmount > 0 && <Line label="Refunded" value={`−${money(p.refundedAmount)}`} />}
                        <Line label="Still owed" value={money(owedOn(p))} strong />
                        {p.dueDate && owedOn(p) > 0 && <Line label="Due" value={shortDate(p.dueDate)} />}
                      </dl>
                      <p className="flex flex-wrap gap-3 text-[13px] font-semibold">
                        {p.tableId && <Link className="text-flame underline underline-offset-2" to={`/admin/tables/${p.tableId}`}>Open the table</Link>}
                        {!p.tableId && <Link className="text-flame underline underline-offset-2" to="/admin/delivery">Open delivery</Link>}
                        <button type="button" className="text-flame underline underline-offset-2" onClick={() => print(p)}>Print receipt</button>
                      </p>
                    </div>
                    <div className="grid content-start gap-4">
                      <h2 className="text-[14px] font-semibold">Payment history</h2>
                      <Collections payment={p} />
                      <SaleActions key={`${p.paidAmount}-${p.refundedAmount}`} payment={p} onChanged={replace} />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {rows.length < count && !failed && (
        <div className="mt-4 flex justify-center">
          <button type="button" className={ADMIN_GHOST} disabled={loading} onClick={() => void load(rows.length)}>
            {loading ? 'Loading…' : `Show more (${count - rows.length} left)`}
          </button>
        </div>
      )}
    </>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'owed' }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className={cx('mt-0.5 text-[20px] font-semibold tnum', tone === 'owed' && 'text-berry')}>{value}</dd>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cx('flex justify-between gap-3', strong && 'font-semibold text-ink')}>
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
