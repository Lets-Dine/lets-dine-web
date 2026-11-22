import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { Star } from '../../components/icons';
import { Band, DISPLAY_LG, LEAD, RAIL, SplitHeading } from './kit';
import { useReveal } from './motion';
import { MENU_DISHES } from './data';

const SHOWN = [MENU_DISHES[1], MENU_DISHES[2], MENU_DISHES[3]];

/** The diner-facing product in one band: three dishes, and the way through to the page that tells the whole story. */
export function RatingsTeaser() {
  const ref = useReveal<HTMLElement>();

  return (
    <Band ref={ref} className="bg-bg">
      <div className={cx(RAIL, 'flex flex-col gap-10 lg:grid lg:grid-cols-12 lg:items-center lg:gap-14')}>
        <div className="lg:col-span-5">
          <SplitHeading text="Your diners get a better menu. You get the verdict." className={cx(DISPLAY_LG, 'text-ink')} />
          <p data-reveal className={cx(LEAD, 'mt-6 max-w-[44ch]')}>
            Every dish carries ratings from the people who actually ordered it, scored on taste, portion and value. You
            see which plates to push and which to fix.
          </p>
          <Link
            data-reveal
            to="/dish-ratings-and-qr-menu"
            className="mt-7 inline-block text-[15px] font-medium text-flame-1 underline underline-offset-4"
          >
            See the QR menu and ratings
          </Link>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 lg:col-span-7">
          {SHOWN.map((dish) => (
            <li key={dish.name} data-reveal className="overflow-hidden rounded-[18px] bg-surface ring-1 ring-hairline ring-inset">
              <img src={dish.image} alt="" width={320} height={320} loading="lazy" className="aspect-square w-full object-cover" />
              <div className="p-3.5">
                <b className="block text-[14px] text-ink">{dish.name}</b>
                <span className="mt-1 flex items-center gap-1 text-[12.5px] text-ink-2">
                  <Star size={11} className="text-gold" />
                  {dish.rating}
                  <span className="text-ink-3">· {dish.ratingCount} diners</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-3 lg:col-span-7 lg:col-start-6">Sample ratings from a demo restaurant.</p>
      </div>
    </Band>
  );
}
