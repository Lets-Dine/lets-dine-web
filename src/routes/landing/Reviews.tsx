import { cx } from '../../components/ui';
import { Check, Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { VERIFIED_REVIEWS } from './data';

const CHAIN = [
  { step: 'Ordered', detail: 'The order exists, with a number' },
  { step: 'Ate', detail: 'The kitchen marked it served' },
  { step: 'Rated', detail: 'Only those dishes can be scored' },
  { step: 'Learned', detail: 'It lands on that dish, for good' },
];

/** The three scores, written as a receipt line rather than a row of stars. */
function ScoreLine({ taste, portion, value }: { taste: number; portion: number; value: number }) {
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums text-ink-3">
      {(
        [
          ['Taste', taste],
          ['Portion', portion],
          ['Value', value],
        ] as const
      ).map(([label, n]) => (
        <div key={label} className="flex gap-1.5">
          <dt className="text-ink-4">{label}</dt>
          <dd className="font-bold text-ink-2">{n.toFixed(1)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Why the numbers on this page mean anything.
 *
 * Deliberately not a testimonial wall: each review is presented as what it
 * actually is in the database — a record attached to an order number and a
 * specific dish, which is the thing that makes it impossible to buy or fake.
 */
export function Reviews() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="reviews" ref={ref} className="bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="08">Verified feedback</Mark>
          <SplitHeading text="Feedback you can actually trust." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
        </div>
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          A rating can only be left by a phone that placed the order and a kitchen that served it. There is no way in
          from outside.
        </p>
      </div>

      {/* Chain of custody */}
      <div className={cx(RAIL, 'mt-14')}>
        <ol className="grid gap-px overflow-hidden rounded-[18px] bg-hairline ring-1 ring-hairline sm:grid-cols-4" data-reveal-group="chain">
          {CHAIN.map((link, i) => (
            <li key={link.step} data-reveal className="bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-6 place-items-center rounded-full bg-flame text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="font-display text-[17px] font-semibold tracking-tight text-ink">{link.step}</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">{link.detail}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* The records themselves */}
      <div className={cx(RAIL, 'mt-8 grid gap-5 lg:grid-cols-3')} data-reveal-group="reviews">
        {VERIFIED_REVIEWS.map((review, i) => (
          <figure
            key={review.name}
            data-reveal
            className="flex flex-col overflow-hidden rounded-[18px] bg-surface shadow-lift ring-1 ring-hairline ring-inset"
          >
            {/* Receipt header: the order this is attached to. */}
            <div className="flex items-center justify-between gap-2 border-b border-dashed border-hairline-strong px-5 py-3">
              <span className="label text-ink-4">Order #{2401 + i * 7}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-mint/12 px-2 py-0.5 text-[10.5px] font-bold text-mint-ink">
                <Check size={10} /> Verified
              </span>
            </div>

            <div className="flex items-center gap-3 px-5 pt-4">
              <img
                src={review.image}
                alt=""
                width={140}
                height={140}
                loading="lazy"
                className="size-12 shrink-0 rounded-[10px] object-cover"
              />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold tracking-tight text-ink">{review.dish}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="flex gap-0.5" aria-hidden>
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} size={11} className={s < review.rating ? 'text-gold' : 'text-ink-4/30'} />
                    ))}
                  </span>
                  <span className="font-mono text-[11.5px] font-bold tabular-nums text-ink-2">
                    {review.rating.toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            <blockquote className="flex-1 px-5 pt-4 text-pretty text-[14.5px] leading-[1.6] text-ink-2">
              “{review.text}”
            </blockquote>

            <figcaption className="mt-4 px-5 pb-5">
              <div className="border-t border-hairline pt-3.5">
                <ScoreLine
                  taste={[5, 5, 4][i]}
                  portion={[4, 5, 5][i]}
                  value={[5, 4, 5][i]}
                />
                <div className="mt-2.5 flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="font-semibold text-ink-3">{review.name}</span>
                  <span className="text-ink-4">{review.verified.replace('Verified · ', '')}</span>
                </div>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>

      <p data-reveal className={cx(RAIL, 'mt-8 text-[13px] text-ink-4')}>
        Reviews shown are the seeded records from Sekuwa Ghar, the demo restaurant — the same ones you can read
        inside the product.
      </p>
    </Band>
  );
}
