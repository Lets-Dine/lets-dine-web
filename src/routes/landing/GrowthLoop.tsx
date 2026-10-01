import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useReveal } from './motion';

const STEPS = [
  { label: 'A better menu', note: 'Photos, ratings, what’s actually good' },
  { label: 'Confident customers', note: 'They stop guessing and start ordering' },
  { label: 'More orders', note: 'Bigger tables, fewer safe choices' },
  { label: 'More feedback', note: 'Every served dish can be rated' },
  { label: 'Sharper insight', note: 'Taste, portion and value, per plate' },
  { label: 'Better decisions', note: 'What to push, fix, price or cut' },
];

const R = 205;
const CENTER = 300;

/** Point on the ring for step `i`, starting at twelve o’clock, clockwise. */
function nodeAt(i: number) {
  const angle = (-90 + i * (360 / STEPS.length)) * (Math.PI / 180);
  return { x: CENTER + R * Math.cos(angle), y: CENTER + R * Math.sin(angle), deg: -90 + i * 60 };
}

/**
 * The argument for why this compounds.
 *
 * The ring is a data diagram, not decoration: it draws itself once as the
 * section arrives and then stops, and each of the six stations lights up in
 * order behind it. Below a laptop the same six become a vertical chain that
 * closes back on itself — the loop is the point, so it has to survive the
 * layout change.
 */
export function GrowthLoop() {
  const ref = useReveal<HTMLElement>();
  const diagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = diagramRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const ring = root.querySelector<SVGCircleElement>('[data-ring]');
      const nodes = root.querySelectorAll<HTMLElement>('[data-node]');
      const arrows = root.querySelectorAll('[data-arrow]');
      if (!ring) return;

      const circumference = 2 * Math.PI * R;
      gsap.set(ring, { strokeDasharray: circumference, strokeDashoffset: circumference });
      gsap.set(nodes, { opacity: 0, scale: 0.9 });
      gsap.set(arrows, { opacity: 0 });

      gsap
        .timeline({ scrollTrigger: { trigger: root, start: 'top 72%' } })
        .to(ring, { strokeDashoffset: 0, duration: 2.1, ease: 'power2.inOut' })
        .to(nodes, { opacity: 1, scale: 1, duration: 0.5, stagger: 0.28, ease: 'power3.out' }, 0.25)
        .to(arrows, { opacity: 1, duration: 0.4, stagger: 0.28 }, 0.45);
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <Band ref={ref} night rule={false} className="overflow-hidden">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="09">The growth loop</Mark>
          <SplitHeading text="Every order makes your restaurant smarter." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
        </div>
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          None of these four parts is worth much alone. Wired together they feed each other, and the menu you print
          next season is written by the room that ate the last one.
        </p>
      </div>

      {/* The ring — laptops and up, where there is room for it to breathe. */}
      <div ref={diagramRef} className={cx(RAIL, 'mt-16 hidden lg:block')}>
        <div className="relative mx-auto aspect-square w-full max-w-[640px]">
          <svg viewBox="0 0 600 600" className="absolute inset-0 size-full" aria-hidden>
            <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="var(--color-hairline)" strokeWidth={1} />
            <circle
              data-ring
              cx={CENTER}
              cy={CENTER}
              r={R}
              fill="none"
              stroke="var(--color-flame-2)"
              strokeWidth={1.5}
              strokeLinecap="round"
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
            />
            {/* Direction of travel, halfway between each pair of stations. */}
            {STEPS.map((_, i) => {
              const mid = (-60 + i * 60) * (Math.PI / 180);
              const x = CENTER + R * Math.cos(mid);
              const y = CENTER + R * Math.sin(mid);
              return (
                <path
                  key={i}
                  data-arrow
                  d="M -5 -4 L 5 0 L -5 4 Z"
                  fill="var(--color-flame-2)"
                  transform={`translate(${x} ${y}) rotate(${(-60 + i * 60) + 90})`}
                />
              );
            })}
          </svg>

          {/* Stations */}
          {STEPS.map((step, i) => {
            const { x, y } = nodeAt(i);
            return (
              <div
                key={step.label}
                data-node
                className="absolute w-[198px] -translate-x-1/2 -translate-y-1/2 rounded-[14px] bg-surface px-4 py-3 text-center shadow-deep ring-1 ring-hairline ring-inset"
                style={{ left: `${(x / 600) * 100}%`, top: `${(y / 600) * 100}%` }}
              >
                <span className="font-mono text-[10px] font-bold tracking-[0.14em] text-flame-1">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="mt-0.5 text-[14px] font-semibold leading-tight tracking-tight text-ink">{step.label}</div>
                <p className="mt-1 text-[11.5px] leading-snug text-ink-4">{step.note}</p>
              </div>
            );
          })}

          {/* Hub */}
          <div className="absolute left-1/2 top-1/2 w-[190px] -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="font-display text-[clamp(26px,3vw,38px)] font-semibold leading-tight tracking-[-0.03em] text-ink">
              Every order
            </span>
            <p className="mt-1.5 text-[13px] leading-snug text-ink-3">feeds the next one</p>
          </div>
        </div>
      </div>

      {/* The same loop, vertically. */}
      <div className={cx(RAIL, 'mt-12 lg:hidden')} data-reveal-group="loop">
        <ol className="mx-auto flex max-w-sm flex-col">
          {STEPS.map((step, i) => (
            <li key={step.label} data-reveal className="relative pl-9">
              <span
                className="absolute left-3 top-0 h-full w-px bg-gradient-to-b from-flame-2/50 to-flame-2/50"
                aria-hidden
              />
              <span className="absolute left-0 top-1 grid size-6 place-items-center rounded-full bg-flame text-[11px] font-bold text-white">
                {i + 1}
              </span>
              <div className="pb-7">
                <div className="text-[16px] font-semibold tracking-tight text-ink">{step.label}</div>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-4">{step.note}</p>
              </div>
            </li>
          ))}
          <li data-reveal className="relative pl-9">
            <span className="absolute left-0 top-0 grid size-6 place-items-center rounded-full bg-surface-2 text-[11px] text-flame-1 ring-1 ring-hairline ring-inset">
              ↻
            </span>
            <span className="text-[13.5px] font-medium italic text-ink-3">…and back to a better menu.</span>
          </li>
        </ol>
      </div>
    </Band>
  );
}
