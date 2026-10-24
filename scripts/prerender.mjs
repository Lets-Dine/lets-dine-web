// Post-build: writes dist/<route>/index.html for every public page with its own
// title, description, canonical and crawlable content, plus dist/sitemap.xml.
// No headless browser: the feature pages' copy is plain JSON, so it is emitted as
// static HTML that React replaces on mount. Vercel serves these files before the SPA rewrite.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://feastox.com';
const dist = new URL('../dist/', import.meta.url);
const features = JSON.parse(await readFile(new URL('../src/content/features.json', import.meta.url), 'utf8'));
const template = await readFile(new URL('index.html', dist), 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pages = [
  { path: '/', priority: '1.0' },
  {
    path: '/pricing',
    title: 'Pricing · FeastoX for restaurants',
    description: 'Plans and prices for FeastoX. A new restaurant starts on a free trial, then pays monthly or yearly.',
    h1: 'FeastoX pricing',
    priority: '0.8',
  },
  {
    path: '/get-started',
    title: 'Get started — FeastoX for restaurants',
    description: 'Bring your restaurant onto FeastoX in a few minutes: tell us about your restaurant and create your owner account.',
    h1: 'Get started with FeastoX',
    priority: '0.8',
  },
  ...features.map((f) => ({
    path: `/${f.slug}`,
    title: f.title,
    description: f.description,
    h1: f.h1,
    body:
      `<p>${esc(f.intro)}</p>` +
      f.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('') +
      '<h2>Questions</h2>' +
      f.faqs.map((q) => `<h3>${esc(q.q)}</h3><p>${esc(q.a)}</p>`).join('') +
      `<p><a href="/get-started">Get started</a></p>` +
      `<nav>${features.filter((o) => o.slug !== f.slug).map((o) => `<a href="/${o.slug}">${esc(o.name)}</a>`).join(' ')}</nav>`,
    priority: '0.9',
  })),
];

for (const p of pages) {
  const url = SITE + (p.path === '/' ? '/' : p.path);
  let html = template;
  if (p.title) {
    const swap = (re, to) => {
      if (!re.test(html)) throw new Error(`prerender: ${re} not found in index.html`);
      html = html.replace(re, () => to);
    };
    swap(/<title>.*?<\/title>/s, `<title>${esc(p.title)}</title>`);
    swap(/(<meta\s+name="description"\s+content=")[^"]*/, `$1${esc(p.description)}`);
    swap(/(<meta property="og:title" content=")[^"]*/, `$1${esc(p.title)}`);
    swap(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(p.title)}`);
    swap(/(<meta property="og:description" content=")[^"]*/, `$1${esc(p.description)}`);
    swap(/(<meta name="twitter:description" content=")[^"]*/, `$1${esc(p.description)}`);
    swap(/(<meta property="og:url" content=")[^"]*/, `$1${url}`);
    swap(/(<link rel="canonical" href=")[^"]*/, `$1${url}`);
    swap(/<div id="root"><\/div>/, `<div id="root"><div class="sr-only"><h1>${esc(p.h1)}</h1>${p.body ?? ''}</div></div>`);
    const dir = new URL(`.${p.path}/`, dist);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL('index.html', dir), html);
  }
}

const urls = pages.map((p) => `  <url><loc>${SITE}${p.path === '/' ? '/' : p.path}</loc><priority>${p.priority}</priority></url>`);
await writeFile(
  new URL('sitemap.xml', dist),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
console.log(`prerendered ${pages.filter((p) => p.title).length} pages + sitemap`);
