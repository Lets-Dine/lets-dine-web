import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWaste, formatQty, wasteLabel } from '../../api/inventory';
import type { WasteTotals } from '../../api/inventory';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, Empty, Loading } from '../../components/admin/kit';
import { Block, Step } from '../../components/admin/profile';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { useDashboard } from './AdminLayout';

const DAY = 86_400_000;
const RANGES = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' },
] as const;
type Range = (typeof RANGES)[number]['value'];

const rangeOf = (r: Range) => {
  const to = new Date();
  if (r === 'month') return { from: new Date(to.getFullYear(), to.getMonth(), 1), to };
  return { from: new Date(to.getTime() - Number(r) * DAY), to };
};

const when = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** What was thrown away, in rupees: by reason, by ingredient, and the latest entries. Entries that could not be priced are counted apart, never as free. */
export function Waste() {
  const { menu } = useDashboard();
  const money = (v: number) => formatMoney(v, menu.restaurant.currency);
  const [range, setRange] = useState<Range>('30');
  const report = useAsync(() => fetchWaste(rangeOf(range)), [range]);

  const r = report.data;
  const top = r ? Math.max(1, ...r.byReason.map((x) => x.cost)) : 1;
  const unpriced = (t: WasteTotals) => (t.unpriced > 0 ? ` · ${t.unpriced} not priced` : '');

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Waste</h1>
      <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[40ch]">
        What was thrown away, priced from the delivery it came from. Log waste from an ingredient on the Stock page.
      </p>

      <div className="mt-5 flex animate-rise flex-wrap items-center gap-2 [animation-delay:120ms]" role="group" aria-label="Period">
        {RANGES.map((x) => (
          <button key={x.value} type="button" aria-pressed={range === x.value} onClick={() => setRange(x.value)} className={cx(CHIP, range === x.value ? CHIP_ON : CHIP_OFF)}>
            {x.label}
          </button>
        ))}
      </div>

      {report.error ? (
        <div className="mt-10"><Empty emoji="⚠️" title="Couldn't load the waste report" message={report.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={report.reload}>Try again</button>} /></div>
      ) : !r || report.loading ? (
        <div className="mt-10"><Loading label="Adding up what was thrown away…" /></div>
      ) : r.count === 0 ? (
        <div className="mt-10"><Empty emoji="🌿" title="No waste logged" message="Nothing was thrown away in this period, or none was logged. Use Waste on an ingredient to record it." /></div>
      ) : (
        <>
          <section aria-label="The three answers" className="mt-10 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
            <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
              <Cell title="Thrown away" sub={r.unpriced > 0 ? 'At least this — some entries have no price' : 'Priced from deliveries'} bad>{money(r.cost)}</Cell>
              <Cell title="Entries" sub="Logged in this period">{String(r.count)}</Cell>
              <Cell title="Not priced" sub="No delivery price on record">{String(r.unpriced)}</Cell>
            </div>
          </section>

          <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-6">
              <Block title="By ingredient" hint="Biggest cost first" delay={260}>
                <ul className="border-t border-hairline">
                  {r.byIngredient.map((x) => (
                    <li key={x.ingredientId} className="flex items-baseline justify-between gap-3 border-b border-hairline py-3.5 text-[14.5px] last:border-0">
                      <div className="min-w-0">
                        <Link to={`/admin/inventory?open=${x.ingredientId}`} className="font-medium hover:underline">{x.name}</Link>
                        <p className="text-[13px] text-ink-3">{formatQty(x.quantity, x.unit)} · {x.count} {x.count === 1 ? 'entry' : 'entries'}{unpriced(x)}</p>
                      </div>
                      <span className="shrink-0 font-semibold tnum">{money(x.cost)}</span>
                    </li>
                  ))}
                </ul>
              </Block>

              <Block title="Latest entries" delay={320}>
                <ul className="border-t border-hairline">
                  {r.recent.map((e, i) => (
                    <Step
                      key={e.id}
                      label={`${e.ingredientName} · ${formatQty(e.quantity, e.unit)} · ${wasteLabel(e.reason)}`}
                      note={`${when.format(new Date(e.createdAt))}${e.note ? ` · ${e.note}` : ''}`}
                      value={e.cost === null ? 'not priced' : money(e.cost)}
                      delay={320 + 140 + Math.min(i, 12) * 45}
                    />
                  ))}
                </ul>
              </Block>
            </div>

            <div className="grid content-start gap-6">
              <Block title="By reason" delay={300}>
                <ul className="border-t border-hairline">
                  {r.byReason.map((x, i) => (
                    <Step
                      key={x.reason}
                      label={wasteLabel(x.reason)}
                      note={`${x.count} ${x.count === 1 ? 'entry' : 'entries'}${unpriced(x)}`}
                      value={money(x.cost)}
                      bar={x.cost / top}
                      share={r.cost > 0 ? `${((x.cost / r.cost) * 100).toFixed(1)}%` : '—'}
                      delay={300 + 140 + i * 45}
                    />
                  ))}
                </ul>
              </Block>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ title, sub, bad, children }: { title: string; sub: string; bad?: boolean; children: string }) {
  return (
    <div className="px-6 py-6">
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', bad && 'text-berry-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}
