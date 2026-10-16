import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listReviews } from '../../api/admin';
import type { ReviewFilter } from '../../api/admin';
import { MERCH } from '../../domain/config';
import { feedbackSummary } from '../../domain/adminMetrics';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { Stars } from '../../components/Rating';
import { relativeTime } from '../../components/time';
import {
  Empty,
  Loading,
  PANEL,
  PageTitle,
  Panel,
  Row,
  Segmented,
  Select,
  StatTile,
} from '../../components/admin/kit';
import { TAG, TAG_OFF, cx } from '../../components/ui';
import { Check } from '../../components/icons';
import { useDashboard } from './AdminLayout';

/**
 * §30. What diners actually said.
 *
 * Filters lead with the negative one, because that is the reason a manager
 * opens this screen. Nothing here can be edited or deleted: a review is tied
 * to a completed order, and a restaurant that could remove the bad ones would
 * make the good ones meaningless. Replying is the future feature, not editing.
 */

type Sentiment = 'all' | 'negative' | 'positive';
type Age = 'all' | '7' | '30' | '90';

export function Reviews() {
  const staff = useStaff();
  const { menu } = useDashboard();

  const [dishId, setDishId] = useState('all');
  const [sentiment, setSentiment] = useState<Sentiment>('all');
  const [stars, setStars] = useState('all');
  const [age, setAge] = useState<Age>('all');

  const filter = useMemo<ReviewFilter>(
    () => ({
      dishId: dishId === 'all' ? undefined : dishId,
      sentiment: sentiment === 'all' ? undefined : sentiment,
      stars: stars === 'all' ? undefined : Number(stars),
      since: age === 'all' ? undefined : Number(age),
    }),
    [dishId, sentiment, stars, age],
  );

  const reviews = useAsync(() => listReviews(staff, filter), [staff, filter]);
  const feedback = useMemo(() => feedbackSummary(menu.dishes), [menu.dishes]);

  const leaderboard = useMemo(
    () =>
      menu.dishes
        .filter((d) => !d.isArchived && d.stats.ratingCount >= MERCH.minRatingsToRank)
        .sort((a, b) => (b.stats.avgRating ?? 0) - (a.stats.avgRating ?? 0)),
    [menu.dishes],
  );

  const rows = reviews.data ?? [];

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Reviews" subtitle="Every one of these is attached to an order that was actually completed." />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="animate-rise [animation-delay:60ms]">
          <StatTile
            label="Restaurant rating"
            value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
            sub="weighted by review count"
            variant="subtle"
          />
        </div>
        <div className="animate-rise [animation-delay:105ms]">
          <StatTile
            label="Average dish rating"
            value={feedback.averageDishRating ? `${feedback.averageDishRating.toFixed(2)} ★` : '—'}
            sub={`${feedback.ratedDishes} rated dishes`}
            variant="subtle"
          />
        </div>
        <div className="animate-rise [animation-delay:150ms]">
          <StatTile label="Reviews" value={feedback.reviewCount.toLocaleString()} sub="verified diners" variant="subtle" />
        </div>
        <div className="animate-rise [animation-delay:195ms]">
          <StatTile
            label="Would order again"
            value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
            sub="across rated dishes"
            variant="subtle"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2 animate-rise [animation-delay:240ms]">
            <Segmented
              label="Sentiment"
              value={sentiment}
              onChange={setSentiment}
              options={[
                { value: 'all', label: 'All' },
                { value: 'negative', label: 'Complaints' },
                { value: 'positive', label: 'Compliments' },
              ]}
            />
            <Select className="w-56" aria-label="Filter by dish" value={dishId} onChange={setDishId} options={[{ value: 'all', label: 'Every dish' }, ...menu.dishes.map((d) => ({ value: d.id, label: d.name }))]} />
            <Select className="w-40" aria-label="Filter by rating" value={stars} onChange={setStars} options={[{ value: 'all', label: 'Any rating' }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? '' : 's'}` }))]} />
            <Select<Age> className="w-40" aria-label="Filter by date" value={age} onChange={setAge} options={[{ value: 'all', label: 'All time' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
          </div>

          {reviews.loading && rows.length === 0 ? (
            <Loading label="Reading reviews…" />
          ) : rows.length === 0 ? (
            <Panel>
              <Empty emoji="🔍" title="No reviews match" message="Try widening the filters — or that is genuinely good news." />
            </Panel>
          ) : (
            <>
              <p className="mb-2 text-[12.5px] text-ink-4" aria-live="polite">
                {rows.length} review{rows.length === 1 ? '' : 's'}
              </p>
              <div className="grid gap-2.5">
                {rows.slice(0, 60).map((review, i) => (
                  <article key={review.id} className={cx(PANEL, 'p-4 animate-rise')} style={{ animationDelay: `${340 + Math.min(i, 10) * 45}ms` }}>
                    <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Stars value={review.overall} size={13} />
                        <Link
                          to={`/admin/menu/${review.dishId}`}
                          className="text-[13.5px] font-semibold text-ink-2 hover:text-ink"
                        >
                          {review.dishName}
                        </Link>
                      </div>
                      <span className="text-[12px] text-ink-4">{relativeTime(review.createdAt)}</span>
                    </header>

                    {review.comment && <p className="text-[14px] leading-relaxed">{review.comment}</p>}

                    {review.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {review.tags.map((tag) => (
                          <span key={tag} className={cx(TAG, TAG_OFF, 'h-6.5 px-2.5 text-[12px]')}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <footer className="mt-2.5 flex flex-wrap items-center gap-3 text-[12px]">
                      <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 py-1 pl-1.5 pr-2 font-semibold text-mint">
                        <Check size={11} />
                        Verified diner
                      </span>
                      <span className="text-ink-4 tnum">
                        Taste {review.taste.toFixed(1)} · Portion {review.portion.toFixed(1)} · Value{' '}
                        {review.value.toFixed(1)}
                      </span>
                      {review.wouldOrderAgain && <span className="font-semibold text-mint">Would order again</span>}
                    </footer>
                  </article>
                ))}
              </div>
              {rows.length > 60 && (
                <p className="mt-3 text-center text-[12.5px] text-ink-4">
                  Showing the 60 most recent of {rows.length}. Narrow the filters to see further back.
                </p>
              )}
            </>
          )}
        </div>

        <Panel title="Dish ratings" hint={`Dishes with at least ${MERCH.minRatingsToRank} ratings`} bare className="animate-rise [animation-delay:300ms]">
          {leaderboard.map((dish, i) => (
            <Row key={dish.id} className="animate-rise" style={{ animationDelay: `${360 + Math.min(i, 8) * 45}ms` }}>
              <span className="min-w-0 flex-1">
                <Link to={`/admin/menu/${dish.id}`} className="block truncate text-[14px] font-semibold hover:text-flame-1">
                  {dish.name}
                </Link>
                <span className="block text-[12px] text-ink-4 tnum">{dish.stats.ratingCount} reviews</span>
              </span>
              <span className="shrink-0">
                <Stars value={dish.stats.avgRating ?? 0} size={12} />
              </span>
              <span
                className={cx(
                  'w-9 shrink-0 text-right text-[14px] font-bold tnum',
                  (dish.stats.avgRating ?? 0) < 4.2 && 'text-berry',
                )}
              >
                {dish.stats.avgRating?.toFixed(1)}
              </span>
            </Row>
          ))}
        </Panel>
      </div>
    </>
  );
}
