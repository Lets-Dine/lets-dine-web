import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { reviewEligibility } from '../api/client';
import type { ReviewDraft } from '../api/client';
import { getOrder, submitReviews } from '../api/diner';
import { track } from '../domain/analytics';
import { REVIEW_TAGS } from '../domain/config';
import type { Order } from '../domain/types';
import { haptic } from '../platform/haptics';
import { DishImage, Skeleton } from '../components/Bits';
import { StarPicker } from '../components/Rating';
import {
  BTN,
  BTN_FLAME,
  BTN_GHOST,
  BTN_SIZE,
  BTN_SIZE_LG,
  DISPLAY,
  EYEBROW,
  GLASS,
  ICON_BTN,
  SHELL,
  TAG,
  TAG_OFF,
  TAG_ON,
  cx,
} from '../components/ui';
import { Check, Sparkle, X } from '../components/icons';
import { useAsync } from '../state/useAsync';
import { useToast } from '../state/ToastContext';
import { useSessionOrders } from '../state/SessionOrdersContext';
import { useRestaurant } from './RestaurantLayout';
import { EmptyState, ErrorScreen, TopBar } from './Shell';

/** The rating flow stays a single focused column at every width. */
const PAGE = 'mx-auto w-full max-w-[620px] px-4 sm:px-6';

const VERDICTS = ['', 'Not good', 'Below average', 'Fine', 'Really good', 'Excellent'];

type Draft = ReviewDraft & { touched: boolean };

const blankDraft = (dishId: string): Draft => ({
  dishId,
  overall: 0,
  taste: 0,
  portion: 0,
  value: 0,
  wouldOrderAgain: true,
  comment: '',
  tags: [],
  touched: false,
});

