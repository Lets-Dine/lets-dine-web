import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Search, Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, PhoneFrame, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useReveal } from './motion';
import { MENU_DISHES, RESTAURANT_NAME } from './data';

const BADGES = [
  { dish: MENU_DISHES[1], badge: 'Most loved', tone: 'bg-gold text-[#241802]' },
  { dish: MENU_DISHES[2], badge: 'Popular', tone: 'bg-flame text-white' },
  { dish: MENU_DISHES[4], badge: 'Best value', tone: 'bg-mint text-white' },
];

/**
 * The consumer half of the product, sold the way a consumer product is sold:
 * one device, large, in the middle of the page, with the three labels that do
 * the actual work floating out of it at plate scale.
 *
 * The floating cards drift at different rates on scroll. They are decorative
 * duplicates of what the screen already shows, so they are hidden from
 * assistive technology and from small screens, where the phone is the page.
 */
export function CustomerExperience() {
  const ref = useReveal<HTMLElement>();
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-drift]').forEach((el) => {
        const depth = Number(el.dataset.drift);
        gsap.fromTo(
          el,
          { yPercent: depth * 9 },
          {
            yPercent: depth * -9,
            ease: 'none',
            scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
          },
        );
      });
    }, stage);

    return () => ctx.revert();
  }, []);

  return (
    <Band ref={ref} className="overflow-hidden bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="04">The customer experience</Mark>
          <SplitHeading text="Give your customers more than a menu." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
        </div>
        <div className="lg:col-span-4 lg:col-start-9 lg:self-end">
          <p data-reveal className={LEAD}>
            Nobody has to ask the server <em className="font-display not-italic text-ink">“what’s good here?”</em> any
            more. The room already answered — and the answer is on the plate, before it is ordered.
          </p>
        </div>
      </div>

      {/* Stage */}
      <div ref={stageRef} className="relative mt-16 lg:mt-20">
        <div className={cx(RAIL, 'relative')}>
          <div data-reveal className="relative mx-auto w-full max-w-[340px]">
            <PhoneFrame>
              <DiscoveryScreen />
            </PhoneFrame>

            {/* Floating labels — the three verdicts, at plate scale. */}
            {BADGES.map((item, i) => {
              const place = [
                'left-[-40%] top-[8%] xl:left-[-58%]',
                'right-[-42%] top-[36%] xl:right-[-60%]',
                'left-[-36%] bottom-[10%] xl:left-[-52%]',
              ][i];
              return (
                <figure
                  key={item.badge}
                  aria-hidden
                  data-drift={i === 1 ? -1 : 1}
                  className={cx(
                    'absolute hidden w-[228px] overflow-hidden rounded-[18px] bg-surface shadow-deep ring-1 ring-hairline ring-inset lg:block',
                    place,
                  )}
                >
                  <div className="relative">
                    <img
                      src={item.dish.image}
                      alt=""
                      width={460}
                      height={320}
                      loading="lazy"
                      className="aspect-[16/10] w-full object-cover"
                    />
                    <span
                      className={cx(
                        'absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10.5px] font-bold tracking-tight',
                        item.tone,
                      )}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <figcaption className="p-3.5">
                    <div className="truncate text-[13.5px] font-semibold tracking-tight text-ink">{item.dish.name}</div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[12px] text-ink-3">
                        <Star size={10} className="text-gold" />
                        {item.dish.rating}
                        <span className="text-ink-4">· {item.dish.ratingCount}</span>
                      </span>
                      <span className="font-mono text-[12.5px] font-bold tabular-nums text-ink">{item.dish.price}</span>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>
      </div>

      <div className={cx(RAIL, 'mt-16 grid gap-8 border-t border-hairline pt-10 sm:grid-cols-3')} data-reveal-group="ce">
        {[
          ['No app', 'The menu opens in the browser the phone already has. Nothing to install, nothing to sign up for.'],
          ['No guessing', 'Most loved, Popular and Best value are computed from orders and ratings, not chosen by marketing.'],
          ['No waiting', 'The order goes to the kitchen from the table, and the table watches it move.'],
        ].map(([title, body]) => (
          <div key={title} data-reveal>
            <h3 className="font-display text-[19px] font-semibold tracking-tight text-ink">{title}</h3>
            <p className="mt-2 max-w-[36ch] text-[14px] leading-relaxed text-ink-3">{body}</p>
          </div>
        ))}
      </div>
    </Band>
  );
}

/** The discovery screen: what a diner sees ten seconds after scanning. */
function DiscoveryScreen() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-12">
        <div className="min-w-0">
          <b className="block truncate text-[15px] font-semibold tracking-tight text-ink">{RESTAURANT_NAME}</b>
          <span className="flex items-center gap-1 text-[11px] text-ink-3">
            <Star size={9.5} className="text-gold" /> 4.6 · 1,248 ratings · Table 12
          </span>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset">
          <Search size={14} />
        </span>
      </div>

      <div className="flex gap-1.5 overflow-hidden px-4 pb-3 text-[11px] font-semibold">
        <span className="shrink-0 rounded-full bg-flame px-2.5 py-1 text-white">Most loved</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 ring-1 ring-hairline ring-inset">
          Popular
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 ring-1 ring-hairline ring-inset">
          Best value
        </span>
      </div>

      {/* Hero dish card */}
      <div className="px-4">
        <div className="overflow-hidden rounded-[16px] bg-surface ring-1 ring-hairline ring-inset">
          <div className="relative">
            <img
              src={MENU_DISHES[1].image}
              alt=""
              width={460}
              height={300}
              loading="lazy"
              className="aspect-[16/10] w-full object-cover"
            />
            <span className="absolute left-2.5 top-2.5 rounded-full bg-gold px-2 py-0.5 text-[9.5px] font-bold text-[#241802]">
              Most loved
            </span>
          </div>
          <div className="p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate text-[13.5px] font-semibold tracking-tight text-ink">{MENU_DISHES[1].name}</div>
              <span className="font-mono text-[12.5px] font-bold tabular-nums text-ink">{MENU_DISHES[1].price}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-ink-2">
                <Star size={9.5} className="text-gold" />
                {MENU_DISHES[1].rating}
              </span>
              <span className="text-ink-4">{MENU_DISHES[1].ratingCount} ratings</span>
            </div>
            <p className="mt-1.5 text-[11px] font-semibold text-mint-ink">
              {Math.round(MENU_DISHES[1].recommendRate * 100)}% would order again
            </p>
            <button
              type="button"
              tabIndex={-1}
              className="mt-2.5 h-8 w-full rounded-full bg-flame text-[12px] font-bold text-white"
            >
              Add to order · {MENU_DISHES[1].price}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex flex-col gap-2 px-4 pb-4">
        {[MENU_DISHES[4], MENU_DISHES[5]].map((dish) => (
          <div key={dish.name} className="flex items-center gap-2.5 rounded-[14px] bg-surface p-2 ring-1 ring-hairline ring-inset">
            <img src={dish.image} alt="" width={140} height={140} loading="lazy" className="size-11 shrink-0 rounded-[9px] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-ink">{dish.name}</div>
              <span className="flex items-center gap-1 text-[10.5px] text-ink-3">
                <Star size={8.5} className="text-gold" />
                {dish.rating} · {dish.price}
              </span>
            </div>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-bold leading-none text-ink-2 ring-1 ring-hairline ring-inset">
              +
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
