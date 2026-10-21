import { shortDate, stampText } from '../../components/time';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCustomers } from '../../api/customers';
import { fetchPaymentsSummary } from '../../api/finance';
import { getPayment, listPayments, listTables } from '../../api/staff';
import { ADMIN_GHOST, Empty, INPUT_BOX, Loading, Select } from '../../components/admin/kit';
import { Block, Num, Result, Step, reduced, useCountUp } from '../../components/admin/profile';
import { printReceipt } from '../../components/admin/receipt';
import { Collections, METHOD_LABEL, SaleActions, StatusChip, owedOn } from '../../components/admin/SaleSettle';
import { ChevronRight } from '../../components/icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
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
  const [version, setVersion] = useState(0);

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

  // Totals come from the server over every match; summing the loaded rows would stop at the first page.
  const summary = useAsync(() => fetchPaymentsSummary(query), [query, version]).data;

  const replace = (next: Payment) => {
    setVersion((v) => v + 1);
    setRows((prev) => prev.map((p) => (p.id === next.id ? next : p)));
    setLinked((prev) => (prev?.id === next.id ? next : prev));
  };

  const tableName = (id: string | null) => (id ? (tables.data?.find((t) => t.id === id)?.name ?? 'Table') : 'Delivery');
  const currency = rows[0]?.currency ?? menu?.restaurant.currency ?? '';
  const money = (v: number) => formatMoney(v, currency);

  const shown = linked && !rows.some((p) => p.id === linked.id) ? [linked, ...rows] : rows;
  // Opening a sale brings it to the top of the screen — it may sit far down a long list, or arrive from a link.
  // Once per opening, so loading more rows or saving a payment does not pull the page back.
  const scrolled = useRef<string | null>(null);
  const inList = openId !== null && shown.some((p) => p.id === openId);
  useEffect(() => {
    if (!openId) {
      scrolled.current = null;
      return;
    }
    if (!inList || scrolled.current === openId) return;
    scrolled.current = openId;
    document.getElementById(`sale-${openId}`)?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }, [openId, inList]);

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

  const sold = useCountUp(summary?.sold ?? 0);
  const owedNow = useCountUp(summary?.owed ?? 0);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Sales</h1>

      {summary && summary.count > 0 && (
        <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[40ch]">
          {summary.count === 1 ? '1 sale' : `${summary.count.toLocaleString('en-IN')} sales`} came to <Num>{money(sold)}</Num>
          {summary.owed > 0 ? (
            <>, and <span className="text-berry-ink tnum">{money(owedNow)}</span> of it is still owed.</>
          ) : (
            <>, all of it collected.</>
          )}
        </p>
      )}

      <div className="mt-6 flex animate-rise flex-wrap items-center gap-2 [animation-delay:140ms]">
        <div role="group" aria-label="Payment status" className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((o) => (
            <button key={o.value} type="button" aria-pressed={status === o.value} className={cx(CHIP, status === o.value ? CHIP_ON : CHIP_OFF)} onClick={() => setStatus(o.value)}>
              {o.label}
            </button>
          ))}
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

      {summary && summary.count > 0 && (
        <section aria-label="Totals" className="mt-8 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
          <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
            <Cell title="Sold" sub={`${summary.count} ${summary.count === 1 ? 'sale' : 'sales'}, tax and service included`}>{money(summary.sold)}</Cell>
            <Cell title="Collected" sub={summary.refunded > 0 ? `After ${money(summary.refunded)} refunded` : 'Nothing refunded'} tone="good">{money(summary.collected)}</Cell>
            <Cell title="Still owed" sub={summary.owed > 0 ? 'On credit or part paid' : 'Everything is settled'} tone={summary.owed > 0 ? 'bad' : 'good'} alert={summary.owed > 0}>
              {summary.owed > 0 ? money(summary.owed) : 'Settled up'}
            </Cell>
          </div>
        </section>
      )}

      <div className="mt-6">
        {failed ? (
          <Empty emoji="⚠️" title="Couldn't read the sales" message={failed} action={<button type="button" className={ADMIN_GHOST} onClick={() => void load(0)}>Try again</button>} />
        ) : loading && rows.length === 0 ? (
          <Loading label="Reading the sales…" />
        ) : shown.length === 0 ? (
          <Empty emoji="🧾" title="No sales match" message="Nothing was sold in these days, or none fits the filters. Try a wider range." />
        ) : (
          <Block title="Every sale" hint="Newest first — open one to collect, refund or print" delay={260}>
            <ul className="border-t border-hairline">
              {shown.map((p, n) => {
                const open = p.id === openId;
                return (
                  <li key={p.id} id={`sale-${p.id}`} style={{ animationDelay: `${400 + Math.min(n, 10) * 45}ms` }} className="scroll-mt-24 animate-rise border-b border-hairline last:border-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setParams(open ? {} : { sale: p.id }, { replace: true })}
                      className="-mx-3 grid w-[calc(100%+1.5rem)] grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto_auto]"
                    >
                      <span className="min-w-0">
                        <b className="block truncate text-[14.5px] font-medium">{tableName(p.tableId)}{p.customerName ? ` · ${p.customerName}` : ''}</b>
                        <span className="block text-[12.5px] text-ink-3 tnum">{stampText(p.createdAt)} · #{p.id.slice(0, 8).toUpperCase()}</span>
                      </span>
                      <span className="hidden truncate text-[13px] text-ink-3 sm:block">{p.items.map((i) => `${i.quantity}× ${i.dishNameSnapshot}`).join(', ')}</span>
                      <span className="text-right text-[15px] font-semibold tnum">{money(p.total)}</span>
                      <span className="hidden text-right text-[13px] text-berry-ink tnum sm:block">{owedOn(p) > 0 ? `${money(owedOn(p))} owed` : ''}</span>
                      <StatusChip status={p.paymentStatus} />
                      <ChevronRight size={16} className={cx('hidden text-ink-4 transition-transform sm:block', open && 'rotate-90')} />
                    </button>

                    {open && <SaleDetail p={p} money={money} where={tableName(p.tableId)} onPrint={() => print(p)} onChanged={replace} />}
                  </li>
                );
              })}
            </ul>
            {rows.length < count && !failed && (
              <div className="mt-5 flex justify-center">
                <button type="button" className={ADMIN_GHOST} disabled={loading} onClick={() => void load(rows.length)}>
                  {loading ? 'Loading…' : `Show more (${count - rows.length} left)`}
                </button>
              </div>
            )}
          </Block>
        )}
      </div>
    </div>
  );
}

