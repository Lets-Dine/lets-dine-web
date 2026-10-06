import { useMemo, useState } from 'react';
import { FEEDBACK_STATUS_LABEL, FEEDBACK_TYPE_LABEL, listFeedback, setFeedbackStatus } from '../../api/feedback';
import type { FeedbackItem, FeedbackStatus, FeedbackType } from '../../api/feedback';
import { Empty, INPUT_BOX, PageTitle, Panel, useCommand } from '../../components/admin/kit';
import { Search } from '../../components/icons';
import { cx } from '../../components/ui';
import { useAsync } from '../../state/useAsync';
import { usePageTitle } from '../../state/usePageTitle';
import { Badge, FilterPills, SkeletonRows, relTime } from './kit';
import type { Tone } from '../../domain/subscription';

type StatusFilter = FeedbackStatus | 'all';
type TypeFilter = FeedbackType | 'all';

const TYPE_TONE: Record<FeedbackType, Tone> = { BUG: 'bad', IDEA: 'info', QUESTION: 'warn', PRAISE: 'good' };
const STATUSES: FeedbackStatus[] = ['NEW', 'REVIEWING', 'DONE'];

/** Everything restaurants have sent the product team, newest first, with a status to triage by. */
export function PlatformFeedback() {
  usePageTitle('Feedback · Platform admin');
  const list = useAsync(listFeedback, []);
  const { run, busy } = useCommand();
  const [status, setStatus] = useState<StatusFilter>('NEW');
  const [type, setType] = useState<TypeFilter>('all');
  const [keyword, setKeyword] = useState('');
  const [shot, setShot] = useState<string | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return all.filter(
      (f) =>
        (status === 'all' || f.status === status) &&
        (type === 'all' || f.type === type) &&
        (!needle || [f.message, f.restaurantName, f.senderName, f.pagePath].some((v) => v.toLowerCase().includes(needle))),
    );
  }, [all, status, type, keyword]);

  const countStatus = (s: StatusFilter) => (s === 'all' ? all.length : all.filter((f) => f.status === s).length);
  const countType = (t: TypeFilter) => (t === 'all' ? all.length : all.filter((f) => f.type === t).length);

  const move = (f: FeedbackItem, next: FeedbackStatus) => run(`s${f.id}`, () => setFeedbackStatus(f.id, next), `Marked ${FEEDBACK_STATUS_LABEL[next].toLowerCase()}`).then((ok) => ok && list.reload());

  return (
    <>
      <PageTitle title="Feedback" subtitle="What restaurants are telling the product team." />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <FilterPills<StatusFilter>
          label="Status"
          value={status}
          onChange={setStatus}
          options={[{ value: 'all', label: 'All', count: countStatus('all') }, ...STATUSES.map((s) => ({ value: s, label: FEEDBACK_STATUS_LABEL[s], count: countStatus(s) }))]}
        />
        <label className="relative block w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input className={cx(INPUT_BOX, 'h-9 py-0 pl-8 text-[13.5px]')} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Search feedback" aria-label="Search feedback" />
        </label>
      </div>
      <div className="mb-4">
        <FilterPills<TypeFilter>
          label="Kind"
          value={type}
          onChange={setType}
          options={[{ value: 'all', label: 'Any kind', count: countType('all') }, ...(Object.keys(FEEDBACK_TYPE_LABEL) as FeedbackType[]).map((t) => ({ value: t, label: FEEDBACK_TYPE_LABEL[t], count: countType(t) }))]}
        />
      </div>

      <Panel bare>
        {list.loading && !list.data ? (
          <SkeletonRows />
        ) : list.error ? (
          <p className="p-5 text-[13px] text-berry">{list.error.message}</p>
        ) : rows.length === 0 ? (
          <Empty emoji="📭" title={all.length === 0 ? 'No feedback yet' : 'Nothing matches'} message={all.length === 0 ? 'Notes sent from a restaurant dashboard land here.' : 'Try another status or kind, or clear the search.'} />
        ) : (
          <ul>
            {rows.map((f) => (
              <li key={f.id} className="border-b border-hairline px-4 py-4 last:border-0 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-3">
                  <Badge tone={TYPE_TONE[f.type]}>{FEEDBACK_TYPE_LABEL[f.type]}</Badge>
                  <span className="font-semibold text-ink">{f.restaurantName}</span>
                  <span>
                    {f.senderName} · {f.senderRole.toLowerCase()}
                  </span>
                  {f.pagePath && <span className="text-ink-4">{f.pagePath}</span>}
                  <span className="ml-auto text-ink-4">{relTime(f.createdAt)}</span>
                </div>
                <p className="mt-2 max-w-[75ch] whitespace-pre-wrap text-[14.5px] leading-relaxed">{f.message}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {f.screenshotUrl && (
                    <button type="button" onClick={() => setShot(f.screenshotUrl)} className="overflow-hidden rounded-lg ring-1 ring-hairline ring-inset" aria-label="View screenshot">
                      <img src={f.screenshotUrl} alt="" loading="lazy" className="h-14 w-24 object-cover" />
                    </button>
                  )}
                  <a href={`mailto:${f.senderEmail}`} className="text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">
                    {f.senderEmail}
                  </a>
                  <span className="flex-1" />
                  <div role="group" aria-label="Status" className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-hairline ring-inset">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={f.status === s}
                        disabled={busy}
                        onClick={() => f.status !== s && move(f, s)}
                        className={cx('h-7 rounded-lg px-2.5 text-[12.5px] font-semibold transition-colors disabled:opacity-50', f.status === s ? 'bg-surface-3 text-ink shadow-lift' : 'text-ink-3 hover:text-ink-2')}
                      >
                        {FEEDBACK_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {shot && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation" onClick={() => setShot(null)}>
          <img src={shot} alt="Screenshot sent with the feedback" className="max-h-[88vh] max-w-full rounded-2xl shadow-deep" />
        </div>
      )}
    </>
  );
}
