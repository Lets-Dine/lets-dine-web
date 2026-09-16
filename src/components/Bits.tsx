import { useState } from 'react';
import { formatMoney } from '../domain/money';
import { haptic } from '../platform/haptics';
import type { BadgeKind, Dish, Minor } from '../domain/types';
import { cx } from './ui';
import { Chilli, Leaf, Minus, Plus } from './icons';

export function Price({ value, currency, className }: { value: Minor; currency: string; className?: string }) {
  return <span className={cx('font-bold tracking-tight tnum', className)}>{formatMoney(value, currency)}</span>;
}

const BADGE_META: Record<BadgeKind, { label: string; cls: string; emoji: string }> = {
  popular: { label: 'Popular', cls: 'bg-flame-3/16 text-[#ff9270]', emoji: '🔥' },
  loved: { label: 'Most loved', cls: 'bg-flame-3/16 text-[#ff9270]', emoji: '❤️' },
  trending: { label: 'Trending', cls: 'bg-mint/15 text-[#6fd7a4]', emoji: '📈' },
  gem: { label: 'Hidden gem', cls: 'bg-[#7e9bff]/16 text-[#a4b6ff]', emoji: '💎' },
  value: { label: 'Best value', cls: 'bg-gold/15 text-[#ffd479]', emoji: '🪙' },
  pick: { label: 'Staff pick', cls: 'bg-ink/10 text-ink-2', emoji: '👨‍🍳' },
};

const BADGE = 'inline-flex h-5.5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-bold';

/** Progressive disclosure: at most a couple of badges per card, the rest live on the detail page. */
export function Badges({ kinds, limit = 2 }: { kinds: BadgeKind[]; limit?: number }) {
  if (kinds.length === 0) return null;
  return (
    <>
      {kinds.slice(0, limit).map((k) => (
        <span className={cx(BADGE, BADGE_META[k].cls)} key={k}>
          <span aria-hidden>{BADGE_META[k].emoji}</span>
          {BADGE_META[k].label}
        </span>
      ))}
    </>
  );
}

export function SoldOutBadge() {
  return <span className={cx(BADGE, 'bg-white/10 text-ink-2')}>Unavailable today</span>;
}

export function DietMarks({ dish }: { dish: Dish }) {
  if (!dish.isVeg && dish.spiceLevel === 0) return null;
  return (
    <span className="ml-1.5 inline-flex translate-y-px items-center gap-1.5" aria-hidden>
      {dish.isVeg && (
        <span className="leading-none text-leaf" title="Vegetarian">
          <Leaf size={11} />
        </span>
      )}
      {dish.spiceLevel > 0 && (
        <span className="inline-flex gap-px leading-none text-[#ff6b4a]" title={`Spice level ${dish.spiceLevel} of 3`}>
          {Array.from({ length: dish.spiceLevel }, (_, i) => (
            <Chilli size={11} key={i} />
          ))}
        </span>
      )}
    </span>
  );
}

/** Food image with a warm gradient placeholder for dishes that have no photo. */
export function DishImage({
  dish,
  className,
  eager = false,
  monogram = 'text-3xl',
}: {
  dish: Pick<Dish, 'imageUrl' | 'name'>;
  className?: string;
  eager?: boolean;
  monogram?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!dish.imageUrl || failed) {
    return (
      <div
        className={cx(
          'grid place-items-center overflow-hidden bg-surface-2 bg-flame-dim font-display font-semibold text-flame-1/45',
          monogram,
          className,
        )}
        aria-hidden
      >
        <span>{dish.name.slice(0, 1)}</span>
      </div>
    );
  }
  return (
    <div className={cx('relative overflow-hidden bg-surface-2', className)}>
      <img
        src={dish.imageUrl}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={cx(
          'size-full object-cover transition-[opacity,scale] duration-700 ease-out-quart',
          loaded ? 'scale-100 opacity-100' : 'scale-105 opacity-0',
        )}
      />
    </div>
  );
}

const STEP_SIZES = {
  sm: { btn: 'size-7.5', icon: 15, value: 'min-w-4 text-[13.5px]' },
  md: { btn: 'size-8.5', icon: 15, value: 'min-w-5 text-[14.5px]' },
  lg: { btn: 'size-11.5', icon: 18, value: 'min-w-7 text-[17px]' },
} as const;

export function QuantityStepper({
  value,
  onChange,
  size = 'md',
  min = 0,
  bare = false,
}: {
  value: number;
  onChange: (next: number) => void;
  size?: keyof typeof STEP_SIZES;
  min?: number;
  bare?: boolean;
}) {
  const s = STEP_SIZES[size];
  const btn = cx(
    'grid place-items-center rounded-full transition-move',
    'active:not-disabled:scale-85 disabled:opacity-35',
    s.btn,
  );
  return (
    <div
      className={cx(
        'inline-flex select-none items-center rounded-full',
        !bare && 'bg-surface-2 ring-1 ring-hairline ring-inset',
      )}
    >
      <button
        type="button"
        className={btn}
        onClick={() => {
          haptic.tick();
          onChange(value - 1);
        }}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        <Minus size={s.icon} />
      </button>
      <span className={cx('text-center font-bold tnum', s.value)} aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={btn}
        onClick={() => {
          haptic.tick();
          onChange(value + 1);
        }}
        disabled={value >= 30}
        aria-label="Increase quantity"
      >
        <Plus size={s.icon} />
      </button>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('block rounded-xl shimmer-bg animate-shimmer', className)} />;
}
