import { useEffect, useMemo, useRef, useState } from 'react';
import { addExpense, closeLedger, deleteExpense, fetchCloses, fetchEntries, fetchLedger, reopenLedger } from '../../api/ledger';
import type { LedgerEntry } from '../../api/ledger';
import { ADMIN_GHOST, ADMIN_PRIMARY, ADMIN_TINY, Confirm, DOCKET_CARD, Field, Loading, MoneyInput, PageTitle, Panel, Perforation, Segmented, TextInput, useCommand } from '../../components/admin/kit';
import { X } from '../../components/icons';
import { clockTime, relativeTime } from '../../components/time';
import { formatMoney } from '../../domain/money';
import type { Minor, PaymentMethod } from '../../domain/types';
import { can } from '../../domain/permissions';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Bank' },
];
const DIRECTIONS: { value: 'DEPOSIT' | 'WITHDRAWAL'; label: string }[] = [
  { value: 'DEPOSIT', label: 'Drawer → Bank' },
  { value: 'WITHDRAWAL', label: 'Bank → Drawer' },
];
const CATEGORY_HINTS = {
  EXPENSE: ['Stock', 'Salaries', 'Rent', 'Utilities', 'Maintenance', 'Other'],
  INCOME: ['Deposit', 'Cash top-up', 'Supplier refund', 'Other'],
};

/** Which composer is open under the tape; none until the cashier asks for one. */
type Panel = null | 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'close';

/** Which side of the period is open under the totals. */
type Flow = 'in' | 'out';

/** What a line is grouped under in the breakdown: sales by how they were paid, anything else by its category. */
function sourceOf(e: LedgerEntry): string {
  return e.kind === 'sale' ? `Sales · ${e.method === 'CASH' ? 'Cash' : 'Bank'}` : e.label;
}

function breakdown(lines: LedgerEntry[]): { name: string; total: Minor; count: number }[] {
  const groups = new Map<string, { name: string; total: Minor; count: number }>();
  for (const e of lines) {
    const g = groups.get(sourceOf(e)) ?? { name: sourceOf(e), total: 0, count: 0 };
    g.total += e.amount;
    g.count += 1;
    groups.set(g.name, g);
  }
  const sorted = [...groups.values()].sort((a, b) => b.total - a.total);
  if (sorted.length <= SLICE_COLORS.length) return sorted;
  // The palette only validates for a handful of hues — the tail folds into one grey slice rather than inventing more.
  const rest = sorted.slice(SLICE_COLORS.length);
  return [...sorted.slice(0, SLICE_COLORS.length), { name: 'Other', total: rest.reduce((n, g) => n + g.total, 0), count: rest.reduce((n, g) => n + g.count, 0) }];
}

/** Categorical slots in fixed order (validated against the dark surface); the grey tail is "Other". */
const SLICE_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const OTHER_COLOR = 'var(--color-ink-4)';

/**
 * The open period read line by line, the way a cashier's tape reads: day opened with so much,
 * then each sale, expense and transfer as it happened, with what the drawer and the bank hold
 * after it. The forms for adding a line and closing sit below the tape, where the next line would go.
 */
