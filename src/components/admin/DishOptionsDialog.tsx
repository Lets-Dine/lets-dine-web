import { useEffect, useState } from 'react';
import { DishAddForm } from '../DishAddForm';
import { DishImage } from '../Bits';
import { X } from '../icons';
import type { Dish, Menu } from '../../domain/types';
import { ADMIN_TINY } from './kit';

/** What staff chose for a dish on a diner's behalf. An add-on id repeated means that many of it. */
export interface DishSelection {
  variantId: string | null;
  addOnIds: string[];
  quantity: number;
}

/** The variants and add-ons a dish can actually be ordered with right now. */
export function orderableOptions(dish: Dish, menu: Menu) {
  return {
    variants: [...dish.variants].filter((v) => v.isAvailable && !v.isArchived).sort((a, b) => a.sortOrder - b.sortOrder),
    addOns: menu.addOns.filter((a) => dish.addOnIds.includes(a.id) && a.isAvailable && !a.isArchived),
  };
}

/**
 * Staff picking a size and extras for a dish they're adding for the diner — the same form the
 * diner sees, minus the kitchen note (the staff order API has no field for one).
 */
export function DishOptionsDialog({ dish, menu, onAdd, onClose }: { dish: Dish; menu: Menu; onAdd: (s: DishSelection) => void; onClose: () => void }) {
  const { variants, addOns } = orderableOptions(dish, menu);
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="animate-pop max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset"
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${dish.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start gap-3">
          <DishImage dish={dish} className="size-12 shrink-0 rounded-xl" monogram="text-base" />
          <h2 className="min-w-0 flex-1 truncate pt-1 text-[16px] font-semibold tracking-tight">{dish.name}</h2>
          <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <DishAddForm
          dish={dish}
          quantity={quantity}
          setQuantity={setQuantity}
          note=""
          setNote={() => {}}
          allowNote={false}
          addOns={addOns}
          selectedAddOnIds={addOnIds}
          onSetAddOnQty={(id, qty) => setAddOnIds((prev) => [...prev.filter((a) => a !== id), ...Array(Math.max(qty, 0)).fill(id)])}
          variants={variants}
          selectedVariantId={variantId}
          onSelectVariant={setVariantId}
          onAdd={() => onAdd({ variantId, addOnIds, quantity })}
          actionLabel="Add to ticket"
        />
      </div>
    </div>
  );
}
