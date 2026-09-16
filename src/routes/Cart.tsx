import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { track } from '../domain/analytics';
import { formatMoney, percentOf } from '../domain/money';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { DishImage, QuantityStepper } from '../components/Bits';
import { BTN, BTN_FLAME, BTN_SIZE, EYEBROW, GLASS, SHELL, cx } from '../components/ui';
import { Plus } from '../components/icons';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState, TopBar } from './Shell';

/** One column on phones; items beside a sticky bill once there is room. */
export const PAGE = 'mx-auto w-full max-w-[620px] px-4 sm:px-6 lg:max-w-5xl lg:px-8';
export const SPLIT = 'lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10';

/** Client-side totals mirror the server formula, but the server's number wins. */
export function useBill(lines: { dishId: string; quantity: number }[], dishes: Dish[]) {
  const { menu } = useRestaurant();
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const subtotal = lines.reduce((sum, l) => sum + (byId.get(l.dishId)?.price ?? 0) * l.quantity, 0);
  const serviceCharge = percentOf(subtotal, menu.restaurant.serviceChargeRate);
  const tax = percentOf(subtotal + serviceCharge, menu.restaurant.taxRate);
  return { subtotal, serviceCharge, tax, total: subtotal + serviceCharge + tax };
}

export function BillLines({
  bill,
  currency,
  serviceRate,
  taxRate,
}: {
  bill: { subtotal: number; serviceCharge: number; tax: number; total: number };
  currency: string;
  serviceRate: number;
  taxRate: number;
}) {
  const row = 'flex items-center justify-between text-[14px] text-ink-2';
  return (
    <div className="flex flex-col gap-2.5">
      <div className={row}>
        <span>Subtotal</span>
        <span className="tnum">{formatMoney(bill.subtotal, currency)}</span>
      </div>
      <div className={row}>
        <span>Service charge · {Math.round(serviceRate * 100)}%</span>
        <span className="tnum">{formatMoney(bill.serviceCharge, currency)}</span>
      </div>
      <div className={row}>
        <span>VAT · {Math.round(taxRate * 100)}%</span>
        <span className="tnum">{formatMoney(bill.tax, currency)}</span>
      </div>
      <hr className="my-1 border-hairline" />
      <div className="flex items-center justify-between text-[17px] font-bold tracking-tight text-ink">
        <span>Total</span>
        <span className="tnum">{formatMoney(bill.total, currency)}</span>
      </div>
    </div>
  );
}

