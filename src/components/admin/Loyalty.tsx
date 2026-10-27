import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../../api/store';
import { adjustLoyalty, fetchLoyaltyLedger, fetchLoyaltyProgram, saveLoyaltyProgram } from '../../api/customers';
import type { LoyaltyEntryType, LoyaltyProgram } from '../../api/customers';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import { useStaff } from '../../state/AuthContext';
import { useAsync } from '../../state/useAsync';
import { relativeTime } from '../time';
import { cx } from '../ui';
import { ADMIN_GHOST, ADMIN_PRIMARY, Field, Loading, MoneyInput, PercentInput, TextInput, Toggle, useCommand } from './kit';
import { Check } from '../icons';
import { Block } from './profile';

const ENTRY_LABEL: Record<LoyaltyEntryType, string> = {
  EARN: 'Earned',
  REDEEM: 'Spent',
  REVIEW_BONUS: 'Review bonus',
  ADJUST: 'Adjusted by hand',
  EXPIRE: 'Expired',
  REVERSAL: 'Reversed',
};

const errorOf = (e: unknown) => (e instanceof ApiError ? e.message : 'That did not go through. Try again.');

/**
 * A customer's points inside their sheet: the balance, the latest ledger lines and — for whoever may
 * discount a bill — a hand adjustment. Errors show here, not as toasts: the sheet is a modal dialog, so
 * a toast would sit under its backdrop.
 */
