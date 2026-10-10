import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBuyList, formatQty } from '../../api/inventory';
import type { BuyListItem } from '../../api/inventory';
import { ADMIN_TINY, Loading, PageTitle, Panel, Segmented, useCommand } from '../../components/admin/kit';
import { Check, Copy, Send } from '../../components/icons';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const HORIZONS = [
  { value: '1', label: 'Tomorrow' },
  { value: '2', label: '2 days' },
  { value: '3', label: '3 days' },
];

const NO_SUPPLIER = 'No supplier yet';

/** The message a supplier gets: plain lines they can read in any chat app. */
function orderMessage(supplier: string, items: BuyListItem[]): string {
  const lines = items.map((i) => `• ${i.name}: ${formatQty(i.toBuy, i.unit)}`);
  const greeting = supplier === NO_SUPPLIER ? 'Hello,' : `Hello ${supplier},`;
  return `${greeting}\nPlease send:\n${lines.join('\n')}\nThank you!`;
}

/**
 * What to order, worked out from what the kitchen used on the same weekdays of the last three weeks, newest counting most.
 * Grouped by the supplier each thing was last bought from, with a message ready to send them.
 */
export function BuyList() {
  const { menu } = useDashboard();
  const { run } = useCommand();
  const [days, setDays] = useState('1');
  const list = useAsync(() => fetchBuyList(Number(days)), [days]);
  const currency = menu.restaurant.currency;

  const groups = useMemo(() => {
    const map = new Map<string, BuyListItem[]>();
    for (const item of list.data ?? []) {
      const key = item.supplier ?? NO_SUPPLIER;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map];
  }, [list.data]);

  if (list.loading && !list.data) return <Loading />;
  const items = list.data ?? [];
  const total = items.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0);
  const unpriced = items.filter((i) => i.estimatedCost === null).length;
  const when = days === '1' ? 'tomorrow' : `the next ${days} days`;

  return (
    <>
      <PageTitle
        title="Buy list"
        purpose="What to order next."
        subtitle="Worked out from what the kitchen usually uses, ready to send to each supplier."
        action={<Segmented label="Cover" value={days} onChange={setDays} options={HORIZONS} />}
      />

      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset sm:p-5">
        <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', items.length === 0 ? 'bg-mint/14 text-mint-ink' : 'bg-flame/14 text-flame-1')} aria-hidden>
          <Check size={18} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">
            {items.length === 0
              ? `Nothing to buy for ${when}`
              : `${items.length} item${items.length === 1 ? '' : 's'} to buy for ${when}${total > 0 ? ` — about ${formatMoney(total, currency)}` : ''}`}
          </h2>
          <p className="mt-0.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            {items.length === 0
              ? 'What’s on the shelf covers the expected use, and every ingredient stays above its warning line.'
              : `Each quantity is what the kitchen usually uses on those days, plus enough to stay above the warning line, less what you have.${unpriced > 0 ? ` ${unpriced} ${unpriced === 1 ? 'has' : 'have'} no known price yet.` : ''}`}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <ol className="mb-4 grid gap-2 text-[13.5px] text-ink-3 sm:grid-cols-2">
          {['Send each supplier their message below. Copy it, or open it in WhatsApp or Viber.', 'When the order arrives, open Stock and press Delivery arrived on each item. Enter what you paid so the next list is priced.'].map((step, i) => (
            <li key={step} className="flex gap-2.5">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-flame/14 text-[12px] font-bold text-flame-1 tnum">{i + 1}</span>
              <span className="leading-snug">{step}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-4">
        {groups.map(([supplier, rows]) => {
          const subtotal = rows.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0);
          const message = orderMessage(supplier, rows);
          return (
            <section key={supplier} aria-label={supplier}>
              <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
                <h3 className="min-w-0 flex-1 text-[14px] font-semibold">
                  {supplier} <span className="font-normal text-ink-4">· {rows.length}</span>
                </h3>
                <button
                  type="button"
                  className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                  onClick={() => void run('copy', () => navigator.clipboard.writeText(message), 'Message copied')}
                >
                  <Copy size={13} /> Copy message
                </button>
                <a
                  className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')}
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Send size={13} /> WhatsApp
                </a>
                <a className={cx(ADMIN_TINY, 'bg-surface-2 ring-1 ring-hairline ring-inset')} href={`viber://forward?text=${encodeURIComponent(message)}`}>
                  <Send size={13} /> Viber
                </a>
              </div>
              <div className="overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
                {rows.map((item) => (
                  <div key={item.ingredientId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-docket-line px-4 py-3.5 last:border-0 sm:px-5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{item.name}</span>
                      <span className="block text-[12.5px] text-docket-inksoft">
                        Have {formatQty(item.onHand, item.unit)}
                        {item.expectedUse > 0 ? ` · usually uses ${formatQty(item.expectedUse, item.unit)}` : ' · no usage history yet'}
                      </span>
                    </span>
                    <span className="text-[16px] font-bold tnum">Buy {formatQty(item.toBuy, item.unit)}</span>
                    <span className="w-24 text-right text-[13px] text-docket-inksoft tnum">{item.estimatedCost === null ? '—' : formatMoney(item.estimatedCost, currency)}</span>
                  </div>
                ))}
                {subtotal > 0 && (
                  <div className="flex justify-end bg-docket-line/40 px-4 py-2.5 text-[13px] font-semibold tnum sm:px-5">About {formatMoney(subtotal, currency)}</div>
                )}
              </div>
            </section>
          );
        })}

        {groups.some(([supplier]) => supplier === NO_SUPPLIER) && (
          <p className="px-1 text-[13px] text-ink-3">Name a supplier when you receive a delivery and these items will group under them next time.</p>
        )}

        <Panel variant="subtle">
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-ink-3">
            Based on the last three weeks of orders, the most recent counting most, so it gets better the longer the kitchen runs on Stock. A new ingredient has no history and is simply topped up to its warning line.{' '}
            <Link to="/admin/inventory" className="font-semibold text-flame-1">
              Receive what arrives on the Stock page.
            </Link>
          </p>
        </Panel>
      </div>
    </>
  );
}
