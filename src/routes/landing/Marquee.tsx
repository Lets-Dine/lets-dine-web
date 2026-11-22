import { useEffect, useRef, useState } from 'react';

const ITEMS = ['QR ordering', 'POS and billing', 'Kitchen display', 'Stock and recipes', 'Dish margins', 'Cash book', 'Profit and loss', 'Delivery riders', 'Branches and floors', 'Staff roles', 'Fonepay QR'];

/**
 * A running band of what the system covers, and a hard colour break between the
 * cream hero and the section under it. The track is duplicated so the loop is
 * seamless; only the first copy is exposed to assistive technology, and it
 * stops running whenever it is off screen.
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

  const items = [...ITEMS, ...ITEMS];

  return (
    <div ref={ref} className="relative overflow-hidden bg-flame py-4 text-white">
      <div
        className="marquee-track flex w-max items-center gap-10 whitespace-nowrap will-change-transform"
        style={{ animation: 'marquee-x 38s linear infinite', animationPlayState: running ? 'running' : 'paused' }}
      >
        {items.map((item, i) => (
          <span key={`${item}-${i}`} className="flex items-center gap-10" aria-hidden={i >= ITEMS.length}>
            <span className="font-display text-[19px] font-semibold tracking-[-0.02em]">{item}</span>
            <span className="text-white/35" aria-hidden>·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