export function LoyaltyPanel({ customerId }: { customerId: string }) {
  const canAdjust = can(useStaff().role, 'payments:discount');
  const ledger = useAsync(() => fetchLoyaltyLedger(customerId), [customerId]);
  const [adjusting, setAdjusting] = useState(false);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const data = ledger.data;
  if (!data) {
    return ledger.error ? (
      <p role="alert" className="text-[13px] text-berry-ink">
        Points could not be loaded.{' '}
        <button type="button" className="font-semibold underline underline-offset-2" onClick={ledger.reload}>
          Try again
        </button>
      </p>
    ) : (
      <p className="text-[13px] text-ink-3">Loading…</p>
    );
  }

  const amount = Number(points);
  const valid = /^-?\d+$/.test(points) && amount !== 0 && Math.abs(amount) <= 1_000_000 && note.trim().length > 0;
  const submit = async () => {
    setSaving(true);
    setError(null);
    setDone(false);
    try {
      await adjustLoyalty(customerId, amount, note.trim());
      setAdjusting(false);
      setDone(true);
      setPoints('');
      setNote('');
      ledger.reload();
    } catch (e) {
      setError(errorOf(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-display text-[26px] font-semibold leading-none tnum">{data.balance}</p>
          <p className="mt-1 text-[12.5px] text-ink-3">{data.program.enabled ? 'points available' : 'points · the program is off, nothing new is earned'}</p>
        </div>
        {canAdjust && !adjusting && (
          <button type="button" className={cx(ADMIN_GHOST, 'h-9')} onClick={() => {
              setDone(false);
              setAdjusting(true);
            }}>
            Adjust
          </button>
        )}
      </div>

      {done && !adjusting && (
        <p role="status" className="text-[12.5px] font-semibold text-mint-ink">
          Points adjusted.
        </p>
      )}

      {adjusting && (
        <form
          className="grid gap-3 rounded-2xl bg-surface-2/50 p-3.5 ring-1 ring-hairline ring-inset"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !saving) void submit();
          }}
        >
          <Field label="Points" hint="Positive to give, negative to take away, e.g. 50 or -20. Up to 1,000,000.">
            <TextInput value={points} onChange={(v) => setPoints(v.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, ''))} maxLength={8} placeholder="50" autoFocus />
          </Field>
          <Field label="Why" hint="Kept in the ledger and the audit log.">
            <TextInput value={note} onChange={setNote} maxLength={200} placeholder="Birthday treat" />
          </Field>
          {error && (
            <p role="alert" className="text-[13px] text-berry-ink">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="button" className={cx(ADMIN_GHOST, 'flex-1')} disabled={saving} onClick={() => { setAdjusting(false); setError(null); }}>
              Cancel
            </button>
            <button type="submit" className={cx(ADMIN_PRIMARY, 'flex-1')} disabled={!valid || saving}>
              {saving ? 'Saving…' : 'Apply'}
            </button>
          </div>
        </form>
      )}

      {data.entries.rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">No points yet.</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {data.entries.rows.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2 text-[13.5px]">
              <span className="min-w-0">
                <span className="block font-medium">{ENTRY_LABEL[entry.type]}</span>
                <span className="block truncate text-[12px] text-ink-4">
                  {relativeTime(entry.createdAt)}
                  {entry.note ? ` · ${entry.note}` : ''}
                  {entry.createdByName ? ` · ${entry.createdByName}` : ''}
                </span>
              </span>
              <span className={cx('shrink-0 font-semibold tnum', entry.points < 0 ? 'text-ink-3' : 'text-mint-ink')}>
                {entry.points > 0 ? '+' : '−'}
                {Math.abs(entry.points)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.entries.count > data.entries.rows.length && <p className="text-[12px] text-ink-4">Latest {data.entries.rows.length} of {data.entries.count} lines.</p>}
    </div>
  );
}

/** The restaurant's points rules, on the Settings page. Everyone who can see settings can read them; the owner changes them. */
export function LoyaltySettings({ currency, canEdit, onSaved }: { currency: string; canEdit: boolean; onSaved?: () => void }) {
  const program = useAsync(fetchLoyaltyProgram, []);
  // What the last save returned wins over the fetched copy, so the form is clean the moment a save lands.
  const [saved, setSaved] = useState<LoyaltyProgram | null>(null);
  const loaded = saved ?? program.data;
  if (!loaded) {
    return (
      <Block title="Loyalty points">
        {program.error ? (
          <p role="alert" className="text-[13px] text-berry-ink">
            The rules could not be loaded.{' '}
            <button type="button" className="font-semibold underline underline-offset-2" onClick={program.reload}>
              Try again
            </button>
          </p>
        ) : (
          <Loading />
        )}
      </Block>
    );
  }
  // Keyed on the saved rules so the form starts again from what is saved after every save.
  return <LoyaltyRules key={JSON.stringify(loaded)} saved={loaded} currency={currency} canEdit={canEdit} onSaved={(next) => {
      setSaved(next);
      onSaved?.();
    }} />;
}

function LoyaltyRules({ saved, currency, canEdit, onSaved }: { saved: LoyaltyProgram; currency: string; canEdit: boolean; onSaved: (next: LoyaltyProgram) => void }) {
  const { busy, run } = useCommand();
  const [enabled, setEnabled] = useState(saved.enabled);
  const [spend, setSpend] = useState(saved.spendPerPoint);
  const [value, setValue] = useState(saved.redeemValue);
  const [pct, setPct] = useState(String(saved.maxRedeemPct));
  const [bonus, setBonus] = useState(String(saved.reviewBonus ?? 0));

  const maxRedeemPct = Number(pct);
  const wholePct = /^\d+$/.test(pct);
  const reviewBonus = Number(bonus);
  // Points must stay worth less than the spending that earns one, or spending them would pay for itself.
  const safeRates = value * maxRedeemPct < spend * 100;
  const validBonus = /^\d+$/.test(bonus) && reviewBonus <= 1_000_000;
  const valid = spend >= 1 && spend <= 10_000_000 && value >= 1 && value <= 10_000_000 && wholePct && maxRedeemPct >= 1 && maxRedeemPct <= 100 && validBonus && safeRates;
  const dirty = enabled !== saved.enabled || spend !== saved.spendPerPoint || value !== saved.redeemValue || maxRedeemPct !== saved.maxRedeemPct || reviewBonus !== (saved.reviewBonus ?? 0);
  const canSave = canEdit && dirty && valid && !busy;
  const [justSaved, setJustSaved] = useState(false);
  const saveRef = useRef<() => void>(() => {});
  const money = (m: number) => formatMoney(m, currency);

  const save = () => {
    if (!canSave) return;
    void run(
      'loyalty',
      async () => onSaved(await saveLoyaltyProgram({ enabled, spendPerPoint: spend, redeemValue: value, maxRedeemPct, reviewBonus })),
    ).then((ok) => {
      if (!ok) return;
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1800);
    });
  };
  saveRef.current = save;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Block title="Loyalty points" hint={canEdit ? 'Saved on its own' : 'Only an owner can change these'}>
      <fieldset disabled={!canEdit} className="grid gap-4 disabled:opacity-60">
        <Toggle checked={enabled} onChange={setEnabled} label="Give points" hint="Customers with a phone number on their order earn points when the bill is paid, and spend them as a discount at the till." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Spend per point" hint="Every time a customer spends this much (on the bill before service charge and tax, less any discount), they earn one point.">
            <MoneyInput value={spend} onChange={setSpend} currency={currency} />
          </Field>
          <Field label="Each point is worth" hint={safeRates || !wholePct ? 'What one point takes off a bill when spent.' : 'Too high: a point must be worth less than the spending that earns one, at this share of a bill.'}>
            <MoneyInput value={value} onChange={setValue} currency={currency} />
          </Field>
          <Field label="Points can pay for up to" hint="Whole percent of a bill, before service charge and tax.">
            <PercentInput value={pct} onChange={setPct} />
          </Field>
          <Field label="Review bonus" hint={validBonus ? 'Points a customer gets, once per order, for rating a dish. 0 for none.' : 'A whole number from 0 to 1,000,000.'}>
            <TextInput value={bonus} onChange={(v) => setBonus(v.replace(/\D/g, ''))} maxLength={7} placeholder="0" />
          </Field>
        </div>
        {valid && (
          <p className="text-[12.5px] leading-relaxed text-ink-4">
            Spending {money(spend * 10)} earns 10 points. 100 points are worth {money(value * 100)} and can cover up to {maxRedeemPct}% of a bill.
          </p>
        )}
      </fieldset>
      {canEdit && (
        <div
          className={cx(
            'fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-[transform,opacity] duration-500 ease-spring',
            dirty || justSaved || busy ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-8 opacity-0',
          )}
          aria-hidden={!dirty && !justSaved && !busy}
        >
          <div className="flex w-full max-w-lg items-center gap-3 rounded-full bg-surface-2/90 py-2 pl-5 pr-2 shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-xl">
            <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate text-[13.5px] text-ink-2" aria-live="polite">
              <span aria-hidden className={cx('size-2 shrink-0 rounded-full', justSaved ? 'bg-mint' : 'animate-breathe bg-gold')} />
              {justSaved ? 'Saved' : 'Unsaved changes'}
            </span>
            <button type="button" className={cx(ADMIN_PRIMARY, 'relative h-9 overflow-hidden px-4')} disabled={!canSave && !justSaved} onClick={save}>
              <span aria-hidden className={cx('absolute inset-0 origin-left bg-mint transition-transform duration-500 ease-out-quart', justSaved ? 'scale-x-100' : 'scale-x-0')} />
              <span className="relative inline-flex items-center gap-1.5">
                {justSaved ? (
                  <>
                    <Check size={15} /> Saved
                  </>
                ) : busy ? (
                  'Saving…'
                ) : (
                  'Save'
                )}
              </span>
            </button>
          </div>
        </div>
      )}
    </Block>
  );
}
