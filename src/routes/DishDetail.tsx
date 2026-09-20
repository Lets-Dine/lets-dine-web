import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getDish, getDishReviews } from '../api/diner';
import { track } from '../domain/analytics';
import { MERCH } from '../domain/config';
import { formatMoney } from '../domain/money';
import { badgesFor } from '../domain/metrics';
import type { Dish } from '../domain/types';
import { haptic } from '../platform/haptics';
import { Badges, DietMarks, DishImage, QuantityStepper, Skeleton, SoldOutBadge } from '../components/Bits';
import { RatingBreakdown, RatingPill, SubRating } from '../components/Rating';
import { ReviewCard } from '../components/ReviewCard';
import { BTN, BTN_GHOST, BTN_SIZE, DISPLAY, EYEBROW, GLASS, ICON_BTN, INPUT, SHELL, TAG, TAG_OFF, cx } from '../components/ui';
import { ChevronLeft, Info } from '../components/icons';
import { useAsync } from '../state/useAsync';
import { useCart } from '../state/CartContext';
import { useToast } from '../state/ToastContext';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState, ErrorScreen } from './Shell';

/** Content column: a comfortable reading width on phones, half the grid on laptops. */
const COL = 'mx-auto w-full max-w-[620px] px-4 sm:px-6 lg:mx-0 lg:max-w-none lg:px-0';

