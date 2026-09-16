import type { Review } from '../domain/types';
import { Stars } from './Rating';
import { TAG, TAG_OFF, cx } from './ui';
import { Check } from './icons';
import { relativeTime } from './time';

export function ReviewCard({ review }: { review: Review }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset">
      <header className="flex items-center justify-between">
        <Stars value={review.overall} size={13} />
        <span className="text-[11.5px] text-ink-4">{relativeTime(review.createdAt)}</span>
      </header>

      {review.comment && <p className="text-[14px] leading-relaxed text-ink">{review.comment}</p>}

      {review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((t) => (
            <span className={cx(TAG, TAG_OFF, 'h-6.5 px-2.5 text-[11.5px]')} key={t}>
              {t}
            </span>
          ))}
        </div>
      )}

      <footer className="flex items-center gap-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 py-1 pl-1.5 pr-2 text-[11.5px] font-semibold text-mint">
          <Check size={11} />
          Verified diner
        </span>
        {review.wouldOrderAgain && <span className="text-[11.5px] font-semibold text-mint">Would order again</span>}
      </footer>
    </article>
  );
}
