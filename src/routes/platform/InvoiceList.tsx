import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PAY_METHOD_LABEL, remindInvoices, voidInvoice } from '../../api/platformConsole';
import type { Invoice } from '../../api/platformConsole';
import { ADMIN_TINY, Confirm, useCommand } from '../../components/admin/kit';
import { Check, Send } from '../../components/icons';
import { cx } from '../../components/ui';
import { Avatar, InvoiceBadge, dueLabel, relTime, rupees, shortDay } from './kit';
import { SettleForm } from './Settle';

/**
 * Invoices as rows an operator can act on in place. Paying, reminding and
 * voiding are the three things ever done to an invoice, so each is one control
 * on the row; marking paid opens its form directly underneath.
 */
export function InvoiceList({ invoices, showTenant = true, onChange }: { invoices: Invoice[]; showTenant?: boolean; onChange: () => void }) {
  return (
    <ul>
      {invoices.map((inv) => (
        <InvoiceRow key={inv.id} inv={inv} showTenant={showTenant} onChange={onChange} />
      ))}
    </ul>
  );
}

function InvoiceRow({ inv, showTenant, onChange }: { inv: Invoice; showTenant: boolean; onChange: () => void }) {
  const { busy, run } = useCommand();
  const [settling, setSettling] = useState(false);
  const unpaid = inv.state === 'OPEN' || inv.state === 'OVERDUE';

  return (
    <li className="border-b border-hairline px-4 py-3.5 last:border-0 sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {showTenant && <Avatar name={inv.tenantName} size={34} />}
        <div className="min-w-[160px] flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {showTenant ? (
              <Link to={`/platform/restaurants/${inv.tenantId}`} className="text-[14px] font-semibold hover:underline">
                {inv.tenantName}
              </Link>
            ) : (
              <span className="text-[14px] font-semibold">{inv.periodLabel}</span>
            )}
            <span className="text-[12.5px] text-ink-4 tnum">{inv.number}</span>
          </div>
          <div className="text-[12.5px] text-ink-3">
            {showTenant && <>{inv.planName} · {inv.periodLabel} · </>}
            {inv.state === 'PAID' && inv.paidAt
              ? `paid ${shortDay(inv.paidAt)}${inv.method ? ` by ${PAY_METHOD_LABEL[inv.method]}` : ''}${inv.reference ? ` · ${inv.reference}` : ''}`
              : inv.state === 'VOID'
                ? 'voided'
                : `${dueLabel(inv.dueAt)}${inv.remindedAt ? ` · reminded ${relTime(inv.remindedAt)}` : ''}`}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[14px] font-semibold tnum">{rupees(inv.amount)}</span>
          <InvoiceBadge state={inv.state} />
        </div>

        {unpaid && !settling && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" className={cx(ADMIN_TINY, 'bg-flame text-white')} onClick={() => setSettling(true)}>
              <Check size={13} /> Mark paid
            </button>
            <button
              type="button"
              disabled={busy}
              className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:text-ink')}
              onClick={() => void run('remind', () => remindInvoices([inv.id]), `Reminder sent for ${inv.number}.`).then((ok) => ok && onChange())}
            >
              <Send size={13} /> Remind
            </button>
            <Confirm label="Void" question={`Void ${inv.number}?`} confirmLabel="Void" onConfirm={() => void run('void', () => voidInvoice(inv.id), `${inv.number} voided.`).then((ok) => ok && onChange())} />
          </div>
        )}
      </div>

      {settling && (
        <SettleForm
          className="mt-3"
          invoice={inv}
          onCancel={() => setSettling(false)}
          onDone={() => {
            setSettling(false);
            onChange();
          }}
        />
      )}
    </li>
  );
}
