// Post-build: writes dist/<route>/index.html for every public page with its own
// title, description, canonical and crawlable content, plus dist/sitemap.xml.
// No headless browser: the feature pages' copy is plain JSON, so it is emitted as
// static HTML that React replaces on mount. Vercel serves these files before the SPA rewrite.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://feastox.com';
const dist = new URL('../dist/', import.meta.url);
const features = JSON.parse(await readFile(new URL('../src/content/features.json', import.meta.url), 'utf8'));
const posts = JSON.parse(await readFile(new URL('../src/content/posts.json', import.meta.url), 'utf8'));
const home = JSON.parse(await readFile(new URL('../src/content/home.json', import.meta.url), 'utf8'));
for (const post of posts) {
  for (const key of ['slug', 'title', 'description', 'h1', 'date', 'intro', 'related']) {
    if (!post[key]) throw new Error(`posts.json: ${post.slug || '?'} missing ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.date)) throw new Error(`posts.json: ${post.slug} date must be YYYY-MM-DD`);
  if (!post.sections?.length) throw new Error(`posts.json: ${post.slug} needs sections`);
  if (!features.some((f) => f.slug === post.related)) throw new Error(`posts.json: ${post.slug} related "${post.related}" is not a feature`);
}
const legal = JSON.parse(await readFile(new URL('../src/content/legal.json', import.meta.url), 'utf8'));
const fill = (t) => t.replace(/\{\{(company|email|updated)\}\}/g, (_, k) => legal[k]);
const template = await readFile(new URL('index.html', dist), 'utf8');
await writeFile(new URL('app.html', dist), template); // untouched shell: app routes fall back to this, not the homepage

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const pages = [
  {
    path: '/',
    title: home.title.replace(/&amp;/g, '&'),
    description: home.description,
    h1: home.h1,
    body:
      `<p>${esc(home.intro)}</p>` +
      home.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('') +
      '<h2>Questions</h2>' +
      home.faqs.map((q) => `<h3>${esc(q.q)}</h3><p>${esc(q.a)}</p>`).join('') +
      `<nav><a href="/pricing">Pricing</a> <a href="/blog">Guides</a> <a href="/get-started">Get started</a> ${features.map((o) => `<a href="/${o.slug}">${esc(o.name)}</a>`).join(' ')}</nav>`,
    faqs: home.faqs,
    keywords: home.keywords,
    priority: '1.0',
  },
  {
    path: '/pricing',
    title: 'Pricing · FeastoX for restaurants',
    description: 'Plans and prices for FeastoX. A new restaurant starts on a free trial, then pays monthly or yearly.',
    h1: 'FeastoX pricing',
    body: '<p>A new restaurant starts on a free trial, then pays monthly or yearly. Plans cover branches, staff seats and monthly orders.</p>',
    priority: '0.8',
  },
  {
    path: '/get-started',
    title: 'Get started — FeastoX for restaurants',
    description: 'Bring your restaurant onto FeastoX in a few minutes: tell us about your restaurant and create your owner account.',
    h1: 'Get started with FeastoX',
    body: '<p>Tell us about your restaurant and create your owner account. Then add your menu and print a QR code for each table.</p>',
    priority: '0.8',
  },
  {
    path: '/blog',
    title: 'Restaurant POS and KDS Guides for Nepal · FeastoX',
    description: 'Practical guides on restaurant POS, KDS (kitchen display), QR menus, food cost and dish ratings for restaurants and cafes in Nepal.',
    h1: 'Restaurant POS and KDS guides for Nepal',
    body: `<p>How a restaurant POS, the KDS in the kitchen, QR menus, food cost and dish ratings fit together.</p><ul>${[...posts].sort((a, b) => b.date.localeCompare(a.date)).map((p) => `<li><a href="/blog/${p.slug}">${esc(p.h1)}</a> ${esc(p.description)}</li>`).join('')}</ul>`,
    keywords: ['restaurant POS Nepal', 'KDS Nepal', 'restaurant kitchen display Nepal', 'restaurant blog Nepal', 'restaurant guides Nepal'],
    priority: '0.7',
    ld: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'FeastoX guides',
      url: `${SITE}/blog`,
      blogPost: posts.map((p) => ({ '@type': 'BlogPosting', headline: p.h1, datePublished: p.date, url: `${SITE}/blog/${p.slug}` })),
    },
  },
  ...posts.map((post) => {
    const feature = features.find((f) => f.slug === post.related);
    return {
      path: `/blog/${post.slug}`,
      title: post.title,
      description: post.description,
      h1: post.h1,
      date: post.date,
      ogType: 'article',
      keywords: post.keywords,
      priority: '0.6',
      body:
        `<p>${esc(post.intro)}</p>` +
        post.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(s.p)}</p>`).join('') +
        `<p>Related: <a href="/${feature.slug}">${esc(feature.name)}</a></p>` +
        `<nav>${posts.filter((o) => o.slug !== post.slug).map((o) => `<a href="/blog/${o.slug}">${esc(o.h1)}</a>`).join(' ')}</nav>`,
      ld: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.h1,
        description: post.description,
        datePublished: post.date,
        dateModified: post.date,
        keywords: post.keywords.join(', '),
        mainEntityOfPage: `${SITE}/blog/${post.slug}`,
        image: `${SITE}/og-image.png`,
        author: { '@type': 'Organization', name: 'FeastoX', '@id': `${SITE}/#org` },
        publisher: { '@id': `${SITE}/#org` },
      },
    };
  }),
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
      `<nav><a href="/blog">Guides</a> ${features.filter((o) => o.slug !== f.slug).map((o) => `<a href="/${o.slug}">${esc(o.name)}</a>`).join(' ')}</nav>`,
    faqs: f.faqs,
    keywords: f.keywords,
    priority: '0.9',
  })),
  // Policies stay out of the sitemap and static HTML until legal.json is `ready` (company name and email filled in).
  ...(legal.ready
    ? legal.pages.map((l) => ({
        path: `/${l.slug}`,
        title: l.title,
        description: l.description,
        h1: l.h1,
        body: `<p>${esc(fill(l.intro))}</p>` + l.sections.map((s) => `<h2>${esc(s.h)}</h2><p>${esc(fill(s.p))}</p>`).join(''),
        priority: '0.3',
      }))
    : []),
];

