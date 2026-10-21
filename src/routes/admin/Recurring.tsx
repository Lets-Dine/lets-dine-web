import { useState } from 'react';
import type { ReactNode } from 'react';
import { addRecurringExpense, deleteRecurringExpense, fetchRecurringExpenses, settleRecurringExpense, updateRecurringExpense } from '../../api/finance';
import type { Recurrence, RecurringDraft, RecurringExpense } from '../../api/finance';
import { ADMIN_GHOST, ADMIN_PRIMARY, Confirm, Empty, Field, Loading, MoneyInput, Segmented, Select, TextInput, useCommand } from '../../components/admin/kit';
import { Block, Num, useCountUp } from '../../components/admin/profile';
import { DISPLAY, cx } from '../../components/ui';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import type { PaymentMethod } from '../../domain/types';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { useDashboard } from './AdminLayout';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const FREQUENCIES: { value: Recurrence; label: string }[] = [
  { value: 'MONTHLY', label: 'Every month' },
  { value: 'WEEKLY', label: 'Every week' },
];
const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Bank' },
];
const CATEGORY_HINTS = ['Rent', 'Salaries', 'Utilities', 'Internet', 'Insurance', 'Licences'];

const ordinal = (n: number) => {
  if (n >= 11 && n <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
};
const DAY_OPTIONS = {
  MONTHLY: Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: `The ${ordinal(i + 1)}` })),
  WEEKLY: WEEKDAYS.map((label, i) => ({ value: String(i), label })),
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const pretty = (day: string) => new Date(`${day}T00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(`${day}T00:00`).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const schedule = (r: Pick<RecurringExpense, 'frequency' | 'dueDay'>) => (r.frequency === 'MONTHLY' ? `Monthly, on the ${ordinal(r.dueDay)}` : `Every ${WEEKDAYS[r.dueDay]}`);
const EXIT_MS = 320;

/** Delay for the nth line of a block that itself rises in at `block` ms. */
const at = (block: number, n: number) => block + 140 + Math.min(n, 12) * 45;

/**
 * Costs that come round on a schedule — rent, wages, utilities. Nothing posts by itself: a due date waits here until
 * someone posts it to the cash book or skips it, so the books never change unseen.
 */
export function Recurring() {
  const staff = useStaff();
  const { menu } = useDashboard();
  const currency = menu?.restaurant.currency ?? '';
  const money = (v: number) => formatMoney(v, currency);
  const canManage = can(staff.role, 'ledger:manage');
  const { run, pending } = useCommand();

  const [version, setVersion] = useState(0);
  const list = useAsync(() => fetchRecurringExpenses(), [version]);
  const [editing, setEditing] = useState<RecurringExpense | 'new' | null>(null);
  const reload = () => setVersion((v) => v + 1);

  const rows = list.data ?? [];
  const active = rows.filter((r) => r.isActive);
  const waiting = active.filter((r) => r.due.length > 0);
  // Weekly costs count 52/12 a month. A rough monthly weight, not a forecast.
  const perMonth = Math.round(active.reduce((sum, r) => sum + (r.frequency === 'MONTHLY' ? r.amount : (r.amount * 52) / 12), 0));
  const monthly = useCountUp(perMonth);

  // A cost id → the due date that was just handled. While that date is still the first waiting one, the row is on its
  // way out; once the list reloads it is gone (or shows its next date), so the entry stops matching by itself.
  const [leaving, setLeaving] = useState<Map<string, string>>(new Map());
  const isLeaving = (r: RecurringExpense) => leaving.get(r.id) === r.due[0];
  const allLeaving = waiting.length > 0 && waiting.every(isLeaving);

  // Pausing a cost that is waiting under "Due now" takes it out of there, so it leaves the same way a post does.
  const togglePause = (r: RecurringExpense) =>
    run(`pause-${r.id}`, () => updateRecurringExpense(r.id, { isActive: !r.isActive }), r.isActive ? 'Paused' : 'Resumed').then((ok) => {
      if (!ok) return;
      if (r.isActive && r.due.length > 0) {
        setLeaving((m) => new Map(m).set(r.id, r.due[0]));
        setTimeout(reload, EXIT_MS + 40);
      } else reload();
    });

  const settle = (r: RecurringExpense, action: 'post' | 'skip' | 'skip-all') =>
    run(`${action}-${r.id}`, () => settleRecurringExpense(r.id, r.due[0], action), action === 'post' ? `${r.category} posted to the cash book` : action === 'skip' ? `${pretty(r.due[0])} skipped` : `${r.due.length} dates skipped`).then((ok) => {
      if (!ok) return;
      // The last waiting date leaves with a collapse; one of several just reloads to show the next.
      if (action === 'skip-all' || r.due.length === 1) {
        setLeaving((m) => new Map(m).set(r.id, r.due[0]));
        setTimeout(reload, EXIT_MS + 40);
      } else reload();
    });

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className={cx(DISPLAY, 'animate-rise text-[clamp(40px,7vw,76px)] leading-[0.98] tracking-[-0.03em]')}>Recurring expenses</h1>

      {list.data && (
        <p className="mt-5 max-w-[34ch] animate-rise text-[clamp(20px,2.6vw,28px)] font-medium leading-[1.3] text-ink-2 [animation-delay:80ms] sm:max-w-[40ch]">
          {active.length === 0 ? (
            <>Nothing recurring yet. Add rent, wages or bills once and stop retyping them.</>
          ) : (
            <>
              {active.length} recurring {active.length === 1 ? 'cost' : 'costs'}, about <Num>{money(monthly)}</Num> a month.{' '}
              {waiting.length > 0 ? <span className="text-gold-ink">{waiting.length} {waiting.length === 1 ? 'is' : 'are'} due now.</span> : <>Nothing is due.</>}
            </>
          )}
        </p>
      )}

      {canManage && editing === null && (
        <div className="mt-6 animate-rise [animation-delay:140ms]">
          <button type="button" className={cx(ADMIN_PRIMARY, 'h-11 px-5 text-[14.5px]')} onClick={() => setEditing('new')}>
            Add a recurring expense
          </button>
        </div>
      )}

      {editing !== null && (
        <div className="mt-6">
          <Block title={editing === 'new' ? 'New recurring expense' : `Edit ${editing.category}`} hint={editing === 'new' ? undefined : 'Changes apply from the next due date'} delay={0}>
            <RecurringForm
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? null : editing}
              currency={currency}
              onCancel={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                reload();
              }}
            />
          </Block>
        </div>
      )}

      {list.loading && !list.data && <div className="mt-10"><Loading label="Reading what recurs…" /></div>}
      {list.error && <div className="mt-10"><Empty emoji="⚠️" title="Couldn't read the recurring expenses" message={list.error.message} /></div>}
      {list.data && rows.length === 0 && editing === null && (
        <div className="mt-6"><Empty emoji="🔁" title="No recurring expenses" message="Rent, salaries, internet — add each once and it will wait here on its due date for you to post." /></div>
      )}

      {rows.length > 0 && (
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="grid content-start">
            {waiting.length > 0 && (
              <Collapse gone={allLeaving}>
              <div className="pb-6">
              <Block title="Due now" hint="Post it to the cash book, or skip it" delay={200}>
                <ul>
                  {waiting.map((r, n) => (
                    <li key={r.id} style={{ animationDelay: `${at(200, n)}ms` }} className="animate-rise">
                      <Collapse gone={isLeaving(r)}>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-hairline py-4">
                        <span className="min-w-0">
                          <span className="block text-[15px] font-medium">{r.category}</span>
                          <span className="block text-[12.5px] text-ink-3">
                            Due {pretty(r.due[0])} · {r.method === 'CASH' ? 'from the drawer' : 'from the bank'}
                            {r.due.length > 1 ? ` · ${r.due.length - 1} more waiting after this` : ''}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="text-[16px] font-semibold tnum">{money(r.amount)}</span>
                          {canManage && (
                            <>
                              <button type="button" className={cx(ADMIN_PRIMARY, 'h-9 px-4 text-[13.5px]')} disabled={pending !== null} onClick={() => void settle(r, 'post')}>
                                {pending === `post-${r.id}` ? 'Posting…' : 'Post'}
                              </button>
                              <button type="button" className={cx(ADMIN_GHOST, 'h-9 px-4 text-[13.5px]')} disabled={pending !== null} onClick={() => void settle(r, 'skip')}>
                                Skip
                              </button>
                              {r.due.length > 1 && (
                                <Confirm label={`Skip all ${r.due.length}`} question={`Skip all ${r.due.length} waiting dates?`} confirmLabel="Skip all" disabled={pending !== null} onConfirm={() => void settle(r, 'skip-all')} />
                              )}
                            </>
                          )}
                        </span>
                      </div>
                      </Collapse>
                    </li>
                  ))}
                </ul>
              </Block>
              </div>
              </Collapse>
            )}

            <Block title="Everything that recurs" hint="Newest changes apply from the next due date" delay={260}>
              <ul className="border-t border-hairline">
                {rows.map((r, n) => (
                  <li key={r.id} style={{ animationDelay: `${at(260, n)}ms` }} className={cx('animate-rise border-b border-hairline py-4 transition-opacity duration-300 last:border-0 motion-reduce:transition-none', !r.isActive && 'opacity-60')}>
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <span className="min-w-0">
                        <span className="block text-[15px] font-medium">{r.category}</span>
                        <span className="block text-[12.5px] text-ink-3">
                          {schedule(r)} · {r.method === 'CASH' ? 'cash' : 'bank'}
                          {r.note ? ` · ${r.note}` : ''}
                        </span>
                        <span className="block text-[12.5px] text-ink-4">{r.isActive ? (r.due.length > 0 ? 'Waiting to be posted' : r.next ? `Next ${pretty(r.next)}` : '') : 'Paused'}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[16px] font-semibold tnum">{money(r.amount)}</span>
                        <span className="block text-[12px] text-ink-4">{r.frequency === 'MONTHLY' ? 'a month' : 'a week'}</span>
                      </span>
                    </div>
                    {canManage && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <button type="button" className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-ink-3 hover:text-ink" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button type="button" className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-ink-3 hover:text-ink" disabled={pending !== null} onClick={() => void togglePause(r)}>
                          {r.isActive ? 'Pause' : 'Resume'}
                        </button>
                        <Confirm label="Delete" question="Delete it? Posted expenses stay." confirmLabel="Delete" disabled={pending !== null} onConfirm={() => void run(`del-${r.id}`, () => deleteRecurringExpense(r.id), 'Removed').then((ok) => ok && reload())} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </Block>
          </div>

          <div className="grid content-start gap-6">
            <Block title="How this works" delay={320}>
              <ul className="list-disc space-y-3 pl-5 text-[14px] leading-relaxed text-ink-3">
                <li>Nothing posts by itself. On the due date it waits under "Due now" until you post it or skip it.</li>
                <li>Posting adds the expense to the cash book at that moment, from the drawer or the bank as you chose, and it counts in that period's profit and loss.</li>
                <li>If you miss a month, each missed date waits in order, oldest first, so you can post or skip each one.</li>
                <li>Editing or pausing never changes what was already posted.</li>
              </ul>
            </Block>
          </div>
        </div>
      )}
    </div>
  );
}

function RecurringForm({ initial, currency, onCancel, onSaved }: { initial: RecurringExpense | null; currency: string; onCancel: () => void; onSaved: () => void }) {
  const { run, busy } = useCommand();
  const [category, setCategory] = useState(initial?.category ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? 0);
  const [frequency, setFrequency] = useState<Recurrence>(initial?.frequency ?? 'MONTHLY');
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 1));
  const [method, setMethod] = useState<PaymentMethod>(initial?.method ?? 'CARD');
  const [note, setNote] = useState(initial?.note ?? '');
  const [startsOn, setStartsOn] = useState(iso(new Date()));

  const changeFrequency = (next: Recurrence) => {
    setFrequency(next);
    setDueDay('1'); // a day number means something different in each, so start fresh
  };

  const save = async () => {
    const draft: RecurringDraft = { category: category.trim(), amount, method, note: note.trim(), frequency, dueDay: Number(dueDay) };
    const ok = await run('save', () => (initial ? updateRecurringExpense(initial.id, draft) : addRecurringExpense({ ...draft, startsOn })), initial ? 'Saved' : 'Recurring expense added');
    if (ok) onSaved();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem_1fr]">
        <Field label="What is it">
          <Select value={category} onChange={setCategory} maxLength={60} allowNew autoFocus placeholder="Rent, salaries…" options={CATEGORY_HINTS.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Amount each time">
          <MoneyInput value={amount || ''} onChange={setAmount} currency={currency} />
        </Field>
        <Field label="Note">
          <TextInput value={note} onChange={setNote} maxLength={300} placeholder="Optional" />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Repeats" value={frequency} onChange={changeFrequency} options={FREQUENCIES} />
        <Field label={frequency === 'MONTHLY' ? 'Due on' : 'Due every'} className="w-40">
          <Select value={dueDay} onChange={setDueDay} options={DAY_OPTIONS[frequency]} />
        </Field>
        <Segmented label="Paid with" value={method} onChange={setMethod} options={METHODS} />
        {!initial && (
          <Field label="First due on or after" className="w-44">
            <input type="date" className="h-10 w-full rounded-xl bg-surface-2 px-3 text-[14px] ring-1 ring-hairline ring-inset" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
        )}
      </div>
      {frequency === 'MONTHLY' && Number(dueDay) > 28 && <p className="text-[12.5px] text-ink-3">In a shorter month this falls on the last day of the month.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={ADMIN_PRIMARY} disabled={busy || amount <= 0 || !category.trim() || (!initial && !startsOn)}>
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add recurring expense'}
        </button>
        <button type="button" className={ADMIN_GHOST} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Shrinks to nothing and fades while `gone`, so what is removed leaves instead of vanishing and the rest slides up. */
function Collapse({ gone, children }: { gone: boolean; children: ReactNode }) {
  return (
    <div
      aria-hidden={gone}
      inert={gone}
      style={{ transitionDuration: `${EXIT_MS}ms` }}
      className={cx('grid transition-[grid-template-rows,opacity] ease-out-quart motion-reduce:transition-none', gone ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100')}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
