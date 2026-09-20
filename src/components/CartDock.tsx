import { Link, useLocation } from 'react-router-dom';
import { formatMoney } from '../domain/money';
import type { Dish } from '../domain/types';
import { useCart } from '../state/CartContext';
import { Bag, ChevronRight } from './icons';

/** Screens that carry their own bottom action bar — the cart dock would fight them. */
export function cartDockHidden(pathname: string): boolean {
  return ['/d/', '/cart', '/checkout', '/order'].some((p) => pathname.includes(p));
}

/**
 * Persistent cart. Full-width thumb-reach bar on phones; a floating pill in the
 * bottom corner once the layout is wide enough for it not to be in the way.
 */
export function CartDock({ dishes, base }: { dishes: Dish[]; base: string }) {
  const cart = useCart();
  const { pathname } = useLocation();

  if (cart.count === 0 || cartDockHidden(pathname)) return null;

  const byId = new Map(dishes.map((d) => [d.id, d]));
  const currency = dishes[0]?.currency ?? 'NPR';
  const subtotal = cart.lines.reduce((sum, l) => sum + (byId.get(l.dishId)?.price ?? 0) * l.quantity, 0);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-60 animate-dock-in px-4 pb-[calc(14px+var(--safe-b))] sm:px-6 lg:inset-x-auto lg:bottom-8 lg:right-8 lg:px-0 lg:pb-0">
      <Link
        to={`${base}/cart`}
        className="pointer-events-auto mx-auto flex h-15 max-w-lg items-center gap-3.5 rounded-full bg-flame pl-3.5 pr-4.5 text-white shadow-flame-lg transition-move active:scale-[0.975] lg:mx-0 lg:h-16 lg:pr-6 lg:hover:scale-[1.03]"
      >
        <span className="relative grid size-9 place-items-center">
          <Bag size={19} />
          <b
            key={cart.count}
            className="absolute -right-1 -top-0.5 grid h-4.5 min-w-4.5 animate-bump place-items-center rounded-full bg-white px-1.5 text-[11.5px] font-extrabold text-flame-3"
          >
            {cart.count}
          </b>
        </span>
        <span className="flex flex-1 flex-col leading-tight">
          <b className="text-[15.5px] font-bold tracking-tight text-white">View cart</b>
          <span className="text-[12px] font-semibold opacity-70 tnum text-white">
            {formatMoney(subtotal, currency)} · plus taxes
          </span>
        </span>
        <ChevronRight size={18} className="text-white" />
      </Link>
    </div>
  );
}
