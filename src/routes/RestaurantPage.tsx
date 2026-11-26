import { useLayoutEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getMenu } from '../api/diner';
import { cx } from '../components/ui';
import { formatMoney } from '../domain/money';
import type { Menu } from '../domain/types';
import { useAsync } from '../state/useAsync';
import { usePageTitle } from '../state/usePageTitle';
import { LandingFooter } from './landing/LandingFooter';
import { LandingNav } from './landing/Nav';
import { DISPLAY_MD, LEAD, RAIL } from './landing/kit';
import { NotFound } from './NotFound';

const SITE = 'https://feastox.com';

function clip(text: string, max = 155) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Only fields the page itself shows, so the markup never states more than a visitor can read. */
function restaurantLd(menu: Menu, url: string) {
  const r = menu.restaurant;
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${url}#restaurant`,
    name: r.name,
    description: r.description || r.tagline || undefined,
    url,
    image: r.coverImageUrl || undefined,
    logo: r.logoUrl || undefined,
    address: r.addressName ? { '@type': 'PostalAddress', streetAddress: r.addressName } : undefined,
    geo: r.latitude != null && r.longitude != null ? { '@type': 'GeoCoordinates', latitude: r.latitude, longitude: r.longitude } : undefined,
    aggregateRating: r.ratingCount > 0 && r.avgRating != null ? { '@type': 'AggregateRating', ratingValue: r.avgRating, reviewCount: r.ratingCount } : undefined,
    sameAs: r.googleUrl || undefined,
  };
}

function useLandingChrome() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    root.setAttribute('data-page', 'landing');
    meta?.setAttribute('content', '#f6f1e7');
    return () => {
      root.removeAttribute('data-page');
      meta?.setAttribute('content', '#12100e');
    };
  }, []);
}

/** Public restaurant page at /r/:slug: identity, rating and a menu summary. Ordering still happens from the table QR. */
export function RestaurantPage() {
  const { slug = '' } = useParams();
  const { data: menu, error } = useAsync(() => getMenu(slug), [slug]);
  useLandingChrome();

  const r = menu?.restaurant;
  // Absent `claimed` means claimed. Restaurants we set up for an owner who hasn't claimed them stay out of search.
  const indexable = Boolean(r) && r?.claimed !== false;
  usePageTitle(
    r ? `${r.name} menu · FeastoX` : 'Restaurant menu · FeastoX',
    r ? clip(r.tagline || r.description || `Menu and prices at ${r.name}. Scan the code on your table to order.`) : undefined,
    undefined,
    indexable,
  );

  if (error) return <NotFound />;

  const url = `${SITE}/r/${encodeURIComponent(slug)}`;
  const categories = menu ? [...menu.categories].sort((a, b) => a.sortOrder - b.sortOrder) : [];
  const dishes = menu?.dishes ?? [];

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main" className={cx(RAIL, 'pb-20 pt-[calc(120px+var(--safe-t))] lg:pt-[calc(150px+var(--safe-t))]')}>
        {menu && r && (
          <>
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurantLd(menu, url)) }} />
            {r.coverImageUrl && <img src={r.coverImageUrl} alt={r.name} className="mb-10 aspect-[21/9] w-full rounded-2xl object-cover" />}
            <h1 className={cx(DISPLAY_MD, 'max-w-[22ch] text-ink')}>{r.name}</h1>
            {r.tagline && <p className={cx(LEAD, 'mt-6 max-w-[56ch]')}>{r.tagline}</p>}
            <p className="mt-4 text-[14px] text-ink-3">
              {r.addressName && <span>{r.addressName}</span>}
              {r.ratingCount > 0 && r.avgRating != null && (
                <span>
                  {r.addressName && ' · '}
                  Rated {r.avgRating.toFixed(1)} from {r.ratingCount} {r.ratingCount === 1 ? 'diner' : 'diners'}
                </span>
              )}
            </p>
            <p className="mt-6 text-[15px] text-ink-2">
              Scan the code on your table to order. {(r.deliveryEnabled || r.pickupEnabled) && (
                <Link to={`/r/${encodeURIComponent(slug)}/delivery`} className="underline underline-offset-4 hover:text-flame-1">
                  Order delivery or pick-up
                </Link>
              )}
            </p>
            {r.description && <p className="mt-10 max-w-[68ch] text-[16px] leading-[1.7] text-ink-2">{r.description}</p>}

            <h2 className="mt-16 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">Menu</h2>
            {categories.map((c) => {
              const items = dishes.filter((d) => d.categoryId === c.id);
              if (items.length === 0) return null;
              return (
                <section key={c.id} className="mt-8">
                  <h3 className="font-display text-[18px] font-semibold text-ink">
                    {c.emoji} {c.name}
                  </h3>
                  <ul className="mt-3 divide-y divide-hairline border-y border-hairline">
                    {items.map((d) => (
                      <li key={d.id} className="flex items-baseline justify-between gap-4 py-3">
                        <span className="text-[15.5px] text-ink">
                          {d.name}
                          {!d.isAvailable && <span className="ml-2 text-[13px] text-ink-4">Sold out</span>}
                        </span>
                        <span className="shrink-0 text-[15px] tnum text-ink-2">{formatMoney(d.price, d.currency)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </main>
      <LandingFooter />
    </div>
  );
}
