import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchEntries } from '../../api/ledger';
import type { LedgerEntry } from '../../api/ledger';
import { Empty, INPUT_BOX, Loading, Perforation, DOCKET_CARD, ADMIN_GHOST } from '../../components/admin/kit';
import { Block, Num } from '../../components/admin/profile';
import { ChevronLeft } from '../../components/icons';
import { CHIP, CHIP_OFF, CHIP_ON, DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import type { Minor, PaymentMethod } from '../../domain/types';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';
import { FlowDialog, Sum, TapeLine, Total } from './Ledger';
import type { Flow } from './Ledger';

const DAY = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const toInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromInput = (v: string) => new Date(`${v}T00:00`);
/** The longest run of days read at once; the API refuses more. */
const MAX_DAYS = 31;

/** Whole days as the API's exclusive-from / inclusive-to pair: midnight just before the first day, the last millisecond of the last. */
const span = (first: Date, last: Date) => ({ from: new Date(DAY(first).getTime() - 1).toISOString(), to: new Date(addDays(DAY(last), 1).getTime() - 1).toISOString() });

const PRESETS = [
  { key: 'today', label: 'Today', days: 0 },
  { key: 'yesterday', label: 'Yesterday', days: 1 },
  { key: 'week', label: 'Last 7 days', days: 6 },
] as const;

/**
 * The books read back by day: pick today, yesterday, a week or any run of days and see every sale,
 * expense and transfer in it. A past close's "Lines" link lands here too, carrying that period's
 * opening balances so the tape can show what the drawer and bank held after each line.
 * The window lives in the URL, so a reload or the back button returns to the same days.
 */
export function LedgerHistory() {
  const { menu } = useDashboard();
  const currency = menu?.restaurant.currency ?? '';
  const money = (v: Minor) => formatMoney(v, currency);
  const [params, setParams] = useSearchParams();

  const today = DAY(new Date());
  const given = params.get('from') && params.get('to') ? { from: params.get('from')!, to: params.get('to')! } : null;
  const preset = !given ? (PRESETS.find((p) => p.key === params.get('days')) ?? PRESETS[0]) : null;
  const range = given ?? span(addDays(today, -(preset?.days ?? 0)), preset?.key === 'yesterday' ? addDays(today, -1) : today);
  const label = given ? (params.get('label') ?? 'Chosen days') : (preset?.label ?? 'Today');
  const base = params.get('cash') && params.get('bank') ? { cash: Number(params.get('cash')), bank: Number(params.get('bank')) } : null;

  const lines = useAsync(() => fetchEntries(range), [range.from, range.to]);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [over, setOver] = useState(false);

  const tape = useMemo(
    () =>
      (lines.data ?? []).reduce<{ entry: LedgerEntry; cash?: Minor; bank?: Minor }[]>((acc, entry) => {
        const prev = acc.at(-1);
        acc.push(base ? { entry, cash: (prev?.cash ?? base.cash) + entry.cashDelta, bank: (prev?.bank ?? base.bank) + entry.bankDelta } : { entry });
        return acc;
      }, []),
    // base is a fresh object each render; its two numbers are the real dependency.
    [lines.data, base?.cash, base?.bank],
  );

  const ins = (lines.data ?? []).filter((e) => e.kind === 'sale' || e.kind === 'income');
  const outs = (lines.data ?? []).filter((e) => e.kind === 'expense');
  const sum = (list: LedgerEntry[], method?: PaymentMethod) => list.filter((e) => !method || e.method === method).reduce((n, e) => n + e.amount, 0);
  const totalIn = sum(ins);
  const totalOut = sum(outs);

  const pickDays = (a: string, b: string) => {
    if (!a || !b) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    const tooLong = fromInput(hi) > addDays(fromInput(lo), MAX_DAYS - 1);
    setOver(tooLong);
    if (tooLong) return;
    const { from, to } = span(fromInput(lo), fromInput(hi));
    setParams({ from, to, label: lo === hi ? lo : `${lo} → ${hi}` });
  };

  const loaded = Boolean(lines.data);

  return (
    <div className="mx-auto max-w-6xl">
      <Link to="/admin/ledger" className="mb-4 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-3 hover:text-ink">
        <ChevronLeft size={15} /> Cash book
      </Link>

      <header>
        <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(36px,6vw,64px)] leading-[0.98] tracking-[-0.03em]')}>Transactions</h1>
        <p className="mt-4 min-h-[2.6em] max-w-[36ch] animate-rise text-[clamp(18px,2.4vw,26px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms]">
          {loaded ? (
            tape.length === 0 ? (
              <>Nothing was recorded for {label.toLowerCase()}.</>
            ) : (
              <>
                {label}: <Num>{money(totalIn)}</Num> in, <Num>{money(totalOut)}</Num> out — <Num>{money(totalIn - totalOut)}</Num> net.
              </>
            )
          ) : null}
        </p>

        <div className="mt-5 flex animate-rise flex-wrap items-center gap-2 [animation-delay:160ms]">
          {PRESETS.map((p) => (
            <button key={p.key} type="button" aria-pressed={preset?.key === p.key} className={cx(CHIP, preset?.key === p.key ? CHIP_ON : CHIP_OFF)} onClick={() => (setParams({ days: p.key }), setFirst(''), setLast(''), setOver(false))}>
              {p.label}
            </button>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-hairline sm:block" aria-hidden />
          <input type="date" aria-label="From day" className={cx(INPUT_BOX, '!h-8.5 !w-auto !py-0')} value={first} max={toInput(today)} onChange={(e) => (setFirst(e.target.value), pickDays(e.target.value, last || e.target.value))} />
          <span className="text-[13px] text-ink-3">to</span>
          <input type="date" aria-label="To day" className={cx(INPUT_BOX, '!h-8.5 !w-auto !py-0')} value={last} max={toInput(today)} onChange={(e) => (setLast(e.target.value), pickDays(first || e.target.value, e.target.value))} />
          <span className={cx('text-[12.5px]', over ? 'font-semibold text-berry' : 'text-ink-3')} role={over ? 'alert' : undefined}>
            {over ? `Pick ${MAX_DAYS} days or fewer.` : `Up to ${MAX_DAYS} days at a time`}
          </span>
        </div>
      </header>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Block title="Totals" hint={label} delay={200}>
          <dl className="grid gap-y-4">
            <Total label="In" value={money(totalIn)} active={flow === 'in'} onClick={() => setFlow(flow === 'in' ? null : 'in')} />
            <Total label="Out" value={money(totalOut)} active={flow === 'out'} onClick={() => setFlow(flow === 'out' ? null : 'out')} />
            <Total label="Net" value={money(totalIn - totalOut)} />
          </dl>
          <div className="my-4 border-t border-hairline" />
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
            <Sum label="Cash in" value={money(sum(ins, 'CASH'))} />
            <Sum label="Cash out" value={money(sum(outs, 'CASH'))} />
            <Sum label="Bank in" value={money(sum(ins, 'CARD'))} />
            <Sum label="Bank out" value={money(sum(outs, 'CARD'))} />
          </dl>
        </Block>

        <section className="animate-rise lg:col-start-1 lg:row-start-1 [animation-delay:260ms]">
          {lines.error ? (
            <Empty emoji="⚠️" title="Couldn't read these days" message={lines.error.message} action={<button type="button" className={ADMIN_GHOST} onClick={lines.reload}>Try again</button>} />
          ) : !loaded ? (
            <Loading label="Reading the tape…" />
          ) : (
            <div className={cx(DOCKET_CARD, 'min-h-56')}>
              <div className="hidden grid-cols-[4.5rem_1fr_7rem_7rem_7rem] gap-x-3 px-6 pt-4 pb-2 text-[10px] font-bold tracking-[0.1em] text-docket-inksoft uppercase sm:grid">
                <span>Time</span>
                <span>Line</span>
                <span className="text-right">Amount</span>
                <span className="text-right">{base ? 'Drawer' : ''}</span>
                <span className="text-right">{base ? 'Bank' : ''}</span>
              </div>
              {tape.length === 0 ? (
                <p className="px-6 py-8 text-[13.5px] text-docket-inksoft">No sales, expenses or transfers fall in these days. Try a wider range.</p>
              ) : (
                <ol>
                  {tape.map(({ entry, cash, bank }, i) => (
                    <li key={entry.id}>
                      {i > 0 && <Perforation />}
                      <TapeLine entry={entry} cash={cash} bank={bank} money={money} busy readOnly />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </section>
      </div>

      {flow && <FlowDialog flow={flow} lines={flow === 'in' ? ins : outs} total={flow === 'in' ? totalIn : totalOut} money={money} onClose={() => setFlow(null)} />}
    </div>
  );
}
