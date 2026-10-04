import { useState } from 'react';
import { PAY_METHOD_LABEL, settleInvoice } from '../../api/platformConsole';
import type { Invoice, PayMethod } from '../../api/platformConsole';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, Select, TextInput, useCommand } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { rupees } from './kit';

const METHODS = (Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((value) => ({ value, label: PAY_METHOD_LABEL[value] }));

/**
 * Payment is settled by a person today — someone sees the transfer land and
 * says so here. This is the whole workflow, so it opens in place, under the
 * row it belongs to, rather than in a modal that hides which invoice it is for.
 */
export function SettleForm({
  invoice,
  onDone,
  onCancel,
  className,
}: {
  invoice: Pick<Invoice, 'id' | 'number' | 'amount' | 'tenantName'>;
  onDone: () => void;
  onCancel: () => void;
  className?: string;
}) {
  const { busy, run } = useCommand();
  const [method, setMethod] = useState<PayMethod>('BANK');
  const [reference, setReference] = useState('');

  return (
    <form
      className={cx('grid gap-3 rounded-xl bg-surface-2/70 p-3.5 ring-1 ring-hairline ring-inset sm:grid-cols-[1fr_1.3fr_auto] sm:items-end', className)}
      onSubmit={(e) => {
        e.preventDefault();
        void run('settle', () => settleInvoice(invoice.id, method, reference.trim()), `${invoice.number} marked paid. ${invoice.tenantName} is back in good standing.`).then((ok) => ok && onDone());
      }}
    >
      <Field label="Received by">
        <Select value={method} onChange={setMethod} options={METHODS} />
      </Field>
      <Field label="Reference" hint="Optional. Transaction or voucher number.">
        <TextInput value={reference} onChange={setReference} maxLength={60} placeholder="TXN483320" />
      </Field>
      <div className="flex gap-2 sm:pb-[22px]">
        <button type="button" onClick={onCancel} className={ADMIN_GHOST} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy}>
          {busy ? 'Saving…' : `Mark ${rupees(invoice.amount)} paid`}
        </button>
      </div>
    </form>
  );
}