function Cell({ title, sub, tone, alert, children }: { title: string; sub: string; tone?: 'good' | 'bad'; alert?: boolean; children: ReactNode }) {
  return (
    <div className={cx('px-6 py-6', alert && 'bg-berry/14')}>
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', tone === 'bad' && 'text-berry-ink', tone === 'good' && 'text-mint-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

/** Delay for the nth line of the opened sale, so its lines settle in one after another. */
const at = (n: number) => 60 + Math.min(n, 12) * 40;

/** One sale opened: the bill as a sum on the left, the money against it — and what can still be done — on the right. */
function SaleDetail({ p, money, where, onPrint, onChanged }: { p: Payment; money: (v: number) => string; where: string; onPrint: () => void; onChanged: (next: Payment) => void }) {
  const owed = owedOn(p);
  let n = 0;
  return (
    <div className="mt-2 mb-5 animate-rise rounded-3xl bg-surface-2 p-5 ring-1 ring-hairline-strong ring-inset sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3 tnum">
            {where}{p.customerName ? ` · ${p.customerName}` : ''} · {stampText(p.createdAt)} · #{p.id.slice(0, 8).toUpperCase()}
          </p>
          <p className={cx(DISPLAY, 'mt-1.5 text-[clamp(32px,4.6vw,48px)] leading-none tnum')}>{money(p.total)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-ink-3">
            <StatusChip status={p.paymentStatus} />
            {owed > 0 ? <span><span className="font-semibold text-berry-ink tnum">{money(owed)}</span> still owed{p.dueDate ? `, due ${shortDate(p.dueDate)}` : ''}</span> : <span>Settled in full</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className={cx(ADMIN_GHOST, 'h-10 px-4 text-[14px]')} to={p.tableId ? `/admin/tables/${p.tableId}` : '/admin/delivery'}>{p.tableId ? 'Open the table' : 'Open delivery'}</Link>
          <button type="button" className={cx(ADMIN_GHOST, 'h-10 px-4 text-[14px]')} onClick={onPrint}>Print receipt</button>
        </div>
      </div>

      <div className="mt-6 grid gap-x-10 gap-y-8 lg:grid-cols-2">
        <section aria-label="The bill">
          <h3 className="mb-2 text-[13px] font-semibold text-ink-3">The bill</h3>
          <ul className="border-t border-hairline">
            {p.items.map((i) => (
              <Step key={i.id} label={`${i.quantity}× ${i.dishNameSnapshot}`} value={money(i.unitPrice * i.quantity)} delay={at(n++)} />
            ))}
          </ul>
          <ul className="mt-1 border-t border-hairline">
            <Step label="Subtotal" value={money(p.subtotal)} delay={at(n++)} />
            {p.discount > 0 && <Step op="−" label="Discount" value={money(p.discount)} delay={at(n++)} />}
            <Step op="+" label="Service charge" value={money(p.serviceCharge)} delay={at(n++)} />
            <Step op="+" label="Tax" value={money(p.tax)} delay={at(n++)} />
          </ul>
          <Result label="Total" value={money(p.total)} delay={at(n++)} />
        </section>

        <section aria-label="The money" className="grid content-start gap-6">
          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-3">What has been paid</h3>
            <ul className="border-t border-hairline">
              <Step label="Total" value={money(p.total)} delay={at(n++)} />
              <Step op="−" label="Collected" note={p.refundedAmount > 0 ? `${money(p.refundedAmount)} of it was refunded — handed back, so it does not reopen the balance` : undefined} value={money(p.paidAmount)} delay={at(n++)} />
            </ul>
            <Result label="Still owed" value={owed > 0 ? money(owed) : 'Nothing'} tone={owed > 0 ? 'bad' : 'good'} delay={at(n++)} />
          </div>

          <div>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-3">Payment history</h3>
            <div className="animate-rise border-t border-hairline pt-3" style={{ animationDelay: `${at(n++)}ms` }}>
              <Collections payment={p} />
            </div>
          </div>

          <div className="animate-rise empty:hidden" style={{ animationDelay: `${at(n++)}ms` }}>
            <SaleActions key={`${p.paidAmount}-${p.refundedAmount}`} payment={p} onChanged={onChanged} />
          </div>
        </section>
      </div>
    </div>
  );
}
