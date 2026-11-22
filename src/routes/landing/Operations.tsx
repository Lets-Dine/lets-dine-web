import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { Band, BODY, DISPLAY_LG, DISPLAY_MD, LEAD, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { BooksPanel, StockPanel } from './panels';

/** Each card links to the keyword page that goes deeper, so the homepage passes weight to them. */
const AREAS = [
  { slug: 'restaurant-pos', title: 'POS and billing', body: 'Take orders at the counter or the table, settle by payment mode, print guest receipts and show the bill on a customer display.' },
  { slug: 'qr-ordering', title: 'QR table ordering', body: 'Diners scan, order and follow their food in the phone browser. No app, no account, and the order lands in the same queue as the till.' },
  { slug: 'kitchen-display-system', title: 'Kitchen and bar screens', body: 'Tickets for the kitchen and the bar, from new to ready, with the status flowing back to the table.' },
  { slug: 'restaurant-delivery', title: 'Delivery', body: 'Delivery orders from a link, with partners and riders and the cash and fees each one holds.' },
  { slug: 'table-management', title: 'Floors and tables', body: 'Lay out floors and tables, give each table its own QR code, and retire a printed code in one click.' },
  { slug: null, title: 'Staff, roles and branches', body: 'Several branches in one account, staff roles, approvals for sensitive actions and an audit log of every change.' },
] as const;

function Row({ title, body, points, link, flip, children }: { title: string; body: string; points: string[]; link: { to: string; label: string }; flip?: boolean; children: ReactNode }) {
  return (
    <div data-reveal className="flex flex-col gap-8 lg:grid lg:grid-cols-12 lg:items-center lg:gap-14">
      <div className={cx('lg:col-span-5', flip && 'lg:order-2 lg:col-start-8')}>
        <h3 className={cx(DISPLAY_MD, 'max-w-[20ch] text-ink')}>{title}</h3>
        <p className={cx(BODY, 'mt-4 max-w-[46ch] text-[16px]')}>{body}</p>
        <ul className="mt-5 flex flex-col gap-2 text-[15px] text-ink-2">
          {points.map((p) => (
            <li key={p} className="flex gap-3">
              <span className="mt-[0.7em] h-px w-4 shrink-0 bg-flame-2" aria-hidden />
              {p}
            </li>
          ))}
        </ul>
        <Link to={link.to} className="mt-6 inline-block text-[14px] font-medium text-flame-1 underline underline-offset-4">
          {link.label}
        </Link>
      </div>
      <div className={cx('lg:col-span-7', flip && 'lg:order-1')}>{children}</div>
    </div>
  );
}

/**
 * Everything behind the till. The areas are a plain index; the two parts most
 * systems leave to a spreadsheet, stock and the books, get a screen each.
 */
export function Operations() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band id="operations" ref={ref} className="bg-bg">
      <div className={cx(RAIL, 'flex flex-col gap-8 lg:grid lg:grid-cols-12')}>
        <SplitHeading text="Everything behind the till, in the same system." className={cx(DISPLAY_LG, 'text-ink lg:col-span-7')} />
        <p data-reveal className={cx(LEAD, 'lg:col-span-4 lg:col-start-9 lg:self-end')}>
          One menu, one order queue and one set of books, so the QR order, the counter order and the delivery order are never three separate problems.
        </p>
      </div>

      <div className={cx(RAIL, 'mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3')}>
        {AREAS.map((a) => (
          <div key={a.title} data-reveal className="border-t border-hairline-strong pt-5">
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{a.title}</h3>
            <p className="mt-2 max-w-[38ch] text-[15.5px] leading-[1.6] text-ink-2">{a.body}</p>
            {a.slug && (
              <Link to={`/${a.slug}`} className="mt-4 inline-block text-[14px] font-medium text-flame-1 underline underline-offset-4">
                Learn more<span className="sr-only"> about {a.title}</span>
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className={cx(RAIL, 'mt-24 flex flex-col gap-24 lg:mt-32 lg:gap-32')}>
        <Row
          title="Know what each dish costs you, not only what it sells for."
          body="Track stock by ingredient, log waste, and get a buy list of what is running low. See each dish against its ingredient cost to learn which plates make money."
          points={['Stock takes, waste and suppliers in one place', 'Recipes can take stock off as dishes are cooked, on plans that include it', 'Dish margin next to the menu price']}
          link={{ to: '/restaurant-inventory', label: 'How inventory works' }}
        >
          <StockPanel />
        </Row>
        <Row
          flip
          title="Keep the books as you sell."
          body="Sales are recorded as bills are settled, so the books are not a separate chore. See what customers owe you, what you owe suppliers, and how the week is going."
          points={['Sales by day and by payment mode', 'Receivables, a cash book and recurring costs', 'Profit and loss from the same records']}
          link={{ to: '/restaurant-accounting', label: 'How accounts work' }}
        >
          <BooksPanel />
        </Row>
      </div>

      <figure data-reveal className={cx(RAIL, 'mt-24 lg:mt-32')}>
        <img
          src="/img/restaurant-counter.webp"
          alt="FeastoX on a phone, a desktop dashboard and a receipt printer"
          width={1400}
          height={580}
          loading="lazy"
          className="w-full rounded-[22px] ring-1 ring-hairline ring-inset"
        />
        <figcaption className="mt-3 text-[12px] text-ink-3">Illustration. Figures shown are sample data.</figcaption>
      </figure>
    </Band>
  );
}
