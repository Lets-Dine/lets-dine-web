import { Link } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { badgesFor } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { Badges, DietMarks, DishImage, Price, QuantityStepper } from './Bits';
import { RatingPill } from './Rating';
import { cx } from './ui';
import { Plus } from './icons';

/** Compact add control: one tap the first time, a stepper after that. Dishes with add-ons or a required variant open a quick-add sheet right here instead of a blind quick-add. */
function AddControl({
  dish,
  onQuickAdd,
  tone = 'solid',
}: {
  dish: Dish;
  onQuickAdd: (dish: Dish, trigger: HTMLElement) => void;
  tone?: 'solid' | 'inset';
}) {
  const cart = useCart();
  // Sums every customized line for this dish, not just the plain one — a dish
  // with add-ons can be in the cart several times over, once per combination.
  const quantity = cart.lines.filter((l) => l.dishId === dish.id).reduce((sum, l) => sum + l.quantity, 0);
  // A varianted dish must never get an instant single-tap add, even with zero add-ons —
  // the diner still has to pick a variant.
  const needsSheet = dish.addOnIds.length > 0 || dish.variants.length > 0;

  if (!dish.isAvailable) {
    return (
      <span className="inline-flex h-7.5 cursor-default items-center rounded-full bg-surface-2 px-3 text-[12px] font-bold text-ink-4 ring-1 ring-hairline ring-inset">
        Sold out
      </span>
    );
  }

  if (quantity > 0 && !needsSheet) {
    return (
      <div className="animate-pop">
        <div
          className={cx(
            'rounded-full',
            tone === 'solid'
              ? 'bg-flame shadow-[0_8px_20px_-8px_rgb(255_110_50/0.85)]'
              : 'bg-surface-2 text-flame-1 ring-1 ring-flame-2/35 ring-inset',
          )}
        >
          <QuantityStepper value={quantity} onChange={(n) => cart.setQuantity(dish.id, n)} size="sm" bare />
        </div>
      </div>
    );
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          haptic.commit();
          if (needsSheet) {
            onQuickAdd(dish, e.currentTarget);
            return;
          }
          cart.add(dish.id, 1);
        }}
        aria-label={
          needsSheet
            ? quantity > 0
              ? `${quantity} of ${dish.name} in your cart — choose options to add another`
              : `Choose options for ${dish.name}`
            : `Add ${dish.name}`
        }
        className={cx(
          'inline-flex items-center justify-center gap-0.5 rounded-full font-bold tracking-tight text-white',
          'transition-move active:scale-90',
          tone === 'solid'
            ? 'h-8.5 pl-3 pr-3.5 text-[13.5px] bg-flame shadow-[0_8px_20px_-8px_rgb(255_110_50/0.85)]'
            : 'h-8 pl-2.5 pr-3 text-[13px] bg-surface-2 text-flame-1 ring-1 ring-flame-2/35 ring-inset',
        )}
      >
        <Plus size={15} />
        Add
      </button>
      {/* Customized lines can't collapse into one stepper — several add-on
          combinations of the same dish can sit in the cart at once — so the
          running total shows as a badge and another tap opens the sheet again. */}
      {quantity > 0 && (
        <b
          key={quantity}
          aria-hidden
          className="absolute -right-1.5 -top-1.5 grid h-4.5 min-w-4.5 animate-bump place-items-center rounded-full bg-flame px-1 text-[10.5px] font-extrabold leading-none text-white tnum ring-2 ring-bg"
        >
          {quantity}
        </b>
      )}
    </span>
  );
}

interface Props {
  dish: Dish;
  href: string;
  ctx: RankContext;
  onQuickAdd: (dish: Dish, trigger: HTMLElement) => void;
}

/** A dish priced off its variants has nothing of its own worth showing — no single price, spice level, or dietary type applies once there's a choice to make. */
function hasActiveVariant(dish: Dish): boolean {
  return dish.variants.some((v) => !v.isArchived);
}

