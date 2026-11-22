import { useEffect, useRef } from 'react';
import { cx } from '../../components/ui';
import { DISPLAY_XL, LEAD, PrimaryCta, RAIL, SecondaryCta } from './kit';
import { gsap, prefersReducedMotion } from './motion';
import { BillPanel, KitchenPanel } from './panels';

/**
 * The first viewport: the argument on the left, and on the right the same
 * order seen twice — at the till and on the kitchen screen.
 * The two panels overlap as one object. Everything is rendered in its final
 * state; GSAP hides and replays it only once it has taken over, so the hero is
 * complete without JavaScript.
 */
export function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const q = gsap.utils.selector(root);
      const words = q('[data-hero-word] > span');
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      gsap.set(words, { yPercent: 110 });
      gsap.set(q('[data-hero-rise]'), { opacity: 0, y: 22 });
      gsap.set(q('[data-hero-panel]'), { opacity: 0, y: 40 });
      tl.to(words, { yPercent: 0, duration: 0.95, ease: 'power4.out', stagger: 0.048 }, 0.1)
        .to(q('[data-hero-rise]'), { opacity: 1, y: 0, duration: 0.7, stagger: 0.08 }, 0.5)
        .to(q('[data-hero-panel]'), { opacity: 1, y: 0, duration: 0.9, stagger: 0.14 }, 0.4);
    }, root);

    return () => ctx.revert();
  }, []);

  const word = (w: string, cls?: string) => (
    <span key={w} data-hero-word className="inline-block overflow-hidden align-bottom pb-[0.06em]">
      <span className={cx('inline-block', cls)}>{w}&nbsp;</span>
    </span>
  );

  return (
    <section
      ref={rootRef}
      className="relative overflow-hidden bg-stock pb-16 pt-[calc(104px+var(--safe-t))] sm:pb-20 lg:pb-24 lg:pt-[calc(124px+var(--safe-t))]"
    >
      <div className={cx(RAIL, 'flex flex-col gap-14 lg:grid lg:grid-cols-12 lg:items-center lg:gap-10')}>
        <div className="lg:col-span-6 lg:pr-4">
          <h1>
            <span aria-hidden className={cx(DISPLAY_XL, 'block max-w-[12ch] text-ink')}>
              {['Run', 'the', 'whole'].map((w) => word(w))}
              {word('restaurant', 'italic text-flame-2')}
              {word('from', 'italic text-flame-2')}
              {word('one', 'italic text-flame-2')}
              {word('system.', 'italic text-flame-2')}
            </span>
            <span className="sr-only">Run the whole restaurant from one system.</span>
          </h1>

          <p data-hero-rise className={cx(LEAD, 'mt-6 max-w-[48ch]')}>
            Orders from the table and the counter, the kitchen screen, stock and food cost, sales and the cash book,
            delivery and every branch. Built for restaurants and cafes in Nepal.
          </p>

          <div data-hero-rise className="mt-7 flex flex-wrap items-center gap-3">
            <PrimaryCta to="/get-started" size="lg">
              Start free trial
            </PrimaryCta>
            <SecondaryCta to="/pricing" size="lg">
              See pricing
            </SecondaryCta>
          </div>
        </div>

        <div className="relative lg:col-span-6">
          <div className="flex flex-col gap-4 lg:gap-5">
            <div data-hero-panel className="lg:ml-12">
              <BillPanel />
            </div>
            <div data-hero-panel className="lg:-ml-6 lg:mr-8">
              <KitchenPanel />
            </div>
          </div>
          <p className="mt-4 text-[12px] text-ink-3 lg:ml-12">Sample data from a demo restaurant.</p>
        </div>
      </div>
    </section>
  );
}
