import { Link, useLocation } from 'react-router-dom';
import { BrandName } from '../../components/BrandName';
import { cx } from '../../components/ui';
import { Android } from '../../components/icons';
import { RAIL } from './kit';
import { scrollToSection } from './motion';
import features from '../../content/features.json';
import { legal } from '../../content/legal';

// Drive share link ("Anyone with the link") to the APK. Empty hides the footer link.
// ponytail: swap for the Play Store URL once the app is published.
const ANDROID_APP_URL = 'https://drive.google.com/file/d/1BCQJkh5rb5_n3gwWvdfn0AfPKf2L8pc3/view?usp=drive_link';

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#operations' },
      { label: 'Reports', href: '#dashboard' },
      { label: 'Pricing', href: '/pricing' },
      ...features.map((f) => ({ label: f.name, href: `/${f.slug}` })),
    ],
  },
];

/**
 * Set like the back of a menu card: the statement at broadsheet size across
 * the top, the index underneath it, the small print along the bottom.
 */
export function LandingFooter() {
  const onHome = useLocation().pathname === '/';

  return (
    <footer className="rule-t bg-stock">
      <div className={cx(RAIL, 'py-16 lg:py-20')}>
        <p className="max-w-[22ch] font-display text-[clamp(28px,4.6vw,52px)] font-semibold leading-[1.05] tracking-[-0.03em] text-ink [font-optical-sizing:auto]">
          One system. <span className="italic text-flame-2">Every part of the restaurant.</span>
        </p>

        <div className="mt-14 grid gap-10 border-t border-hairline pt-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <span className="font-display text-[19px] font-semibold tracking-[-0.03em] text-ink">
              <BrandName />
              <span className="text-flame-1">.</span>
            </span>
            <p className="mt-3 max-w-[32ch] text-[13.5px] leading-relaxed text-ink-3">
              Restaurant software for Nepal: QR table ordering, POS, kitchen display, inventory, accounts and
              delivery, with verified dish ratings.
            </p>
            {ANDROID_APP_URL && (
              <div className="mt-8">
                <h2 className="label text-ink-4">Download our app</h2>
                <a
                  href={ANDROID_APP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Download the FeastoX app for Android (APK)"
                  className="group mt-4 inline-flex items-center gap-3 rounded-xl border border-hairline bg-[#171310] py-2.5 pl-3 pr-4 text-[#fdf6ee] transition-colors hover:text-flame-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-flame-1"
                >
                  <Android size={22} className="text-[#3ddc84]" />
                  <span className="text-[14px] font-medium">Android</span>
                </a>
              </div>
            )}
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="label text-ink-4">{column.title}</h2>
              <ul className="mt-4 flex flex-col gap-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith('#') && onHome ? (
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
                      <Link
                        to={link.href.startsWith('#') ? `/${link.href}` : link.href}
                        className="-my-1 inline-block py-1 text-[14px] text-ink-2 transition-colors hover:text-flame-1"
                      >
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
          <span>© {new Date().getFullYear()} <BrandName />. Built for dining rooms.</span>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-1">
            {legal.ready && legal.pages.map((p) => (
              <Link key={p.slug} to={`/${p.slug}`} className="hover:text-flame-1">{p.name}</Link>
            ))}
            <Link to="/blog" className="hover:text-flame-1">Guides</Link>
            <a href="/llms.txt" className="hover:text-flame-1">Info for AI</a>
          </nav>
          {/* <span>
            Dishes, ratings and figures throughout this page come from Sekuwa Ghar, the demo restaurant you can open
            at <Link to="/demo" className="font-medium text-ink-3 underline underline-offset-2 hover:text-flame-1">/demo</Link>.
          </span> */}
        </div>
      </div>
    </footer>
  );
}
