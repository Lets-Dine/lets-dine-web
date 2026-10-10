import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchQuality } from '../../api/inventory';
import type { LotQuality } from '../../api/inventory';
import { Loading, Panel, Segmented } from '../../components/admin/kit';
import { cx } from '../../components/ui';
import { useAsync } from '../../state/useAsync';

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

const pct = (rate: number) => `${Math.round(rate * 100)}%`;
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Which deliveries ended up in poorly rated dishes. A review is traced back through the order to the
 * deliveries that were used for it, and a delivery is flagged when its dishes did clearly worse than
 * the same ingredient's other deliveries — so the question to take to a supplier is specific.
 */
export function DeliveriesSection() {
  const [days, setDays] = useState('30');
  const quality = useAsync(() => fetchQuality(Number(days)), [days]);

  if (quality.loading && !quality.data) return <Loading />;
  const rows = quality.data ?? [];
  const flagged = rows.filter((r) => r.flagged);
  const rest = rows.filter((r) => !r.flagged);

  const headline =
    flagged.length > 0
      ? {
          tone: 'bad' as const,
          title: `${flagged.length} deliver${flagged.length === 1 ? 'y looks' : 'ies look'} worse than usual`,
          sub: 'The dishes made from these got clearly more poor ratings than the same ingredient from other deliveries. Worth a word with the supplier, or a closer look at that batch.',
        }
      : rows.length > 0
        ? { tone: 'good' as const, title: 'No delivery stands out', sub: 'Every delivery with reviews is rating about the same as the rest of its ingredient.' }
        : {
            tone: 'neutral' as const,
            title: 'Nothing to compare yet',
            sub: 'This fills in once dishes with a recipe get reviewed. Receive deliveries on the Stock page, and each review is traced back to the deliveries used for it.',
          };

  return (
    <section aria-labelledby="deliv-h">
      <div className="mb-3 flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 id="deliv-h" className="text-[18px] font-semibold tracking-tight">
            Deliveries and reviews
          </h2>
          <p className="mt-0.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            Which deliveries ended up in poorly rated dishes. {headline.title}.
          </p>
        </div>
        <Segmented label="Period" value={days} onChange={setDays} options={PERIODS} />
      </div>

      <div className="grid gap-4">
        {flagged.length > 0 && (
          <section aria-label="Deliveries to look at">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-berry-ink">Look at these first</h3>
            <LotList rows={flagged} />
          </section>
        )}
        {rest.length > 0 && (
          <section aria-label="Other deliveries">
            <h3 className="mb-2 px-1 text-[13px] font-semibold text-ink-2">
              {flagged.length > 0 ? 'Everything else' : 'Reviewed deliveries'} <span className="font-normal text-ink-4">· {rest.length}</span>
            </h3>
            <LotList rows={rest} />
          </section>
        )}
        {rows.length > 0 && (
          <Panel variant="subtle">
            <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-3">
              A rating of 2 stars or lower on taste or overall counts as poor. A dish uses several ingredients, so one poor rating counts against each of them — that is why a delivery is only
              flagged when it is at least twice as bad as the same ingredient’s other deliveries, with four or more reviews behind it.
            </p>
          </Panel>
        )}
        {rows.length === 0 && (
          <p className="px-1 text-[13px] text-ink-3">
            Not set up yet? Give your dishes a recipe from the{' '}
            <Link to="/admin/menu" className="font-semibold text-flame-1">
              menu
            </Link>
            , then receive deliveries on the{' '}
            <Link to="/admin/inventory" className="font-semibold text-flame-1">
              Stock page
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  );
}

function LotList({ rows }: { rows: LotQuality[] }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
      {rows.map((lot) => (
        <div key={lot.lotId} className="grid gap-2 border-b border-docket-line px-4 py-4 last:border-0 sm:px-5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[15px] font-semibold">{lot.ingredientName}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-docket-inksoft">
              Delivered {day(lot.receivedAt)}
              {lot.supplier ? ` · ${lot.supplier}` : ' · opening stock or no supplier named'}
            </span>
            <span className={cx('rounded-md px-2 py-0.5 text-[11.5px] font-bold', lot.flagged ? 'bg-berry/14 text-berry-ink' : 'bg-docket-line/70 text-docket-inksoft')}>
              {lot.flagged ? 'Worse than usual' : lot.reviewCount < 4 ? 'Too few reviews' : 'Normal'}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
            <span>
              <span className="font-bold tnum">
                {lot.poorCount} of {lot.reviewCount}
              </span>{' '}
              reviews poor <span className="tnum">({pct(lot.poorRate)})</span>
            </span>
            <span className="text-docket-inksoft">
              other {lot.ingredientName.toLowerCase()} deliveries: <span className="tnum">{pct(lot.baselineRate)}</span>
            </span>
          </div>
          {lot.flagged && (
            <p className="text-[13px] text-docket-inksoft">
              What to do: ask {lot.supplier ?? 'whoever supplied it'} about this delivery, and check the next one before it goes into dishes.
            </p>
          )}
          <div className="h-1.5 max-w-sm rounded-full bg-docket-line" role="img" aria-label={`${pct(lot.poorRate)} poor reviews`}>
            <div className={cx('h-full rounded-full', lot.flagged ? 'bg-berry' : 'bg-docket-inksoft/50')} style={{ width: `${Math.max(2, lot.poorRate * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
