import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDish, getDishReviews } from '../api/diner';
import { track } from '../domain/analytics';
import { MERCH } from '../domain/config';
import { formatMoney } from '../domain/money';
import { badgesFor } from '../domain/metrics';
import { haptic } from '../platform/haptics';
import { Badges, DietMarks, DishImage, QuantityStepper, Skeleton, SoldOutBadge } from '../components/Bits';
import { RatingBreakdown, RatingPill } from '../components/Rating';
import { ReviewCard } from '../components/ReviewCard';
import { BTN, BTN_SIZE, DISPLAY, GLASS, ICON_BTN, INPUT, SHELL, TAG, TAG_OFF, cx } from '../components/ui';
import { Check, ChevronDown, ChevronLeft, Plus } from '../components/icons';
import { useAsync } from '../state/useAsync';
import { useCart } from '../state/CartContext';
import { usePageTitle } from '../state/usePageTitle';
import { useToast } from '../state/ToastContext';
import { useRestaurant } from './RestaurantLayout';
import { ErrorScreen } from './Shell';

/*
 * Dish detail, take two.
 *
 * One idea: the page reads top to bottom as four calm sections — the dish,
 * your choices, what diners said, written reviews — separated by space and a
 * hairline instead of boxes. Everything optional (note, rating breakdown) sits
 * one tap deeper. Motion is spent on three moments: the photo easing away as
 * you scroll, the price rolling to its new total, and the add button filling.
 */

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rolls a number toward its target — the total should feel like it moved, not jumped. */
function useTween(target: number, ms = 280) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduceMotion()) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - p) ** 4;
      from.current = start + (target - start) * eased;
      setValue(Math.round(from.current));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

/** True once the element has scrolled into view (and stays true). */
function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen] as const;
}

