import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { Band, DISPLAY_LG, LEAD, Mark, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';

/** Each card links to the keyword page that goes deeper, so the homepage passes weight to them. */
const AREAS = [
  { slug: 'restaurant-pos', title: 'POS & billing', body: 'Take orders at the counter or table, settle by payment mode, print receipts and show the bill on a customer display.' },
  { slug: 'kitchen-display-system', title: 'Kitchen display', body: 'Tickets for the kitchen and the bar, from new to ready, with the status flowing back to the table.' },
  { slug: 'restaurant-inventory', title: 'Inventory & margins', body: 'Stock by ingredient, recipes that can take stock off as dishes are cooked (plan-dependent), waste, a buy list and what each dish really earns.' },
  { slug: 'restaurant-accounting', title: 'Sales & accounts', body: 'Sales, receivables, a cash book, recurring costs and profit and loss, kept as you sell.' },
  { slug: 'restaurant-delivery', title: 'Delivery', body: 'Delivery orders from a link, with partners and riders and the cash and fees each one holds.' },
  ] as const;

/**
 * Everything behind the till. The page opens on the diner-facing product, but
 * what an owner is buying is the whole back of house, so it gets its own
 * section — a plain index of areas rather than another set of screenshots.
 */
export function Operations() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="operations" ref={ref} className="bg-bg">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <div className="lg:col-span-7">
          <Mark n="03">Run the restaurant</Mark>
          <SplitHeading text="Everything behind the till, in the same system." className={cx(DISPLAY_LG, 'mt-6 text-ink')} />
        </div>
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          One menu, one order queue and one set of books, so the QR order, the counter order and the delivery order are never three separate problems.
        </p>
      </div>

      <div className={cx(RAIL, 'mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3')}>
        {AREAS.map((a) => (
          <div key={a.slug} data-reveal className="border-t border-hairline-strong pt-5">
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{a.title}</h3>
            <p className="mt-2 max-w-[38ch] text-[15.5px] leading-[1.6] text-ink-2">{a.body}</p>
            <Link
              to={`/${a.slug}`}
              className="mt-4 inline-block text-[14px] font-medium text-flame-1 underline underline-offset-4"
            >
              Learn more<span className="sr-only"> about {a.title}</span>
            </Link>
          </div>
        ))}
      </div>
    </Band>
  );
}
