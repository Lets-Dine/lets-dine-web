import home from '../../content/home.json';
import { paintBrand } from '../../components/BrandName';
import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';

type Qa = { q: string; a: string };

/** Visible FAQ plus the matching FAQPage JSON-LD, both driven by the same list so they never drift apart. */
export function Faq({ faqs = home.faqs, heading = 'Things restaurant owners ask first.' }: { faqs?: Qa[]; heading?: string }) {
  const ref = useReveal<HTMLElement>();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  return (
    <Band ref={ref} className="bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <div className={cx(RAIL, 'flex flex-col gap-10 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-5">
          <SplitHeading text={heading} className={cx(DISPLAY_LG, 'text-ink')} />
        </div>
        <div className="lg:col-span-7">
          {faqs.map(({ q, a }) => (
            <details key={q} data-reveal className="group border-b border-hairline py-5 first:border-t">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-[19px] font-semibold tracking-[-0.01em] text-ink">
                <span>{paintBrand(q)}</span>
                <span aria-hidden className="text-flame-2 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[60ch] text-[15.5px] leading-[1.6] text-ink-2">{paintBrand(a)}</p>
            </details>
          ))}
        </div>
      </div>
    </Band>
  );
}
