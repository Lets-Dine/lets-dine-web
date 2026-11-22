import { cx } from '../../components/ui';
import { Band, DISPLAY_XL, LEAD, PrimaryCta, RAIL, SecondaryCta, SplitHeading } from './kit';
import { useReveal } from './motion';

/** The close. Lights down, one sentence at cover size, two ways in. */
export function FinalCta() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} night rule={false} className="relative overflow-hidden py-28 sm:py-32 lg:py-44">
      <div className={cx(RAIL, 'relative text-center')}>
        <SplitHeading
          text="Put the whole restaurant on one system."
          className={cx(DISPLAY_XL, 'mx-auto max-w-[15ch] text-ink')}
        />
        <p data-reveal className={cx(LEAD, 'mx-auto mt-7 max-w-[54ch]')}>
          Start with the free trial, add your menu and tables, and have the first order coming through today.
        </p>
        <div data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta to="/get-started" size="lg">
            Start free trial
          </PrimaryCta>
          <SecondaryCta to="/pricing" size="lg">
            See pricing
          </SecondaryCta>
        </div>
      </div>
    </Band>
  );
}
