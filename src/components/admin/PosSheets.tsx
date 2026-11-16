import { useMemo } from 'react';
import { listPayments } from '../../api/staff';
import { formatMoney } from '../../domain/money';
import type { DiningTable, Menu, Payment } from '../../domain/types';
import type { HeldTicket } from '../../state/useHeldTickets';
import { useStaff } from '../../state/AuthContext';
import { useToast } from '../../state/ToastContext';
import { useAsync } from '../../state/useAsync';
import { BTN_FLAME, BTN_GHOST, cx } from '../ui';
import { relativeTime, stampText } from '../time';
import { Empty, Loading } from './kit';
import { printReceipt } from './receipt';
import { METHOD_LABEL } from './SaleSettle';
import { Sheet } from './Sheet';
import { SheetHeader } from './delivery';

/** Tickets set aside, with a way back to each. Recalling takes the dishes back onto the table or floor they were for. */
export function HeldSheet({
  held,
  menu,
  onRecall,
  onDiscard,
  onClose,
  title = 'Held tickets',
  intro = 'Set aside, not sent. They stay on this device until you recall or discard them.',
}: {
  held: HeldTicket[];
  menu: Menu;
  onRecall: (ticket: HeldTicket) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
  /** POS v2 calls this parking rather than holding, and a sheet that disagrees with the button that opened it is a bug. */
  title?: string;
  intro?: string;
}) {
  const nameOf = useMemo(() => new Map(menu.dishes.map((d) => [d.id, d.name])), [menu.dishes]);
  return (
    <Sheet label={title} onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title={title} intro={intro} onClose={() => close()} />
          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
            {held.length === 0 ? (
              <Empty emoji="⏸️" title="Nothing set aside" message="Set a ticket aside to deal with it later while you serve someone else." />
            ) : (
              <ul className="grid gap-3">
                {[...held].reverse().map((t) => {
                  const count = t.lines.reduce((n, l) => n + l.qty, 0);
                  const names = t.lines.slice(0, 3).map((l) => `${l.qty}× ${nameOf.get(l.dishId) ?? 'Removed dish'}`);
                  return (
                    <li key={t.id} className="rounded-2xl bg-surface-2 p-4 ring-1 ring-hairline ring-inset">
                      <p className="flex items-baseline justify-between gap-3">
                        <b className="truncate text-[16px]">
                          {t.label}
                          {t.spot && <span className="font-normal text-ink-3"> · {t.spot}</span>}
                        </b>
                        <span className="shrink-0 text-[12.5px] text-ink-3">{relativeTime(t.at)}</span>
                      </p>
                      <p className="mt-1 text-[13.5px] text-ink-3">
                        {count} item{count === 1 ? '' : 's'}: {names.join(', ')}
                        {t.lines.length > 3 && '…'}
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          className={cx(BTN_FLAME, 'h-11 flex-1 text-[14.5px]')}
                          onClick={() => {
                            close();
                            onRecall(t);
                          }}
                        >
                          Recall
                        </button>
                        <button type="button" className={cx(BTN_GHOST, 'h-11 text-[14.5px]')} onClick={() => onDiscard(t.id)}>
                          Discard
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}

/** The latest payments, each with a receipt to print again: for the customer who lost theirs, or a printer that jammed. */
export function ReceiptsSheet({ tables, menu, onClose }: { tables: DiningTable[]; menu: Menu; onClose: () => void }) {
  const staff = useStaff();
  const push = useToast();
  const sales = useAsync(() => listPayments(staff, 0, 15), [staff]);
  const currency = menu.restaurant.currency;
  const tableName = (id: string | null) => (id ? (tables.find((t) => t.id === id)?.name ?? 'Table') : 'Counter or delivery');
  /** What the customer's copy says: a payment with no table is a counter sale or a delivery, and the receipt cannot tell which. */
  const receiptName = (id: string | null) => (id ? tableName(id) : 'Order');

  const print = (p: Payment) => {
    const opened = printReceipt(
      { name: receiptName(p.tableId) },
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
    if (!opened) push('Allow pop-ups for this site to print the receipt', '⚠️');
  };

  return (
    <Sheet label="Receipts" onClose={onClose}>
      {(close) => (
        <>
          <SheetHeader title="Receipts" intro="The latest payments. Print a receipt again for anyone who needs one." onClose={() => close()} />
          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
            {!sales.data ? (
              sales.error ? <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{sales.error.message}</p> : <Loading />
            ) : sales.data.rows.length === 0 ? (
              <Empty emoji="🧾" title="No payments yet" message="Payments you take show up here." />
            ) : (
              <ul className="divide-y divide-hairline">
                {sales.data.rows.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">
                        {tableName(p.tableId)}
                        {p.paymentStatus === 'UNPAID' && <span className="ml-2 text-[12px] font-semibold text-berry-ink">On credit</span>}
                      </p>
                      <p className="text-[12.5px] text-ink-3 tnum">{stampText(p.createdAt)}</p>
                    </div>
                    <span className="shrink-0 text-[15px] font-semibold tnum">{formatMoney(p.total, currency)}</span>
                    <button type="button" className={cx(BTN_GHOST, 'h-10 shrink-0 px-4 text-[13.5px]')} onClick={() => print(p)}>
                      Print
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
