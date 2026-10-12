import { useEffect, useState } from 'react';
import { fetchAllSupplierPrices, priceLabel } from '../../api/suppliers';
import { fetchIngredients, formatQty, receiveDelivery } from '../../api/inventory';
import { cx } from '../ui';
import { formatMoney } from '../../domain/money';
import type { Minor, PaymentMethod } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, Field, INPUT_BOX, MoneyInput, Segmented, Select, useCommand } from './kit';
import { QtyField } from './QtyField';
import { FOOT_PRIMARY, SHEET_FOOT, Sheet } from './Sheet';
import { X } from '../icons';

const localDay = () => new Date().toLocaleDateString('en-CA');

/**
 * Buy from one supplier: pick what arrived, how much, what it cost, and whether it was paid or is
 * owed. It is the same delivery as on the Stock page, with the supplier already filled in. "Add
 * another" keeps the sheet open for the next item on the same bill.
 */
export function PurchaseSheet({ supplier, currency, onClose, onSaved }: { supplier: string; currency: string; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useCommand();
  const ingredients = useAsync(fetchIngredients, []);
  const prices = useAsync(() => fetchAllSupplierPrices(supplier).catch(() => []), [supplier]);
  const [ingredientId, setIngredientId] = useState('');
  const [qty, setQty] = useState<number | ''>('');
  const [cost, setCost] = useState<Minor>(0);
  // Once the price is typed by hand it is left alone; until then it follows the last price and the quantity.
  const [priceTyped, setPriceTyped] = useState(false);
  const [onCredit, setOnCredit] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const today = localDay();
  const [arrivedOn, setArrivedOn] = useState(today);
  // Remounting clears the quantity and price boxes, which keep their own text.
  const [round, setRound] = useState(0);
  // The price box has its own, so filling it in never remounts the quantity box while it is being typed in.
  const [priceKey, setPriceKey] = useState(0);
  const [bought, setBought] = useState(0);

  const list = ingredients.data ?? [];
  const ing = list.find((i) => i.id === (ingredientId || list[0]?.id));
  const unitCost = prices.data?.find((p) => p.ingredientId === ing?.id)?.latestUnitCost;
  const suggested = unitCost && qty ? Math.round(unitCost * qty) : 0;
  const credit = onCredit && cost > 0;
  const ready = !!ing && !!qty;

  // The sheet's own close (which plays its exit), handed over by `Sheet` on each render.
  const close = { current: null as null | (() => void) };

  useEffect(() => {
    if (!priceTyped && suggested !== cost) {
      setCost(suggested);
      setPriceKey((k) => k + 1);
    }
  }, [priceTyped, suggested, cost]);

  const save = (another: boolean) => {
    if (!ing || !qty) return;
    void run(
      'buy',
      () =>
        receiveDelivery(ing.id, {
          quantity: qty,
          supplier,
          cost,
          method,
          onCredit: credit,
          // Today means now; an earlier day is filed at midday, so it lands inside that day.
          receivedAt: arrivedOn && arrivedOn < today ? new Date(`${arrivedOn}T12:00:00`).toISOString() : undefined,
        }),
      `${ing.name} bought${credit ? ' on credit' : ''}`,
    ).then((ok) => {
      if (!ok) return;
      setBought((n) => n + 1);
      onSaved();
      if (another) {
        setQty('');
        setCost(0);
        setPriceTyped(false);
        setRound((r) => r + 1);
        setPriceKey((k) => k + 1);
      } else {
        close.current?.();
      }
    });
  };

  return (
    <Sheet label={`Buy from ${supplier}`} onClose={onClose}>
      {(done) => {
        close.current = done;
        return (
          <>
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div className="min-w-0">
                <h2 className="text-[22px] font-semibold tracking-tight">Buy from {supplier}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                  {bought > 0 ? `${bought} added so far. ` : ''}It goes into stock, and the price is kept so you can see how it moves.
                </p>
              </div>
              <button type="button" aria-label="Close" onClick={() => done()} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
                <X size={16} />
              </button>
            </div>

            {ingredients.loading && !ingredients.data ? (
              <p className="px-5 pt-6 text-[13.5px] text-ink-3">Loading ingredients…</p>
            ) : list.length === 0 ? (
              <p className="px-5 pt-6 text-[13.5px] leading-relaxed text-ink-3">There is nothing to buy yet. Add ingredients on the Stock page first.</p>
            ) : (
              <form
                className="grid flex-1 content-start gap-4 overflow-y-auto px-5 pt-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  save(false);
                }}
              >
                <Field label="What did you buy">
                  <Select
                    value={ing?.id ?? ''}
                    onChange={(id) => {
                      setIngredientId(id);
                      setQty('');
                      setPriceTyped(false);
                      setRound((r) => r + 1);
                    }}
                    options={list.map((i) => ({ value: i.id, label: i.name }))}
                  />
                </Field>
                <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
                  <Field label="How much">
                    <QtyField key={`q${round}${ing?.id}`} unit={ing?.unit ?? 'pcs'} onChange={setQty} big={!!ing && ing.unit !== 'pcs' && Math.max(ing.quantity, ing.parLevel) >= 1000} />
                  </Field>
                  <Field
                    label="Total price"
                    hint={unitCost ? `Last price ${priceLabel(unitCost, ing?.unit ?? 'pcs', currency)}${!priceTyped && suggested > 0 ? ', filled in for you' : ''}.` : undefined}
                  >
                    <MoneyInput
                      key={`c${priceKey}`}
                      value={cost}
                      onChange={(v) => {
                        setPriceTyped(true);
                        setCost(v);
                      }}
                      currency={currency}
                    />
                  </Field>
                  <Field label="Date received" className="sm:col-span-2">
                    <input type="date" value={arrivedOn} max={today} onChange={(e) => setArrivedOn(e.target.value || today)} className={cx(INPUT_BOX, 'tnum')} />
                  </Field>
                </div>

                <div className="grid gap-2">
                  <Segmented
                    label="Payment"
                    value={onCredit ? 'credit' : 'now'}
                    onChange={(v) => setOnCredit(v === 'credit')}
                    options={[
                      { value: 'now', label: 'Paid now' },
                      { value: 'credit', label: 'On credit' },
                    ]}
                  />
                  {onCredit && cost === 0 && <p className="text-[12.5px] text-ink-3">Enter the total price above so we know how much you owe.</p>}
                </div>
                {cost > 0 && !credit && (
                  <Segmented
                    label="Paid with"
                    value={method}
                    onChange={setMethod}
                    options={[
                      { value: 'CASH', label: 'Cash' },
                      { value: 'CARD', label: 'Bank' },
                    ]}
                  />
                )}

                {ing && qty ? (
                  <p className="max-w-[62ch] rounded-xl bg-surface-2/60 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2 ring-1 ring-hairline ring-inset" aria-live="polite">
                    {ing.name} goes from {formatQty(ing.quantity, ing.unit)} to {formatQty(ing.quantity + qty, ing.unit)}.{' '}
                    {cost > 0
                      ? credit
                        ? `${formatMoney(cost, currency)} is added to what you owe ${supplier}. The cash book records it when you pay.`
                        : `${formatMoney(cost, currency)} is filed in the cash book as a stock expense.`
                      : 'No price entered, so nothing is filed in the cash book.'}
                  </p>
                ) : null}

                <div className={SHEET_FOOT}>
                  <button type="submit" disabled={busy || !ready} className={FOOT_PRIMARY}>
                    {credit ? 'Buy on credit' : 'Add to stock'}
                  </button>
                  <button type="button" disabled={busy || !ready} className={cx(ADMIN_GHOST, 'h-11')} onClick={() => save(true)}>
                    Add another
                  </button>
                </div>
              </form>
            )}
          </>
        );
      }}
    </Sheet>
  );
}
