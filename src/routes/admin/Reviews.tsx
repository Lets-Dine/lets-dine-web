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
  INPUT_BOX,
  Loading,
  PANEL,
  PageTitle,
  Panel,
  Row,
  Segmented,
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
      <PageTitle title="Reviews" subtitle="Every one of these is attached to an order that was actually completed." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Restaurant rating"
          value={feedback.restaurantRating ? `${feedback.restaurantRating.toFixed(2)} ★` : '—'}
          sub="weighted by review count"
        />
        <StatTile
          label="Average dish rating"
          value={feedback.averageDishRating ? `${feedback.averageDishRating.toFixed(2)} ★` : '—'}
          sub={`${feedback.ratedDishes} rated dishes`}
        />
        <StatTile label="Reviews" value={feedback.reviewCount.toLocaleString()} sub="verified diners" />
        <StatTile
          label="Would order again"
          value={feedback.recommendRate !== null ? `${Math.round(feedback.recommendRate * 100)}%` : '—'}
          sub="across rated dishes"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
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
            <select
              className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
              value={dishId}
              onChange={(e) => setDishId(e.target.value)}
              aria-label="Filter by dish"
            >
              <option value="all" className="bg-surface-2">
                Every dish
              </option>
              {menu.dishes.map((d) => (
                <option key={d.id} value={d.id} className="bg-surface-2">
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
              value={stars}
              onChange={(e) => setStars(e.target.value)}
              aria-label="Filter by rating"
            >
              <option value="all" className="bg-surface-2">
                Any rating
              </option>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n} className="bg-surface-2">
                  {n} star{n === 1 ? '' : 's'}
                </option>
              ))}
            </select>
            <select
              className={cx(INPUT_BOX, 'w-auto appearance-none py-2')}
              value={age}
              onChange={(e) => setAge(e.target.value as Age)}
              aria-label="Filter by date"
            >
              <option value="all" className="bg-surface-2">
                All time
              </option>
              <option value="7" className="bg-surface-2">
                Last 7 days
              </option>
              <option value="30" className="bg-surface-2">
                Last 30 days
              </option>
              <option value="90" className="bg-surface-2">
                Last 90 days
              </option>
            </select>
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
                {rows.slice(0, 60).map((review) => (
                  <article key={review.id} className={cx(PANEL, 'p-4')}>
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
                      <span className="text-[11.5px] text-ink-4">{relativeTime(review.createdAt)}</span>
                    </header>

                    {review.comment && <p className="text-[14px] leading-relaxed">{review.comment}</p>}

                    {review.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {review.tags.map((tag) => (
                          <span key={tag} className={cx(TAG, TAG_OFF, 'h-6.5 px-2.5 text-[11.5px]')}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <footer className="mt-2.5 flex flex-wrap items-center gap-3 text-[11.5px]">
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

        <Panel title="Dish ratings" hint={`Dishes with at least ${MERCH.minRatingsToRank} ratings`} bare>
          {leaderboard.map((dish) => (
            <Row key={dish.id}>
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
