import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fetchProfitLoss } from '../../api/finance';
import type { ProfitLoss } from '../../api/finance';
import { Empty, INPUT_BOX, Loading } from '../../components/admin/kit';
import { Block, Num, Result, Step, useCountUp } from '../../components/admin/profile';
import { Alert } from '../../components/icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

type Preset = 'month' | 'last' | 'custom';
const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'last', label: 'Last month' },
  { value: 'custom', label: 'Custom dates' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayStart = (v: string) => new Date(`${v}T00:00`);
/** `to` is exclusive, so a picked end day runs to the start of the next. */
const nextDay = (v: string) => {
  const d = dayStart(v);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
};
const prettyDay = (v: string) => dayStart(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function presetDays(preset: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const now = new Date();
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

/** Delay for the nth line of a block that itself rises in at `block` ms, so lines follow one after another. */
const at = (block: number, n: number) => block + 140 + Math.min(n, 12) * 45;

const pct = (part: number, whole: number) => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');

/**
 * Revenue less what it cost to earn, laid out as a sum a person can follow top to bottom — money in, cost of
 * food, running costs, what is left. Sales count the day they were billed, costs the day they were posted,
 * and tax comes out before anything is called revenue. Same language as the customer page: a big plain
 * headline, a strip of the three answers, then a block per step.
 */
export function ProfitLossPage() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const currency = menu?.restaurant.currency ?? '';
  const money = (v: number) => formatMoney(v, currency);

  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState(presetDays('month'));
  const days = preset === 'custom' ? custom : presetDays(preset);
  const branchId = staff.branchId;
  const branchName = staff.branches?.find((b) => b.id === branchId)?.name ?? 'This branch';

  const report = useAsync(() => {
    if (!branchId || !days.from || !days.to) return Promise.resolve(null);
    return fetchProfitLoss({ from: dayStart(days.from).toISOString(), to: nextDay(days.to), branchId });
  }, [branchId, days.from, days.to]);

  const r = report.data;
  const nothing = r && r.sales + r.tax === 0 && r.expenses.length === 0 && r.stockPurchases === 0 && r.stockOpening === 0 && r.stockClosing === 0;

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Profit &amp; loss</h1>

      <div className="mt-5 flex animate-rise flex-wrap items-center gap-2 [animation-delay:80ms]" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" aria-pressed={preset === p.value} className={cx(CHIP, preset === p.value ? CHIP_ON : CHIP_OFF)} onClick={() => setPreset(p.value)}>
            {p.label}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="flex items-center gap-2 text-[13px] text-ink-3">
            <input type="date" aria-label="From" className={INPUT_BOX} value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            to
            <input type="date" aria-label="To" className={INPUT_BOX} value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </span>
        )}
      </div>

      {report.loading && !r && <div className="mt-10"><Loading label="Adding up the books…" /></div>}
      {report.error && <div className="mt-10"><Empty emoji="⚠️" title="Couldn't read the books" message={report.error.message} /></div>}
      {nothing && <div className="mt-10"><Empty emoji="🧾" title="Nothing recorded in this period" message="No sales, purchases or expenses fall in these dates. Try a wider range." /></div>}
      {r && !nothing && <Report r={r} money={money} branchName={branchName} range={`${prettyDay(days.from)} – ${prettyDay(days.to)}`} stale={report.loading} />}
    </div>
  );
}

