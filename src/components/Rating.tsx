import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { haptic } from '../platform/haptics';
import { cx } from './ui';
import { Star, StarHalf } from './icons';

/** Stars are decorative — the numeric rating and its count carry the meaning. */
export function Stars({ value, size = 13 }: { value: number; size?: number }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex gap-0.5 leading-none text-gold">
      {[1, 2, 3, 4, 5].map((i) => {
        if (rounded >= i) return <Star key={i} size={size} />;
        if (rounded >= i - 0.5) return <StarHalf key={i} size={size} />;
        return <Star key={i} size={size} filled={false} className="text-gold/25" />;
      })}
    </span>
  );
}

/**
 * A rating never appears without its count — a 5.0 from two diners must not
 * read like a 4.8 from five hundred.
 */
export function RatingPill({
  rating,
  count,
  size = 'sm',
  onDark = false,
}: {
  rating: number | null;
  count: number;
  size?: 'sm' | 'md';
  onDark?: boolean;
}) {
  if (rating === null || count === 0) {
    return <span className="text-[12px] font-semibold italic text-ink-4">Not rated yet</span>;
  }
  const md = size === 'md';
  return (
    <span
      className={cx(
        'inline-flex items-center leading-none font-semibold',
        md ? 'gap-1.5 text-[15px]' : 'gap-1.5 text-[12.5px]',
        onDark ? 'text-white/85' : 'text-ink-2',
      )}
    >
      <Star size={md ? 14 : 11.5} className="text-gold" />
      <b className={cx('font-bold tnum', onDark ? 'text-white' : 'text-ink')}>{rating.toFixed(1)}</b>
      <span className={cx('tnum', md ? 'text-[13px]' : 'text-[12px]', onDark ? 'text-white/65' : 'text-ink-4')}>
        · {count.toLocaleString('en-US')}
      </span>
    </span>
  );
}

export function SubRating({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="grid grid-cols-[62px_1fr_30px] items-center gap-2.5 py-[5px]">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full origin-left rounded-full bg-flame animate-grow-x"
          style={{ width: `${((value ?? 0) / 5) * 100}%` }}
        />
      </span>
      <b className="text-right text-[13px] font-bold tnum">{value === null ? '—' : value.toFixed(1)}</b>
    </div>
  );
}

export function RatingBreakdown({ distribution, total }: { distribution: readonly number[]; total: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star - 1] ?? 0;
        const pct = total > 0 ? (n / total) * 100 : 0;
        return (
          <div className="grid grid-cols-[10px_12px_1fr_34px] items-center gap-[7px]" key={star}>
            <span className="text-[11.5px] font-semibold text-ink-3 tnum">{star}</span>
            <Star size={10} className="text-gold/80" />
            <span className="h-[5px] overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full origin-left rounded-full bg-gradient-to-r from-gold to-flame-2 animate-grow-x"
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-right text-[11.5px] text-ink-4 tnum">{n.toLocaleString('en-US')}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Tap-or-drag-to-rate.
 *
 * The rating follows the finger the whole way across the row — press a star,
 * slide, and the value tracks 1:1 with a tick at every step, so a diner can
 * feel their way to the right number instead of aiming for it. Feedback lands
 * on pointer-*down*, never on release.
 *
 * `touch-action: pan-y` claims the horizontal gesture for rating while leaving
 * the vertical one to the page — the diner can still scroll from here.
 */
export function StarPicker({
  value,
  onChange,
  size = 34,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  size?: number;
  label: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  /** The row is five equal columns; whichever one the finger is over wins. */
  const valueAt = (clientX: number): number => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return value;
    return Math.min(5, Math.max(1, Math.ceil(((clientX - rect.left) / rect.width) * 5)));
  };

  const set = (next: number, tick: boolean) => {
    if (next === value) return;
    if (tick) haptic.tick();
    onChange(next);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      set(Math.min(5, Math.max(1, (value || 0) + step)), true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      set(1, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      set(5, true);
    }
  };

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label={label}
      className="flex touch-pan-y gap-1.5"
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        haptic.tick();
        onChange(valueAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (dragging.current) set(valueAt(e.clientX), true);
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} of 5`}
          /* Roving tabindex: the group is one tab stop, arrows move within it. */
          tabIndex={n === (value || 1) ? 0 : -1}
          className={cx(
            'p-0.5 transition-[color,scale] duration-150 ease-spring active:scale-125',
            n <= value ? 'text-gold' : 'text-gold/25',
            n === value && 'scale-115',
          )}
          onClick={() => onChange(n)}
        >
          <Star size={size} filled={n <= value} />
        </button>
      ))}
    </div>
  );
}
