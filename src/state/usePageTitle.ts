import { useEffect } from 'react';
import features from '../content/features.json';

const SITE = 'https://feastox.com';
/** Only these routes are marketing pages worth indexing; diner, admin and platform routes are private/per-table. */
const INDEXABLE = new Set(['/', '/get-started', '/pricing', ...features.map((f) => `/${f.slug}`)]);

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

/** Keeps the tab title and SEO tags (description, canonical, robots, Open Graph) in sync with whichever page is mounted. */
export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const indexable = INDEXABLE.has(path);
    const url = SITE + (path === '/' ? '/' : path);

    document.title = title;
    if (description) {
      setMeta('meta[name="description"]', 'name', 'description', description);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
    }
    setMeta('meta[property="og:title"]', 'property', 'og:title', title);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
    setMeta('meta[property="og:url"]', 'property', 'og:url', url);
    setMeta('meta[name="robots"]', 'name', 'robots', indexable ? 'index,follow' : 'noindex,nofollow');

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;
  }, [title, description]);
}
