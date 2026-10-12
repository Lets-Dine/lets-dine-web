import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode, RefObject } from 'react';
import { cx } from '../ui';

/**
 * The shared language of the profile pages (a customer, a courier): a tilting identity card, a floating
 * bar once the identity scrolls away, blocks that rise in, and figures that count up.
 */

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Eases a number to its target — from zero on first sight, from the old value after — so changes land instead of jumping. */
export function useCountUp(target: number, ms = 1100) {
  const from = useRef(reduced() ? target : 0);
  const [n, setN] = useState(from.current);
  useEffect(() => {
    if (reduced()) {
      from.current = target;
      setN(target);
      return;
    }
    let raf = 0;
    const start = from.current;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      from.current = Math.round(start + (target - start) * (1 - Math.pow(1 - p, 4)));
      setN(from.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

/** True once `ref` has scrolled out of view. */
export function useAway(ref: RefObject<HTMLElement | null>) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return away;
}

/** A small pill pinned to the top that slides in while `show` — the name and the one action that matters. */
export function FloatingBar({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="sticky top-3 z-20 h-0">
      <div
        aria-hidden={!show}
        inert={!show}
        className={cx(
          'mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-surface-3 py-1.5 pl-4 pr-1.5 shadow-deep ring-1 ring-hairline-strong ring-inset transition-[opacity,translate] duration-300 ease-out-quart',
          show ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-3 opacity-0',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A card that tilts toward the pointer and catches light as it turns, tinted from a hue. */
export function TiltCard({ hue, glow = true, children }: { hue: number; glow?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (k: string, v: string) => ref.current?.style.setProperty(k, v);
  const move = (e: PointerEvent) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch' || reduced()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    set('--rx', `${(0.5 - y) * 16}deg`);
    set('--ry', `${(x - 0.5) * 20}deg`);
    set('--mx', `${x * 100}%`);
    set('--my', `${y * 100}%`);
  };
  const rest = () => {
    set('--rx', '0deg');
    set('--ry', '0deg');
  };

  return (
    <div className="relative mx-auto w-full max-w-95">
      {glow && <span aria-hidden className="pointer-events-none absolute -inset-8 -z-10 rounded-full blur-3xl" style={{ background: `oklch(0.5 0.14 ${hue} / 0.4)` }} />}
      <div className="perspective-[1000px]" onPointerMove={move} onPointerLeave={rest}>
        <div
          ref={ref}
          className="relative aspect-[1.586] animate-card-in overflow-hidden rounded-[26px] p-6 shadow-[0_40px_60px_-30px_rgb(0_0_0/0.7)] transition-transform duration-200 ease-out transform-3d transform-[rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] sm:p-7"
          style={{ background: `linear-gradient(145deg, oklch(0.9 0.085 ${hue}), oklch(0.8 0.12 ${(hue + 28) % 360}))`, color: `oklch(0.2 0.05 ${hue})` }}
        >
          <span aria-hidden className="pointer-events-none absolute inset-0 mix-blend-soft-light" style={{ background: 'radial-gradient(circle at var(--mx,30%) var(--my,10%), rgb(255 255 255 / 0.85), transparent 55%)' }} />
          {children}
        </div>
      </div>
    </div>
  );
}

export const Num = ({ children }: { children: ReactNode }) => <span className="text-ink tnum">{children}</span>;

export function Block({ title, hint, delay = 0, id, action, children }: { title: string; hint?: string; delay?: number; id?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 animate-rise rounded-3xl bg-surface px-5 py-5 ring-1 ring-hairline ring-inset sm:px-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-baseline gap-x-3 text-[17px] font-semibold tracking-tight">
          {title}
          {hint && <span className="text-[12.5px] font-normal text-ink-3">{hint}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
