import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../ui';

/** Room a tip needs above its trigger: its height, the gap, and a little to spare. */
const ROOM = 88;

/** The nearest ancestor that scrolls (and so clips what sticks out of it), or null for the page itself. */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p;
  }
  return null;
}

/**
 * A tooltip that shows the instant the pointer lands or the element is focused (the browser's own `title`
 * waits about a second and can't be styled). `label` is a small caption, `children` the point of it.
 * It opens above, or below when a scrolling parent would cut it off. The tip stays in the DOM, so screen
 * readers read it with the trigger; touch users get it on tap.
 */
export function Tip({ label, tip, className, children }: { label: string; tip: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  const place = () => {
    const el = ref.current;
    if (!el) return;
    const top = scroller(el)?.getBoundingClientRect().top ?? 0;
    setBelow(el.getBoundingClientRect().top - top < ROOM);
  };

  return (
    <span ref={ref} tabIndex={0} onPointerEnter={place} onFocus={place} className={cx('group/tip relative cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2', className)}>
      {children}
      <span
        role="tooltip"
        style={{ '--tip-y': below ? '-6px' : '6px' } as CSSProperties}
        className={cx(
          'pointer-events-none invisible absolute right-0 z-30 w-max max-w-[16rem] rounded-xl bg-surface-3 px-3.5 py-2.5 text-left opacity-0',
          'shadow-[0_1px_2px_rgb(0_0_0/0.2),0_16px_32px_-12px_rgb(0_0_0/0.55)] ring-1 ring-hairline-strong ring-inset',
          'group-hover/tip:visible group-hover/tip:animate-tip-hover group-focus/tip:visible group-focus/tip:animate-tip-in motion-reduce:group-hover/tip:animate-none motion-reduce:group-hover/tip:opacity-100',
          below ? 'top-full mt-2.5 origin-top-right' : 'bottom-full mb-2.5 origin-bottom-right',
        )}
      >
        <span aria-hidden className={cx('absolute right-3.5 size-2.5 rotate-45 bg-surface-3 ring-1 ring-hairline-strong', below ? '-top-[5px] [clip-path:polygon(0_0,100%_0,0_100%)]' : '-bottom-[5px] [clip-path:polygon(100%_0,100%_100%,0_100%)]')} />
        <span className="relative flex items-center gap-1.5 text-[11.5px] leading-tight font-semibold tracking-wide text-ink-3">
          <span aria-hidden className="size-1.5 rounded-full bg-flame shadow-[0_0_8px_rgb(255_110_50/0.7)]" />
          {label}
        </span>
        <span className="relative mt-1 block text-[13.5px] leading-snug font-semibold text-ink">{tip}</span>
      </span>
    </span>
  );
}