function Report({ r, money, branchName, range, stale }: { r: ProfitLoss; money: (v: number) => string; branchName: string; range: string; stale: boolean }) {
  const kept = useCountUp(Math.abs(r.netProfit));
  const revenue = useCountUp(Math.max(r.revenue, 0));
  const loss = r.netProfit < 0;
  const costs = Math.max(r.cogs, 0) + r.operatingExpenses;
  const missing = r.unpricedItems > 0;

  return (
    <div className={cx('transition-opacity', stale && 'opacity-60')}>
      <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:120ms] sm:max-w-[40ch]">
        {r.revenue <= 0 ? (
          <>{branchName} took no revenue in {range}, and had <Num>{money(costs)}</Num> of costs.</>
        ) : loss ? (
          <>{branchName} spent <Num>{money(kept)}</Num> more than it earned on <Num>{money(revenue)}</Num> of revenue, {range}.</>
        ) : (
          <>{branchName} kept <span className="text-mint-ink tnum">{money(kept)}</span> of <Num>{money(revenue)}</Num> revenue — {pct(r.netProfit, r.revenue)} — {range}.</>
        )}
      </p>

      {missing && (
        <div role="note" className="mt-8 flex animate-rise items-start gap-3 rounded-2xl bg-berry/14 px-5 py-4 text-[15px] text-berry-ink ring-1 ring-berry/40 ring-inset [animation-delay:160ms]">
          <Alert size={20} className="mt-0.5 shrink-0" />
          <p>
            {r.unpricedItems} ingredient{r.unpricedItems === 1 ? ' has' : 's have'} no price on record, so the cost of food is too low and profit looks better than it is. Enter the cost when{' '}
            <Link to="/admin/inventory" className="font-semibold underline underline-offset-2">receiving stock</Link>.
          </p>
        </div>
      )}

      <section aria-label="The three answers" className="mt-10 animate-rise overflow-hidden rounded-[28px] bg-surface-2 ring-1 ring-hairline-strong ring-inset [animation-delay:200ms]">
        <div className="grid divide-y divide-hairline md:grid-cols-3 md:divide-x md:divide-y-0">
          <Cell title="Revenue" sub="Sales after tax and refunds">{money(r.revenue)}</Cell>
          <Cell title="Costs" sub={`Food ${money(Math.max(r.cogs, 0))} + running ${money(r.operatingExpenses)}`}>{money(costs)}</Cell>
          <Cell title={loss ? 'Loss' : 'Profit'} sub={r.netMargin === null ? 'No revenue to compare to' : `${pct(r.netProfit, r.revenue)} of revenue`} tone={loss ? 'bad' : 'good'} alert={loss}>
            {money(r.netProfit)}
          </Cell>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="grid content-start gap-6">
          <Block title="Money in" hint="From the bills" delay={260}>
            <ul className="border-t border-hairline">
              <Step label="Total billed" note="What customers were charged — food, service charge and tax" value={money(r.sales + r.tax)} delay={at(260, 0)} />
              <Step op="−" label="Tax collected" note="Belongs to the tax office, so never revenue" value={money(r.tax)} delay={at(260, 1)} />
              <Step op="−" label="Refunds" note="Money handed back to customers" value={money(r.refunds)} delay={at(260, 2)} />
            </ul>
            <Result label="Revenue" value={money(r.revenue)} delay={at(260, 3)} />
          </Block>

          <Block title="Cost of food" hint="What left the shelves" delay={320}>
            <ul className="border-t border-hairline">
              <Step label="Stock at the start" note="Value of what was on the shelves on the first day" value={money(r.stockOpening)} delay={at(320, 0)} />
              <Step op="+" label="Bought" note="Deliveries and transfers received, paid or on credit" value={money(r.stockPurchases)} delay={at(320, 1)} />
              {r.stockOut > 0 && <Step op="−" label="Sent away" note="Returned to suppliers or moved to another branch, net of any refund" value={money(r.stockOut)} delay={at(320, 2)} />}
              <Step op="−" label="Stock at the end" note="Value of what is left on the last day" value={money(r.stockClosing)} delay={at(320, 3)} />
            </ul>
            <Result label="Cost of food" value={money(r.cogs)} note={r.waste > 0 ? `Includes ${money(r.waste)} thrown away` : undefined} delay={at(320, 4)} />
            <Result label="Gross profit" value={money(r.grossProfit)} note={`Revenue less cost of food · ${pct(r.grossProfit, r.revenue)} of revenue`} delay={at(320, 5)} />
          </Block>

          <Block title="Running costs" hint="From the cash book expenses" delay={380}>
            {r.expenses.length === 0 ? (
              <p className="text-[14px] text-ink-3">No expenses were recorded in this period.</p>
            ) : (
              <ul className="border-t border-hairline">
                {r.expenses.map((e, i) => (
                  <Step key={e.category} delay={at(380, i)} op="−" label={e.category} value={money(e.amount)} bar={r.expenses[0].amount > 0 ? e.amount / r.expenses[0].amount : 0} share={pct(e.amount, r.operatingExpenses)} />
                ))}
              </ul>
            )}
            <Result label="Running costs" value={money(r.operatingExpenses)} delay={at(380, r.expenses.length)} />
            <Result label="Net profit" value={money(r.netProfit)} note="Gross profit less running costs" tone={loss ? 'bad' : 'good'} big delay={at(380, r.expenses.length + 1)} />
          </Block>
        </div>

        <div className="grid content-start gap-6">
          <Block title="Where the revenue went" delay={300}>
            <Split r={r} money={money} />
          </Block>

          <Block title="How this is worked out" delay={360}>
            <ul className="list-disc space-y-3 pl-5 text-[14px] leading-relaxed text-ink-3">
              <li>Sales count on the day the bill was made, including credit sales still owed. Collecting the money later changes nothing here.</li>
              <li>
                Food is costed from stock: what you had, plus what you bought, less what is left. Waste, staff meals and spoilage are included without being entered twice. It is only as accurate as your stock counts —{' '}
                <Link to="/admin/inventory/count" className="font-semibold text-flame-1">count stock</Link> at the end of the period.
              </li>
              <li>
                Paying a supplier is not a running cost; the food shows up when it is used. Rent, wages and the like are the expenses in the{' '}
                <Link to="/admin/ledger" className="font-semibold text-flame-1">cash book</Link>.
              </li>
            </ul>
          </Block>
        </div>
      </div>
    </div>
  );
}

