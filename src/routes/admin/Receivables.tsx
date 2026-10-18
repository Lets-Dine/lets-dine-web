import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchReceivables, recordReminder } from '../../api/receivables';
import type { Receivable, ReceivableBucket } from '../../api/receivables';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useToast } from '../../state/ToastContext';
import { ADMIN_GHOST, ADMIN_PRIMARY, Empty, Loading, PANEL, PageTitle, Select } from '../../components/admin/kit';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

const PAGE = 20;
const RECENT_REMINDER_MS = 48 * 3_600_000;

const BUCKETS: { value: ReceivableBucket; label: string }[] = [
  { value: 'notDue', label: 'Not due yet' },
  { value: 'overdue30', label: 'Overdue 1–30 days' },
  { value: 'overdue60', label: 'Overdue 31–60' },
  { value: 'overdue60plus', label: 'Overdue 60+' },
];

const SORTS = [
  { value: 'owed', label: 'Owes the most' },
  { value: 'oldest', label: 'Oldest bill first' },
  { value: 'name', label: 'Name, A–Z' },
] as const;

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

const dueLabel = (days: number) => (days < 0 ? `Due in ${-days} day${days === -1 ? '' : 's'}` : days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} overdue`);

/** Everyone who owes the restaurant money, oldest and biggest first, with a one-tap way to chase them. */
export function Receivables() {
  const { menu } = useDashboard();
  const push = useToast();
  const currency = menu.restaurant.currency;
  const money = (v: number) => formatMoney(v, currency);
  const [bucket, setBucket] = useState<ReceivableBucket | null>(null);
  const [sortBy, setSortBy] = useState<(typeof SORTS)[number]['value']>('owed');
  // ponytail: "show more" refetches a longer page instead of appending, fine up to the API's 100-row cap
  const [limit, setLimit] = useState(PAGE);
  const list = useAsync(() => fetchReceivables({ bucket: bucket ?? undefined, sortBy, limit }), [bucket, sortBy, limit]);

  const remind = (r: Receivable) => {
    if (r.lastRemindedAt && Date.now() - Date.parse(r.lastRemindedAt) < RECENT_REMINDER_MS && !window.confirm(`${r.name} was reminded ${ago(r.lastRemindedAt)}. Remind again?`)) return;
    const digits = r.phone.replace(/\D/g, '');
    const text = `Hi ${r.name.split(/\s+/)[0]}, a friendly reminder that ${money(r.owed)} is pending at ${menu.restaurant.name}. You can pay anytime at the counter. Thank you!`;
    // Opened synchronously from the click so the browser doesn't block it; the log follows.
    window.open(`https://wa.me/${digits.length === 10 ? `977${digits}` : digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    recordReminder(r.customerId)
      .then(list.reload)
      .catch((e: Error) => push(`Reminder opened, but couldn't be logged: ${e.message}`));
  };

  if (list.error && !list.data) return <Empty emoji="⚠️" title="Couldn't load receivables" message={list.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={list.reload}>Try again</button>} />;
  if (!list.data) return <Loading label="Adding up who owes what…" />;

  const { buckets, rows, count } = list.data;
  const all = Object.values(buckets);
  const total = all.reduce((n, b) => n + b.owed, 0);
  const people = all.reduce((n, b) => n + b.customers, 0);
  const late = buckets.overdue60.owed + buckets.overdue60plus.owed;

  return (
    <>
      <div className="animate-rise">
        <PageTitle title="Receivables" subtitle="Bills left on credit that haven't been paid yet." />
      </div>

      <section aria-label="Summary" className={cx(PANEL, 'mb-4 animate-rise p-5 [animation-delay:60ms] sm:p-6')}>
        <p className="text-[13px] font-semibold text-ink-3">Owed to you</p>
        <p className="mt-1 text-[clamp(32px,5vw,46px)] font-semibold leading-none tracking-tight tnum">{money(total)}</p>
        <p className="mt-2 text-[13.5px] text-ink-3">
          {people === 0 ? 'Nobody owes anything right now.' : `${people} customer${people === 1 ? '' : 's'}${late > 0 ? ` · ${money(late)} is more than 30 days overdue` : ''}`}
        </p>
      </section>

      <div className="mb-4 grid animate-rise gap-3 lg:grid-cols-[1fr_auto] lg:items-center [animation-delay:100ms]">
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filter by age">
          <button type="button" aria-pressed={bucket === null} onClick={() => setBucket(null)} className={cx(CHIP, bucket === null ? CHIP_ON : CHIP_OFF)}>
            All
          </button>
          {BUCKETS.map((b) => (
            <button key={b.value} type="button" aria-pressed={bucket === b.value} onClick={() => setBucket(b.value)} className={cx(CHIP, 'shrink-0', bucket === b.value ? CHIP_ON : CHIP_OFF)}>
              {b.label} · <span className="tnum">{money(buckets[b.value].owed)}</span>
            </button>
          ))}
        </div>
        <Select value={sortBy} onChange={(v) => setSortBy(v as typeof sortBy)} options={[...SORTS]} aria-label="Sort receivables" />
      </div>

      {rows.length === 0 ? (
        <Empty emoji="🎉" title={bucket ? 'Nothing in this group' : 'All settled up'} message={bucket ? 'Try another age group.' : 'When a bill is left on credit it will show up here.'} />
      ) : (
        <ul className="grid animate-rise gap-3 [animation-delay:140ms]">
          {rows.map((r) => (
            <li key={r.customerId} className={cx(PANEL, 'flex flex-wrap items-center justify-between gap-x-6 gap-y-3 p-4 sm:p-5')}>
              <div className="min-w-0">
                <Link to={`/admin/customers/${r.customerId}`} className="block truncate text-[16px] font-semibold hover:underline">
                  {r.name}
                </Link>
                <p className="mt-0.5 text-[13px] text-ink-3">
                  <span className={r.daysOverdue > 0 ? 'font-semibold text-berry-ink' : undefined}>{dueLabel(r.daysOverdue)}</span> · {r.billCount} bill{r.billCount === 1 ? '' : 's'} ·{' '}
                  {r.lastRemindedAt ? `reminded ${ago(r.lastRemindedAt)}` : 'not reminded yet'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[20px] font-semibold tracking-tight tnum">{money(r.owed)}</span>
                <button type="button" className={cx(r.lastRemindedAt ? ADMIN_GHOST : ADMIN_PRIMARY, 'h-10 px-4')} onClick={() => remind(r)}>
                  {r.lastRemindedAt ? 'Remind again' : 'Remind'}
                </button>
                <Link to={`/admin/customers/${r.customerId}#tab`} className={cx(ADMIN_GHOST, 'h-10 px-4')}>
                  Record payment
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length < count && (
        <div className="mt-4 text-center">
          <button type="button" className={ADMIN_GHOST} disabled={limit >= 100 || list.loading} onClick={() => setLimit((l) => Math.min(l + PAGE, 100))}>
            Show more ({count - rows.length} left)
          </button>
        </div>
      )}
    </>
  );
}