export function Ledger() {
  const { menu } = useDashboard();
  const currency = menu?.restaurant.currency ?? '';
  const money = (v: Minor) => formatMoney(v, currency);
  const { run, busy } = useCommand();
  const staff = useStaff();

  const summary = useAsync(fetchLedger, []);
  const entries = useAsync(fetchEntries, []);
  const closes = useAsync(() => fetchCloses(), []);
  const reload = () => {
    summary.reload();
    entries.reload();
    closes.reload();
  };

  const [panel, setPanel] = useState<Panel>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [amount, setAmount] = useState<Minor>(0);
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [counted, setCounted] = useState<Minor>(0);
  const [bankCounted, setBankCounted] = useState<Minor>(0);
  const [closeNote, setCloseNote] = useState('');
  // Remounts MoneyInput, which keeps its own text, after a submit.
  const [formKey, setFormKey] = useState(0);

  // Running drawer and bank balance after each line.
  const tape = useMemo(
    () =>
      (entries.data ?? []).reduce<{ entry: LedgerEntry; cash: Minor; bank: Minor }[]>((lines, entry) => {
        const prev = lines.at(-1);
        lines.push({ entry, cash: (prev?.cash ?? 0) + entry.cashDelta, bank: (prev?.bank ?? 0) + entry.bankDelta });
        return lines;
      }, []),
    [entries.data],
  );

  const s = summary.data;
  if (!s) return summary.error ? <p className="text-[13px] text-berry">{summary.error.message}</p> : <Loading />;
  const variance = counted - s.closingExpected;
  const bankVariance = bankCounted - s.bankExpected;
  // Cash and bank together — what the period took in and paid out, whatever the drawer holds. Transfers only move money between the two.
  const totalIn = s.cashSales + s.cardSales + s.cashIncome + s.cardIncome;
  const totalOut = s.cashExpenses + s.cardExpenses;
  const flowLines = flow ? (entries.data ?? []).filter((e) => (flow === 'in' ? e.kind === 'sale' || e.kind === 'income' : e.kind === 'expense')) : [];

  const submitExpense = async () => {
    if (panel !== 'INCOME' && panel !== 'EXPENSE' && panel !== 'TRANSFER') return;
    const draft =
      panel === 'TRANSFER'
        ? { kind: direction, amount, method: 'CASH' as const, category: 'Transfer', note: note.trim() }
        : { kind: panel, amount, method, category: category.trim(), note: note.trim() };
    const ok = await run('expense', () => addExpense(draft), panel === 'INCOME' ? 'Income recorded' : panel === 'EXPENSE' ? 'Expense recorded' : 'Transfer recorded');
    if (!ok) return;
    setPanel(null);
    setAmount(0);
    setCategory('');
    setNote('');
    setFormKey((k) => k + 1);
    reload();
  };

  const submitClose = async () => {
    const ok = await run('close', () => closeLedger(counted, bankCounted, closeNote.trim()), s.needsOpening ? 'Opening balances saved' : 'Books closed');
    if (!ok) return;
    setPanel(null);
    setCounted(0);
    setBankCounted(0);
    setCloseNote('');
    setFormKey((k) => k + 1);
    reload();
  };

  const readout = (diff: number, entered: Minor, expected: Minor, what: string) => (
    <p className={entered === 0 || diff === 0 ? 'text-[13px] text-ink-3' : diff < 0 ? 'text-[13px] font-medium text-berry' : 'text-[13px] font-medium text-ink'}>
      {entered === 0 ? `Expected ${money(expected)}` : diff === 0 ? `${what} matches.` : `${what} ${diff < 0 ? 'short' : 'over'} by ${money(Math.abs(diff))}`}
    </p>
  );

  const closeForm = (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Field label={s.needsOpening ? 'Cash in the drawer' : 'Counted cash'}>
            <MoneyInput key={`c${formKey}`} value={counted || ''} onChange={setCounted} currency={currency} />
          </Field>
          {!s.needsOpening && readout(variance, counted, s.closingExpected, 'Drawer')}
        </div>
        <div className="space-y-1.5">
          <Field label={s.needsOpening ? 'Bank balance' : 'Bank balance now'} hint={s.needsOpening ? 'Card and online money, as the bank shows it' : undefined}>
            <MoneyInput key={`b${formKey}`} value={bankCounted || ''} onChange={setBankCounted} currency={currency} />
          </Field>
          {!s.needsOpening && readout(bankVariance, bankCounted, s.bankExpected, 'Bank')}
        </div>
      </div>
      <Field label="Note">
        <TextInput value={closeNote} onChange={setCloseNote} maxLength={300} placeholder="Optional" />
      </Field>
      <button type="button" className={ADMIN_PRIMARY} disabled={busy || (s.needsOpening && counted + bankCounted <= 0)} onClick={submitClose}>
        {s.needsOpening ? 'Open the day' : 'Close & start next period'}
      </button>
    </div>
  );

  if (s.needsOpening) {
    return (
      <>
        <PageTitle title="Cash book" subtitle="Start with what is in the drawer and the bank — every sale, expense and transfer after it is tracked line by line, against both." />
        <Panel title="Open the day" className="max-w-md">
          {closeForm}
        </Panel>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Cash book" subtitle={s.periodStart ? `This period · opened ${relativeTime(s.periodStart)}` : undefined} />

      <div className={DOCKET_CARD}>
        {entries.loading && !entries.data ? (
          <Loading label="Reading the tape…" />
        ) : (
          <>
            <div className="hidden grid-cols-[4.5rem_1fr_7rem_7rem_7rem] gap-x-3 px-6 pt-4 pb-2 text-[10.5px] font-bold tracking-[0.1em] text-docket-inksoft uppercase sm:grid">
              <span>Time</span>
              <span>Line</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Drawer</span>
              <span className="text-right">Bank</span>
            </div>
            <ol>
              {tape.map(({ entry: e, cash, bank }, i) => (
                <li key={e.id}>
                  {i > 0 && <Perforation />}
                  <TapeLine
                    entry={e}
                    cash={cash}
                    bank={bank}
                    money={money}
                    busy={busy}
                    onRemove={() => run(`del${e.id}`, () => deleteExpense(e.id), 'Line removed').then((ok) => ok && reload())}
                  />
                </li>
              ))}
              {tape.length === 1 && (
                <li>
                  <Perforation />
                  <p className="px-6 py-6 text-[13px] text-docket-inksoft">Nothing yet. Sales land here as tables are settled; add income, expenses or a transfer below.</p>
                </li>
              )}
            </ol>
          </>
        )}

        <Perforation thick />
        <dl className="grid grid-cols-3 gap-x-6 px-6 pt-4">
          <Total label="Total in" value={money(totalIn)} active={flow === 'in'} onClick={() => setFlow(flow === 'in' ? null : 'in')} />
          <Total label="Total out" value={money(totalOut)} active={flow === 'out'} onClick={() => setFlow(flow === 'out' ? null : 'out')} />
          <Total label="Net" value={money(totalIn - totalOut)} />
        </dl>
        <div className="py-3">
          <Perforation />
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 px-6 text-[13px] sm:grid-cols-4">
          <Sum label="Cash in" value={money(s.cashSales + s.cashIncome)} />
          <Sum label="Cash out" value={money(s.cashExpenses)} />
          <Sum label="Bank in" value={money(s.cardSales + s.cardIncome)} />
          <Sum label="Bank out" value={money(s.cardExpenses)} />
        </dl>
        <div className="mt-3">
          <Perforation />
        </div>
        <dl className="grid gap-y-1 px-6 pt-3 text-[13.5px]">
          <Held label="Opened with" value={money(s.opening + s.bankOpening)} />
          <Held label="Drawer should hold" value={money(s.closingExpected)} />
          <Held label="Bank should hold" value={money(s.bankExpected)} />
        </dl>
        <div className="flex items-baseline justify-between px-6 py-4">
          <span className="font-display text-[13px] font-bold tracking-[0.1em] uppercase">Total on hand</span>
          <span className="font-display text-[30px] leading-none font-black tnum">{money(s.closingExpected + s.bankExpected)}</span>
        </div>
      </div>

      {flow && <FlowDialog flow={flow} lines={flowLines} total={flow === 'in' ? totalIn : totalOut} money={money} onClose={() => setFlow(null)} />}

      {/* Secondary: the cashier reads the tape first; adding a line or closing is one quiet step away. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(
          [
            ['INCOME', '+ Income'],
            ['EXPENSE', '+ Expense'],
            ['TRANSFER', 'Transfer'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={panel === k}
            className={`${ADMIN_TINY} ring-1 ring-hairline ring-inset ${panel === k ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink'}`}
            onClick={() => setPanel(panel === k ? null : k)}
          >
            {label}
          </button>
        ))}
        <span className="flex-1" />
        {s.closedToday ? (
          <span className="px-2 text-[12.5px] text-ink-3">Closed today at {s.periodStart ? clockTime(s.periodStart) : ''}</span>
        ) : (
          <button
            type="button"
            aria-pressed={panel === 'close'}
            className={`${ADMIN_TINY} ${panel === 'close' ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink'}`}
            onClick={() => {
              if (panel !== 'close') {
                // Start from what the books say; the cashier only edits if the real count differs.
                setCounted(s.closingExpected);
                setBankCounted(s.bankExpected);
                setFormKey((k) => k + 1);
              }
              setPanel(panel === 'close' ? null : 'close');
            }}
          >
            Close the books…
          </button>
        )}
        {s.canReopen && can(staff.role, 'ledger:reopen') && (
          <Confirm
            label="Reopen last close"
            question="Reopen it? Anything recorded since joins that period."
            confirmLabel="Reopen"
            disabled={busy}
            onConfirm={() =>
              run('reopen', reopenLedger, 'Last close reopened').then((ok) => {
                if (ok) {
                  setPanel(null);
                  reload();
                }
              })
            }
          />
        )}
      </div>

      {panel === 'TRANSFER' && (
        <Panel className="mt-3" variant="subtle" title="Move money" hint="Deposit cash into the bank, or withdraw from the bank into the drawer. It isn't income or spend.">
          <div className="space-y-3">
            <Segmented label="Direction" value={direction} onChange={setDirection} options={DIRECTIONS} />
            <div className="grid gap-3 sm:grid-cols-[11rem_1fr]">
              <Field label="Amount">
                <MoneyInput key={`t${formKey}`} value={amount || ''} onChange={setAmount} currency={currency} />
              </Field>
              <Field label="Note">
                <TextInput value={note} onChange={setNote} maxLength={300} placeholder="Optional" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button type="button" className={ADMIN_GHOST} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button type="button" className={ADMIN_PRIMARY} disabled={busy || amount <= 0} onClick={submitExpense}>
                Record transfer
              </button>
            </div>
          </div>
        </Panel>
      )}

      {(panel === 'INCOME' || panel === 'EXPENSE') && (
        <Panel className="mt-3" variant="subtle" title={panel === 'INCOME' ? 'Add income' : 'Add expense'} hint="Money in that isn't a table sale, or money out. It lands on the tape as the next line.">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[11rem_1fr_1fr]">
              <Field label="Amount">
                <MoneyInput key={`e${formKey}${panel}`} value={amount || ''} onChange={setAmount} currency={currency} />
              </Field>
              <Field label="Category">
                <TextInput value={category} onChange={setCategory} maxLength={60} list="ledger-categories" placeholder={CATEGORY_HINTS[panel].slice(0, 3).join(', ')} autoFocus />
                <datalist id="ledger-categories">
                  {CATEGORY_HINTS[panel].map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Note">
                <TextInput value={note} onChange={setNote} maxLength={300} placeholder="Optional" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented label={panel === 'INCOME' ? 'Received as' : 'Paid with'} value={method} onChange={setMethod} options={METHODS} />
              <span className="flex-1" />
              <button type="button" className={ADMIN_GHOST} onClick={() => setPanel(null)}>
                Cancel
              </button>
              <button type="button" className={ADMIN_PRIMARY} disabled={busy || amount <= 0 || !category.trim()} onClick={submitExpense}>
                {panel === 'INCOME' ? 'Add income' : 'Add expense'}
              </button>
            </div>
          </div>
        </Panel>
      )}

      {panel === 'close' && (
        <Panel className="mt-3" variant="subtle" title="Close the books" hint="Count the drawer and read the bank balance to end this period. The next one opens with what you enter.">
          {closeForm}
        </Panel>
      )}

      <Panel className="mt-5" title="Past closes" bare>
        {(closes.data ?? []).length <= 1 ? (
          <p className="p-5 text-[13px] text-ink-3">No closed periods yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[12px] text-ink-3">
                <tr>
                  {['Closed', 'Opened with', 'In', 'Out', 'Drawer', 'Drawer diff', 'Bank', 'Bank diff'].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline tnum">
                {(closes.data ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{relativeTime(c.closedAt)}</td>
                    <td className="px-4 py-2.5">{money(c.opening + c.bankOpening)}</td>
                    <td className="px-4 py-2.5">{money(c.cashSales + c.cardSales + c.cashIncome + c.cardIncome)}</td>
                    <td className="px-4 py-2.5">{money(c.cashExpenses + c.cardExpenses)}</td>
                    <td className="px-4 py-2.5">{money(c.closingCounted)}</td>
                    <td className={`px-4 py-2.5 ${c.variance < 0 ? 'text-berry' : ''}`}>{money(c.variance)}</td>
                    <td className="px-4 py-2.5">{money(c.bankCounted)}</td>
                    <td className={`px-4 py-2.5 ${c.bankVariance < 0 ? 'text-berry' : ''}`}>{money(c.bankVariance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Total({ label, value, active, onClick }: { label: string; value: string; active?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <dt className="text-[11px] font-bold tracking-wide text-docket-inksoft uppercase">{label}</dt>
      <dd className="font-display mt-0.5 text-[18px] font-black tnum sm:text-[20px]">{value}</dd>
      {onClick && <span className="mt-0.5 block text-[11.5px] text-docket-inksoft underline underline-offset-2">See breakdown</span>}
    </>
  );
  if (!onClick) return <div>{body}</div>;
  return (
    <button type="button" aria-haspopup="dialog" onClick={onClick} className={`-mx-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-docket-line/40 ${active ? 'bg-docket-line/40' : ''}`}>
      {body}
    </button>
  );
}

/** A pie slice from `start` to `end` radians (0 = 12 o'clock, clockwise) as an SVG path; a full turn is a circle. */
function slicePath(start: number, end: number): string {
  const C = 100;
  const R = 92;
  if (end - start >= Math.PI * 2 - 1e-6) return `M${C} ${C - R}A${R} ${R} 0 1 1 ${C - 0.01} ${C - R}Z`;
  const pt = (a: number) => `${C + R * Math.sin(a)} ${C - R * Math.cos(a)}`;
  return `M${C} ${C}L${pt(start)}A${R} ${R} 0 ${end - start > Math.PI ? 1 : 0} 1 ${pt(end)}Z`;
}

/**
 * One side of the period in a dialog: a pie of where it came from or went, with the legend that
 * names and sizes every slice. The transactions behind it are one click further, not shown up front.
 */
function FlowDialog({ flow, lines, total, money, onClose }: { flow: Flow; lines: LedgerEntry[]; total: Minor; money: (v: Minor) => string; onClose: () => void }) {
  const groups = breakdown(lines);
  const [hot, setHot] = useState<number | null>(null);
  const [showTx, setShowTx] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const history = [...lines].reverse();
  const noun = flow === 'in' ? 'money in' : 'spending';
  const colorOf = (i: number) => SLICE_COLORS[i] ?? OTHER_COLOR;

  // The parent passes a fresh onClose every render, so the key listener reads it through a ref and focus is taken once.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const slices = groups.map((g, i) => {
    const start = (groups.slice(0, i).reduce((n, x) => n + x.total, 0) / Math.max(1, total)) * Math.PI * 2;
    return { g, i, d: slicePath(start, start + (g.total / Math.max(1, total)) * Math.PI * 2) };
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="animate-pop max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-label={flow === 'in' ? 'Total in breakdown' : 'Total out breakdown'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold text-ink-3">{flow === 'in' ? 'Total in' : 'Total out'}</h2>
            <p className="font-display text-[32px] leading-tight font-black tnum">{money(total)}</p>
            <p className="text-[12.5px] text-ink-3">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'} this period
            </p>
          </div>
          <button ref={closeRef} type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {groups.length === 0 ? (
          <p className="py-10 text-center text-[13.5px] text-ink-3">No {noun} this period yet.</p>
        ) : (
          <div className="mt-4 grid items-center gap-5 sm:grid-cols-[11rem_1fr]">
            <svg viewBox="0 0 200 200" role="img" aria-label={`${noun} by source`} className="mx-auto w-44 sm:w-full">
              {slices.map(({ g, i, d }) => (
                <path
                  key={g.name}
                  d={d}
                  fill={colorOf(i)}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  opacity={hot === null || hot === i ? 1 : 0.35}
                  className="transition-opacity duration-150"
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                >
                  <title>{`${g.name}: ${money(g.total)} (${Math.round((g.total / total) * 100)}%)`}</title>
                </path>
              ))}
            </svg>
            <ul className="grid gap-1">
              {groups.map((g, i) => (
                <li
                  key={g.name}
                  className={`grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2.5 rounded-lg px-2 py-1.5 text-[13.5px] transition-colors ${hot === i ? 'bg-surface-2' : ''}`}
                  onMouseEnter={() => setHot(i)}
                  onMouseLeave={() => setHot(null)}
                >
                  <span className="size-2.5 translate-y-px rounded-[3px]" style={{ background: colorOf(i) }} aria-hidden />
                  <span className="min-w-0 truncate" title={g.name}>
                    {g.name}
                    <span className="ml-1.5 text-[11.5px] text-ink-4">×{g.count}</span>
                  </span>
                  <span className="text-right font-semibold tnum">
                    {money(g.total)}
                    <span className="ml-2 text-[12px] font-normal text-ink-3">{Math.round((g.total / total) * 100)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lines.length > 0 && (
          <div className="mt-5 border-t border-hairline pt-4">
            <button type="button" aria-expanded={showTx} className={ADMIN_GHOST} onClick={() => setShowTx((v) => !v)}>
              {showTx ? 'Hide transactions' : `See transactions (${lines.length})`}
            </button>
            {showTx && (
              <ol className="mt-3 max-h-72 divide-y divide-hairline overflow-y-auto">
                {history.map((e) => (
                  <li key={e.id} className="grid grid-cols-[3.75rem_1fr_auto] items-baseline gap-x-3 py-2.5 text-[13.5px]">
                    <time className="text-[12.5px] font-semibold text-ink-3 tnum" dateTime={e.at}>
                      {clockTime(e.at)}
                    </time>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{e.label}</div>
                      <div className="truncate text-[12px] text-ink-3">{[e.method === 'CASH' ? 'Cash' : 'Bank', e.detail].filter(Boolean).join(' · ')}</div>
                    </div>
                    <span className="font-semibold tnum">
                      {flow === 'in' ? '+' : '−'}
                      {money(e.amount)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Sum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:block">
      <dt className="text-docket-inksoft">{label}</dt>
      <dd className="font-semibold tnum">{value}</dd>
    </div>
  );
}

function Held({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-docket-inksoft">{label}</dt>
      <dd className="font-semibold tnum">{value}</dd>
    </div>
  );
}

/** One line of the tape: when, what, the amount, and where the drawer and the bank stand after it. */
function TapeLine({
  entry: e,
  cash,
  bank,
  money,
  busy,
  onRemove,
}: {
  entry: LedgerEntry;
  cash: Minor;
  bank: Minor;
  money: (v: Minor) => string;
  busy: boolean;
  onRemove: () => void;
}) {
  const opening = e.kind === 'opening';
  const expense = e.kind === 'expense';
  const transfer = e.kind === 'transfer';
  const removable = expense || e.kind === 'income' || transfer;
  // Where the money went — implied for the opening and for a transfer, whose label already says it.
  const via = opening || transfer ? '' : e.method === 'CASH' ? 'Cash' : 'Bank';
  const detail = [via, opening ? `Drawer ${money(e.cashDelta)} · Bank ${money(e.bankDelta)}` : '', e.detail].filter(Boolean).join(' · ');
  return (
    <div className="grid grid-cols-[3.75rem_1fr_auto] items-start gap-x-3 gap-y-0.5 px-6 py-3.5 sm:grid-cols-[4.5rem_1fr_7rem_7rem_7rem] sm:items-baseline">
      <time className="text-[12.5px] font-semibold text-docket-inksoft tnum" dateTime={e.at}>
        {clockTime(e.at)}
      </time>
      <div className="min-w-0">
        <div className={opening ? 'font-display text-[16px] font-black' : 'text-[14.5px] font-semibold'}>{e.label}</div>
        {(detail || removable) && (
          <div className="text-[12.5px] text-docket-inksoft">
            {detail}
            {removable && (
              <button type="button" disabled={busy} onClick={onRemove} className={`${detail ? 'ml-2 ' : ''}font-semibold underline underline-offset-2 hover:text-berry disabled:opacity-50`}>
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      <span className={`col-start-3 row-start-1 text-right text-[15px] font-bold tnum sm:col-start-3 ${expense ? 'text-berry' : ''}`}>
        {opening || transfer ? '' : expense ? '−' : '+'}
        {money(e.amount)}
      </span>
      <span className="col-start-2 row-start-3 text-[12px] text-docket-inksoft tnum sm:col-start-4 sm:row-start-1 sm:text-right">
        <span className="sm:hidden">Drawer </span>
        {money(cash)}
      </span>
      <span className="col-start-2 row-start-4 text-[12px] text-docket-inksoft tnum sm:col-start-5 sm:row-start-1 sm:text-right">
        <span className="sm:hidden">Bank </span>
        {money(bank)}
      </span>
    </div>
  );
}
