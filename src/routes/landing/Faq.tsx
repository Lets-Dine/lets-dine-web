import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, Mark, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';

const FAQS = [
  {
    q: 'What is FeastoX?',
    a: 'FeastoX is a QR menu and table-ordering platform for restaurants. Diners scan a code at the table, browse a digital menu, order without waiting for a waiter, and rate every dish they ate.',
  },
  {
    q: 'Do my customers need to install an app or create an account?',
    a: 'No. Diners scan the QR code on the table and the menu opens in their phone browser. There is nothing to download and no sign-up.',
  },
  {
    q: 'How do dish ratings work?',
    a: 'Only a diner who actually ordered and received a dish can rate it, so every rating is purchase-verified. Diners score taste, portion and value, and say whether they would order it again.',
  },
  {
    q: 'Is FeastoX available in Nepal?',
    a: 'Yes. FeastoX is built Nepal-first, with prices in Rs. and support for the way Nepali restaurants and cafes run their floor.',
  },
  {
    q: 'How much does it cost?',
    a: 'A new restaurant starts on a free trial, then pays monthly or yearly. See the pricing page for current plans.',
  },
  {
    q: 'How long does setup take?',
    a: 'A few minutes to create your account, then add your menu and print a QR code for each table.',
  },
];

/** Visible FAQ plus the matching FAQPage JSON-LD, both driven by the same list so they never drift apart. */
export function Faq() {
  const ref = useReveal<HTMLElement>();
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map(({ q, a }) => ({
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
          <Mark n="11">Questions</Mark>
          <SplitHeading text="Things restaurant owners ask first." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
        </div>
        <div className="lg:col-span-7">
          {FAQS.map(({ q, a }) => (
            <details key={q} data-reveal className="group border-b border-hairline py-5 first:border-t">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-display text-[19px] font-semibold tracking-[-0.01em] text-ink">
                {q}
                <span aria-hidden className="text-flame-2 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[60ch] text-[15.5px] leading-[1.6] text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </Band>
  );
}
