import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Check, Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { gsap, prefersReducedMotion, useReveal } from './motion';
import { DISH_COMMENTS, HERO_DISH } from './data';

const FACETS = [
  { label: 'Taste', value: HERO_DISH.taste, note: 'Marinade and char' },
  { label: 'Portion', value: HERO_DISH.portion, note: 'Size for the price' },
  { label: 'Value', value: HERO_DISH.value, note: 'Worth coming back for' },
] as const;

/**
 * The differentiator, given the whole width of the page and the lights turned
 * down. A photograph at plate scale on one side, and on the other the entire
 * reputation that dish has earned — the three scores separately, the reorder
 * rate, the words diners actually used, and how many of them said each one.
 *
 * The score bars grow from zero as the section arrives; they are rendered at
 * full width first, so the numbers are correct with JavaScript unavailable.
 */
export function DishIntelligence() {
  const ref = useReveal<HTMLElement>();
  const barsRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLDivElement>(null);
  const pct = Math.round(HERO_DISH.recommendRate * 100);

  useEffect(() => {
    const bars = barsRef.current;
    const photo = photoRef.current;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      if (bars) {
        const fills = bars.querySelectorAll<HTMLElement>('[data-bar]');
        gsap.set(fills, { scaleX: 0, transformOrigin: 'left center' });
        gsap.to(fills, {
          scaleX: 1,
          duration: 1.1,
          ease: 'power3.out',
          stagger: 0.12,
          scrollTrigger: { trigger: bars, start: 'top 84%' },
        });
      }
      if (photo) {
        const img = photo.querySelector('img');
        if (img) {
          gsap.fromTo(
            img,
            { yPercent: -7 },
            {
              yPercent: 7,
              ease: 'none',
              scrollTrigger: { trigger: photo, start: 'top bottom', end: 'bottom top', scrub: 0.7 },
            },
          );
        }
      }
    });

    return () => ctx.revert();
  }, []);

  return (
    <Band id="dish-intelligence" ref={ref} night rule={false} className="overflow-hidden">
      <div className={RAIL}>
        <div className="flex flex-col gap-8 lg:grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Mark n="03">Dish intelligence</Mark>
            <SplitHeading text="Every dish has a story." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
          </div>
          <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
            Not what it costs — what it tastes like, how big it arrives, and whether the table that ordered it would
            do it again.
          </p>
        </div>
      </div>

      {/* The dish, at plate scale. */}
      <div className="mt-14 lg:mt-20">
        <div className={RAIL}>
        <div className="grid items-stretch gap-px overflow-hidden rounded-[24px] bg-hairline-strong lg:grid-cols-2">
          <div ref={photoRef} data-reveal className="relative h-[280px] overflow-hidden bg-surface sm:h-[380px] lg:h-auto lg:min-h-[560px]">
            <img
              src={HERO_DISH.image}
              alt={HERO_DISH.name}
              width={1200}
              height={1400}
              loading="lazy"
              className="absolute inset-0 size-full scale-115 object-cover"
            />
            {/* The caption sits on a photograph that is bright in places, so the
                wash has to reach well up the frame rather than hug the edge. */}
            <span
              className="absolute inset-0 bg-[linear-gradient(to_top,rgb(10_7_4/0.94),rgb(10_7_4/0.62)_34%,rgb(10_7_4/0.12)_68%,transparent)]"
              aria-hidden
            />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
              <div>
                <h3 className="font-display text-[clamp(24px,3.4vw,38px)] font-semibold leading-tight tracking-[-0.025em] text-white">
                  {HERO_DISH.name}
                </h3>
                <p className="mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-white/70">{HERO_DISH.description}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/12 px-3 py-1.5 font-mono text-[13px] font-bold tabular-nums text-white backdrop-blur-sm">
                {HERO_DISH.price}
              </span>
            </div>
          </div>

          <div data-reveal className="flex flex-col gap-7 bg-surface p-6 sm:p-9 lg:p-10">
            {/* Headline score */}
            <div className="flex items-end justify-between gap-4 border-b border-hairline pb-6">
              <div>
                <span className="label text-ink-4">Overall</span>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="font-mono text-[56px] font-bold leading-none tabular-nums tracking-[-0.03em] text-ink">
                    {HERO_DISH.rating}
                  </span>
                  <Star size={22} className="translate-y-[-6px] text-gold" />
                </div>
                <span className="mt-2 block text-[13px] text-ink-3">
                  from {HERO_DISH.ratingCount} diners who ordered it
                </span>
              </div>
              <div className="text-right">
                <div className="font-mono text-[30px] font-bold leading-none tabular-nums text-mint-ink">{pct}%</div>
                <span className="mt-1.5 block whitespace-nowrap text-[12.5px] leading-snug text-ink-3">would order it again</span>
              </div>
            </div>

            {/* The three scores, apart */}
            <div ref={barsRef} className="flex flex-col gap-5">
              {FACETS.map((facet) => (
                <div key={facet.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[14.5px] font-semibold text-ink">{facet.label}</span>
                    <span className="font-mono text-[15px] font-bold tabular-nums text-ink">{facet.value.toFixed(1)}</span>
                  </div>
                  <span className="mt-2 block h-[6px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span
                      data-bar
                      className="block h-full rounded-full bg-gradient-to-r from-flame-3 to-flame-2"
                      style={{ width: `${(facet.value / 5) * 100}%` }}
                    />
                  </span>
                  <span className="mt-1.5 block text-[12px] text-ink-4">{facet.note}</span>
                </div>
              ))}
            </div>

            {/* What they said, counted */}
            <div className="flex flex-wrap gap-2 border-t border-hairline pt-6">
              {HERO_DISH.tags.map(([tag, n]) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-3.5 py-1.5 text-[13px] font-medium text-ink-2 ring-1 ring-hairline ring-inset"
                >
                  {tag}
                  <span className="font-mono text-[11.5px] font-bold tabular-nums text-flame-1">{n}</span>
                </span>
              ))}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-1.5 font-mono text-[11.5px] font-bold tabular-nums text-ink-3 ring-1 ring-hairline ring-inset">
                {HERO_DISH.orders30d} orders
                <span className="text-mint-ink">
                  ↑{Math.round(((HERO_DISH.orders30d - HERO_DISH.ordersPrev30d) / HERO_DISH.ordersPrev30d) * 100)}%
                </span>
              </span>
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* The words themselves. */}
      <div className={cx(RAIL, 'mt-8 grid gap-4 sm:grid-cols-3')} data-reveal-group="comments">
        {DISH_COMMENTS.map((comment) => (
          <figure
            key={comment.name}
            data-reveal
            className="flex flex-col rounded-[16px] bg-surface p-5 ring-1 ring-hairline ring-inset"
          >
            <blockquote className="flex-1 text-pretty font-display text-[15px] italic leading-[1.55] text-ink-2">
              “{comment.text}”
            </blockquote>
            <figcaption className="mt-4 flex items-center justify-between gap-2 border-t border-hairline pt-3">
              <span className="text-[12.5px] font-semibold text-ink-3">{comment.name}</span>
              <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-mint-ink">
                <Check size={11} /> Verified order
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </Band>
  );
}
