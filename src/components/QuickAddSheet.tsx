import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../domain/analytics';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { useRestaurant } from '../routes/RestaurantLayout';
import { DishAddForm } from './DishAddForm';
import { DishImage } from './Bits';
import { cx } from './ui';
import { X } from './icons';

/** A cart line's variant/add-ons/quantity/note, as the sheet edits them. */
export interface DishAddSnapshot {
  quantity: number;
  note: string;
  variantId: string | null;
  addOnIds: string[];
}

/**
 * The add-on picker as an overlay on top of wherever the diner already is —
 * so choosing "extra cheese ×2" never costs them their place in the menu.
 * Same form as the dish detail page's sticky bar, framed as a sheet instead.
 *
 * Pass `initial` to edit an existing cart line in place (from the cart) rather
 * than add a new one (from the menu) — the sheet opens pre-filled and its
 * confirm swaps the old line for the new selection instead of merging into it.
 */
export function QuickAddSheet({
  dish,
  href,
  initial,
  onClose,
}: {
  dish: Dish;
  href: string;
  initial?: DishAddSnapshot;
  onClose: () => void;
}) {
  const { menu } = useRestaurant();
  const cart = useCart();
  const toast = useToast();
  const editing = Boolean(initial);

  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>(initial?.addOnIds ?? []);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(initial?.variantId ?? null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const availableAddOns = menu.addOns.filter((a) => dish.addOnIds.includes(a.id) && a.isAvailable && !a.isArchived);
  const availableVariants = [...dish.variants]
    .filter((v) => v.isAvailable && !v.isArchived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const setAddOnQty = (id: string, qty: number) =>
    setSelectedAddOnIds((prev) => [...prev.filter((a) => a !== id), ...Array(Math.max(qty, 0)).fill(id)]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = () => {
    haptic.commit();
    if (initial) {
      // Editing swaps the whole line — merges into another line that now happens
      // to match (e.g. quantity/add-ons edited down to an existing combo) exactly
      // the way adding one normally merges, since it's the same `cart.add` underneath.
      cart.remove(dish.id, initial.variantId, initial.addOnIds);
      cart.add(dish.id, quantity, note, selectedVariantId, selectedAddOnIds);
      toast(`${dish.name} updated`, '✓', {
        label: 'Undo',
        onAction: () => {
          cart.remove(dish.id, selectedVariantId, selectedAddOnIds);
          cart.add(dish.id, initial.quantity, initial.note, initial.variantId, initial.addOnIds);
        },
      });
    } else {
      const before = cart.quantityOf(dish.id, selectedVariantId, selectedAddOnIds);
      cart.add(dish.id, quantity, note, selectedVariantId, selectedAddOnIds);
      track('dish_added_to_cart', { dishId: dish.id, quantity });
      toast(`${quantity} × ${dish.name} added`, '🛒', {
        label: 'Undo',
        onAction: () => cart.setQuantity(dish.id, before, selectedVariantId, selectedAddOnIds),
      });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-black/55 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Edit ${dish.name}` : `Add ${dish.name}`}
        onClick={(e) => e.stopPropagation()}
        className={cx(
          'w-full animate-rise rounded-t-4xl bg-bg p-4 pb-[calc(16px+var(--safe-b))] shadow-deep ring-1 ring-hairline ring-inset',
          'sm:max-w-[420px] sm:animate-pop sm:rounded-4xl sm:pb-5',
        )}
      >
        <div className="mb-3.5 flex items-start gap-3">
          <DishImage dish={dish} className="size-13 shrink-0 rounded-xl" monogram="text-base" />
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 className="truncate text-[15.5px] font-semibold tracking-tight">{dish.name}</h2>
            <Link to={href} onClick={onClose} className="text-[12px] font-semibold text-flame-1">
              View details &amp; reviews
            </Link>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 transition-move active:scale-90"
          >
            <X size={15} />
          </button>
        </div>

        <DishAddForm
          dish={dish}
          quantity={quantity}
          setQuantity={setQuantity}
          note={note}
          setNote={setNote}
          addOns={availableAddOns}
          selectedAddOnIds={selectedAddOnIds}
          onSetAddOnQty={setAddOnQty}
          variants={availableVariants}
          selectedVariantId={selectedVariantId}
          onSelectVariant={setSelectedVariantId}
          onAdd={confirm}
          actionLabel={editing ? 'Save' : 'Add'}
        />
      </div>
    </div>
  );
}