/** Row card — the workhorse of the full menu. Two per line once there is room. */
export function DishRow({ dish, href, ctx, onQuickAdd }: Props) {
  const badges = badgesFor(dish, ctx);
  const varianted = hasActiveVariant(dish);
  return (
    <article
      className={cx(
        'flex items-start gap-3.5 border-b border-hairline py-4 last:border-b-0',
        'md:rounded-2xl md:border-0 md:bg-surface md:p-4 md:shadow-warm md:ring-1 md:ring-hairline md:ring-inset',
        'md:transition-[background-color,box-shadow,transform] md:duration-200 md:ease-out-quart',
        'md:hover:-translate-y-0.5 md:hover:bg-surface-2 md:hover:shadow-warm-lg',
        !dish.isAvailable && 'opacity-50',
      )}
    >
      <Link to={href} className="flex min-w-0 flex-1 flex-col gap-1.5">
        {badges.length > 0 && (
          <div className="mb-px flex gap-1.5">
            <Badges kinds={badges} limit={1} />
          </div>
        )}
        <h3 className="text-[16px] font-semibold leading-tight tracking-tight">
          {dish.name}
          {!varianted && <DietMarks dish={dish} />}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <RatingPill rating={dish.stats.avgRating} count={dish.stats.ratingCount} />
          {dish.stats.recommendRate !== null && dish.stats.ratingCount >= 20 && (
            <span className="text-[11.5px] font-semibold text-mint tnum">
              {Math.round(dish.stats.recommendRate * 100)}% would reorder
            </span>
          )}
        </div>
        <p className="text-[13px] leading-relaxed text-ink-3 line-clamp-2-safe">{dish.description}</p>
        {!varianted && <Price value={dish.price} currency={dish.currency} className="mt-0.5 text-[15px]" />}
      </Link>

      <div className="relative w-27 shrink-0">
        <Link to={href} tabIndex={-1} aria-hidden>
          <DishImage dish={dish} className="size-27 rounded-2xl shadow-lift ring-1 ring-hairline ring-inset" />
        </Link>
        <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2">
          <AddControl dish={dish} onQuickAdd={onQuickAdd} />
        </div>
      </div>
    </article>
  );
}

/** Tall card for the merchandising rails. Scrolls on phones, grids on laptops. */
export function DishTile({ dish, href, ctx, onQuickAdd, rank }: Props & { rank?: number }) {
  const badges = badgesFor(dish, ctx);
  const varianted = hasActiveVariant(dish);
  return (
    <article
      className={cx('flex w-42 shrink-0 snap-start flex-col gap-2.5 lg:w-full', !dish.isAvailable && 'opacity-50')}
    >
      <Link
        to={href}
        className="group relative block h-44 overflow-hidden rounded-3xl shadow-warm ring-1 ring-hairline ring-inset transition-move duration-300 lg:h-56 lg:hover:-translate-y-1 lg:hover:shadow-warm-lg"
      >
        <DishImage
          dish={dish}
          className="size-full transition-[scale] duration-500 ease-out-quart group-hover:scale-105"
        />
        <span
          className="absolute inset-0 bg-gradient-to-t from-[#080605]/85 via-[#080605]/25 via-35% to-transparent"
          aria-hidden
        />
        {rank !== undefined && (
          <span className="absolute left-2.5 top-2 font-display text-3xl font-bold leading-none text-white/95 drop-shadow-[0_2px_12px_rgb(0_0_0_/_0.7)] tnum">
            {rank}
          </span>
        )}
        {badges.length > 0 && (
          <span className="absolute right-2.5 top-2.5 backdrop-blur-md">
            <Badges kinds={badges} limit={1} />
          </span>
        )}
        <span className="absolute bottom-2.5 left-3">
          <RatingPill rating={dish.stats.avgRating} count={dish.stats.ratingCount} onDark />
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <Link to={href} className="min-w-0 flex-1">
          <h3 className="truncate text-[14.5px] font-semibold tracking-tight">{dish.name}</h3>
          {!varianted && <Price value={dish.price} currency={dish.currency} className="text-[13.5px] text-ink-2" />}
        </Link>
        <AddControl dish={dish} onQuickAdd={onQuickAdd} tone="inset" />
      </div>
    </article>
  );
}
