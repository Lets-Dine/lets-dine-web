import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { RESTAURANT_TYPES } from './data';

/**
 * Who this is for, told in photographs rather than icons. Each card is a tall
 * editorial crop with the name set over it; the reason sits underneath at all
 * times on touch, and rises on hover where there is a pointer to hover with.
 */
export function RestaurantTypes() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} className="bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="10">Built for</Mark>
          <SplitHeading
            text="Any room where people sit down and decide what to eat."
            className={cx(DISPLAY_LG, 'mt-6 text-ink')}
          />
        </div>
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          Six tables or six branches — the menu, the ordering and the ratings work the same way.
        </p>
      </div>

      <div className={cx(RAIL, 'mt-14')}>
        <ul
          className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
          data-reveal-group="types"
        >
          {RESTAURANT_TYPES.map((type) => (
            <li
              key={type.name}
              data-reveal
              className="group w-[76vw] shrink-0 snap-start sm:w-auto"
            >
              <article className="relative flex h-full flex-col overflow-hidden rounded-[18px] bg-surface ring-1 ring-hairline ring-inset">
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={type.image}
                    alt={type.name}
                    width={800}
                    height={600}
                    loading="lazy"
                    className="size-full object-cover transition-[scale] duration-700 ease-out-quart group-hover:scale-105"
                  />
                  <span className="absolute inset-0 wash-ink opacity-90" aria-hidden />
                  <h3 className="absolute bottom-4 left-4 right-4 font-display text-[22px] font-semibold tracking-[-0.02em] text-white">
                    {type.name}
                  </h3>
                </div>
                <p className="p-4 text-[13.5px] leading-relaxed text-ink-3">{type.description}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  );
}
