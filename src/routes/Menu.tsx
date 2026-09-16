import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { track } from '../domain/analytics';
import { buildSections } from '../domain/metrics';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { DishRow, DishTile } from '../components/DishCard';
import { RatingPill } from '../components/Rating';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, EYEBROW, GLASS, ICON_BTN, RAIL, SHELL, WIDE, cx } from '../components/ui';
import { Clock, Search, X } from '../components/icons';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState } from './Shell';

export function Menu() {
  const { menu, table, ctx, base } = useRestaurant();
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);
  const [activeCategory, setActiveCategory] = useState(menu.categories[0]?.id ?? '');
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const chipRailRef = useRef<HTMLDivElement>(null);

  const href = (dish: Dish) => `${base}/d/${dish.id}`;
  const sections = useMemo(() => buildSections(menu.dishes, ctx), [menu.dishes, ctx]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const categoryName = new Map(menu.categories.map((c) => [c.id, c.name.toLowerCase()]));
    return menu.dishes.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        (categoryName.get(d.categoryId) ?? '').includes(q),
    );
  }, [query, menu]);

  useEffect(() => {
    track('menu_viewed', { restaurant: menu.restaurant.slug });
  }, [menu.restaurant.slug]);

  // Compact header takes over once the cover has scrolled away.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 190);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Category nav follows whichever section is under the sticky bar.
  useEffect(() => {
    if (results) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCategory(visible.target.id.replace('sec-', ''));
      },
      { rootMargin: '-136px 0px -66% 0px', threshold: 0 },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [results, menu.categories]);

  // Keep the active chip in view as the diner scrolls (small screens only).
  useEffect(() => {
    const rail = chipRailRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-cat="${activeCategory}"]`);
    if (rail && chip) {
      const target = chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2;
      rail.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
  }, [activeCategory]);

  const jumpTo = (categoryId: string) => {
    haptic.select();
    setActiveCategory(categoryId);
    sectionRefs.current.get(categoryId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className={SHELL}>
      {/* ── Cover ───────────────────────────────────────────────── */}
      <header className="relative">
        <div className="relative h-67 overflow-hidden md:h-90 lg:h-[420px]">
          {menu.restaurant.coverImageUrl ? (
            <img src={menu.restaurant.coverImageUrl} alt="" className="size-full animate-settle object-cover" />
          ) : (
            <div
              className="size-full animate-settle bg-surface bg-[radial-gradient(circle_at_50%_-10%,rgb(255_138_61/0.35),transparent_68%)]"
              aria-hidden
            />
          )}
          <span
            className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-bg)_2%,rgb(16_13_11/0.86)_26%,rgb(16_13_11/0.25)_62%,rgb(16_13_11/0.5)_100%)]"
            aria-hidden
          />
        </div>

        <Link
          to={`${base}/orders`}
          aria-label="Your orders this visit"
          className={cx(ICON_BTN, 'absolute right-4 top-[calc(12px+var(--safe-t))]')}
        >
          <Clock size={19} />
        </Link>

        <div className={cx(WIDE, 'relative -mt-26 animate-rise-slow pb-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:mt-0 lg:pb-10')}>
          <div className="flex flex-col gap-2.5 lg:max-w-3xl">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-bg/60 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.09em] text-ink-2 ring-1 ring-hairline-strong ring-inset backdrop-blur-md">
              <span className="size-1.5 rounded-full bg-mint shadow-[0_0_0_3px_rgb(78_203_143/0.2)]" aria-hidden />
              {table.name}
            </span>
            <h1 className={cx(DISPLAY, 'text-[clamp(30px,9vw,38px)] lg:text-5xl')}>{menu.restaurant.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <RatingPill rating={menu.restaurant.avgRating} count={menu.restaurant.ratingCount} size="md" />
              <span className="text-ink-4" aria-hidden>
                ·
              </span>
              <span className="text-[13.5px] text-ink-3">{menu.restaurant.tagline}</span>
            </div>
            <p className="max-w-[46ch] text-[13.5px] leading-relaxed text-ink-3 lg:text-[15px]">
              {menu.restaurant.description}
            </p>
          </div>
        </div>
      </header>

      {/* ── Sticky search + categories ──────────────────────────── */}
      <div
        className={cx(
          'sticky top-0 z-50 pb-2 pt-[calc(10px+var(--safe-t))] transition-shadow duration-200',
          GLASS,
          scrolled && 'shadow-[0_1px_0_var(--color-hairline),0_14px_26px_-22px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className={WIDE}>
          <div
            className={cx(
              'grid grid-cols-[1fr_auto] items-center gap-2.5 overflow-hidden transition-all duration-200 ease-out-quart',
              scrolled ? 'mb-2 max-h-9 opacity-100' : 'max-h-0 opacity-0',
            )}
          >
            <b className="truncate text-[15px] font-semibold tracking-tight lg:text-lg">{menu.restaurant.name}</b>
            <RatingPill rating={menu.restaurant.avgRating} count={menu.restaurant.ratingCount} />
          </div>

          <div className="relative flex h-11.5 items-center rounded-full bg-surface-2 ring-1 ring-hairline ring-inset focus-within:ring-[1.5px] focus-within:ring-flame-2/35 lg:max-w-md">
            <Search size={17} className="absolute left-4 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search dishes…"
              aria-label="Search dishes"
              enterKeyHint="search"
              className="size-full rounded-full bg-transparent pl-11 pr-11 text-[15px] outline-none placeholder:text-ink-4"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  haptic.tick();
                  setQuery('');
                }}
                aria-label="Clear search"
                className="absolute right-2 grid size-7 place-items-center rounded-full bg-surface-3 text-ink-2"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Always mounted, so the count is announced rather than appearing
              silently under a screen reader as the diner types. */}
          <p className="sr-only" role="status" aria-live="polite">
            {results
              ? `${results.length} ${results.length === 1 ? 'dish' : 'dishes'} match ${query.trim()}`
              : ''}
          </p>

          {!results && (
            <div className={cx(RAIL, 'mt-2.5 lg:hidden')} ref={chipRailRef}>
              {menu.categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  data-cat={c.id}
                  onClick={() => jumpTo(c.id)}
                  className={cx(CHIP, activeCategory === c.id ? CHIP_ON : CHIP_OFF)}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Search results ──────────────────────────────────────── */}
      {results && (
        <section className={cx(WIDE, 'pt-5')}>
          <p className={cx(EYEBROW, 'mb-2')}>
            {results.length} {results.length === 1 ? 'dish' : 'dishes'} for “{query.trim()}”
          </p>
          {results.length === 0 ? (
            <EmptyState
              emoji="🔍"
              title="Nothing matched that"
              message="Try a category like “momo”, or an ingredient like “chicken”."
            />
          ) : (
            <div className="md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3">
              {results.map((d) => (
                <DishRow key={d.id} dish={d} href={href(d)} ctx={ctx} />
              ))}
            </div>
          )}
        </section>
      )}

      {!results && (
        <>
          {/* ── Merchandising rails ─────────────────────────────── */}
          {sections.map((section) => (
            <section className={cx(WIDE, 'pt-7')} key={section.key}>
              <div className="mb-3.5 flex flex-col gap-0.5">
                <h2 className={cx(DISPLAY, 'text-[19px] font-bold lg:text-2xl')}>
                  <span aria-hidden>{section.emoji}</span> {section.title}
                </h2>
                <p className="text-[12.5px] text-ink-4 lg:text-[13.5px]">{section.subtitle}</p>
              </div>
              <div
                className={cx(
                  RAIL,
                  '-mx-4 px-4 pb-1 sm:-mx-6 sm:px-6',
                  'lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-5 lg:overflow-visible lg:px-0',
                )}
              >
                {section.dishes.map((d, i) => (
                  <DishTile
                    key={d.id}
                    dish={d}
                    href={href(d)}
                    ctx={ctx}
                    rank={section.key === 'loved' ? i + 1 : undefined}
                  />
                ))}
              </div>
            </section>
          ))}

          {/* ── Full menu ───────────────────────────────────────── */}
          <div className={cx(WIDE, 'pt-8 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10')}>
            <aside className="hidden lg:block">
              <nav className="sticky top-32 flex flex-col gap-0.5" aria-label="Menu categories">
                <h2 className={cx(EYEBROW, 'mb-2 px-3')}>Categories</h2>
                {menu.categories.map((c) => {
                  const count = menu.dishes.filter((d) => d.categoryId === c.id).length;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => jumpTo(c.id)}
                      className={cx(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[14px] font-semibold transition-colors duration-150',
                        activeCategory === c.id
                          ? 'bg-flame-2/14 text-flame-1 ring-1 ring-flame-2/30 ring-inset'
                          : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <span aria-hidden>{c.emoji}</span>
                      <span className="flex-1">{c.name}</span>
                      <span className="text-[12px] text-ink-4 tnum">{count}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            <div>
              {menu.categories.map((category) => {
                const dishes = menu.dishes
                  .filter((d) => d.categoryId === category.id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                if (dishes.length === 0) return null;
                return (
                  <section
                    key={category.id}
                    id={`sec-${category.id}`}
                    className="scroll-mt-33 pb-2 lg:scroll-mt-28"
                    ref={(el) => {
                      if (el) sectionRefs.current.set(category.id, el);
                      else sectionRefs.current.delete(category.id);
                    }}
                  >
                    <h2 className={cx(DISPLAY, 'flex items-center gap-2.5 pb-1 pt-5.5 text-[21px] lg:text-2xl')}>
                      <span aria-hidden>{category.emoji}</span>
                      {category.name}
                      <span className="rounded-full bg-surface-2 px-2 py-0.5 font-sans text-[12px] font-semibold text-ink-4 tnum">
                        {dishes.length}
                      </span>
                    </h2>
                    <div className="md:grid md:grid-cols-2 md:gap-3 lg:mt-2">
                      {dishes.map((d) => (
                        <DishRow key={d.id} dish={d} href={href(d)} ctx={ctx} />
                      ))}
                    </div>
                  </section>
                );
              })}

              <footer className="pb-2.5 pt-7">
                <p className="max-w-[70ch] text-[12px] leading-relaxed text-ink-4">
                  Ratings come only from diners with a completed order at {menu.restaurant.name}. Dishes are ranked by
                  rating, review count, order volume and recent trend — never by raw average alone.
                </p>
              </footer>
            </div>
          </div>
        </>
      )}

      <div className="h-[calc(var(--dock-h)+var(--safe-b))] lg:h-8" />
    </main>
  );
}
