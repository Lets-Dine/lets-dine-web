import { twMerge } from 'tailwind-merge';

/** Joins class names, dropping anything falsy, and resolves conflicting Tailwind utilities in favor of the last one. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(' '));
}

/* ── Shared layout rails ──────────────────────────────────────────
   Phones get a single comfortable column; laptops get the real estate
   they came with. Every screen composes from these two widths.      */

/** Full-page background — ambient warmth only shows up once there is room. */
export const SHELL = 'min-h-dvh bg-bg lg:bg-room';

/** Wide content: menus, grids, anything that benefits from more columns. */
export const WIDE = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

/** Reading/form width: carts, checkout, review flow. */
export const NARROW = 'mx-auto w-full max-w-[620px] px-4 sm:px-6';

/** Space held for the fixed bottom bar, which only exists below `lg`. */
export const DOCK_SPACE = 'h-[calc(var(--dock-h)+var(--safe-b))] lg:hidden';
export const DOCK_SPACE_LG = 'h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:hidden';

/* ── Reusable atoms ──────────────────────────────────────────────── */

export const BTN =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight ' +
  'transition-move active:scale-[0.965] ' +
  'disabled:pointer-events-none disabled:opacity-40 select-none';

export const BTN_SIZE = 'h-13 px-5.5 text-[15.5px]';
export const BTN_SIZE_LG = 'h-14.5 px-7 text-[16.5px]';

export const BTN_FLAME = `${BTN} ${BTN_SIZE} bg-flame text-white shadow-flame`;
export const BTN_GHOST = `${BTN} ${BTN_SIZE} bg-surface-2 text-ink ring-1 ring-hairline ring-inset`;
export const BTN_QUIET = `${BTN} h-11 px-3.5 text-[15px] text-ink-3`;

export const ICON_BTN =
  'grid size-10 place-items-center rounded-full glass-chip text-ink ring-1 ring-hairline ring-inset ' +
  'transition-move active:scale-90';

export const CARD = 'rounded-3xl bg-surface ring-1 ring-hairline ring-inset';

export const CHIP =
  'inline-flex h-8.5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] ' +
  'font-semibold transition-[color,background-color,scale] duration-150 ease-out-quart active:scale-95';

export const CHIP_OFF = 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset';
export const CHIP_ON = 'bg-flame text-white shadow-[0_6px_18px_-8px_rgb(255_120_55_/_0.7)]';

export const TAG =
  'inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ' +
  'transition-colors duration-150';
export const TAG_OFF = 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset';
export const TAG_ON = 'bg-flame-2/15 text-flame-1 ring-1 ring-flame-2/35 ring-inset';

export const EYEBROW = 'text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3';

export const DISPLAY = 'font-display font-bold tracking-tight leading-[1.1] [font-optical-sizing:auto]';

/** Frosted bar used for sticky headers and bottom action bars.
 *  The material itself is defined in `index.css`, so the reduced-transparency
 *  and high-contrast fallbacks have one place to override. */
export const GLASS = 'glass';

/** Horizontal scroller on small screens; callers switch it to a grid at `lg`. */
export const RAIL = 'flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory';

export const INPUT =
  'w-full rounded-full bg-surface-2 px-4 text-[14px] text-ink outline-none ring-1 ring-hairline ring-inset ' +
  'placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/35';
