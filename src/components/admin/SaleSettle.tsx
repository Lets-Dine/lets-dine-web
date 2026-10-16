import { useRef, useState } from 'react';
import { randomId } from '../../api/store';
import { collectPayment, refundPayment } from '../../api/finance';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import type { Payment, PaymentMethod, PaymentStatus } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, MoneyInput, Segmented, TextInput, useCommand } from './kit';

export const STATUS_LABEL: Record<PaymentStatus, string> = { UNPAID: 'Unpaid', PARTIALLY_PAID: 'Part paid', PAID: 'Paid' };
export const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Cash', CARD: 'Card', QR: 'QR' };
const METHODS = (Object.keys(METHOD_LABEL) as PaymentMethod[]).map((value) => ({ value, label: METHOD_LABEL[value] }));

/** What the customer still owes on a sale. */
// A payment saved before collections existed has no `paidAmount`: it was taken in full.
export const owedOn = (p: Pick<Payment, 'total' | 'paidAmount'>) => Math.max(0, p.total - (p.paidAmount ?? p.total));

const STATUS_TONE: Record<PaymentStatus, string> = {
  UNPAID: 'bg-berry/14 text-berry',
  PARTIALLY_PAID: 'bg-gold/20 text-gold',
  PAID: 'bg-mint/14 text-mint',
};

/** The word carries the state; the tint only helps scanning, so it is never the only signal. */
export function StatusChip({ status, className }: { status: PaymentStatus; className?: string }) {
  return <span className={cx('inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold', STATUS_TONE[status], className)}>{STATUS_LABEL[status]}</span>;
}

/** Every collection and refund against one sale, in the order it happened — the sale itself is one row, however many times it was paid. */
export function Collections({ payment }: { payment: Payment }) {
  const money = (v: number) => formatMoney(v, payment.currency);
  const lines = [
    ...(payment.tenders ?? []).filter((t) => t.status === 'SUCCEEDED').map((t) => ({ id: t.id, at: t.paidAt, label: `Collected by ${METHOD_LABEL[t.method]}`, note: t.reference, amount: t.amount, out: false })),
    ...(payment.refunds ?? []).map((r) => ({ id: r.id, at: r.createdAt, label: `Refunded by ${METHOD_LABEL[r.method]}`, note: r.reason, amount: r.amount, out: true })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  if (lines.length === 0) return <p className="text-[13px] text-ink-3">Nothing collected yet.</p>;
  return (
    <ul className="grid gap-1.5">
      {lines.map((l) => (
        <li key={l.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
          <span className="min-w-0">
            <span className="font-medium">{l.label}</span>
            <span className="ml-2 text-[12px] text-ink-3 tnum">{new Date(l.at).toLocaleString()}</span>
            {l.note && <span className="ml-2 text-[12px] text-ink-3">{l.note}</span>}
          </span>
          <span className={cx('shrink-0 font-semibold tnum', l.out && 'text-berry')}>{l.out ? '−' : ''}{money(l.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Takes money against what a sale still owes, as many times as it takes. The server decides what is owed and
 * refuses anything above it. The retry key is made once per attempt and replaced only after it lands, so a
 * double-tap or a retried request collects once.
 */
export function SettleForm({ payment, onDone }: { payment: Payment; onDone: (next: Payment) => void }) {
  const owed = owedOn(payment);
  const { run, busy } = useCommand();
  const [amount, setAmount] = useState<number>(owed);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reference, setReference] = useState('');
  const key = useRef(randomId());
  const money = (v: number) => formatMoney(v, payment.currency);
  const over = amount > owed;

  const submit = async () => {
    let saved: Payment | null = null;
    const ok = await run(
      `settle-${payment.id}`,
      async () => {
        saved = await collectPayment(payment.id, { amount, method, reference, idempotencyKey: key.current });
      },
      `${money(amount)} collected`,
    );
    if (ok && saved) {
      key.current = randomId();
      onDone(saved);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount" hint={over ? `More than the ${money(owed)} still owed.` : `${money(owed)} still owed.`}>
          <MoneyInput value={amount} onChange={setAmount} currency={payment.currency} />
        </Field>
        <Field label="Reference (optional)">
          <TextInput value={reference} onChange={setReference} placeholder="Receipt or wallet reference" />
        </Field>
      </div>
      <Segmented label="Method" value={method} onChange={setMethod} options={METHODS} />
      <div className="flex gap-2">
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || amount <= 0 || over}>
          {busy ? 'Recording…' : `Collect ${money(amount)}`}
        </button>
        {amount !== owed && (
          <button type="button" className={ADMIN_GHOST} onClick={() => setAmount(owed)}>
            Collect all {money(owed)}
          </button>
        )}
      </div>
    </form>
  );
}

/** Hands money back. The sale and its collections stay as they were; the refund is a record of its own and an outflow in the cash book. */
export function RefundForm({ payment, onDone }: { payment: Payment; onDone: (next: Payment) => void }) {
  const refundable = Math.max(0, payment.paidAmount - payment.refundedAmount);
  const { run, busy } = useCommand();
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [reason, setReason] = useState('');
  const key = useRef(randomId());
  const money = (v: number) => formatMoney(v, payment.currency);
  const over = amount > refundable;

  const submit = async () => {
    let saved: Payment | null = null;
    const ok = await run(
      `refund-${payment.id}`,
      async () => {
        saved = await refundPayment(payment.id, { amount, method, reason, idempotencyKey: key.current });
      },
      `${money(amount)} refunded`,
    );
    if (ok && saved) {
      key.current = randomId();
      setAmount(0);
      setReason('');
      onDone(saved);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Refund amount" hint={over ? `Only ${money(refundable)} can still be refunded.` : `Up to ${money(refundable)}.`}>
          <MoneyInput value={amount} onChange={setAmount} currency={payment.currency} />
        </Field>
        <Field label="Reason">
          <TextInput value={reason} onChange={setReason} placeholder="Why it is being refunded" />
        </Field>
      </div>
      <Segmented label="Paid back by" value={method} onChange={setMethod} options={METHODS} />
      <div>
        <button type="submit" className={ADMIN_GHOST} disabled={busy || amount <= 0 || over}>
          {busy ? 'Refunding…' : `Refund ${money(amount)}`}
        </button>
      </div>
    </form>
  );
}

/** Collect and refund for one sale, offered only to roles that may do each. */
export function SaleActions({ payment, onChanged }: { payment: Payment; onChanged: (next: Payment) => void }) {
  const staff = useStaff();
  const owed = owedOn(payment);
  const canRefund = can(staff.role, 'ledger:manage') && payment.paidAmount - payment.refundedAmount > 0;
  const canCollect = can(staff.role, 'orders:advance') && owed > 0;
  const [mode, setMode] = useState<'collect' | 'refund'>(canCollect ? 'collect' : 'refund');
  if (!canCollect && !canRefund) return null;
  const active = mode === 'refund' && canRefund ? 'refund' : canCollect ? 'collect' : 'refund';
  return (
    <div className="grid gap-3">
      {canCollect && canRefund && (
        <Segmented label="Action" value={active} onChange={setMode} options={[{ value: 'collect', label: 'Record payment' }, { value: 'refund', label: 'Refund' }]} />
      )}
      {active === 'collect' ? <SettleForm payment={payment} onDone={onChanged} /> : <RefundForm payment={payment} onDone={onChanged} />}
    </div>
  );
}