export function DishDetail() {
  const { dishId = '' } = useParams();
  const { menu, ctx, base } = useRestaurant();
  const navigate = useNavigate();
  const cart = useCart();
  const toast = useToast();

  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');
  const [showAllReviews, setShowAllReviews] = useState(false);

  const currency = menu.restaurant.currency;
  const dishQuery = useAsync(() => getDish(dishId, currency), [dishId, currency]);
  const reviewsQuery = useAsync(() => getDishReviews(dishId), [dishId]);
  const dish = dishQuery.data;

  useEffect(() => {
    if (dish) track('dish_detail_viewed', { dishId: dish.id, name: dish.name });
  }, [dish]);

  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate(base));

  if (dishQuery.error) return <ErrorScreen title="Dish not found" message={dishQuery.error.message} />;

  if (!dish) {
    return (
      <main className={SHELL}>
        <Skeleton className="h-85 rounded-none lg:hidden" />
        <div className={cx(COL, 'flex flex-col gap-3.5 pt-5 lg:mx-auto lg:max-w-6xl lg:px-8')}>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-24" />
          <Skeleton className="h-32" />
        </div>
      </main>
    );
  }

  const stats = dish.stats;
  const hasRatings = stats.ratingCount > 0 && stats.avgRating !== null;
  const showRecommend = stats.recommendRate !== null && stats.ratingCount >= MERCH.minRatingsForRecommendRate;
  const reviews = reviewsQuery.data ?? [];
  const withComments = reviews.filter((r) => r.comment.length > 0);
  const shown = showAllReviews ? withComments : withComments.slice(0, 3);

  const addToCart = () => {
    const before = cart.quantityOf(dish.id);
    haptic.commit();
    cart.add(dish.id, quantity, note);
    track('dish_added_to_cart', { dishId: dish.id, quantity });
    toast(`${quantity} × ${dish.name} added`, '🛒', {
      label: 'Undo',
      onAction: () => cart.setQuantity(dish.id, before),
    });
    goBack();
  };

  return (
    <main className={SHELL}>
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

        <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-12">
          {/* ── Photo ─────────────────────────────────────────── */}
          <div className="relative h-85 lg:sticky lg:top-24 lg:h-auto">
            <DishImage
              dish={dish}
              eager
              monogram="text-[84px] lg:text-[120px]"
              className="size-full lg:aspect-4/5 lg:size-auto lg:rounded-4xl lg:shadow-deep lg:ring-1 lg:ring-hairline lg:ring-inset"
            />
            <span
              className="absolute inset-0 bg-[linear-gradient(to_top,var(--color-bg)_1%,rgb(16_13_11/0.55)_34%,transparent_68%),linear-gradient(to_bottom,rgb(10_8_7/0.5),transparent_26%)] lg:hidden"
              aria-hidden
            />
          </div>

          {/* ── Detail ────────────────────────────────────────── */}
          <div className="relative -mt-11.5 lg:mt-0">
            <div className={COL}>
              <div className="mb-2.5 flex min-h-5.5 flex-wrap gap-1.5">
                <Badges kinds={badgesFor(dish, ctx)} limit={3} />
                {!dish.isAvailable && <SoldOutBadge />}
              </div>

              <h1 className={cx(DISPLAY, 'mb-2 text-[clamp(27px,8vw,33px)] lg:text-4xl')}>
                {dish.name}
                <DietMarks dish={dish} />
              </h1>
              <p className="text-[14.5px] leading-relaxed text-ink-2 lg:text-[15.5px]">{dish.description}</p>

              <div className="mt-4 flex items-baseline justify-between gap-3 pb-1">
                <span className="text-[26px] font-bold tracking-tighter tnum lg:text-3xl">
                  {formatMoney(dish.price, dish.currency)}
                </span>
                <RatingPill rating={stats.avgRating} count={stats.ratingCount} size="md" />
              </div>

              {/* Desktop keeps the add controls in the flow of the page. */}
              <div className="mt-6 hidden lg:block">
                <AddPanel
                  dish={dish}
                  quantity={quantity}
                  setQuantity={setQuantity}
                  note={note}
                  setNote={setNote}
                  onAdd={addToCart}
                />
              </div>

              {/* ── What diners actually said ─────────────────── */}
              {hasRatings ? (
                <section className="pt-7">
                  <div className="flex flex-col gap-4 rounded-3xl bg-surface p-4.5 ring-1 ring-hairline ring-inset">
                    <div className="flex items-center justify-between gap-3.5">
                      <div>
                        <span className={cx(DISPLAY, 'block text-[40px] leading-none tracking-tighter tnum')}>
                          {stats.avgRating?.toFixed(1)}
                        </span>
                        <span className="mt-1.5 block text-[12.5px] text-ink-3 tnum">
                          {stats.ratingCount.toLocaleString('en-US')} verified{' '}
                          {stats.ratingCount === 1 ? 'rating' : 'ratings'}
                        </span>
                      </div>
                      {showRecommend && (
                        <div className="flex flex-col items-end rounded-2xl bg-mint/15 px-3.5 py-2.5 text-right">
                          <b className="text-[22px] font-bold leading-tight tracking-tight text-mint tnum">
                            {Math.round((stats.recommendRate ?? 0) * 100)}%
                          </b>
                          <span className="max-w-[11ch] text-[11px] font-semibold text-mint/80">would order again</span>
                        </div>
                      )}
                    </div>

                    <RatingBreakdown distribution={stats.distribution} total={stats.ratingCount} />

                    <div className="border-t border-hairline pt-3">
                      <SubRating label="Taste" value={stats.taste} />
                      <SubRating label="Portion" value={stats.portion} />
                      <SubRating label="Value" value={stats.value} />
                    </div>
                  </div>

                  {stats.topTags.length > 0 && (
                    <div className="mt-5 flex flex-col gap-2.5">
                      <h2 className={EYEBROW}>People often say</h2>
                      <div className="flex flex-wrap gap-2">
                        {stats.topTags.map((t) => (
                          <span className={cx(TAG, TAG_OFF)} key={t.tag}>
                            {t.tag}
                            <span className="text-[11.5px] text-ink-4 tnum">{t.count}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section className="pt-7">
                  <EmptyState
                    emoji="✨"
                    title="Be the first to rate this dish"
                    message="Nobody has rated it yet. Order it, and you'll be asked what you thought once the kitchen closes your order."
                  />
                </section>
              )}

              {/* ── Reviews ───────────────────────────────────── */}
              {withComments.length > 0 && (
                <section className="pt-7">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className={cx(DISPLAY, 'text-[19px] lg:text-xl')}>Reviews</h2>
                    <span className="text-[12.5px] text-ink-3">{withComments.length} written</span>
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {shown.map((r) => (
                      <ReviewCard key={r.id} review={r} />
                    ))}
                  </div>
                  {withComments.length > 3 && !showAllReviews && (
                    <button type="button" className={cx(BTN_GHOST, 'mt-3 w-full')} onClick={() => setShowAllReviews(true)}>
                      Read all {withComments.length} reviews
                    </button>
                  )}
                </section>
              )}

              <p className="mt-6 flex items-center gap-2 text-[12px] text-ink-4">
                <Info size={14} className="shrink-0" />
                Only diners who completed an order containing this dish can rate it.
              </p>
            </div>

            <div className="h-[calc(var(--dock-h)+58px+var(--safe-b))] lg:h-0" />
          </div>
        </div>
      </div>

      {/* ── Sticky add bar (small screens) ──────────────────────── */}
      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 flex animate-rise flex-col gap-2.5 px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto w-full max-w-[620px]">
          <AddPanel
            dish={dish}
            quantity={quantity}
            setQuantity={setQuantity}
            note={note}
            setNote={setNote}
            onAdd={addToCart}
          />
        </div>
      </div>
    </main>
  );
}

function AddPanel({
  dish,
  quantity,
  setQuantity,
  note,
  setNote,
  onAdd,
}: {
  dish: Dish;
  quantity: number;
  setQuantity: (n: number) => void;
  note: string;
  setNote: (s: string) => void;
  onAdd: () => void;
}) {
  const [noteOpen, setNoteOpen] = useState(note.length > 0);

  if (!dish.isAvailable) {
    return (
      <button type="button" className={cx(BTN_GHOST, 'w-full')} disabled>
        Not available today
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2.5">
      {/* Most diners never write a note, and on a phone this panel is pinned
          over the page — so the common path shows first and the note is one
          tap deeper, exactly as it already works in the cart. */}
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
          className={cx(INPUT, 'h-11')}
        />
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="w-fit py-0.5 text-[13px] font-semibold text-flame-1"
        >
          + Add a note for the kitchen
        </button>
      )}
      <div className="flex items-center gap-2.5">
        <QuantityStepper value={quantity} onChange={setQuantity} min={1} size="lg" />
        <button type="button" className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')} onClick={onAdd}>
          Add · {formatMoney(dish.price * quantity, dish.currency)}
        </button>
      </div>
    </div>
  );
}
