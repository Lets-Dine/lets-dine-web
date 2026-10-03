import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Star } from '../../components/icons';
import { Band, DISPLAY_XL, LEAD, PrimaryCta, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useReveal } from './motion';
import { MENU_DISHES } from './data';

/**
 * The close. Lights down, one sentence at cover size, two ways in.
 *
 * Behind it, the product itself: a slow drift of the real dish cards a diner
 * would see, held far enough back that it never competes with the type. It is
 * decoration built from real data rather than an abstract gradient, and it is
 * hidden from assistive technology.
 */
export function FinalCta() {
  const ref = useReveal<HTMLElement>();
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-lane]').forEach((lane, i) => {
        gsap.fromTo(
          lane,
          { xPercent: i % 2 === 0 ? -4 : 4 },
          {
            xPercent: i % 2 === 0 ? 4 : -4,
            ease: 'none',
            scrollTrigger: { trigger: bg, start: 'top bottom', end: 'bottom top', scrub: 1 },
          },
        );
      });
    }, bg);

    return () => ctx.revert();
  }, []);

  return (
    <Band ref={ref} night rule={false} className="relative overflow-hidden py-28 sm:py-32 lg:py-44">
      {/* Product visualisation, well back. */}
      <div ref={bgRef} aria-hidden className="pointer-events-none absolute inset-0 select-none opacity-[0.16]">
        {[0, 1].map((lane) => (
          <div
            key={lane}
            data-lane
            className={cx(
              'absolute flex w-[130%] gap-4',
              lane === 0 ? 'left-[-15%] top-[11%]' : 'left-[-15%] bottom-[11%]',
            )}
          >
            {[...MENU_DISHES, ...MENU_DISHES].slice(lane * 3, lane * 3 + 8).map((dish, i) => (
              <div
                key={`${dish.name}-${i}`}
                className="flex w-[230px] shrink-0 gap-2.5 rounded-[14px] bg-surface p-2.5 ring-1 ring-hairline ring-inset"
              >
                <img
                  src={dish.image}
                  alt=""
                  width={120}
                  height={120}
                  loading="lazy"
                  className="size-12 shrink-0 rounded-[9px] object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-ink">{dish.name}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-ink-3">
                    <span className="flex items-center gap-1">
                      <Star size={9} className="text-gold" />
                      {dish.rating}
                    </span>
                    <span className="font-mono tabular-nums">{dish.price}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <span className="absolute inset-0 bg-gradient-to-b from-bg via-bg/55 to-bg" />
      </div>

      <div className={cx(RAIL, 'relative text-center')}>
        <SplitHeading
          text="Give your customers a better way to dine."
          className={cx(DISPLAY_XL, 'mx-auto max-w-[15ch] text-ink')}
        />
        <p data-reveal className={cx(LEAD, 'mx-auto mt-7 max-w-[54ch]')}>
          Bring your menu, your orders, your reviews and everything your customers think about each dish into one
          experience — theirs and yours.
        </p>
        <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta to="/platform" size="lg">
            Get started
          </PrimaryCta>
          {/* <SecondaryCta to="/" size="lg">
            Book a demo
          </SecondaryCta> */}
        </div>
        <p data-reveal className="mt-6 text-[13px] text-ink-4">
          No card to set up. Bring your existing menu and we’ll have the first table scanning today.
        </p>
      </div>
    </Band>
  );
}
