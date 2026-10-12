import { useEffect, useState } from 'react';
import { fetchIngredients, formatQty, returnStock } from '../../api/inventory';
import type { SupplierDelivery } from '../../api/suppliers';
import { formatMoney } from '../../domain/money';
import type { Minor, PaymentMethod } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { X } from '../icons';
import { cx } from '../ui';
import { ADMIN_GHOST, Field, MoneyInput, Segmented, TextInput, useCommand } from './kit';
import { QtyField } from './QtyField';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from './Sheet';

const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Send part of one delivery back to its supplier, from the supplier's page. The delivery is already
 * chosen, so it is just how much and what they give back. The refund follows their share of the price
 * until it is typed by hand. Same rules as returning from the Stock page, which the server enforces.
 */
export function ReturnSheet({ supplier, delivery, currency, onClose, onSaved }: { supplier: string; delivery: SupplierDelivery; currency: string; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useCommand();
  // What is on the shelf now: stock already used belongs to no delivery, so it cannot go back.
  const shelf = useAsync(() => fetchIngredients().then((all) => all.find((i) => i.id === delivery.ingredientId) ?? null), [delivery.ingredientId]);
  const [qty, setQty] = useState<number | ''>('');
  const [refund, setRefund] = useState<Minor>(0);
  const [typed, setTyped] = useState(false);
  const [refundKey, setRefundKey] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [note, setNote] = useState('');

  const room = Math.min(delivery.remaining, shelf.data?.quantity ?? delivery.remaining);
  const cost = delivery.cost ?? 0;
  const share = cost && qty ? Math.min(Math.round((cost * qty) / delivery.quantity), Math.max(0, cost - delivery.refunded)) : 0;

  useEffect(() => {
    if (!typed && share !== refund) {
      setRefund(share);
      setRefundKey((k) => k + 1);
    }
  }, [typed, share, refund]);

  const ok = !!qty && qty <= room && refund <= share;
  const close = { current: null as null | (() => void) };

  const save = () => {
    if (!qty || !ok) return;
    void run('return', () => returnStock(delivery.ingredientId, { lotId: delivery.id, quantity: qty, refund, method, note: note.trim() }), `${delivery.ingredientName} sent back to ${supplier}`).then((done) => {
      if (!done) return;
      onSaved();
      close.current?.();
    });
  };

  return (
    <Sheet label={`Return ${delivery.ingredientName}`} onClose={onClose}>
      {(done) => {
        close.current = done;
        return (
          <>
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0">
                <h2 className="text-[22px] font-semibold tracking-tight">Return {delivery.ingredientName}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                  To {supplier}. Delivered {day.format(new Date(delivery.receivedAt))}: {formatQty(delivery.quantity, delivery.unit)}, {formatQty(delivery.remaining, delivery.unit)} left.
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => done()} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
                <X size={16} />
              </button>
            </div>

            <form
              className="grid flex-1 content-start gap-4 overflow-y-auto px-5 pt-5"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Field label="How much goes back" hint={shelf.loading && !shelf.data ? undefined : `Up to ${formatQty(room, delivery.unit)}${room < delivery.remaining ? ' (what is on the shelf)' : ''}.`}>
                <QtyField unit={delivery.unit} onChange={setQty} big={delivery.unit !== 'pcs' && delivery.quantity >= 1000} />
              </Field>
              <Field
                label="What they give back"
                hint={
                  cost
                    ? delivery.onCredit
                      ? `It comes off what you still owe ${supplier} first; anything beyond that is money back, recorded as income.`
                      : 'Money back, recorded in the cash book as income. Leave it at 0 if you are waiting for a replacement.'
                    : 'No price was entered for this delivery, so there is nothing to refund.'
                }
              >
                <MoneyInput
                  key={refundKey}
                  value={refund}
                  onChange={(v) => {
                    setTyped(true);
                    setRefund(v);
                  }}
                  currency={currency}
                />
              </Field>
              {refund > 0 && (
                <Segmented
                  label={delivery.onCredit ? 'Any money back received as' : 'Received as'}
                  value={method}
                  onChange={setMethod}
                  options={[
                    { value: 'CASH', label: 'Cash' },
                    { value: 'CARD', label: 'Bank' },
                  ]}
                />
              )}
              <Field label="Why (optional)">
                <TextInput value={note} onChange={setNote} maxLength={200} placeholder="Spoiled, wrong item…" />
              </Field>
              {qty ? (
                <p
                  className={cx('max-w-[62ch] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ring-1 ring-inset', qty > room || refund > share ? 'bg-berry/10 text-berry-ink ring-berry/25' : 'bg-surface-2/60 text-ink-2 ring-hairline')}
                  aria-live="polite"
                >
                  {qty > room
                    ? `Only ${formatQty(room, delivery.unit)} can go back from that delivery.`
                    : refund > share
                      ? `They can't give back more than ${formatMoney(share, currency)} for this much.`
                      : refund > 0
                        ? `${formatMoney(refund, currency)} ${delivery.onCredit ? `comes off what you owe ${supplier}; any of it you have already paid for comes back as money, filed as income.` : 'is filed in the cash book as income.'}`
                        : 'No money is expected back.'}
                </p>
              ) : null}
              <div className={SHEET_FOOT}>
                <button type="submit" disabled={busy || !ok} className={FOOT_PRIMARY}>
                  {qty ? `Return ${formatQty(qty, delivery.unit)}` : 'Return stock'}
                </button>
                <button type="button" className={cx(ADMIN_GHOST, 'h-11')} onClick={() => done()}>
                  Cancel
                </button>
              </div>
            </form>
          </>
        );
      }}
    </Sheet>
  );
}
