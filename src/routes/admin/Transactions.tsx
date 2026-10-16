import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCustomers } from '../../api/customers';
import { fetchTransactionSummary, fetchTransactions } from '../../api/finance';
import type { Transaction, TransactionType } from '../../api/finance';
import { recordSettlement } from '../../api/delivery';
import { getPayment } from '../../api/staff';
import { fetchSuppliers, paySupplier } from '../../api/suppliers';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Field, INPUT_BOX, Loading, MoneyInput, PageTitle, Segmented, Select, TextInput, useCommand } from '../../components/admin/kit';
import { METHOD_LABEL, SettleForm, StatusChip } from '../../components/admin/SaleSettle';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import type { Payment, PaymentMethod, PaymentStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const PAGE = 25;
type TypeFilter = 'all' | TransactionType;
type StatusFilter = 'all' | PaymentStatus;

const TYPES: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'SALE', label: 'Sales' },
  { value: 'PURCHASE', label: 'Purchases' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'INCOME', label: 'Income' },
  { value: 'TRANSFER', label: 'Transfers' },
  { value: 'REFUND', label: 'Refunds' },
  { value: 'DELIVERY_FEE', label: 'Courier fees' },
];
const STATUSES: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Part paid' },
  { value: 'PAID', label: 'Paid' },
];
const TYPE_LABEL: Record<TransactionType, string> = { SALE: 'Sale', PURCHASE: 'Purchase', EXPENSE: 'Expense', INCOME: 'Income', TRANSFER: 'Transfer', REFUND: 'Refund', DELIVERY_FEE: 'Courier fee' };
const dayStart = (v: string) => new Date(`${v}T00:00`).toISOString();
const dayEnd = (v: string) => new Date(`${v}T23:59:59.999`).toISOString();

/** Where a row came from — the sale, the supplier, the cash-book statement — so every figure traces back to its record. */
function sourceLink(t: Transaction): { to: string; label: string } {
  if (t.type === 'SALE') return { to: `/admin/sales?sale=${t.source.id}`, label: 'Open sale' };
  if (t.type === 'REFUND') return { to: `/admin/sales?sale=${t.saleId}`, label: 'Original sale' };
  if (t.type === 'DELIVERY_FEE') return { to: `/admin/delivery/${t.counterparty?.kind === 'PARTNER' ? 'partners' : 'riders'}/${t.counterparty?.id}`, label: 'Open courier' };
  if (t.type === 'PURCHASE') return { to: `/admin/suppliers/${encodeURIComponent(t.counterparty?.name ?? '')}`, label: 'Open supplier' };
  return { to: '/admin/ledger/transactions', label: 'Cash book' };
}

/**
 * Every financial activity, paid or not. A credit sale or credit purchase is listed the moment it happens, with
 * what is paid and what is still owed; paying it later changes that row's figures and adds no new one. Money
 * movements (cash and bank) live in the Cash book, not here.
 */
