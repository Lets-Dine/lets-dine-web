import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCountSheet, formatQty, submitStockTake } from '../../api/inventory';
import type { StockTakeResult } from '../../api/inventory';
import { ADMIN_GHOST, ADMIN_PRIMARY, Loading, PageTitle, Panel, useCommand } from '../../components/admin/kit';
import { QtyField } from '../../components/admin/QtyField';
import { Alert, Check } from '../../components/icons';
import { cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

/**
 * A blind count. The sheet shows names and units, never what the system expects — so the numbers
 * typed in are what is really on the shelf. Submitting corrects stock to the count and reveals the
 * differences, which are also written to the audit log.
 */
export function StockTake() {
  const { menu } = useDashboard();
  const { busy, run } = useCommand();
  const sheet = useAsync(fetchCountSheet, []);
  const [counts, setCounts] = useState<Record<string, number | ''>>({});
  // Bumped to clear every field after a finished count.
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<StockTakeResult[] | null>(null);
  const currency = menu.restaurant.currency;

  if (sheet.loading && !sheet.data) return <Loading />;
  const rows = sheet.data ?? [];
  const entered = Object.entries(counts).filter((e): e is [string, number] => e[1] !== '');

  const submit = () =>
    void run('take', async () => {
      setResult(await submitStockTake(entered.map(([ingredientId, quantity]) => ({ ingredientId, quantity }))));
    }, 'Count recorded');

  if (result) return <Outcome result={result} currency={currency} onAgain={() => { setResult(null); setCounts({}); setRound((r) => r + 1); sheet.reload(); }} />;

  return (
    <>
      <PageTitle
        title="Count everything"
        purpose="Check the shelves against the system."
        subtitle="Count what is really there. The expected numbers stay hidden until you submit, so the count is honest."
        action={
          <Link to="/admin/inventory" className={ADMIN_GHOST}>
            Back to stock
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Panel>
          <p className="py-4 text-center text-[13.5px] text-ink-3">
            No ingredients to count yet. Add some on the{' '}
            <Link to="/admin/inventory" className="font-semibold text-flame-1">
              Stock page
            </Link>
            .
          </p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          <ol className="grid gap-2 text-[13.5px] text-ink-3 sm:grid-cols-3">
            {['Count each ingredient below. Skip any you are not counting today.', 'Press Submit count at the bottom.', 'Stock is corrected to your numbers, and you see what went missing.'].map((step, i) => (
              <li key={step} className="flex gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-flame/14 text-[12px] font-bold text-flame-1 tnum">{i + 1}</span>
                <span className="leading-snug">{step}</span>
              </li>
            ))}
          </ol>
          <div className="overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
            {rows.map((row) => (
              <div key={`${round}:${row.ingredientId}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-docket-line px-4 py-3 last:border-0 sm:px-5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{row.name}</span>
                <span className="w-56 max-w-full text-ink">
                  <QtyField unit={row.unit} onChange={(q) => setCounts((prev) => ({ ...prev, [row.ingredientId]: q }))} placeholder="Not counted" />
                </span>
              </div>
            ))}
          </div>

          <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3 shadow-lift ring-1 ring-hairline ring-inset sm:p-4">
            <span className="min-w-0 flex-1 text-[13.5px] text-ink-3">
              <span className="font-semibold text-ink tnum">
                {entered.length} of {rows.length}
              </span>{' '}
              counted. Anything left empty stays as it is.
            </span>
            <button type="button" disabled={busy || entered.length === 0} className={ADMIN_PRIMARY} onClick={submit}>
              Submit count
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Outcome({ result, currency, onAgain }: { result: StockTakeResult[]; currency: string; onAgain: () => void }) {
  const off = result.filter((r) => r.difference !== 0).sort((a, b) => Math.abs(b.value ?? b.difference) - Math.abs(a.value ?? a.difference));
  const missingValue = off.reduce((sum, r) => sum + (r.value !== null && r.value < 0 ? -r.value : 0), 0);
  const good = off.length === 0;

  return (
    <>
      <PageTitle title="Count everything" subtitle="Count recorded. Stock now matches what you counted." />

      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-surface p-4 ring-1 ring-hairline ring-inset sm:p-5">
        <span className={cx('mt-0.5 grid size-9 shrink-0 place-items-center rounded-full', good ? 'bg-mint/14 text-mint-ink' : 'bg-gold/16 text-gold-ink')} aria-hidden>
          {good ? <Check size={18} /> : <Alert size={18} />}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight">
            {good ? `All ${result.length} matched` : `${off.length} of ${result.length} were off`}
          </h2>
          <p className="mt-0.5 max-w-[62ch] text-[13.5px] leading-relaxed text-ink-3">
            {good
              ? 'Everything on the shelf was what the system expected.'
              : `${missingValue > 0 ? `About ${formatMoney(missingValue, currency)} of stock is missing. ` : ''}Stock has been corrected to your count, and the differences are in the audit log.`}
          </p>
        </div>
      </div>

      {off.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-2xl bg-docket-surface text-docket-ink ring-1 ring-hairline ring-inset">
          {off.map((r) => (
            <div key={r.ingredientId} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-docket-line px-4 py-3.5 last:border-0 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                <span className="block text-[12.5px] text-docket-inksoft">
                  Expected {formatQty(r.expected, r.unit)} · counted {formatQty(r.counted, r.unit)}
                </span>
              </span>
              <span className={cx('rounded-md px-2 py-0.5 text-[11.5px] font-bold', r.difference < 0 ? 'bg-berry/14 text-berry-ink' : 'bg-mint/14 text-mint-ink')}>
                {r.difference < 0 ? 'Missing' : 'Extra'}
              </span>
              <span className="w-28 text-right text-[16px] font-bold tnum">
                {r.difference > 0 ? '+' : '−'}
                {formatQty(Math.abs(r.difference), r.unit)}
              </span>
              <span className="w-24 text-right text-[13px] text-docket-inksoft tnum">{r.value === null ? '' : formatMoney(Math.abs(r.value), currency)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button type="button" className={ADMIN_PRIMARY} onClick={onAgain}>
          Start another count
        </button>
        <Link to="/admin/inventory" className={ADMIN_GHOST}>
          Back to stock
        </Link>
      </div>
    </>
  );
}