export function ReviewFlow() {
  const { orderId = '' } = useParams();
  const { menu, session, base } = useRestaurant();
  const navigate = useNavigate();
  const toast = useToast();
  const { rememberOrder } = useSessionOrders();

  const { data: order, error, loading } = useAsync(
    () => getOrder(orderId, session.anonymousSessionToken),
    [orderId, session.anonymousSessionToken],
  );
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [index, setIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<Order | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const pending = useMemo(
    () => (order ? order.items.filter((i) => reviewEligibility(order, i.dishId).ok) : []),
    [order],
  );

  if (error) return <ErrorScreen title="Order not found" message={error.message} />;

  if (loading || !order) {
    return (
      <main className={SHELL}>
        <TopBar title="Rate your meal" fallbackTo={base} width={PAGE} />
        <div className={cx(PAGE, 'flex flex-col gap-3.5 pt-4')}>
          <Skeleton className="h-65 rounded-3xl" />
          <Skeleton className="h-30 rounded-3xl" />
        </div>
      </main>
    );
  }

  if (order.status !== 'COMPLETED') {
    return (
      <main className={SHELL}>
        <TopBar title="Rate your meal" fallbackTo={`${base}/order/${order.id}`} width={PAGE} />
        <div className={cx(PAGE, 'pt-6')}>
          <EmptyState
            emoji="⏳"
            title="Not just yet"
            message="Ratings open once the restaurant marks your order completed. That's what keeps every rating here honest."
            action={
              <Link to={`${base}/order/${order.id}`} className={BTN_GHOST}>
                Back to order status
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  if (submitted || pending.length === 0) {
    const ratedCount = submitted ? submitted.reviewedDishIds.length : order.reviewedDishIds.length;
    return (
      <main className={SHELL}>
        <TopBar title="Thank you" fallbackTo={base} width={PAGE} />
        <section className={cx(PAGE, 'flex animate-rise flex-col items-center gap-3 pt-13 text-center')}>
          <div className="mb-1 grid size-19 animate-pop place-items-center rounded-full bg-flame text-white shadow-flame" aria-hidden>
            <Sparkle size={30} />
          </div>
          <h1 className={cx(DISPLAY, 'text-[27px]')}>Your ratings are live</h1>
          <p className="mb-3.5 max-w-[34ch] text-[14.5px] leading-relaxed text-ink-3">
            {ratedCount > 0
              ? `${ratedCount} verified ${ratedCount === 1 ? 'rating' : 'ratings'} from this order are now part of what the next diner sees.`
              : 'Nothing left to rate from this order.'}
          </p>
          <Link to={base} className={cx(BTN, BTN_SIZE_LG, 'w-full max-w-80 bg-flame text-white shadow-flame')}>
            Back to the menu
          </Link>
          <Link to={`${base}/order/${order.id}`} className="py-2 text-[15px] font-semibold text-ink-3">
            View order
          </Link>
        </section>
      </main>
    );
  }

  const item = pending[Math.min(index, pending.length - 1)];
  const draft = drafts[item.dishId] ?? blankDraft(item.dishId);
  const dish = menu.dishes.find((d) => d.id === item.dishId);
  const isLast = index >= pending.length - 1;

  const update = (patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [item.dishId]: { ...draft, ...patch, touched: true } }));

  const toggleTag = (tag: string) => {
    haptic.select();
    update({ tags: draft.tags.includes(tag) ? draft.tags.filter((t) => t !== tag) : [...draft.tags, tag].slice(0, 6) });
  };

  const finish = async () => {
    const ready = Object.values(drafts).filter((d) => d.overall > 0);
    if (ready.length === 0) {
      navigate(`${base}/order/${order.id}`);
      return;
    }
    setSubmitting(true);
    setFailure(null);
    try {
      const updated = await submitReviews(
        order.id,
        ready.map(({ touched: _touched, ...rest }) => rest),
        session.anonymousSessionToken,
      );
      rememberOrder(updated);
      ready.forEach((r) => track('review_submitted', { dishId: r.dishId, overall: r.overall }));
      haptic.success();
      toast(`${ready.length} ${ready.length === 1 ? 'rating' : 'ratings'} submitted`, '⭐');
      setSubmitted(updated);
    } catch (e) {
      haptic.warn();
      setFailure(e instanceof Error ? e.message : 'Could not submit your ratings.');
      setSubmitting(false);
    }
  };

  const next = () => (isLast ? void finish() : setIndex((i) => i + 1));

  return (
    <main className={SHELL}>
      <TopBar
        title="Rate your meal"
        subtitle={`${index + 1} of ${pending.length}`}
        fallbackTo={`${base}/order/${order.id}`}
        width={PAGE}
        right={
          <button
            type="button"
            className={ICON_BTN}
            aria-label="Close"
            onClick={() => navigate(`${base}/order/${order.id}`)}
          >
            <X size={17} />
          </button>
        }
      />

      <div className={cx(PAGE, 'flex gap-1.5 pt-3.5')} aria-hidden>
        {pending.map((p, i) => (
          <span
            key={p.dishId}
            className={cx(
              'h-[3px] flex-1 rounded-full transition-colors duration-200',
              i === index ? 'bg-flame' : i < index ? 'bg-mint/60' : 'bg-surface-3',
            )}
          />
        ))}
      </div>

      <section className={cx(PAGE, 'pt-4')} key={item.dishId}>
        <div className="flex animate-rise flex-col gap-4.5 rounded-4xl bg-surface p-4.5 shadow-lift ring-1 ring-hairline ring-inset">
          <div className="flex items-center gap-3.5">
            {dish && <DishImage dish={dish} className="size-16 shrink-0 rounded-2xl" monogram="text-2xl" />}
            <div className="min-w-0 flex-1">
              <span className={EYEBROW}>You ordered {item.quantity}×</span>
              <h1 className={cx(DISPLAY, 'mt-1 text-[22px]')}>{item.dishNameSnapshot}</h1>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 pb-0.5 pt-1.5">
            <StarPicker
              value={draft.overall}
              onChange={(n) =>
                update({ overall: n, taste: draft.taste || n, portion: draft.portion || n, value: draft.value || n })
              }
              label="Overall rating"
              size={36}
            />
            <span
              className={cx(
                'text-[13.5px] font-semibold transition-colors duration-150',
                draft.overall ? 'text-gold' : 'text-ink-4',
              )}
            >
              {draft.overall ? VERDICTS[draft.overall] : 'Tap to rate'}
            </span>
          </div>

          {draft.overall > 0 && (
            <div className="flex animate-rise flex-col gap-5 border-t border-hairline pt-4.5">
              <div className="flex flex-col gap-2.5">
                <b className="text-[13.5px] font-semibold">Would you order it again?</b>
                <div className="flex gap-2">
                  {(
                    [
                      [true, 'Yes', <Check size={14} key="y" />],
                      [false, 'No', <X size={14} key="n" />],
                    ] as const
                  ).map(([yes, label, icon]) => {
                    const on = draft.wouldOrderAgain === yes;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          haptic.select();
                          update({ wouldOrderAgain: yes });
                        }}
                        className={cx(
                          'inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-semibold',
                          'transition-move active:scale-96',
                          !on && 'bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset',
                          on && yes && 'bg-mint/15 text-mint ring-[1.5px] ring-mint/40 ring-inset',
                          on && !yes && 'bg-berry/13 text-[#ff90a4] ring-[1.5px] ring-berry/35 ring-inset',
                        )}
                      >
                        {icon}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1">
                {(
                  [
                    ['Taste', 'taste'],
                    ['Portion', 'portion'],
                    ['Value', 'value'],
                  ] as const
                ).map(([label, key]) => (
                  <div className="flex items-center justify-between gap-3" key={key}>
                    <span className="text-[13.5px] font-medium text-ink-2">{label}</span>
                    <StarPicker value={draft[key]} onChange={(n) => update({ [key]: n })} label={label} size={20} />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-2.5">
                <b className="text-[13.5px] font-semibold">What stood out?</b>
                <div className="flex flex-wrap gap-2">
                  {REVIEW_TAGS.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => toggleTag(tag)}
                      aria-pressed={draft.tags.includes(tag)}
                      className={cx(TAG, draft.tags.includes(tag) ? TAG_ON : TAG_OFF)}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-2.5">
                <b className="text-[13.5px] font-semibold">Anything else? (optional)</b>
                <textarea
                  value={draft.comment}
                  maxLength={500}
                  rows={3}
                  placeholder="What would you tell a friend about this dish?"
                  onChange={(e) => update({ comment: e.target.value })}
                  className="w-full resize-none rounded-2xl bg-surface-2 px-3.5 py-3 text-[14px] leading-relaxed outline-none ring-1 ring-hairline ring-inset placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/35"
                />
              </label>
            </div>
          )}
        </div>

        {failure && (
          <p className="mt-3.5 rounded-2xl bg-berry/12 px-3.5 py-3 text-[13.5px] font-semibold text-[#ff90a4]" role="alert">
            {failure}
          </p>
        )}

        {/* Desktop puts the controls right below the card instead of pinning them. */}
        <div className="hidden gap-2.5 pt-5 lg:flex">
          <button type="button" className={BTN_GHOST} onClick={next} disabled={submitting}>
            Skip
          </button>
          <button
            type="button"
            className={cx(BTN_FLAME, 'flex-1')}
            onClick={next}
            disabled={draft.overall === 0 || submitting}
          >
            {submitting ? 'Submitting…' : isLast ? 'Submit ratings' : 'Next dish'}
          </button>
        </div>
      </section>

      <div className="h-[calc(var(--dock-h)+var(--safe-b))] lg:h-10" />

      <div
        className={cx(
          'fixed inset-x-0 bottom-0 z-58 animate-rise px-4 pb-[calc(12px+var(--safe-b))] pt-3 sm:px-6 lg:hidden',
          GLASS,
          'shadow-[0_-1px_0_var(--color-hairline),0_-18px_34px_-26px_rgb(0_0_0/0.95)]',
        )}
      >
        <div className="mx-auto flex w-full max-w-[620px] items-center gap-2.5">
          <button type="button" className={BTN_GHOST} onClick={next} disabled={submitting}>
            Skip
          </button>
          <button
            type="button"
            className={cx(BTN, BTN_SIZE, 'flex-1 bg-flame text-white shadow-flame')}
            onClick={next}
            disabled={draft.overall === 0 || submitting}
          >
            {submitting ? 'Submitting…' : isLast ? 'Submit ratings' : 'Next dish'}
          </button>
        </div>
      </div>
    </main>
  );
}
