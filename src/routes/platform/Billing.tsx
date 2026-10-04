import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listInvoices, remindInvoices } from '../../api/platformConsole';
import type { Invoice } from '../../api/platformConsole';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, Empty, INPUT_BOX, PageTitle, Panel, useCommand } from '../../components/admin/kit';
import { Search, Send } from '../../components/icons';
import { usePageTitle } from '../../state/usePageTitle';
import { cx } from '../../components/ui';
import { FilterPills, SkeletonRows, rupees } from './kit';
import { InvoiceList } from './InvoiceList';

type View = 'due' | 'overdue' | 'paid' | 'all';
const VIEWS: View[] = ['due', 'overdue', 'paid', 'all'];

const matches = (inv: Invoice, view: View) =>
  view === 'all' ? true : view === 'due' ? inv.state === 'OPEN' || inv.state === 'OVERDUE' : view === 'overdue' ? inv.state === 'OVERDUE' : inv.state === 'PAID';

/**
 * Money in, by hand. Payment is arranged with the team and recorded here, so
 * this screen is built around the one loop that matters: find the unpaid
 * invoice, nudge the owner, mark it paid when the transfer lands.
 */
export function PlatformBilling() {
  usePageTitle('Billing · Platform admin');
  const [params, setParams] = useSearchParams();
  const list = useAsync(listInvoices, []);
  const { busy, run } = useCommand();

  const raw = params.get('view') as View | null;
  const view: View = raw && VIEWS.includes(raw) ? raw : 'due';
  const keyword = params.get('q') ?? '';
  const setParam = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const all = useMemo(() => list.data ?? [], [list.data]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v, all.filter((i) => matches(i, v)).length])) as Record<View, number>, [all]);
  const rows = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return all.filter((i) => matches(i, view) && (!needle || i.tenantName.toLowerCase().includes(needle) || i.number.toLowerCase().includes(needle)));
  }, [all, view, keyword]);

  const overdue = all.filter((i) => i.state === 'OVERDUE');
  const overdueTotal = overdue.reduce((s, i) => s + i.amount, 0);
  const dueTotal = all.filter((i) => i.state === 'OPEN').reduce((s, i) => s + i.amount, 0);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const collected = all.filter((i) => i.state === 'PAID' && i.paidAt && Date.parse(i.paidAt) >= monthStart).reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <PageTitle
        title="Billing"
        subtitle="Invoices across every restaurant. Mark them paid as payments arrive."
        action={
          overdue.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              className={ADMIN_GHOST}
              onClick={() => void run('all', () => remindInvoices(overdue.map((i) => i.id)), `Reminders sent for ${overdue.length} overdue ${overdue.length === 1 ? 'invoice' : 'invoices'}.`).then((ok) => ok && list.reload())}
            >
              <Send size={14} /> Remind all overdue ({overdue.length})
            </button>
          ) : undefined
        }
      />

      <section aria-label="Billing at a glance" className="mb-5 grid grid-cols-1 overflow-hidden rounded-2xl bg-docket-surface ring-1 ring-hairline ring-inset sm:grid-cols-3">
        {[
          { label: 'Overdue', value: rupees(overdueTotal), sub: `${overdue.length} ${overdue.length === 1 ? 'invoice' : 'invoices'}`, danger: overdue.length > 0 },
          { label: 'Due, not yet late', value: rupees(dueTotal), sub: `${counts.due - overdue.length} open` },
          { label: 'Collected this month', value: rupees(collected), sub: 'Marked paid' },
        ].map((c, i) => (
          <div key={c.label} className={cx('px-4 py-3.5 sm:px-5', i > 0 && 'border-t border-hairline sm:border-l sm:border-t-0')}>
            <div className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{c.label}</div>
            <div className={cx('mt-1 text-[22px] font-semibold tracking-tight tnum', c.danger && 'text-berry-ink')}>{c.value}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">{c.sub}</div>
          </div>
        ))}
      </section>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          label="Show invoices"
          value={view}
          onChange={(v) => setParam('view', v, 'due')}
          options={[
            { value: 'due', label: 'Needs payment', count: counts.due },
            { value: 'overdue', label: 'Overdue', count: counts.overdue },
            { value: 'paid', label: 'Paid', count: counts.paid },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
        <label className="relative block w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
          <input className={cx(INPUT_BOX, 'h-9 py-0 pl-8 text-[13.5px]')} value={keyword} onChange={(e) => setParam('q', e.target.value, '')} placeholder="Restaurant or invoice number" aria-label="Filter invoices" />
        </label>
      </div>

      <Panel bare>
        {list.loading && !list.data ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <Empty
            emoji={view === 'due' ? '✓' : '🧾'}
            title={view === 'due' && !keyword ? 'Every invoice is settled' : 'No invoices here'}
            message={view === 'due' && !keyword ? 'Nothing is waiting on a payment. New invoices appear as renewals come due.' : 'Nothing matches this view. Try another filter.'}
          />
        ) : (
          <InvoiceList invoices={rows} onChange={list.reload} />
        )}
      </Panel>
    </>
  );
}
