import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, LEAD, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { RESTAURANT_TYPES } from './data';

/** Who this is for, as a plain ruled index. No photographs: the page is made of the product, not of stock food. */
export function RestaurantTypes() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} className="bg-stock">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <SplitHeading text="From six tables to six branches." className={cx(DISPLAY_LG, 'text-ink lg:col-span-7')} />
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          The same system runs a corner cafe and a chain. You turn on what you need.
        </p>
      </div>

      <ul className={cx(RAIL, 'mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3')}>
        {RESTAURANT_TYPES.map((type) => (
          <li key={type.name} data-reveal className="border-t border-hairline-strong pt-5">
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{type.name}</h3>
            <p className="mt-2 max-w-[36ch] text-[15px] leading-[1.6] text-ink-2">{type.description}</p>
          </li>
        ))}
      </ul>
    </Band>
  );
}
