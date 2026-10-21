import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/**
 * Rises into place each time it scrolls into view. Content is visible until the script has
 * checked. Whatever is on screen at load plays `intro` (an animation class) instead, if given;
 * only what starts below the fold is armed to wait for the scroll.
 */
export function Reveal({ children, delay = 0, className, intro, introDelay = 0 }: { children: ReactNode; delay?: number; className?: string; intro?: string; introDelay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    // On screen at load means inside the viewport both ways: a tile scrolled out of view sideways in a rail still waits.
    if (box.top < window.innerHeight && box.left < window.innerWidth) {
      if (intro) {
        el.classList.add(intro);
        el.style.animationDelay = `${introDelay}ms`;
      }
      return;
    }
    if (typeof IntersectionObserver === 'undefined') return;
    el.dataset.reveal = 'hidden';
    const io = new IntersectionObserver(
      ([entry]) => {
        // Replays on every pass: re-armed once fully out of view, so the reset is never seen.
        el.dataset.reveal = entry.isIntersecting ? 'shown' : 'hidden';
      },
      { rootMargin: '0px 0px 0% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [intro, introDelay]);
  return (
    <div ref={ref} className={className} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
