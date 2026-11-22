import { useLayoutEffect } from 'react';
import { usePageTitle } from '../state/usePageTitle';
import { cx } from '../components/ui';
import { LandingNav } from './landing/Nav';
import { LandingFooter } from './landing/LandingFooter';
import { DISPLAY_MD, LEAD, RAIL } from './landing/kit';
import { fillLegal, legal } from '../content/legal';

/** A policy page. Its copy lives in `content/legal.json`, which `scripts/prerender.mjs` also bakes into static HTML. */
export function Legal({ slug }: { slug: string }) {
  const page = legal.pages.find((p) => p.slug === slug)!;
  usePageTitle(page.title, page.description);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', '#f6f1e7');
    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', '#12100e');
    };
  }, []);

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main" className={cx(RAIL, 'pb-20 pt-[calc(120px+var(--safe-t))] lg:pt-[calc(150px+var(--safe-t))]')}>
        <h1 className={cx(DISPLAY_MD, 'max-w-[22ch] text-ink')}>{page.h1}</h1>
        <p className={cx(LEAD, 'mt-6 max-w-[60ch]')}>{fillLegal(page.intro)}</p>
        <div className="mt-12 max-w-[68ch]">
          {page.sections.map((s) => (
            <section key={s.h} className="mt-10">
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.h}</h2>
              <p className="mt-2 text-[15.5px] leading-[1.65] text-ink-2">{fillLegal(s.p)}</p>
            </section>
          ))}
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
