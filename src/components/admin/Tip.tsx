import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
        className={cx(
          'pointer-events-none absolute right-0 z-30 w-max max-w-[16rem] rounded-xl bg-surface-3 px-3 py-2 text-left opacity-0 shadow-deep ring-1 ring-hairline-strong ring-inset transition-[opacity,translate] duration-100 ease-out motion-reduce:transition-none',
          'group-hover/tip:translate-y-0 group-hover/tip:opacity-100 group-focus/tip:translate-y-0 group-focus/tip:opacity-100',
          below ? 'top-full mt-2 -translate-y-1' : 'bottom-full mb-2 translate-y-1',
        )}
      >
        <span className="block text-[11.5px] font-semibold text-ink-3">{label}</span>
        <span className="mt-0.5 block text-[14px] font-semibold text-ink">{tip}</span>
      </span>
    </span>
  );
}