function Cell({ title, sub, tone, alert, children }: { title: string; sub: string; tone?: 'good' | 'bad'; alert?: boolean; children: ReactNode }) {
  return (
    <div className={cx('px-6 py-6', alert && 'bg-berry/14')}>
      <h2 className="mb-3 text-[13px] font-semibold text-ink-3">{title}</h2>
      <p className={cx(DISPLAY, 'text-[clamp(28px,3.4vw,38px)] leading-none tnum', tone === 'bad' && 'text-berry-ink', tone === 'good' && 'text-mint-ink')}>{children}</p>
      <p className="mt-2 text-[13.5px] text-ink-3">{sub}</p>
    </div>
  );
}

/** Food, running costs and what was kept, side by side as parts of the revenue — each labelled, never colour alone. */
function Split({ r, money }: { r: ProfitLoss; money: (v: number) => string }) {
  const food = Math.max(r.cogs, 0);
  const running = r.operatingExpenses;
  const kept = Math.max(r.netProfit, 0);
  const spread = food + running + kept;
  const w = (v: number) => `${(v / spread) * 100}%`;
  const loss = r.netProfit < 0;
  if (spread <= 0) return <p className="text-[14px] text-ink-3">Nothing to split yet.</p>;

  const rows = [
    { swatch: 'bg-flame-2', label: 'Food', value: food },
    { swatch: 'bg-gold', label: 'Running costs', value: running },
    { swatch: loss ? 'bg-berry' : 'bg-mint', label: loss ? 'Loss' : 'Profit', value: loss ? r.netProfit : kept },
  ];
  return (
    <>
      <div role="img" aria-label={rows.map((x) => `${x.label} ${money(x.value)}`).join(', ')} className="flex h-4 overflow-hidden rounded-full bg-ink/8">
        <span className="block origin-left animate-grow-x bg-flame-2" style={{ width: w(food) }} />
        <span className="block origin-left animate-grow-x bg-gold [animation-delay:80ms]" style={{ width: w(running) }} />
        <span className="block origin-left animate-grow-x bg-mint [animation-delay:160ms]" style={{ width: w(kept) }} />
      </div>
      <dl className="mt-4 border-t border-hairline">
        {rows.map((x, i) => (
          <div key={x.label} style={{ animationDelay: `${440 + i * 60}ms` }} className="flex animate-rise items-baseline gap-2.5 border-b border-hairline py-3 last:border-0">
            <span aria-hidden className={cx('size-2.5 shrink-0 rounded-full', x.swatch)} />
            <dt className="text-[14px] text-ink-2">{x.label}</dt>
            <dd className="ml-auto text-right">
              <span className="text-[15px] font-semibold tnum">{money(x.value)}</span>
              <span className="ml-2 inline-block w-14 text-[12.5px] text-ink-4 tnum">{pct(x.value, r.revenue)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}
