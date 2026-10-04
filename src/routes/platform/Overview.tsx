import { useState } from 'react';
import { Link } from 'react-router-dom';
import { extendTrial, getOverview, remindInvoices } from '../../api/platformConsole';
import type { Overview as OverviewData, QueueAction, QueueItem } from '../../api/platformConsole';
import { useAsync } from '../../state/useAsync';
import { ADMIN_TINY, Change, Empty, Loading, PageTitle, Panel, useCommand } from '../../components/admin/kit';
import { usePageTitle } from '../../state/usePageTitle';
import { Check, ChevronRight } from '../../components/icons';
import { cx } from '../../components/ui';
import { Avatar, Badge, MonthBars, StackBar, clock, relTime, rupees, shortDay } from './kit';
import { SettleForm } from './Settle';

/**
 * Operator home. It opens on the work, not on the numbers: the first thing an
 * operator needs is "who needs me right now", so that queue leads and the
 * revenue picture sits beside it as context.
 */
export function PlatformOverview() {
  usePageTitle('Overview · Platform admin');
  const data = useAsync(getOverview, []);

  if (!data.data) {
    return data.error ? <p className="rounded-2xl bg-berry/10 px-4 py-3 text-[14px] text-berry ring-1 ring-berry/25 ring-inset">{data.error.message}</p> : <Loading label="Reading the platform…" />;
  }
  const o = data.data;
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageTitle title="Overview" subtitle={`${today} · ${o.queue.length === 0 ? 'nothing is waiting on you' : `${o.queue.length} ${o.queue.length === 1 ? 'thing needs' : 'things need'} you`}`} />

      <Pulse o={o} />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.45fr_1fr] lg:items-start">
        <Queue items={o.queue} onChange={data.reload} />

        <div className="grid gap-5">
          <Panel title="Recurring revenue" hint="Monthly, last 12 months">
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-display text-[28px] font-bold leading-none tracking-tight tnum">{rupees(o.mrr)}</span>
              <span className="text-[12.5px] text-ink-3">a month</span>
              <Change value={o.mrrChange} />
            </div>
            <MonthBars data={o.series} />
          </Panel>

          <Panel title="Who pays what" hint="Billing restaurants by plan">
            <StackBar
              parts={o.planMix.map((p, i) => ({
                label: p.name,
                value: p.mrr,
                display: `${p.count} · ${rupees(p.mrr)}`,
                className: ['bg-ink-4/60', 'bg-flame-2', 'bg-flame-3'][i] ?? 'bg-ink-4',
              }))}
            />
          </Panel>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Panel title="Newest restaurants" action={<Link to="/platform/restaurants" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')}>All restaurants <ChevronRight size={13} /></Link>} bare>
          <ul>
            {o.signups.map((t) => (
              <li key={t.id}>
                <Link to={`/platform/restaurants/${t.id}`} className="flex items-center gap-3 border-b border-hairline px-4 py-3 transition-colors duration-150 last:border-0 hover:bg-surface-2/50 sm:px-5">
                  <Avatar name={t.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold">{t.name}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">
                      {t.city} · joined {relTime(t.createdAt)}
                    </span>
                  </span>
                  {t.firstOrderAt === null ? <Badge tone="muted">No order yet</Badge> : <Badge tone="good">Taking orders</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Latest activity" action={<Link to="/platform/activity" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')}>Full log <ChevronRight size={13} /></Link>} bare>
          <ul>
            {o.events.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-ink-4" aria-hidden />
                <span className="min-w-0 flex-1 text-[13.5px]">
                  <span className="font-semibold">{e.action}</span>
                  {e.tenantName && <span className="text-ink-2"> · {e.tenantName}</span>}
                  {e.detail && <span className="block truncate text-[12.5px] text-ink-3">{e.detail}</span>}
                </span>
                <span className="shrink-0 text-[12px] text-ink-4 tnum" title={`${shortDay(e.at)} ${clock(e.at)}`}>
                  {relTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}

/* ── Pulse ─────────────────────────────────────────────────────────── */

function Pulse({ o }: { o: OverviewData }) {
  const cells: { label: string; value: string; sub: ReturnType<typeof Change> | string; to: string }[] = [
    { label: 'Billing restaurants', value: String(o.activeCount), sub: `${o.trialCount} on trial`, to: '/platform/restaurants?status=active' },
    { label: 'Orders this month', value: o.orders.toLocaleString(), sub: <Change value={o.ordersChange} />, to: '/platform/restaurants' },
    { label: 'Collected this month', value: rupees(o.collected), sub: 'Invoices marked paid', to: '/platform/billing?view=paid' },
    { label: 'Waiting to be paid', value: rupees(o.outstanding), sub: o.overdueCount > 0 ? `${o.overdueCount} overdue` : 'Nothing overdue', to: '/platform/billing?view=overdue' },
  ];
  return (
    <section aria-label="Platform at a glance" className="grid grid-cols-2 overflow-hidden rounded-2xl bg-docket-surface ring-1 ring-hairline ring-inset lg:grid-cols-4">
      {cells.map((c, i) => (
        <Link
          key={c.label}
          to={c.to}
          className={cx(
            'block px-4 py-3.5 transition-colors duration-150 hover:bg-surface-2/50 sm:px-5',
            i % 2 === 1 && 'border-l border-hairline',
            i > 1 && 'border-t border-hairline lg:border-t-0',
            i > 0 && 'lg:border-l lg:border-hairline',
          )}
        >
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{c.label}</div>
          <div className="mt-1 truncate text-[20px] font-semibold tracking-tight tnum sm:text-[22px]">{c.value}</div>
          <div className="mt-0.5 text-[12.5px] text-ink-3">{c.sub}</div>
        </Link>
      ))}
    </section>
  );
}

/* ── Queue ─────────────────────────────────────────────────────────── */

function Queue({ items, onChange }: { items: QueueItem[]; onChange: () => void }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <Panel title="Needs you" hint="Most urgent first. Resolve from here or open the restaurant." bare>
      {items.length === 0 ? (
        <Empty
          emoji="✓"
          title="Nothing is waiting on you"
          message="No overdue invoices, no trials about to lapse, no restaurant stuck. New items show up here the moment they appear."
        />
      ) : (
        <ul>
          {shown.map((item) => (
            <QueueRow key={item.id} item={item} onChange={onChange} />
          ))}
          {items.length > 5 && (
            <li className="px-4 py-3 sm:px-5">
              <button type="button" className={cx(ADMIN_TINY, 'text-ink-3 hover:text-ink')} onClick={() => setAll((a) => !a)} aria-expanded={all}>
                {all ? 'Show fewer' : `Show ${items.length - 5} more`}
              </button>
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function QueueRow({ item, onChange }: { item: QueueItem; onChange: () => void }) {
  const { pending, busy, run } = useCommand();
  const [settling, setSettling] = useState(false);

  const act = (action: QueueAction) => {
    if (action === 'settle') setSettling(true);
    if (action === 'remind' && item.invoice) {
      void run('remind', () => remindInvoices([item.invoice!.id]), `Reminder sent to ${item.tenantName}.`).then((ok) => ok && onChange());
    }
    if (action === 'extend') {
      void run('extend', () => extendTrial(item.tenantId, 7), `${item.tenantName}'s trial extended by 7 days.`).then((ok) => ok && onChange());
    }
  };

  return (
    <li className="border-b border-hairline px-4 py-4 last:border-0 sm:px-5">
      <div className="flex items-start gap-3">
        <Avatar name={item.tenantName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Link to={`/platform/restaurants/${item.tenantId}`} className="text-[14.5px] font-semibold hover:underline">
              {item.tenantName}
            </Link>
            <Badge tone={item.tone}>{item.title}</Badge>
          </div>
          <p className="mt-1 max-w-[62ch] text-[13px] leading-snug text-ink-3">
            {item.detail}
            {item.invoice && <span className="text-ink-2"> {item.invoice.number} · {rupees(item.invoice.amount)}</span>}
          </p>
          {!settling && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {item.actions.map((a) =>
                a === 'open' ? (
                  <Link key={a} to={`/platform/restaurants/${item.tenantId}`} className={cx(ADMIN_TINY, 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:text-ink')}>
                    Open
                  </Link>
                ) : (
                  <button
                    key={a}
                    type="button"
                    disabled={busy}
                    onClick={() => act(a)}
                    className={cx(ADMIN_TINY, a === item.actions[0] ? 'bg-flame text-white' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:text-ink')}
                  >
                    {a === 'settle' ? (
                      <>
                        <Check size={13} /> Mark paid
                      </>
                    ) : a === 'remind' ? (
                      pending === 'remind' ? 'Sending…' : 'Send reminder'
                    ) : pending === 'extend' ? (
                      'Extending…'
                    ) : (
                      'Extend 7 days'
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      </div>
      {settling && item.invoice && (
        <SettleForm
          className="mt-3 sm:ml-12"
          invoice={item.invoice}
          onCancel={() => setSettling(false)}
          onDone={() => {
            setSettling(false);
            onChange();
          }}
        />
      )}
    </li>
  );
}