function Section({ title, aside, children }: { title: string; aside?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-hairline pt-8">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <h2 className={cx(DISPLAY, 'text-[22px]')}>{title}</h2>
        {aside && <span className="text-[12.5px] text-ink-3">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** One score, drawn as a bar that fills when it first scrolls into view. */
function ScoreBar({ label, value, seen, delay }: { label: string; value: number | null; seen: boolean; delay: number }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <b className="text-[15px] font-bold tnum">{value === null ? '—' : value.toFixed(1)}</b>
      </div>
      <span className="h-1 overflow-hidden rounded-full bg-surface-3">
        <span
          className="block h-full origin-left rounded-full bg-flame transition-transform duration-1000 ease-out-quart"
          style={{
            width: `${((value ?? 0) / 5) * 100}%`,
            transform: seen ? 'scaleX(1)' : 'scaleX(0)',
            transitionDelay: `${delay}ms`,
          }}
        />
      </span>
    </div>
  );
}

export function DishDetailV2() {
  const { dishId = '' } = useParams();
  const { menu, ctx, base, browseOnly } = useRestaurant();
  const navigate = useNavigate();
  const cart = useCart();
  const toast = useToast();

  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [added, setAdded] = useState(false);

  const heroRef = useRef<HTMLDivElement>(null);
  const [scoresRef, scoresSeen] = useInView<HTMLDivElement>();

  const currency = menu.restaurant.currency;
  const dishQuery = useAsync(() => getDish(dishId, currency), [dishId, currency]);
  const reviewsQuery = useAsync(() => getDishReviews(dishId), [dishId]);
  const dish = dishQuery.data;
  usePageTitle(dish ? `${dish.name} · ${menu.restaurant.name}` : menu.restaurant.name, dish?.description);

  useEffect(() => {
    if (dish) track('dish_detail_viewed', { dishId: dish.id, name: dish.name });
  }, [dish]);

  // The photo drifts up slower than the page and softens, so the title feels like it rises over it.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || reduceMotion()) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => el.style.setProperty('--s', String(Math.min(window.scrollY, 420))));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [dish]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(base));

  // Derived before the early returns so the price tween's hook order stays fixed.
  const availableAddOns = dish ? menu.addOns.filter((a) => dish.addOnIds.includes(a.id) && a.isAvailable && !a.isArchived) : [];
  const availableVariants = dish
    ? [...dish.variants].filter((v) => v.isAvailable && !v.isArchived).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  const selectedVariant = availableVariants.find((v) => v.id === selectedVariantId) ?? null;
  const variantPriced = dish ? dish.variants.some((v) => !v.isArchived) : false;
  const qtyOf = (id: string) => selectedAddOnIds.filter((a) => a === id).length;
  const unit = dish
    ? (variantPriced ? (selectedVariant?.price ?? 0) : dish.price) +
      availableAddOns.reduce((sum, a) => sum + a.price * qtyOf(a.id), 0)
    : 0;
  const total = unit * quantity;
  const shownTotal = useTween(total);

  if (dishQuery.error) return <ErrorScreen title="Dish not found" message={dishQuery.error.message} />;

  if (!dish) {
    return (
      <main className={SHELL}>
        <Skeleton className="h-96 rounded-none lg:hidden" />
        <div className="mx-auto flex max-w-[620px] flex-col gap-4 px-4 pt-6">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-6 h-28" />
        </div>
      </main>
    );
  }

  const stats = dish.stats;
  const hasRatings = stats.ratingCount > 0 && stats.avgRating !== null;
  const showRecommend = stats.recommendRate !== null && stats.ratingCount >= MERCH.minRatingsForRecommendRate;
  const withComments = (reviewsQuery.data ?? []).filter((r) => r.comment.length > 0);
  const needsVariant = variantPriced && !selectedVariant;
  const hasChoices = availableVariants.length > 0 || availableAddOns.length > 0;

  const setAddOnQty = (id: string, qty: number) =>
    setSelectedAddOnIds((prev) => [...prev.filter((a) => a !== id), ...Array(Math.max(qty, 0)).fill(id)]);

  const addToCart = () => {
    if (added) return;
    const before = cart.quantityOf(dish.id, selectedVariantId, selectedAddOnIds);
    haptic.commit();
    cart.add(dish.id, quantity, note, selectedVariantId, selectedAddOnIds);
    track('dish_added_to_cart', { dishId: dish.id, quantity });
    toast(`${quantity} × ${dish.name} added`, '🛒', {
      label: 'Undo',
      onAction: () => cart.setQuantity(dish.id, before, selectedVariantId, selectedAddOnIds),
    });
    // Let the button finish its fill so the add reads as done before the page leaves.
    setAdded(true);
    window.setTimeout(goBack, reduceMotion() ? 0 : 520);
  };

  const ctaLabel = !dish.isAvailable
    ? 'Not available today'
    : needsVariant
      ? 'Choose an option to continue'
      : `Add · ${formatMoney(shownTotal, dish.currency)}`;

  return (
    <main className={cx(SHELL, 'overflow-x-clip')}>
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className={cx(ICON_BTN, 'fixed left-4 top-[calc(12px+var(--safe-t))] z-40 sm:left-6 lg:hidden')}
      >
        <ChevronLeft size={19} />
      </button>

      <div className="lg:mx-auto lg:max-w-6xl lg:px-8 lg:py-8">
        <button
          type="button"
          onClick={goBack}
          className="mb-6 hidden items-center gap-2 text-[14px] font-semibold text-ink-3 transition-colors hover:text-ink lg:inline-flex"
        >
          <ChevronLeft size={17} />
          Back to menu
        </button>

        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-14">
          {/* ── Photo ── */}
          <div ref={heroRef} className="relative h-[26rem] overflow-hidden lg:sticky lg:top-24 lg:h-auto lg:overflow-visible">
            <div
              className="size-full will-change-transform max-lg:[transform:translateY(calc(var(--s,0)*0.28px))_scale(calc(1+var(--s,0)*0.0004))]"
            >
              <DishImage
                dish={dish}
                eager
                monogram="text-[84px] lg:text-[120px]"
                className="size-full lg:aspect-4/5 lg:size-auto lg:rounded-4xl lg:shadow-deep lg:ring-1 lg:ring-hairline lg:ring-inset"
              />
            </div>
            <span
              className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-bg)_2%,rgb(16_13_11/0.35)_40%,transparent_70%),linear-gradient(to_bottom,rgb(10_8_7/0.5),transparent_26%)] lg:hidden"
              aria-hidden
            />
          </div>

          {/* ── Everything else ── */}
          <div className="relative -mt-20 min-w-0 px-4 sm:px-6 lg:mt-0 lg:px-0">
            <div className="mx-auto flex w-full max-w-[620px] flex-col gap-9 lg:mx-0 lg:max-w-none">
              {/* The dish */}
              <header className="animate-rise">
                <div className="mb-3 flex min-h-5.5 flex-wrap gap-1.5">
                  <Badges kinds={badgesFor(dish, ctx)} limit={2} />
                  {!dish.isAvailable && <SoldOutBadge />}
                </div>
                <h1 className={cx(DISPLAY, 'text-balance text-[clamp(32px,9vw,40px)] lg:text-[44px]')}>
                  {dish.name}
                  {!variantPriced && <DietMarks dish={dish} />}
                </h1>
                <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{dish.description}</p>
                <div className="mt-5 flex items-center justify-between gap-3">
                  {variantPriced ? (
                    <span className="text-[14px] font-semibold text-ink-3">
                      {selectedVariant ? formatMoney(selectedVariant.price, dish.currency) : 'Price by option'}
                    </span>
                  ) : (
                    <span className="text-[28px] font-bold tracking-tighter tnum">{formatMoney(dish.price, dish.currency)}</span>
                  )}
                  <RatingPill rating={stats.avgRating} count={stats.ratingCount} size="md" />
                </div>
              </header>

              {/* Your choices */}
              {!browseOnly && dish.isAvailable && hasChoices && (
                <Section title="Make it yours">
                  <div className="flex flex-col gap-7">
                    {availableVariants.length > 0 && (
                      <div role="radiogroup" aria-label="Option" className="flex flex-col">
                        {availableVariants.map((v) => {
                          const active = v.id === selectedVariantId;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => {
                                haptic.select();
                                setSelectedVariantId(v.id);
                              }}
                              className="group flex items-center gap-3.5 border-b border-hairline py-4 text-left first:pt-0 last:border-b-0 last:pb-0"
                            >
                              <span
                                className={cx(
                                  'grid size-6 shrink-0 place-items-center rounded-full text-white transition-[background-color,box-shadow,scale] duration-300 ease-spring',
                                  active
                                    ? 'scale-110 bg-flame'
                                    : 'ring-[1.5px] ring-hairline-strong ring-inset group-hover:ring-flame-2/50',
                                )}
                                aria-hidden
                              >
                                <Check
                                  size={14}
                                  className={cx('transition-[scale,opacity] duration-200', active ? 'scale-100 opacity-100' : 'scale-50 opacity-0')}
                                />
                              </span>
                              <span className={cx('flex-1 text-[15.5px] font-semibold transition-colors', active ? 'text-ink' : 'text-ink-2')}>
                                {v.name}
                                <DietMarks dish={v} />
                              </span>
                              <span className="text-[14px] font-semibold tnum text-ink-3">{formatMoney(v.price, dish.currency)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {availableAddOns.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <h3 className="text-[13px] font-semibold text-ink-3">Extras</h3>
                        <div className="flex flex-wrap gap-2">
                          {availableAddOns.map((a) => {
                            const qty = qtyOf(a.id);
                            return qty === 0 ? (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => {
                                  haptic.select();
                                  setAddOnQty(a.id, 1);
                                }}
                                className={cx(TAG, TAG_OFF, 'h-10 gap-2 pl-3 hover:bg-surface-3 active:scale-95')}
                              >
                                <Plus size={14} className="text-flame-1" />
                                {a.name}
                                <span className="tnum text-ink-4">+{formatMoney(a.price, dish.currency)}</span>
                              </button>
                            ) : (
                              <span
                                key={a.id}
                                className="inline-flex h-10 animate-pop items-center gap-1 rounded-full bg-flame-2/14 py-0 pl-3.5 pr-1 text-[13px] font-semibold text-ink ring-[1.5px] ring-flame-2/35 ring-inset"
                              >
                                {a.name}
                                <QuantityStepper value={qty} onChange={(n) => setAddOnQty(a.id, n)} size="sm" min={0} bare />
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {noteOpen ? (
                      <input
                        type="text"
                        value={note}
                        maxLength={140}
                        autoFocus
                        onChange={(e) => setNote(e.target.value)}
                        onBlur={() => note.trim().length === 0 && setNoteOpen(false)}
                        placeholder="No onions, extra spicy…"
                        aria-label="Note for the kitchen"
                        className={cx(INPUT, 'h-11 animate-swap')}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setNoteOpen(true)}
                        className="w-fit text-[13.5px] font-semibold text-flame-1 underline decoration-flame-1/30 underline-offset-4 transition-colors hover:decoration-flame-1"
                      >
                        Add a note for the kitchen
                      </button>
                    )}
                  </div>
                </Section>
              )}

              {/* What diners said */}
              <Section title="What diners say" aside={hasRatings ? 'Verified orders only' : undefined}>
                {hasRatings ? (
                  <div ref={scoresRef} className="flex flex-col gap-6">
                    <div className="flex items-end justify-between gap-4">
                      <div className="flex items-baseline gap-3">
                        <span className={cx(DISPLAY, 'text-[56px] leading-none tracking-tighter tnum')}>{stats.avgRating?.toFixed(1)}</span>
                        <span className="text-[13px] text-ink-3 tnum">
                          from {stats.ratingCount.toLocaleString('en-US')} {stats.ratingCount === 1 ? 'diner' : 'diners'}
                        </span>
                      </div>
                      {showRecommend && (
                        <p className="text-right text-[13px] leading-tight text-ink-3">
                          <b className="block text-[22px] font-bold tracking-tight text-mint tnum">
                            {Math.round((stats.recommendRate ?? 0) * 100)}%
                          </b>
                          would order again
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-5">
                      <ScoreBar label="Taste" value={stats.taste} seen={scoresSeen} delay={0} />
                      <ScoreBar label="Portion" value={stats.portion} seen={scoresSeen} delay={120} />
                      <ScoreBar label="Value" value={stats.value} seen={scoresSeen} delay={240} />
                    </div>

                    {stats.topTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {stats.topTags.slice(0, 5).map((t) => (
                          <span className={cx(TAG, TAG_OFF)} key={t.tag}>
                            {t.tag}
                            <span className="text-[11.5px] text-ink-4 tnum">{t.count}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    <div>
                      <button
                        type="button"
                        aria-expanded={showBreakdown}
                        onClick={() => setShowBreakdown((s) => !s)}
                        className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-3 transition-colors hover:text-ink"
                      >
                        Rating breakdown
                        <ChevronDown size={15} className={cx('transition-transform duration-300 ease-out-quart', showBreakdown && 'rotate-180')} />
                      </button>
                      <div
                        className={cx(
                          'grid transition-[grid-template-rows,opacity] duration-400 ease-out-quart',
                          showBreakdown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                        )}
                      >
                        <div className="overflow-hidden" inert={!showBreakdown}>
                          <div className="pt-4">
                            <RatingBreakdown distribution={stats.distribution} total={stats.ratingCount} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-3">
                    Nobody has rated this yet. Order it, and you’ll be asked what you thought once the kitchen closes your order.
                  </p>
                )}
              </Section>

              {/* Written reviews — a swipeable row instead of a long stack */}
              {withComments.length > 0 && (
                <Section title="In their words" aside={`${withComments.length} written`}>
                  <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 no-scrollbar sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
                    {withComments.map((r) => (
                      <div key={r.id} className="w-[84%] shrink-0 snap-start sm:w-[22rem] [&>article]:h-full">
                        <ReviewCard review={r} />
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Add bar: pinned on phones, part of the page on laptops */}
              {!browseOnly && (
                <div
                  className={cx(
                    'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6',
                    'lg:static lg:z-auto lg:animate-none lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none',
                    GLASS,
                    'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
                  )}
                >
                  <div className="mx-auto flex w-full max-w-[620px] items-center gap-2.5 lg:mx-0 lg:max-w-none">
                    {dish.isAvailable && <QuantityStepper value={quantity} onChange={setQuantity} min={1} size="lg" />}
                    <button
                      type="button"
                      onClick={addToCart}
                      disabled={!dish.isAvailable || needsVariant}
                      className={cx(
                        BTN,
                        BTN_SIZE,
                        'relative flex-1 overflow-hidden bg-flame text-white shadow-flame',
                        !dish.isAvailable && 'bg-surface-2 text-ink-3 shadow-none',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cx(
                          'absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart',
                          added ? 'scale-x-100' : 'scale-x-0',
                        )}
                      />
                      <span className="relative inline-flex items-center gap-2 tnum">
                        {added ? (
                          <>
                            <Check size={18} /> Added
                          </>
                        ) : (
                          ctaLabel
                        )}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Room for the pinned bar */}
            <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-0" />
          </div>
        </div>
      </div>
    </main>
  );
}
