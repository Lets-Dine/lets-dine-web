import { Link } from 'react-router-dom';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { badgesFor } from '../domain/metrics';
import type { RankContext } from '../domain/metrics';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { Badges, DietMarks, DishImage, Price, QuantityStepper } from './Bits';
import { RatingPill } from './Rating';
import { cx } from './ui';
import { Bag, Plus } from './icons';

/** Compact add control: one tap the first time, a stepper after that. */
function AddControl({ dish, tone = 'solid' }: { dish: Dish; tone?: 'solid' | 'inset' }) {
  const cart = useCart();
  const toast = useToast();
  const quantity = cart.quantityOf(dish.id);

  if (!dish.isAvailable) {
    return (
      <span className="inline-flex h-7.5 cursor-default items-center rounded-full bg-surface-2 px-3 text-[12px] font-bold text-ink-4 ring-1 ring-hairline ring-inset">
        Sold out
      </span>
    );
  }

  if (quantity > 0) {
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
    <button
      type="button"
      onClick={() => {
        haptic.commit();
        cart.add(dish.id, 1);
        toast(`${dish.name} added`, <Bag size={19} />, {
          label: 'Undo',
          onAction: () => cart.setQuantity(dish.id, 0),
        });
      }}
      aria-label={`Add ${dish.name}`}
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
  );
}

interface Props {
  dish: Dish;
  href: string;
  ctx: RankContext;
}

/** Row card — the workhorse of the full menu. Two per line once there is room. */
export function DishRow({ dish, href, ctx }: Props) {
  const badges = badgesFor(dish, ctx);
  return (
    <article
      className={cx(
        'flex items-start gap-3.5 border-b border-hairline py-4 last:border-b-0',
        'md:rounded-2xl md:border-0 md:bg-surface md:p-4 md:ring-1 md:ring-hairline md:ring-inset',
        'md:transition-colors md:duration-200 md:hover:bg-surface-2',
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
          <DietMarks dish={dish} />
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
        <Price value={dish.price} currency={dish.currency} className="mt-0.5 text-[15px]" />
      </Link>

      <div className="relative w-27 shrink-0">
        <Link to={href} tabIndex={-1} aria-hidden>
          <DishImage dish={dish} className="size-27 rounded-2xl shadow-lift ring-1 ring-hairline ring-inset" />
        </Link>
        <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2">
          <AddControl dish={dish} />
        </div>
      </div>
    </article>
  );
}

/** Tall card for the merchandising rails. Scrolls on phones, grids on laptops. */
export function DishTile({ dish, href, ctx, rank }: Props & { rank?: number }) {
  const badges = badgesFor(dish, ctx);
  return (
    <article
      className={cx('flex w-42 shrink-0 snap-start flex-col gap-2.5 lg:w-full', !dish.isAvailable && 'opacity-50')}
    >
      <Link
        to={href}
        className="group relative block h-44 overflow-hidden rounded-3xl shadow-lift ring-1 ring-hairline ring-inset lg:h-56"
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
          <Price value={dish.price} currency={dish.currency} className="text-[13.5px] text-ink-2" />
        </Link>
        <AddControl dish={dish} tone="inset" />
      </div>
    </article>
  );
}