export function Cart() {
  const { menu, table, base } = useRestaurant();
  const cart = useCart();
  const navigate = useNavigate();
  const toast = useToast();
  const [openNote, setOpenNote] = useState<string | null>(null);

  const byId = new Map(menu.dishes.map((d) => [d.id, d]));
  const bill = useBill(cart.lines, menu.dishes);
  const currency = menu.restaurant.currency;

  if (cart.lines.length === 0) {
    return (
      <main className={SHELL}>
        <TopBar title="Your order" subtitle={table.name} fallbackTo={base} width={PAGE} />
        <div className={cx(PAGE, 'pt-6 lg:max-w-2xl')}>
          <EmptyState
            emoji="🍽️"
            title="Your cart is empty"
            message="Add something from the menu and it will show up here."
            action={
              <Link to={base} className={BTN_FLAME}>
                Browse the menu
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  const proceed = () => {
    haptic.select();
    track('cart_viewed', { items: cart.count });
    navigate(`${base}/checkout`);
  };

  return (
    <main className={SHELL}>
      <TopBar
        title="Your order"
        subtitle={`${table.name} · ${cart.count} ${cart.count === 1 ? 'item' : 'items'}`}
        fallbackTo={base}
        width={PAGE}
      />

      <div className={cx(PAGE, SPLIT, 'pt-4')}>
        <div>
          <section className="flex flex-col gap-3.5">
            {cart.lines.map((line) => {
              const dish = byId.get(line.dishId);
              if (!dish) return null;
              const noteOpen = openNote === line.dishId || line.note.length > 0;
              return (
                <article
                  className="flex gap-3.5 rounded-3xl bg-surface p-3.5 ring-1 ring-hairline ring-inset"
                  key={line.dishId}
                >
                  <Link to={`${base}/d/${dish.id}`} aria-label={dish.name}>
                    <DishImage dish={dish} className="size-16.5 shrink-0 rounded-xl" monogram="text-xl" />
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2.5">
                      <Link
                        to={`${base}/d/${dish.id}`}
                        className="text-[15px] font-semibold leading-tight tracking-tight hover:text-flame-1"
                      >
                        {dish.name}
                      </Link>
                      <span className="shrink-0 text-[14.5px] font-bold tnum">
                        {formatMoney(dish.price * line.quantity, currency)}
                      </span>
                    </div>

                    <span className="mt-0.5 block text-[12px] text-ink-4 tnum">
                      {formatMoney(dish.price, currency)} each
                      {!dish.isAvailable && <b className="font-semibold text-berry"> · no longer available</b>}
                    </span>

                    {noteOpen ? (
                      <input
                        value={line.note}
                        maxLength={140}
                        placeholder="Note for the kitchen"
                        onChange={(e) => cart.setNote(line.dishId, e.target.value)}
                        className="mt-2 h-8.5 w-full rounded-xl bg-surface-2 px-3 text-[13px] outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/35"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenNote(line.dishId)}
                        className="mt-1.5 block text-[12.5px] font-semibold text-flame-1"
                      >
                        + Add a note
                      </button>
                    )}

                    <div className="mt-2.5 flex items-center justify-between">
                      <QuantityStepper value={line.quantity} onChange={(n) => cart.setQuantity(line.dishId, n)} size="sm" />
                      <button
                        type="button"
                        /* Removal is reversible, so it needs no confirmation — it
                           needs an undo. One tap out, one tap back. */
                        onClick={() => {
                          const index = cart.lines.findIndex((l) => l.dishId === line.dishId);
                          const removed = { ...line };
                          haptic.warn();
                          cart.remove(line.dishId);
                          toast(`${dish.name} removed`, '🗑️', {
                            label: 'Undo',
                            onAction: () => cart.restore(removed, index),
                          });
                        }}
                        className="px-1 py-1.5 text-[12.5px] font-semibold text-ink-4 transition-colors hover:text-berry"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <Link
            to={base}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-flame-2/14 px-4.5 py-2.5 text-[14px] font-semibold text-flame-1 ring-1 ring-flame-2/35 ring-inset"
          >
            <Plus size={16} />
            Add more dishes
          </Link>
        </div>

        {/* ── Bill ────────────────────────────────────────────── */}
        <aside className="pt-7 lg:sticky lg:top-24 lg:pt-0">
          <div className="flex flex-col gap-3 lg:rounded-3xl lg:bg-surface lg:p-5 lg:ring-1 lg:ring-hairline lg:ring-inset">
            <h2 className={EYEBROW}>Bill</h2>
            <BillLines
              bill={bill}
              currency={currency}
              serviceRate={menu.restaurant.serviceChargeRate}
              taxRate={menu.restaurant.taxRate}
            />
            <p className="text-[11.5px] leading-relaxed text-ink-4">
              The kitchen confirms the final amount when it accepts your order.
            </p>
            <button type="button" className={cx(BTN_FLAME, 'mt-1 hidden! w-full lg:inline-flex!')} onClick={proceed}>
              Review & order
            </button>
          </div>
        </aside>
      </div>

      <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-10" />

      {/* ── Sticky bar (small screens) ──────────────────────────── */}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto flex w-full max-w-155 items-center gap-2.5">
          <div className="flex flex-col pl-1 leading-tight">
            <span className="text-[11px] font-semibold text-ink-3">Total</span>
            <b className="text-[17px] font-bold tracking-tight tnum">{formatMoney(bill.total, currency)}</b>
          </div>
          <button type="button" className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-ember shadow-flame')} onClick={proceed}>
            Review & order
          </button>
        </div>
      </div>
    </main>
  );
}
