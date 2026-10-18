import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchWaste, formatQty, wasteLabel } from '../../api/inventory';
import type { WasteTotals } from '../../api/inventory';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { ADMIN_GHOST, Empty, Loading, PANEL, PageTitle } from '../../components/admin/kit';
import { CHIP, CHIP_OFF, CHIP_ON, cx } from '../../components/ui';
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
    <>
      <div className="animate-rise">
        <PageTitle title="Waste" subtitle="What was thrown away, priced from the delivery it came from. Log waste from an ingredient on the Stock page." />
      </div>

      <div className="mb-4 flex animate-rise flex-wrap gap-2 [animation-delay:60ms]" role="group" aria-label="Period">
        {RANGES.map((x) => (
          <button key={x.value} type="button" aria-pressed={range === x.value} onClick={() => setRange(x.value)} className={cx(CHIP, range === x.value ? CHIP_ON : CHIP_OFF)}>
            {x.label}
          </button>
        ))}
      </div>

      {report.error ? (
        <Empty emoji="⚠️" title="Couldn't load the waste report" message={report.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={report.reload}>Try again</button>} />
      ) : !r || report.loading ? (
        <Loading label="Adding up what was thrown away…" />
      ) : r.count === 0 ? (
        <Empty emoji="🌿" title="No waste logged" message="Nothing was thrown away in this period, or none was logged. Use Waste on an ingredient to record it." />
      ) : (
        <div className="grid animate-rise gap-4 [animation-delay:100ms]">
          <section className={cx(PANEL, 'p-4 sm:p-5')} aria-label="Total">
            <p className="text-[13px] text-ink-3">Thrown away</p>
            <p className="text-[28px] font-semibold tracking-tight tnum">{money(r.cost)}</p>
            <p className="text-[13px] text-ink-3">
              {r.count} {r.count === 1 ? 'entry' : 'entries'}
              {r.unpriced > 0 && ` · ${r.unpriced} couldn't be priced (no delivery price on record), so the total is at least this`}
            </p>
          </section>

          <section className={cx(PANEL, 'p-4 sm:p-5')} aria-label="By reason">
            <h2 className="text-[15px] font-semibold">By reason</h2>
            <ul className="mt-3 grid gap-3">
              {r.byReason.map((x) => (
                <li key={x.reason}>
                  <div className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="font-medium">{wasteLabel(x.reason)}</span>
                    <span className="tnum">{money(x.cost)}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-ink/10" role="img" aria-label={`${wasteLabel(x.reason)} ${money(x.cost)}`}>
                    <div className="h-full rounded-full bg-flame-2" style={{ width: `${(x.cost / top) * 100}%` }} />
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{x.count} {x.count === 1 ? 'entry' : 'entries'}{unpriced(x)}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={cx(PANEL, 'p-4 sm:p-5')} aria-label="By ingredient">
            <h2 className="text-[15px] font-semibold">By ingredient</h2>
            <ul className="mt-2 divide-y divide-hairline">
              {r.byIngredient.map((x) => (
                <li key={x.ingredientId} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                  <div className="min-w-0">
                    <Link to={`/admin/inventory?open=${x.ingredientId}`} className="font-semibold hover:underline">{x.name}</Link>
                    <p className="text-[12.5px] text-ink-3">{formatQty(x.quantity, x.unit)} · {x.count} {x.count === 1 ? 'entry' : 'entries'}{unpriced(x)}</p>
                  </div>
                  <span className="shrink-0 tnum">{money(x.cost)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={cx(PANEL, 'p-4 sm:p-5')} aria-label="Latest entries">
            <h2 className="text-[15px] font-semibold">Latest entries</h2>
            <ul className="mt-2 divide-y divide-hairline">
              {r.recent.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 py-2.5 text-[14px]">
                  <div className="min-w-0">
                    <p><span className="font-semibold">{e.ingredientName}</span> · {formatQty(e.quantity, e.unit)} · {wasteLabel(e.reason)}</p>
                    <p className="text-[12.5px] text-ink-3">{when.format(new Date(e.createdAt))}{e.note && ` · ${e.note}`}</p>
                  </div>
                  <span className="shrink-0 tnum text-ink-2">{e.cost === null ? 'not priced' : money(e.cost)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </>
  );
}
