import { cx } from '../../components/ui';
import { Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { HERO_DISH, MENU_DISHES } from './data';

const QUESTIONS = [
  'Is it actually good?',
  'Is the portion worth the price?',
  'What do other tables recommend?',
  'Would I order it again?',
  'What is this kitchen actually known for?',
];

/** A printed menu line: name, dotted leader, price. The whole of what paper says. */
function PrintedLine({ name, description, price }: { name: string; description: string; price: string }) {
  return (
    <li className="py-3.5">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[15.5px] font-semibold tracking-tight text-ink-2">{name}</span>
        <span className="min-w-6 flex-1 translate-y-[-3px] border-b border-dotted border-ink-4/50" aria-hidden />
        <span className="font-mono text-[13px] tabular-nums text-ink-3">{price}</span>
      </div>
      <p className="mt-1 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-4">{description}</p>
    </li>
  );
}

export function Problem() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="problem" ref={ref} className="bg-stock">
      <div className={RAIL}>
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Mark n="01">The problem</Mark>
            <SplitHeading
              text="A menu tells you what’s on the table. It doesn’t tell you what belongs on yours."
              className={cx(DISPLAY_LG, 'mt-6 text-ink')}
            />
          </div>
          <div className="lg:col-span-4 lg:col-start-9 lg:self-end">
            <p data-reveal className={LEAD}>
              Name, description, price. That is everything a printed menu has ever told a diner — and it is not
              enough to decide what to order at a table you have never sat at before.
            </p>
            <p data-reveal className={cx(LEAD, 'mt-4 text-ink-3')}>
              So the table guesses, or asks a server who is already carrying four plates. Both of you end up working
              from an opinion nobody wrote down.
            </p>
          </div>
        </div>

        {/* The comparison: the same dish, twice. */}
        <div className="mt-16 flex flex-col gap-6 lg:mt-20 lg:grid lg:items-stretch lg:grid-cols-[1fr_auto_1fr]" data-reveal-group="compare">
          {/* Paper */}
          <figure
            data-reveal
            className="flex flex-col rounded-[20px] bg-surface-2/70 p-6 ring-1 ring-hairline ring-inset sm:p-8"
          >
            <figcaption className="label flex items-center justify-between text-ink-4">
              <span>The printed menu</span>
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[9.5px] tracking-[0.12em] text-ink-3">
                What paper knows
              </span>
            </figcaption>

            <div className="mt-6">
              <p className="label pb-2 text-ink-3">Tonight’s kitchen</p>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {[HERO_DISH, MENU_DISHES[3]].map((dish) => (
                  <PrintedLine key={dish.name} name={dish.name} description={dish.description} price={dish.price} />
                ))}
              </ul>
            </div>

            <p className="mt-6 max-w-[34ch] text-[13px] italic leading-relaxed text-ink-4">
              Every line reads exactly as confident as every other line. Nothing here tells you which one this
              kitchen is actually known for.
            </p>
          </figure>

          {/* Rotating in place: the span is taken out of flow first, or the
              narrow auto column wraps it to one letter per line before the
              transform ever applies. */}
          <div className="relative flex items-center justify-center lg:w-12" aria-hidden>
            <span className="label whitespace-nowrap text-ink-4 lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rotate-90">
              the same dish →
            </span>
          </div>

          {/* Product */}
          <figure
            data-reveal
            className="flex flex-col overflow-hidden rounded-[20px] bg-surface shadow-deep ring-1 ring-hairline ring-inset"
          >
            <figcaption className="label flex items-center justify-between border-b border-hairline px-6 py-4 text-ink-4 sm:px-8">
              <span>On myfood</span>
              <span className="rounded-full bg-flame-2/12 px-2 py-0.5 text-[9.5px] tracking-[0.12em] text-flame-1">
                What the room knows
              </span>
            </figcaption>

            <div className="flex flex-1 flex-col p-6 sm:p-8">
              <div className="flex gap-4">
                <img
                  src={HERO_DISH.image}
                  alt={HERO_DISH.name}
                  width={320}
                  height={320}
                  loading="lazy"
                  className="size-[86px] shrink-0 rounded-[14px] object-cover ring-1 ring-hairline ring-inset"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-display text-[19px] font-semibold tracking-tight text-ink">{HERO_DISH.name}</h3>
                    <span className="shrink-0 font-mono text-[14px] font-bold tabular-nums text-ink">{HERO_DISH.price}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    <span className="inline-flex items-center gap-1 font-semibold text-ink">
                      <Star size={12} className="text-gold" />
                      {HERO_DISH.rating}
                    </span>
                    <span className="text-ink-4">{HERO_DISH.ratingCount} ratings</span>
                    <span className="text-ink-4" aria-hidden>
                      ·
                    </span>
                    <span className="font-semibold text-mint-ink">
                      {Math.round(HERO_DISH.recommendRate * 100)}% would order again
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {HERO_DISH.tags.map(([tag, n]) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 ring-1 ring-hairline ring-inset"
                      >
                        {tag} <span className="font-mono tabular-nums text-ink-4">{n}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-auto grid gap-3 border-t border-hairline pt-6 sm:grid-cols-3">
                {(
                  [
                    ['Taste', HERO_DISH.taste],
                    ['Portion', HERO_DISH.portion],
                    ['Value', HERO_DISH.value],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] text-ink-3">{label}</span>
                      <span className="font-mono text-[13px] font-bold tabular-nums text-ink">{value}</span>
                    </div>
                    <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                      <span className="block h-full rounded-full bg-flame" style={{ width: `${(value / 5) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </figure>
        </div>

        {/* The questions paper leaves open, set the way a diner actually thinks them. */}
        <div className="mt-16 flex flex-col gap-8 lg:mt-24 lg:grid lg:grid-cols-12" data-reveal-group="questions">
          <p data-reveal className="label text-ink-4 lg:col-span-3">
            What the table is really asking
          </p>
          <ul className="lg:col-span-9">
            {QUESTIONS.map((q) => (
              <li
                key={q}
                data-reveal
                className="flex items-baseline gap-4 border-b border-hairline py-4 first:border-t lg:py-5"
              >
                <span className="font-mono text-[11px] text-flame-1" aria-hidden>
                  ?
                </span>
                <span className="font-display text-[clamp(19px,2.6vw,30px)] font-normal italic leading-tight tracking-tight text-ink-2">
                  {q}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Band>
  );
}