for (const p of pages) {
  const url = SITE + (p.path === '/' ? '/' : p.path);
  let html = template;
  if (p.title) {
    const swap = (re, to) => {
      if (!re.test(html)) throw new Error(`prerender: ${re} not found in index.html`);
      html = html.replace(re, (_, p1) => (typeof p1 === 'string' ? p1 : '') + to); // p1 is the match offset when the regex has no group
    };
    swap(/<title>.*?<\/title>/s, `<title>${esc(p.title)}</title>`);
    swap(/(<meta\s+name="description"\s+content=")[^"]*/, `${esc(p.description)}`);
    swap(/(<meta name="keywords" content=")[^"]*/, esc((p.keywords ?? home.keywords).join(', ')));
    swap(/(<meta property="og:title" content=")[^"]*/, `${esc(p.title)}`);
    swap(/(<meta name="twitter:title" content=")[^"]*/, `${esc(p.title)}`);
    swap(/(<meta property="og:description" content=")[^"]*/, `${esc(p.description)}`);
    swap(/(<meta name="twitter:description" content=")[^"]*/, `${esc(p.description)}`);
    swap(/(<meta property="og:url" content=")[^"]*/, `${url}`);
    swap(/(<link rel="canonical" href=")[^"]*/, `${url}`);
    if (p.ogType) swap(/(<meta property="og:type" content=")[^"]*/, p.ogType);
    const blocks = [];
    if (p.faqs) blocks.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faqs.map((q) => ({ '@type': 'Question', name: q.q, acceptedAnswer: { '@type': 'Answer', text: q.a } })) });
    if (p.ld) blocks.push(p.ld);
    const ld = blocks.map((b) => `<script type="application/ld+json">${JSON.stringify(b).replace(/</g, '\\u003c')}</script>`).join('');
    if (p.date) html = html.replace('</head>', `<meta property="article:published_time" content="${p.date}"></head>`);
    swap(/<div id="root"><\/div>/, `<div id="root">${ld}<div class="sr-only"><h1>${esc(p.h1)}</h1>${p.body ?? ''}</div></div>`);
    const dir = new URL(`.${p.path}/`, dist);
    await mkdir(dir, { recursive: true });
    await writeFile(new URL('index.html', dir), html);
  }
}

const urls = pages.map((p) => {
  const loc = `${SITE}${p.path === '/' ? '/' : p.path}`;
  const last = p.date ? `<lastmod>${p.date}</lastmod>` : '';
  return `  <url><loc>${loc}</loc>${last}<priority>${p.priority}</priority></url>`;
});
await writeFile(
  new URL('sitemap.xml', dist),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
const line = (p) => `- [${(p.title ?? p.path).replace(/ · FeastoX$/, '')}](${SITE}${p.path}): ${p.description ?? ''}`.trimEnd();
await writeFile(
  new URL('llms.txt', dist),
  `# FeastoX\n\n> ${home.description}\n\n${home.intro}\n\n## Pages\n\n${pages.map(line).join('\n')}\n`,
);
console.log(`prerendered ${pages.filter((p) => p.title).length} pages + sitemap`);
