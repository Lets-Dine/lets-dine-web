import { useState } from 'react';
import type { AddOn, Dish, DishVariant } from '../domain/types';
import { formatMoney } from '../domain/money';
import { haptic } from '../platform/haptics';
import { DietMarks, QuantityStepper } from './Bits';
import { Check } from './icons';
import { BTN, BTN_GHOST, BTN_SIZE, INPUT, cx } from './ui';

/**
 * The dish/variant/add-on/quantity/note controls a diner fills in before
 * something lands in the cart — the detail page's sticky bar and the menu's
 * quick-add sheet are just two different frames around this same form.
 */
export function DishAddForm({
  dish,
  quantity,
  setQuantity,
  note,
  setNote,
  addOns,
  selectedAddOnIds,
  onSetAddOnQty,
  variants,
  selectedVariantId,
  onSelectVariant,
  onAdd,
  actionLabel = 'Add',
  allowNote = true,
}: {
  dish: Dish;
  quantity: number;
  setQuantity: (n: number) => void;
  note: string;
  setNote: (s: string) => void;
  addOns: AddOn[];
  selectedAddOnIds: string[];
  onSetAddOnQty: (id: string, qty: number) => void;
  variants: DishVariant[];
  selectedVariantId: string | null;
  onSelectVariant: (id: string) => void;
  onAdd: () => void;
  actionLabel?: string;
  /** Staff adding on a diner's behalf can't attach a kitchen note, so they hide it. */
  allowNote?: boolean;
}) {
  const [noteOpen, setNoteOpen] = useState(note.length > 0);

  if (!dish.isAvailable) {
    return (
      <button type="button" className={cx(BTN_GHOST, 'w-full')} disabled>
        Not available today
      </button>
    );
  }
  const qtyOf = (id: string) => selectedAddOnIds.filter((a) => a === id).length;
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) ?? null;
  // A varianted dish prices off the chosen variant, never the dish's own base price.
  const needsVariant = variants.length > 0 && !selectedVariant;
  const basePrice = variants.length > 0 ? (selectedVariant?.price ?? 0) : dish.price;
  const total = (basePrice + addOns.reduce((sum, a) => sum + a.price * qtyOf(a.id), 0)) * quantity;
  return (
    <div className="flex flex-col gap-2.5">
      {variants.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-3">Choose an option</span>
          <div className="flex flex-col gap-2.5">
            {variants.map((variant) => {
              const active = variant.id === selectedVariantId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => {
                    haptic.select();
                    onSelectVariant(variant.id);
                  }}
                  aria-pressed={active}
                  className={cx(
                    'flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition-colors duration-150',
                    active
                      ? 'bg-flame-2/14 ring-[1.5px] ring-flame-2/35 ring-inset'
                      : 'bg-surface ring-1 ring-hairline ring-inset hover:bg-surface-2',
                  )}
                >
                  <span
                    className={cx(
                      'grid size-5.5 shrink-0 place-items-center rounded-full text-white transition-colors duration-150',
                      active ? 'bg-flame' : 'ring-[1.5px] ring-hairline-strong ring-inset',
                    )}
                    aria-hidden
                  >
                    {active && <Check size={13} />}
                  </span>
                  <span className="flex-1 text-[14.5px] font-semibold">
                    {variant.name}
                    <DietMarks dish={variant} />
                  </span>
                  <span className="text-[13.5px] font-semibold tnum text-ink-3">
                    {formatMoney(variant.price, dish.currency)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {addOns.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-3">Add extras</span>
          {addOns.map((addOn) => {
            const qty = qtyOf(addOn.id);
            return (
              <div
                key={addOn.id}
                className={cx(
                  'flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-150',
                  qty > 0 ? 'bg-flame-2/14 ring-[1.5px] ring-flame-2/35 ring-inset' : 'bg-surface ring-1 ring-hairline ring-inset',
                )}
              >
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{addOn.name}</span>
                  <span className="text-[12px] tnum text-ink-3">+{formatMoney(addOn.price, dish.currency)} each</span>
                </span>
                <QuantityStepper
                  value={qty}
                  onChange={(n) => {
                    haptic.select();
                    onSetAddOnQty(addOn.id, n);
                  }}
                  size="sm"
                  min={0}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Most diners never write a note, and this panel is often pinned over
          the page — so the common path shows first and the note is one tap
          deeper, exactly as it already works in the cart. */}
      {!allowNote ? null : noteOpen ? (
        <input
          type="text"
          value={note}
          maxLength={140}
          autoFocus
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim().length === 0 && setNoteOpen(false)}
          placeholder="No onions, extra spicy…"
          aria-label="Note for the kitchen"
          className={cx(INPUT, 'h-11')}
        />
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="w-fit py-0.5 text-[13px] font-semibold text-flame-1"
        >
          + Add a note for the kitchen
        </button>
      )}
      <div className="flex items-center gap-2.5">
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} size="lg" />
        <button
          type="button"
          className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')}
          onClick={onAdd}
          disabled={needsVariant}
        >
          {needsVariant ? 'Choose an option to continue' : `${actionLabel} · ${formatMoney(total, dish.currency)}`}
        </button>
      </div>
    </div>
  );
}
