import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { RAIL } from './kit';
import { scrollToSection } from './motion';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Digital menu', href: '#product' },
      { label: 'Table ordering', href: '#how-it-works' },
      { label: 'Reviews', href: '#reviews' },
      { label: 'Analytics', href: '#dashboard' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
      { label: 'Careers', href: '/careers' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Help centre', href: '/help' },
      { label: 'Documentation', href: '/docs' },
      { label: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
    ],
  },
];

/**
 * Set like the back of a menu card: the statement at broadsheet size across
 * the top, the index underneath it, the small print along the bottom.
 */
export function LandingFooter() {
  return (
    <footer className="rule-t bg-stock">
      <div className={cx(RAIL, 'py-16 lg:py-20')}>
        <p className="max-w-[22ch] font-display text-[clamp(28px,4.6vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [font-optical-sizing:auto]">
          Better menus. Better decisions. <span className="italic text-flame-2">Better dining.</span>
        </p>

        <div className="mt-14 grid gap-10 border-t border-hairline pt-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-ink">
              letsDine<span className="text-flame-1">.</span>
            </span>
            <p className="mt-3 max-w-[32ch] text-[13.5px] leading-relaxed text-ink-3">
              A dining experience platform: digital menus, QR table ordering, verified reviews and dish-level
              intelligence, in one place.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="label text-ink-4">{column.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('#') ? (
                      <a
                        href={link.href}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToSection(link.href);
                        }}
                        className="-my-1 inline-block py-1 text-[14px] text-ink-2 transition-colors hover:text-flame-1"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link to={link.href} className="-my-1 inline-block py-1 text-[14px] text-ink-2 transition-colors hover:text-flame-1">
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-hairline pt-6 text-[12.5px] text-ink-4 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} letsDine. Built for dining rooms.</span>
          {/* <span>
            Dishes, ratings and figures throughout this page come from Sekuwa Ghar, the demo restaurant you can open
            at <Link to="/demo" className="font-medium text-ink-3 underline underline-offset-2 hover:text-flame-1">/demo</Link>.
          </span> */}
        </div>
      </div>
    </footer>
  );
}
