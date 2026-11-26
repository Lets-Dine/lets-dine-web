import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serves /r/:slug with that restaurant's own title, description and image in the HTML.
 * Social crawlers (Facebook, X, WhatsApp, Slack) read the raw HTML and never run the app,
 * so the client-side usePageTitle is invisible to them. The SPA still loads on top of this shell.
 *
 * Only the fields a share preview needs are read. Everything else on the public record is ignored.
 */

const SITE = 'https://feastox.com';
const DEFAULT_IMAGE = `${SITE}/og-image.png`;
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/i;
const LOOKUP_TIMEOUT_MS = 3000;

interface SharedRestaurant {
  name: string;
  tagline?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  logoUrl?: string | null;
  claimedAt?: string | null;
  isActive?: boolean;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function clip(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

function httpsOnly(url: string | null | undefined): string | null {
  return url && /^https:\/\//i.test(url) ? url : null;
}

/** Replaces the content of one meta tag, matched by its name or property. Tolerates the multi-line form Vite writes. */
function setMeta(html: string, attr: 'name' | 'property', key: string, content: string): string {
  const tag = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`, 'i');
  return html.replace(tag, `<meta ${attr}="${key}" content="${esc(content)}" />`);
}

/**
 * Fills the Vite template for one restaurant. With no restaurant (missing, unknown, or the API is down)
 * it returns the generic shell marked noindex, so a bad link never gets a FeastoX card for a restaurant.
 */
export function renderShell(template: string, slug: string, restaurant: SharedRestaurant | null): string {
  const url = `${SITE}/r/${slug}`;
  if (!restaurant) {
    return template.replace(/<meta name="robots" content="[^"]*"\s*\/?>/i, '<meta name="robots" content="noindex,nofollow" />');
  }

  // Same rule as the client page: only claimed restaurants go to search. Unclaimed ones still get their own share card.
  const indexable = restaurant.claimedAt !== null && restaurant.isActive !== false;
  const name = restaurant.name;
  const description = clip(restaurant.tagline || restaurant.description || `Menu and prices at ${name}. Scan the code on your table to order.`);
  const image = httpsOnly(restaurant.coverImageUrl) ?? httpsOnly(restaurant.logoUrl) ?? DEFAULT_IMAGE;
  const title = `${name} menu · FeastoX`;

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'property', 'og:url', url);
  html = setMeta(html, 'property', 'og:image', image);
  // The template's 1200×630 dimensions describe the FeastoX card, not this image.
  html = html.replace(/\s*<meta property="og:image:(width|height)"[^>]*>/gi, '');
  html = setMeta(html, 'property', 'og:image:alt', name);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  html = setMeta(html, 'name', 'twitter:image', image);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${url}" />`);
  html = setMeta(html, 'name', 'robots', indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow');
  return html;
}

/** Reads the public record. `null` = not found; throws on anything else so the caller can fall back. */
async function lookup(apiBase: string, slug: string): Promise<{ restaurant: SharedRestaurant | null } | null> {
  const res = await fetch(`${apiBase}/public/restaurants/${slug}`, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (res.status === 404) return { restaurant: null };
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: SharedRestaurant };
  return body.data ? { restaurant: body.data } : null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const slug = new URL(req.url ?? '/', 'http://localhost').searchParams.get('slug') ?? '';
  const apiBase = (process.env.VITE_API_URL ?? '').replace(/\/+$/, '');

  const send = (status: number, html: string, cache: string) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', cache);
    res.end(html);
  };

  // The untouched Vite template, copied by the prerender step. Static, so it is served without re-entering this function.
  const shellRes = await fetch(`https://${req.headers.host}/app.html`);
  if (!shellRes.ok) return send(500, 'Unavailable', 'no-store');
  const template = await shellRes.text();

  if (!SLUG.test(slug) || !apiBase) {
    return send(404, renderShell(template, slug, null), 'public, s-maxage=60');
  }

  try {
    const found = await lookup(apiBase, slug);
    if (!found) return send(200, renderShell(template, slug, null), 'public, s-maxage=60');
    if (!found.restaurant) return send(404, renderShell(template, slug, null), 'public, s-maxage=300');
    return send(200, renderShell(template, slug, found.restaurant), 'public, s-maxage=300, stale-while-revalidate=86400');
  } catch {
    return send(200, renderShell(template, slug, null), 'public, s-maxage=60');
  }
}
