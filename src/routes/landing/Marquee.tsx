import { useEffect, useRef, useState } from 'react';
import { Star } from '../../components/icons';
import { MENU_DISHES } from './data';

/**
 * A running band of real dishes and the ratings they have earned — the page's
 * thesis stated as a ticker rather than a sentence, and a hard colour break
 * between the cream hero and the cream section under it.
 *
 * The track is duplicated so the loop is seamless; only the first copy is
 * exposed to assistive technology. It stops running whenever it is off
 * screen, so nothing animates where nobody is looking.
 */
export function Marquee() {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setRunning(entry.isIntersecting), { threshold: 0 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const items = [...MENU_DISHES, ...MENU_DISHES];

  return (
    <div ref={ref} className="relative overflow-hidden bg-flame py-4 text-white">
      <div
        className="marquee-track flex w-max items-center gap-10 whitespace-nowrap will-change-transform"
        style={{
          animation: 'marquee-x 38s linear infinite',
          animationPlayState: running ? 'running' : 'paused',
        }}
      >
        {items.map((dish, i) => (
          <span
            key={`${dish.name}-${i}`}
            className="flex items-center gap-2.5 text-[14px] font-medium"
            aria-hidden={i >= MENU_DISHES.length}
          >
            <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">{dish.name}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 font-mono text-[11.5px] font-bold tabular-nums">
              <Star size={10} /> {dish.rating.toFixed(1)}
            </span>
            <span className="font-mono text-[11.5px] tabular-nums text-white/65">
              {dish.orders30d} orders · 30d
            </span>
            <span className="text-white/35" aria-hidden>
              ✳
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
