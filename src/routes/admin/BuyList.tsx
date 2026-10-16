import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchBuyList, formatQty } from '../../api/inventory';
import type { BuyListItem } from '../../api/inventory';
import { ADMIN_GHOST, Loading, Segmented, useCommand } from '../../components/admin/kit';
import { Block, Num } from '../../components/admin/profile';
import { ChevronLeft, Copy, Send } from '../../components/icons';
import { DISPLAY, cx } from '../../components/ui';
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

  if (list.loading && !list.data) return <Loading label="Working out the list…" />;
  const items = list.data ?? [];
  const total = items.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0);
  const unpriced = items.filter((i) => i.estimatedCost === null).length;
  const when = days === '1' ? 'tomorrow' : `the next ${days} days`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/inventory" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Stock
      </Link>

      <section>
        <h1 className={cx(DISPLAY, 'animate-rise wrap-break-word text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Buy list</h1>
        <p className="mt-5 max-w-[30ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[36ch]">
          {items.length === 0 ? (
            <>Nothing to buy for {when}. The shelf already covers it.</>
          ) : (
            <>
              <Num>{items.length}</Num> {items.length === 1 ? 'item' : 'items'} for {when}
              {total > 0 && (
                <>
                  , about <Num>{formatMoney(total, currency)}</Num>
                </>
              )}
              .
            </>
          )}
        </p>
        <div className="mt-6 animate-rise [animation-delay:160ms]">
          <Segmented label="Cover" value={days} onChange={setDays} options={HORIZONS} />
        </div>
      </section>

      <section aria-label="List at a glance" className="mt-12 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:240ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="Cover">
            <p className={cx(DISPLAY, 'text-[24px]')}>{days === '1' ? 'Tomorrow' : `${days} days`}</p>
          </Cell>
          <Cell title="About">
            <p className={cx(DISPLAY, 'text-[24px] tnum')}>{total > 0 ? formatMoney(total, currency) : '—'}</p>
          </Cell>
          <Cell title="No price yet">
            <p className={cx(DISPLAY, 'text-[24px] tnum', unpriced > 0 && 'text-flame-1')}>{unpriced === 0 ? 'None' : unpriced}</p>
          </Cell>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          {groups.map(([supplier, rows], gi) => {
            const subtotal = rows.reduce((sum, i) => sum + (i.estimatedCost ?? 0), 0);
            const message = orderMessage(supplier, rows);
            return (
              <Block key={supplier} title={supplier} hint={`${rows.length} ${rows.length === 1 ? 'item' : 'items'}`} delay={380 + gi * 60}>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button type="button" className={pill} onClick={() => void run('copy', () => navigator.clipboard.writeText(message), 'Message copied')}>
                    <Copy size={14} /> Copy
                  </button>
                  <a className={pill} href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
                    <Send size={14} /> WhatsApp
                  </a>
                  <a className={pill} href={`viber://forward?text=${encodeURIComponent(message)}`}>
                    <Send size={14} /> Viber
                  </a>
                </div>
                <ol>
                  {rows.map((item, i) => (
                    <li key={item.ingredientId} className="group flex items-baseline justify-between gap-4 border-b border-hairline py-3.5 first:pt-0 last:border-0 last:pb-0">
                      <span className="min-w-0">
                        <span className={cx(DISPLAY, 'block truncate transition-[translate] duration-300 ease-out-quart group-hover:translate-x-1', i === 0 ? 'text-[26px]' : 'text-[20px] font-semibold text-ink-2')}>
                          {item.name}
                        </span>
                        <span className="mt-0.5 block text-[13.5px] text-ink-3">
                          Have {formatQty(item.onHand, item.unit)}
                          {item.expectedUse > 0 ? ` · usually uses ${formatQty(item.expectedUse, item.unit)}` : ' · no usage history yet'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className={cx(DISPLAY, 'block text-[22px] tnum')}>{formatQty(item.toBuy, item.unit)}</span>
                        <span className="text-[13px] text-ink-3 tnum">{item.estimatedCost === null ? 'No price yet' : formatMoney(item.estimatedCost, currency)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {subtotal > 0 && <p className="mt-4 text-right text-[14.5px] font-semibold tnum">About {formatMoney(subtotal, currency)}</p>}
                {supplier === NO_SUPPLIER && (
                  <p className="mt-4 text-[13.5px] leading-relaxed text-ink-3">Name a supplier when the delivery arrives and these items will group under them next time.</p>
                )}
              </Block>
            );
          })}
        </div>

        <div className="grid content-start gap-6">
          {items.length > 0 && (
            <section className="animate-rise rounded-3xl bg-flame-2/12 p-5 ring-1 ring-flame-2/35 ring-inset [animation-delay:320ms] sm:p-6">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
                <span className="size-2 rounded-full bg-flame-2 motion-safe:animate-pulse" /> Next move
              </h2>
              <p className={cx(DISPLAY, 'mt-3 text-[22px] font-semibold leading-snug')}>Send each supplier their list.</p>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
                Copy the message, or open it in WhatsApp or Viber. When it arrives, record the delivery on Stock and enter what you paid, so the next list is priced.
              </p>
              <Link to="/admin/inventory" className={cx(ADMIN_GHOST, 'mt-4 h-11 px-5 text-[14.5px]')}>
                Open Stock
              </Link>
            </section>
          )}

          <Block title="How this list is made" delay={items.length > 0 ? 400 : 320}>
            <p className="text-[14.5px] leading-relaxed text-ink-2">
              Each quantity is what the kitchen usually uses on those days, plus enough to stay above the warning line, less what you already have. The last three weeks of orders count, the most recent most, so it gets better the longer the kitchen runs on Stock. A new ingredient has no history and is simply topped up to its warning line.
            </p>
          </Block>
        </div>
      </div>
    </div>
  );
}

const pill =
  'inline-flex h-8 items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-move hover:bg-surface-3 active:scale-95';

function Cell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-6 py-6">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      {children}
    </div>
  );
}
