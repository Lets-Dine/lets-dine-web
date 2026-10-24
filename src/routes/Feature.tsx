import { useLayoutEffect } from 'react';
import { Link } from 'react-router-dom';
import features from '../content/features.json';
import { usePageTitle } from '../state/usePageTitle';
import { cx } from '../components/ui';
import { LandingNav } from './landing/Nav';
import { LandingFooter } from './landing/LandingFooter';
import { DISPLAY_MD, LEAD, PrimaryCta, RAIL } from './landing/kit';

export type FeatureContent = (typeof features)[number];

/** A keyword landing page. Its copy lives in `content/features.json`, which `scripts/prerender.mjs` also bakes into static HTML. */
export function Feature({ slug }: { slug: string }) {
  const page = features.find((f) => f.slug === slug)!;
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

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main" className={cx(RAIL, 'pb-20 pt-[calc(120px+var(--safe-t))] lg:pt-[calc(150px+var(--safe-t))]')}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        <h1 className={cx(DISPLAY_MD, 'max-w-[22ch] text-ink')}>{page.h1}</h1>
        <p className={cx(LEAD, 'mt-6 max-w-[56ch]')}>{page.intro}</p>
        <div className="mt-8">
          <PrimaryCta to="/get-started" size="lg">
            Get started
          </PrimaryCta>
        </div>

        <div className="mt-16 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {page.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.h}</h2>
              <p className="mt-2 max-w-[48ch] text-[15.5px] leading-[1.62] text-ink-2">{s.p}</p>
            </section>
          ))}
        </div>

        <h2 className="mt-20 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">Questions</h2>
        <dl className="mt-4 max-w-[64ch]">
          {page.faqs.map((f) => (
            <div key={f.q} className="border-b border-hairline py-5 first:border-t">
              <dt className="font-semibold text-ink">{f.q}</dt>
              <dd className="mt-1.5 text-[15.5px] leading-[1.6] text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-14 text-[14px] text-ink-3">
          More: {features.filter((f) => f.slug !== slug).map((f, i) => (
            <span key={f.slug}>
              {i > 0 && ' · '}
              <Link to={`/${f.slug}`} className="underline underline-offset-4 hover:text-flame-1">
                {f.name}
              </Link>
            </span>
          ))}
        </p>
      </main>
      <LandingFooter />
    </div>
  );
}
