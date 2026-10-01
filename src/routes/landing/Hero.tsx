import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { Check, Star } from '../../components/icons';
import { DISPLAY_XL, Figure, LEAD, PhoneFrame, PrimaryCta, RAIL, SecondaryCta } from './kit';
import { gsap, prefersReducedMotion, useCountUp } from './motion';
import { HERO_DISH, MENU_DISHES, RESTAURANT_NAME } from './data';

/**
 * The first viewport.
 *
 * Asymmetric on purpose: the argument occupies seven columns on the left at a
 * size a printed cover would use, and the product occupies five on the right —
 * a real menu screen, a live order ticket and a rating readout, composed as
 * one object rather than three floating cards. A photograph bleeds off the
 * right edge behind it so the composition has somewhere to go.
 *
 * Everything below is rendered in its final state. GSAP hides it and replays
 * it only once it has taken over, so the hero is complete without JavaScript.
 */
export function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  const [ratingRef, rating] = useCountUp(4.6, 1);
  const [repeatRef, repeat] = useCountUp(41, 0);
  const [countRef, count] = useCountUp(1248, 0);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);
      const words = q('[data-hero-word] > span');
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      gsap.set(q('[data-hero-photo]'), { clipPath: 'inset(0% 0% 100% 0%)' });
      gsap.set(words, { yPercent: 110 });
      gsap.set(q('[data-hero-rise]'), { opacity: 0, y: 22 });
      gsap.set(q('[data-hero-phone]'), { opacity: 0, y: 48, rotate: -1.5 });
      gsap.set(q('[data-hero-float]'), { opacity: 0, y: 18, scale: 0.94 });

      tl.to(q('[data-hero-photo]'), { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: 'power4.inOut' })
        .to(words, { yPercent: 0, duration: 0.95, ease: 'power4.out', stagger: 0.048 }, 0.15)
        .to(q('[data-hero-rise]'), { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0.55)
        .to(q('[data-hero-phone]'), { opacity: 1, y: 0, rotate: 0, duration: 1.05 }, 0.42)
        .to(q('[data-hero-float]'), { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.12, ease: 'back.out(1.5)' }, 0.95);

      // Depth on scroll: the photograph drifts slower than the panel in front of it.
      gsap.to(q('[data-hero-photo]'), {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 0.6 },
      });
      gsap.to(q('[data-hero-stack]'), {
        yPercent: -6,
        ease: 'none',
        scrollTrigger: { trigger: root, start: 'top top', end: 'bottom top', scrub: 0.6 },
      });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden bg-stock pb-16 pt-[calc(104px+var(--safe-t))] sm:pb-20 lg:pb-24 lg:pt-[calc(124px+var(--safe-t))]"
    >
      <div className={cx(RAIL, 'relative flex flex-col gap-14 lg:grid lg:grid-cols-12 lg:items-center lg:gap-10')}>
        {/* ── The argument ─────────────────────────────────────── */}
        <div className="lg:col-span-7 lg:pr-6">
          <p data-hero-rise className="label flex items-center gap-2.5 text-ink-4">
            <span className="inline-block size-1.5 rounded-full bg-flame-2" aria-hidden />
            A dining experience platform
          </p>

          <h1 className="mt-5">
            <span aria-hidden>
              <span className="block max-w-[18ch] font-display text-[clamp(16px,1.6vw,21px)] font-normal italic leading-[1.35] text-ink-3">
                {'Your menu tells them what’s available.'.split(' ').map((w, i) => (
                  <span key={i} data-hero-word className="inline-block overflow-hidden align-bottom">
                    <span className="inline-block">{w}&nbsp;</span>
                  </span>
                ))}
              </span>
              <span className={cx(DISPLAY_XL, 'mt-2.5 block max-w-[13ch] text-ink')}>
                {['We', 'tell', 'them', 'what’s'].map((w, i) => (
                  <span key={i} data-hero-word className="inline-block overflow-hidden align-bottom pb-[0.06em]">
                    <span className="inline-block">{w}&nbsp;</span>
                  </span>
                ))}
                <span data-hero-word className="inline-block overflow-hidden align-bottom pb-[0.06em]">
                  <span className="inline-block italic text-flame-2">worth&nbsp;</span>
                </span>
                <span data-hero-word className="inline-block overflow-hidden align-bottom pb-[0.06em]">
                  <span className="inline-block italic text-flame-2">ordering.</span>
                </span>
              </span>
            </span>
            <span className="sr-only">
              Your menu tells them what’s available. We tell them what’s worth ordering.
            </span>
          </h1>

          <p data-hero-rise className={cx(LEAD, 'mt-6 max-w-[47ch]')}>
            A digital menu, table ordering by QR code, and a rating on every single dish — taste, portion and value,
            left only by the people who actually ate it. Your kitchen finally finds out what the room thinks.
          </p>

          <div data-hero-rise className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryCta to="/platform" size="lg">
              Get started
            </PrimaryCta>
            <SecondaryCta to="/demo" size="lg">
              See how it works
            </SecondaryCta>
          </div>

          <div data-hero-rise className="mt-9 grid max-w-lg grid-cols-3 gap-6 border-t border-hairline pt-5">
            <Figure refCb={ratingRef} value={`${rating}★`} label="Average dish rating" />
            <Figure refCb={repeatRef} value={`${repeat}%`} label="Orders that reorder a dish" />
            <Figure refCb={countRef} value={Number(count).toLocaleString('en-US')} label="Ratings left by diners" />
          </div>
          <p data-hero-rise className="mt-3 max-w-lg text-[12px] leading-relaxed text-ink-4">
            Figures from Sekuwa Ghar, the live demo restaurant you can open at{' '}
            <span className="font-mono">/demo</span>.
          </p>
        </div>

        {/* ── The product ──────────────────────────────────────── */}
        <div className="relative lg:col-span-5">
          {/* Photograph, bleeding off the right edge behind the phone. */}
          <div
            data-hero-photo
            aria-hidden
            className="pointer-events-none absolute -right-[18%] -top-[14%] hidden h-[118%] w-[86%] overflow-hidden rounded-[28px] lg:block"
          >
            <img
              src="/img/chicken-sekuwa.jpg"
              alt=""
              width={1200}
              height={1600}
              className="size-full scale-105 object-cover"
            />
            <span className="absolute inset-0 bg-gradient-to-l from-transparent via-bg/30 to-bg/85" />
          </div>

          <div data-hero-stack className="relative mx-auto w-full max-w-[330px] lg:mx-0 lg:ml-2">
            <div data-hero-phone>
              <PhoneFrame>
                <MenuScreen />
              </PhoneFrame>
            </div>

            {/* Live order ticket — the same order, seen from the kitchen pass. */}
            <div
              data-hero-float
              className="absolute -left-[164px] -top-[9%] hidden w-[218px] rounded-[16px] bg-surface p-3.5 shadow-deep ring-1 ring-hairline ring-inset sm:block"
            >
              <div className="flex items-center justify-between">
                <span className="label text-ink-4">Table 12</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-mint/12 px-2 py-0.5 text-[10.5px] font-bold text-mint-ink">
                  <Check size={10} /> On the pass
                </span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5 text-[12.5px] text-ink-2">
                <div className="flex justify-between gap-2">
                  <span>2 × Chicken Sekuwa</span>
                  <span className="font-mono tabular-nums text-ink">900</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>1 × Buff Jhol Momo</span>
                  <span className="font-mono tabular-nums text-ink">320</span>
                </div>
              </div>
              <div className="mt-2.5 flex justify-between border-t border-hairline pt-2 text-[12.5px] font-semibold">
                <span className="text-ink-3">Total</span>
                <span className="font-mono tabular-nums text-ink">Rs. 1,220</span>
              </div>
            </div>

            {/* Dish reputation — the differentiator, stated as a readout. */}
            <div
              data-hero-float
              className="absolute -right-6 bottom-[8%] hidden w-[206px] rounded-[16px] bg-surface p-3.5 shadow-deep ring-1 ring-hairline ring-inset sm:block lg:-right-16"
            >
              <span className="label text-ink-4">Dish reputation</span>
              <div className="mt-2 flex items-baseline gap-1.5">
                <Star size={15} className="translate-y-px text-gold" />
                <b className="font-mono text-[22px] font-bold tabular-nums text-ink">{HERO_DISH.rating}</b>
                <span className="text-[12px] text-ink-4">/ {HERO_DISH.ratingCount} diners</span>
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5" aria-hidden>
                {(
                  [
                    ['Taste', HERO_DISH.taste],
                    ['Portion', HERO_DISH.portion],
                    ['Value', HERO_DISH.value],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="grid grid-cols-[46px_1fr_24px] items-center gap-2">
                    <span className="text-[11px] text-ink-3">{label}</span>
                    <span className="h-1 overflow-hidden rounded-full bg-surface-3">
                      <span className="block h-full rounded-full bg-flame" style={{ width: `${(v / 5) * 100}%` }} />
                    </span>
                    <span className="text-right font-mono text-[11px] font-bold tabular-nums text-ink-2">{v}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 border-t border-hairline pt-2 text-[11.5px] font-semibold text-mint-ink">
                {Math.round(HERO_DISH.recommendRate * 100)}% would order it again
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The diner's menu screen, built from the same dishes the demo restaurant serves. */
function MenuScreen() {
  const [loved, popular] = [MENU_DISHES[1], MENU_DISHES[2]];

  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[132px] shrink-0">
        <img src="/img/cover.jpg" alt="" width={720} height={400} className="size-full object-cover" />
        <span className="absolute inset-0 wash-ink" aria-hidden />
        <div className="absolute bottom-3 left-4 right-4">
          <b className="block text-[15px] font-semibold tracking-tight text-white">{RESTAURANT_NAME}</b>
          <span className="text-[11px] text-white/70">Table 12 · Terrace · Open till 11pm</span>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-hidden px-3 pb-2.5 pt-3 text-[11px] font-semibold">
        <span className="shrink-0 rounded-full bg-flame px-2.5 py-1 text-white">All</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 ring-1 ring-hairline ring-inset">
          Momo
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 ring-1 ring-hairline ring-inset">
          Grills
        </span>
        <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-ink-2 ring-1 ring-hairline ring-inset">
          Mains
        </span>
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        {[
          { dish: loved, badge: 'Most loved', tone: 'bg-gold/15 text-gold-ink' },
          { dish: popular, badge: 'Popular', tone: 'bg-flame-2/15 text-flame-1' },
        ].map(({ dish, badge, tone }) => (
          <div key={dish.name} className="flex gap-2.5 rounded-[14px] bg-surface p-2 ring-1 ring-hairline ring-inset">
            <img src={dish.image} alt="" width={160} height={160} className="size-[58px] shrink-0 rounded-[10px] object-cover" />
            <div className="min-w-0 flex-1 py-0.5">
              <span className={cx('inline-flex rounded-full px-1.5 py-[2px] text-[9px] font-bold', tone)}>{badge}</span>
              <div className="mt-1 truncate text-[12.5px] font-semibold tracking-tight text-ink">{dish.name}</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-2">
                  <Star size={9.5} className="text-gold" /> {dish.rating}
                  <span className="text-ink-4">· {dish.ratingCount}</span>
                </span>
                <span className="font-mono text-[11.5px] font-bold text-ink">{dish.price}</span>
              </div>
            </div>
            <span className="mt-0.5 grid size-6 shrink-0 self-start place-items-center rounded-full bg-flame text-[13px] font-bold leading-none text-white">
              +
            </span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-hairline px-3.5 py-3">
        <div className="text-[11.5px] text-ink-3">
          3 items · <span className="font-mono font-bold text-ink">Rs. 1,220</span>
        </div>
        <span className="rounded-full bg-flame px-3.5 py-1.5 text-[11.5px] font-bold text-white">View order</span>
      </div>
    </div>
  );
}
