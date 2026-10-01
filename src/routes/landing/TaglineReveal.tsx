import { cx } from '../../components/ui';
import { Band, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';

/**
 * A breath between the platform tour and the section that proves it. One
 * sentence, set at cover size, revealed a word at a time in reading order.
 */
export function TaglineReveal() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} rule={false} className="bg-stock py-28 sm:py-32 lg:py-44">
      <div className={cx(RAIL, 'lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-10 lg:col-start-2">
          <span data-reveal className="mb-8 block h-px w-20 bg-flame-2" aria-hidden />
          <SplitHeading
            as="p"
            start="top 78%"
            text="Restaurants don’t just know what they sell. They know what the room thinks of every single plate."
            className="font-display text-[clamp(28px,5.4vw,62px)] font-normal leading-[1.14] tracking-[-0.028em] text-ink [font-optical-sizing:auto]"
          />
        </div>
      </div>
    </Band>
  );
}
