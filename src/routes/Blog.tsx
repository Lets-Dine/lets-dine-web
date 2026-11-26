import { useLayoutEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import posts from '../content/posts.json';
import features from '../content/features.json';
import { usePageTitle } from '../state/usePageTitle';
import { paintBrand } from '../components/BrandName';
import { cx } from '../components/ui';
import { LandingNav } from './landing/Nav';
import { LandingFooter } from './landing/LandingFooter';
import { DISPLAY_MD, LEAD, RAIL } from './landing/kit';
import { NotFound } from './NotFound';

const INDEX_TITLE = 'Restaurant POS and KDS Guides for Nepal · FeastoX';
const INDEX_DESCRIPTION =
  'Practical guides on restaurant POS, KDS (kitchen display), QR menus, food cost and dish ratings for restaurants and cafes in Nepal.';

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

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function articleLd(post: (typeof posts)[number], path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.h1,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    keywords: post.keywords.join(', '),
    mainEntityOfPage: `https://feastox.com${path}`,
    image: 'https://feastox.com/og-image.png',
    author: { '@type': 'Organization', name: 'FeastoX', '@id': 'https://feastox.com/#org' },
    publisher: { '@id': 'https://feastox.com/#org' },
  };
}

export function BlogIndex() {
  useLandingChrome();
  usePageTitle(INDEX_TITLE, INDEX_DESCRIPTION, ['restaurant POS Nepal', 'KDS Nepal', 'restaurant kitchen display Nepal', 'restaurant blog Nepal', 'restaurant guides Nepal']);
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main" className={cx(RAIL, 'pb-20 pt-[calc(120px+var(--safe-t))] lg:pt-[calc(150px+var(--safe-t))]')}>
        <h1 className={cx(DISPLAY_MD, 'max-w-[22ch] text-ink')}>Restaurant POS and KDS guides for Nepal</h1>
        <p className={cx(LEAD, 'mt-6 max-w-[56ch]')}>
          How a restaurant POS, the KDS in the kitchen, QR menus, food cost and dish ratings fit together. Written for owners, not for a feature list.
        </p>
        <ul className="mt-14 divide-y divide-hairline border-y border-hairline">
          {sorted.map((post) => (
            <li key={post.slug}>
              <Link to={`/blog/${post.slug}`} className="block py-6 hover:text-flame-1">
                <time dateTime={post.date} className="text-[12.5px] text-ink-4">
                  {formatDate(post.date)}
                </time>
                <span className="mt-1 block font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{post.h1}</span>
                <span className="mt-2 block max-w-[62ch] text-[15.5px] leading-[1.6] text-ink-2">{post.description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <LandingFooter />
    </div>
  );
}

export function BlogPost() {
  const { slug } = useParams();
  const post = posts.find((p) => p.slug === slug);
  useLandingChrome();
  usePageTitle(post?.title ?? 'Page not found · FeastoX', post?.description, post?.keywords);
  if (!post) return <NotFound />;

  const feature = features.find((f) => f.slug === post.related);
  const others = posts.filter((p) => p.slug !== post.slug);

  return (
    <div className="min-h-dvh bg-stock text-ink">
      <LandingNav />
      <main id="main" className={cx(RAIL, 'pb-20 pt-[calc(120px+var(--safe-t))] lg:pt-[calc(150px+var(--safe-t))]')}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd(post, `/blog/${post.slug}`)) }} />
        <p className="text-[13px] text-ink-4">
          <Link to="/blog" className="hover:text-flame-1">
            Guides
          </Link>
          <span aria-hidden="true"> · </span>
          <time dateTime={post.date}>{formatDate(post.date)}</time>
        </p>
        <h1 className={cx(DISPLAY_MD, 'mt-4 max-w-[24ch] text-ink')}>{post.h1}</h1>
        <p className={cx(LEAD, 'mt-6 max-w-[62ch]')}>{paintBrand(post.intro)}</p>
        <div className="mt-12 max-w-[68ch]">
          {post.sections.map((s) => (
            <section key={s.h} className="mt-10">
              <h2 className="font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">{s.h}</h2>
              <p className="mt-2 text-[16px] leading-[1.7] text-ink-2">{paintBrand(s.p)}</p>
            </section>
          ))}
        </div>
        {feature && (
          <p className="mt-12 text-[15px] text-ink-2">
            Related:{' '}
            <Link to={`/${feature.slug}`} className="underline underline-offset-4 hover:text-flame-1">
              {feature.name}
            </Link>
          </p>
        )}
        <h2 className="mt-16 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">More guides</h2>
        <ul className="mt-3 max-w-[62ch]">
          {others.map((p) => (
            <li key={p.slug} className="border-b border-hairline py-3 first:border-t">
              <Link to={`/blog/${p.slug}`} className="text-[15.5px] text-ink-2 underline-offset-4 hover:text-flame-1 hover:underline">
                {p.h1}
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <LandingFooter />
    </div>
  );
}