export function Transactions() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const currency = menu?.restaurant.currency ?? '';
  const money = (v: number) => formatMoney(v, currency);

  const [type, setType] = useState<TypeFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [party, setParty] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [owedOnly, setOwedOnly] = useState(false);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const summary = useAsync(() => fetchTransactionSummary(), [version]);
  const customers = useAsync(() => listCustomers({ limit: 100 }), []);
  const suppliers = useAsync(() => fetchSuppliers(), []);
  const partyOptions = [
    { value: 'all', label: 'Everyone' },
    ...(customers.data?.rows ?? []).map((c) => ({ value: `c:${c.id}`, label: `${c.name} (customer)` })),
    ...(suppliers.data ?? []).map((s) => ({ value: `s:${s.name}`, label: `${s.name} (supplier)` })),
  ];

  const query = useMemo(
    () => ({
      type: type === 'all' ? undefined : type,
      paymentStatus: status === 'all' ? undefined : status,
      customerId: party.startsWith('c:') ? party.slice(2) : undefined,
      supplier: party.startsWith('s:') ? party.slice(2) : undefined,
      outstandingOnly: owedOnly || undefined,
      from: from ? dayStart(from) : undefined,
      to: to ? dayEnd(to) : undefined,
    }),
    [type, status, party, owedOnly, from, to],
  );

  const load = async (offset: number) => {
    setLoading(true);
    setFailed(null);
    try {
      const page = await fetchTransactions({ ...query, limit: PAGE, offset });
      setRows((prev) => (offset === 0 ? page.rows : [...prev, ...page.rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setCount(page.count);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'Could not read the transactions.');
    } finally {
      setLoading(false);
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload whenever a filter or a payment changes the figures.
  useEffect(() => void load(0), [query, version]);

  const s = summary.data;
  const afterPayment = () => {
    setPaying(null);
    setVersion((v) => v + 1);
  };

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Transactions" subtitle="Everything that happened financially, paid or not. Paying a balance later updates its row — it never adds a second one." />
      </div>

      {s && (
        <dl className="mb-5 grid animate-rise [animation-delay:120ms] grid-cols-2 gap-x-6 gap-y-3 border-y border-hairline py-4 sm:grid-cols-3 lg:grid-cols-5">
          <Figure label={`Owed by customers (${s.receivables.count})`} value={money(s.receivables.outstanding)} />
          <Figure label="Of that, overdue" value={money(s.receivables.overdue)} tone={s.receivables.overdue > 0 ? 'bad' : undefined} />
          <Figure label={`Owed to suppliers (${s.payables.count})`} value={money(s.payables.outstanding)} />
          <Figure label={`Owed to couriers (${s.courierFees.count})`} value={money(s.courierFees.outstanding)} />
          <div className="flex items-end">
            <button type="button" aria-pressed={owedOnly} className={cx(ADMIN_GHOST, owedOnly && 'ring-flame')} onClick={() => setOwedOnly((v) => !v)}>
              {owedOnly ? 'Showing only what is owed' : 'Show only what is owed'}
            </button>
          </div>
        </dl>
      )}

      <div className="mb-4 flex animate-rise flex-wrap items-center gap-3 [animation-delay:60ms]">
        <div className="overflow-x-auto no-scrollbar">
          <Segmented label="Type" value={type} onChange={setType} options={TYPES} />
        </div>
        <Select<StatusFilter> className="w-40" aria-label="Filter by payment status" value={status} onChange={setStatus} options={STATUSES} />
        <Select className="w-56" aria-label="Filter by customer or supplier" value={party} onChange={setParty} options={partyOptions} />
        <input type="date" aria-label="From day" className={cx(INPUT_BOX, '!h-10 !w-auto')} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-[13px] text-ink-3">to</span>
        <input type="date" aria-label="To day" className={cx(INPUT_BOX, '!h-10 !w-auto')} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
      </div>

      {failed ? (
        <Empty emoji="⚠️" title="Couldn't read the transactions" message={failed} action={<button type="button" className={ADMIN_GHOST} onClick={() => void load(0)}>Try again</button>} />
      ) : loading && rows.length === 0 ? (
        <Loading label="Reading the transactions…" />
      ) : rows.length === 0 ? (
        <Empty emoji="📒" title="Nothing here" message="No transaction fits these filters. Try a wider range or another type." />
      ) : (
        <ul className="divide-y divide-hairline rounded-2xl ring-1 ring-hairline ring-inset">
          {rows.map((t, n) => {
            const link = sourceLink(t);
            const overdue = t.dueDate && t.outstandingAmount > 0 && new Date(t.dueDate) < new Date();
            const canPay = t.outstandingAmount > 0 && (t.type === 'SALE' ? can(staff.role, 'orders:advance') : can(staff.role, 'ledger:manage'));
            return (
              <li key={t.id} style={{ animationDelay: `${180 + Math.min(n, 8) * 40}ms` }} className="animate-rise px-4 py-3.5">
                <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1.6fr)_auto_auto_auto_auto]">
                  <span className="min-w-0">
                    <b className="block truncate text-[14.5px]">
                      <span className="mr-2 text-[12px] font-semibold text-ink-3">{TYPE_LABEL[t.type]}</span>
                      {t.description}
                    </b>
                    <span className="block truncate text-[12px] text-ink-3 tnum">
                      {new Date(t.transactionDate).toLocaleDateString()}
                      {t.counterparty ? ` · ${t.counterparty.name}` : ''}
                      {t.dueDate ? ` · due ${new Date(t.dueDate).toLocaleDateString()}` : ''}
                      {' · '}
                      <Link to={link.to} className="font-semibold text-flame underline underline-offset-2">{link.label}</Link>
                    </span>
                  </span>
                  <span className="text-right text-[14px] font-semibold tnum">
                    {money(t.totalAmount)}
                    {t.paidAmount !== t.totalAmount && <span className="block text-[12px] font-normal text-ink-3">{money(t.paidAmount)} paid</span>}
                  </span>
                  <span className={cx('hidden text-right text-[13px] tnum sm:block', overdue ? 'font-semibold text-berry' : 'text-ink-3')}>
                    {t.outstandingAmount > 0 ? `${money(t.outstandingAmount)} ${overdue ? 'overdue' : 'owed'}` : ''}
                  </span>
                  <StatusChip status={t.paymentStatus} />
                  {canPay ? (
                    <button type="button" className={ADMIN_GHOST} aria-expanded={paying === t.id} onClick={() => setPaying(paying === t.id ? null : t.id)}>
                      {paying === t.id ? 'Cancel' : t.type === 'SALE' ? 'Record payment' : t.type === 'DELIVERY_FEE' ? 'Pay courier' : 'Pay supplier'}
                    </button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </div>
                {paying === t.id && (
                  <div className="mt-3 border-t border-hairline pt-4">
                    {t.type === 'SALE' ? <SaleSettle saleId={t.source.id} onDone={afterPayment} /> : t.type === 'DELIVERY_FEE' ? <PayCourier tx={t} money={money} currency={currency} branchId={staff.branchId ?? ''} onDone={afterPayment} /> : <PayBill tx={t} money={money} currency={currency} onDone={afterPayment} />}
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

/** Reads the sale fresh before offering to collect, so the amount offered is what the server says is owed right now. */
function SaleSettle({ saleId, onDone }: { saleId: string; onDone: () => void }) {
  const staff = useStaff();
  const sale = useAsync<Payment>(() => getPayment(staff, saleId), [saleId]);
  if (sale.error) return <p className="text-[13px] text-berry" role="alert">{sale.error.message}</p>;
  if (!sale.data) return <Loading label="Reading the sale…" />;
  return <SettleForm payment={sale.data} onDone={onDone} />;
}

/** Pays a courier what they are owed. It settles their oldest unpaid delivery first, and the cash-book outflow is posted by the settlement. */
function PayCourier({ tx, money, currency, branchId, onDone }: { tx: Transaction; money: (v: number) => string; currency: string; branchId: string; onDone: () => void }) {
  const { run, busy } = useCommand();
  const [amount, setAmount] = useState<number>(tx.outstandingAmount);
  const [method, setMethod] = useState<'CASH' | 'BANK'>('CASH');
  const over = amount > tx.outstandingAmount;
  const courier = tx.counterparty;
  if (!courier?.id) return null;
  const account = courier.kind === 'PARTNER' ? ({ kind: 'PARTNER', id: courier.id } as const) : ({ kind: 'RIDER', id: courier.id } as const);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(`courier-${tx.id}`, () => recordSettlement(branchId, account, { direction: 'PAYOUT', amount, offset: 0, method, note: tx.description }), `${money(amount)} paid to ${courier.name}`).then((ok) => ok && onDone());
      }}
    >
      <Field label="Amount" hint={over ? `More than the ${money(tx.outstandingAmount)} owed on this delivery.` : `${money(tx.outstandingAmount)} owed on this delivery. Payments go to ${courier.name}'s oldest unpaid delivery first.`}>
        <MoneyInput value={amount} onChange={setAmount} currency={currency} />
      </Field>
      <Segmented label="Paid from" value={method} onChange={setMethod} options={[{ value: 'CASH', label: 'Cash' }, { value: 'BANK', label: 'Bank' }]} />
      <div>
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || amount <= 0 || over}>
          {busy ? 'Paying…' : `Pay ${money(amount)}`}
        </button>
      </div>
    </form>
  );
}

/** Pays a supplier. What a supplier is owed is one running balance, so the payment settles their oldest unpaid delivery first. */
function PayBill({ tx, money, currency, onDone }: { tx: Transaction; money: (v: number) => string; currency: string; onDone: () => void }) {
  const { run, busy } = useCommand();
  const [amount, setAmount] = useState<number>(tx.outstandingAmount);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [note, setNote] = useState('');
  const over = amount > tx.outstandingAmount;
  const supplier = tx.counterparty?.name ?? '';
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void run(`pay-${tx.id}`, () => paySupplier({ supplier, amount, method, note }), `${money(amount)} paid to ${supplier}`).then((ok) => ok && onDone());
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" hint={over ? `More than the ${money(tx.outstandingAmount)} owed on this delivery.` : `${money(tx.outstandingAmount)} owed on this delivery. Payments go to ${supplier}'s oldest unpaid delivery first.`}>
          <MoneyInput value={amount} onChange={setAmount} currency={currency} />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={note} onChange={setNote} placeholder="Cheque, transfer reference…" />
        </Field>
      </div>
      <Segmented label="Paid from" value={method} onChange={setMethod} options={(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: value === 'CARD' ? 'Bank' : METHOD_LABEL[value] }))} />
      <div>
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || amount <= 0 || over}>
          {busy ? 'Paying…' : `Pay ${money(amount)}`}
        </button>
      </div>
    </form>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div>
      <dt className="text-[12.5px] text-ink-3">{label}</dt>
      <dd className={cx('mt-0.5 text-[20px] font-semibold tnum', tone === 'bad' && 'text-berry')}>{value}</dd>
    </div>
  );
}
