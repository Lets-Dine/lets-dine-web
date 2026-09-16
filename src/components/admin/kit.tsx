import { useCallback, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ApiError } from '../../api/store';
import { formatMoney, symbolFor } from '../../domain/money';
import type { Minor, OrderStatus } from '../../domain/types';
import { haptic } from '../../platform/haptics';
import { useToast } from '../../state/ToastContext';
import { BTN, DISPLAY, cx } from '../ui';
import { Check, X } from '../icons';

/**
 * The dashboard's vocabulary. It shares the diner app's palette and easings —
 * same restaurant, same brand — but not its proportions: this is a tool used
 * for a whole shift, so it is denser, squarer and quieter, and it leads with
 * numbers rather than photographs.
 */

export const PANEL = 'rounded-2xl bg-surface ring-1 ring-hairline ring-inset';
export const PAD = 'p-4 sm:p-5';

export const ADMIN_BTN = `${BTN} h-10 px-4 text-[14px]`;
export const ADMIN_PRIMARY = `${ADMIN_BTN} bg-flame text-ember shadow-flame`;
export const ADMIN_GHOST = `${ADMIN_BTN} bg-surface-2 text-ink ring-1 ring-hairline ring-inset`;
export const ADMIN_QUIET = `${ADMIN_BTN} text-ink-3 hover:text-ink`;
export const ADMIN_DANGER = `${ADMIN_BTN} bg-berry/14 text-berry ring-1 ring-berry/30 ring-inset`;
export const ADMIN_TINY =
  'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold transition-move ' +
  'active:scale-95 disabled:pointer-events-none disabled:opacity-35';

export const INPUT_BOX =
  'w-full rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14.5px] text-ink outline-none ring-1 ring-hairline ring-inset ' +
  'placeholder:text-ink-4 focus:ring-[1.5px] focus:ring-flame-2/40 transition-[box-shadow] duration-150';

export const LABEL = 'block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-4';

export function Panel({
  title,
  hint,
  action,
  children,
  className,
  bare = false,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Skip the inner padding when the panel holds its own rows or a table. */
  bare?: boolean;
}) {
  return (
    <section className={cx(PANEL, className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="truncate text-[15px] font-semibold tracking-tight">{title}</h2>}
            {hint && <p className="mt-0.5 truncate text-[12.5px] text-ink-3">{hint}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={bare ? '' : PAD}>{children}</div>
    </section>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className={cx(DISPLAY, 'text-[26px] sm:text-[30px]')}>{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/* ── Numbers ───────────────────────────────────────────────────────── */

export function StatTile({
  label,
  value,
  sub,
  change,
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Fraction, where 0.12 is +12%. Null means there is nothing to compare to. */
  change?: number | null;
  emphasis?: boolean;
}) {
  return (
    <div className={cx(PANEL, 'px-4 py-3.5', emphasis && 'bg-flame-dim')}>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.09em] text-ink-4">{label}</div>
      <div className={cx(DISPLAY, 'mt-1.5 text-[24px] tnum sm:text-[27px]')}>{value}</div>
      <div className="mt-1 flex items-center gap-2 text-[12.5px]">
        {change !== undefined && <Change value={change} />}
        {sub && <span className="truncate text-ink-3">{sub}</span>}
      </div>
    </div>
  );
}

export function Change({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-ink-4">no prior figure</span>;
  const rounded = Math.round(value * 100);
  if (rounded === 0) return <span className="text-ink-4">level</span>;
  const up = rounded > 0;
  return (
    <span className={cx('font-semibold tnum', up ? 'text-mint' : 'text-berry')}>
      {up ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  );
}

export function Money({ value, currency, className }: { value: Minor; currency: string; className?: string }) {
  return <span className={cx('tnum', className)}>{formatMoney(value, currency)}</span>;
}

/* ── Status ────────────────────────────────────────────────────────── */

const STATUS_STYLE: Record<OrderStatus, string> = {
  PENDING: 'bg-flame-3/18 text-[#ff9270]',
  ACCEPTED: 'bg-gold/15 text-[#ffd479]',
  PREPARING: 'bg-[#7e9bff]/16 text-[#a4b6ff]',
  READY: 'bg-mint/16 text-[#6fd7a4]',
  COMPLETED: 'bg-white/8 text-ink-3',
  CANCELLED: 'bg-berry/14 text-[#ff8098]',
};

export function StatusPill({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center rounded-full px-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em]',
        STATUS_STYLE[status],
      )}
    >
      {label}
    </span>
  );
}

/* ── Form fields ───────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      <span className={LABEL}>{label}</span>
      <span className="mt-1.5 block">{children}</span>
      {hint && <span className="mt-1.5 block text-[12px] text-ink-4">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  type = 'text',
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: 'text' | 'email' | 'password';
  autoFocus?: boolean;
}) {
  return (
    <input
      className={INPUT_BOX}
      value={value}
      type={type}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  maxLength,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      className={cx(INPUT_BOX, 'resize-y leading-relaxed')}
      value={value}
      rows={rows}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select className={cx(INPUT_BOX, 'appearance-none')} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface-2">
          {o.label}
        </option>
      ))}
    </select>
  );
}

/**
 * Prices are entered in whole currency and stored in minor units. The
 * conversion happens once, here, so no screen ever holds a float price.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
}: {
  value: Minor;
  onChange: (next: Minor) => void;
  currency: string;
}) {
  const [text, setText] = useState(() => (value / 100).toFixed(2));
  return (
    <span className="relative block">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[13.5px] font-semibold text-ink-4">
        {symbolFor(currency)}
      </span>
      <input
        className={cx(INPUT_BOX, 'pl-12 tnum')}
        value={text}
        inputMode="decimal"
        onChange={(e) => {
          const next = e.target.value.replace(/[^0-9.]/g, '');
          setText(next);
          const parsed = Number.parseFloat(next);
          if (Number.isFinite(parsed)) onChange(Math.round(parsed * 100));
        }}
        onBlur={() => setText((value / 100).toFixed(2))}
      />
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        haptic.select();
        onChange(!checked);
      }}
      className={cx(
        'flex w-full items-center justify-between gap-4 rounded-xl px-1 py-2 text-left transition-move',
        'disabled:pointer-events-none disabled:opacity-40',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold">{label}</span>
        {hint && <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
      <span
        className={cx(
          'relative h-6.5 w-11 shrink-0 rounded-full transition-colors duration-200 ease-out-quart',
          checked ? 'bg-flame' : 'bg-surface-3',
        )}
        aria-hidden
      >
        <span
          className={cx(
            'absolute top-1 size-4.5 rounded-full bg-ink shadow-lift transition-move duration-200',
            checked ? 'left-5.5' : 'left-1',
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex gap-1 rounded-xl bg-surface-2 p-1 ring-1 ring-hairline ring-inset"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              haptic.tick();
              onChange(o.value);
            }}
            className={cx(
              'h-8 whitespace-nowrap rounded-lg px-3 text-[13px] font-semibold transition-move',
              on ? 'bg-surface-3 text-ink shadow-lift' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Destructive actions ───────────────────────────────────────────── */

/**
 * Irreversible things ask twice, in place, with the safe answer first — the
 * same bargain the diner side strikes when cancelling an order. Reversible
 * things do not ask at all; they get an undo in the toast instead.
 */
export function Confirm({
  label,
  question,
  confirmLabel,
  onConfirm,
  className,
  disabled = false,
}: {
  label: ReactNode;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking)
    return (
      <button
        type="button"
        disabled={disabled}
        className={cx(ADMIN_TINY, 'text-ink-3 hover:text-berry', className)}
        onClick={() => {
          haptic.warn();
          setAsking(true);
        }}
      >
        {label}
      </button>
    );

  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-2 py-1 pl-2.5 pr-1 ring-1 ring-hairline ring-inset">
      <span className="text-[12.5px] text-ink-2">{question}</span>
      <button type="button" className={cx(ADMIN_TINY, 'text-ink-3')} onClick={() => setAsking(false)}>
        <X size={13} /> Keep
      </button>
      <button
        type="button"
        className={cx(ADMIN_TINY, 'bg-berry/16 text-berry')}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        <Check size={13} /> {confirmLabel}
      </button>
    </span>
  );
}

/* ── Running a mutation ────────────────────────────────────────────── */

/**
 * Every dashboard action is the same three lines: disable the control, call
 * the API, say what happened. A rejected call is never silent — the server owns
 * the rules, so its refusal is the message worth showing.
 */
export function useCommand() {
  const push = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setPending(key);
      try {
        await action();
        if (success) {
          haptic.success();
          push(success);
        }
        return true;
      } catch (error) {
        haptic.warn();
        push(error instanceof ApiError ? error.message : 'That did not go through. Try again.', '⚠️');
        return false;
      } finally {
        setPending(null);
      }
    },
    [push],
  );

  return { pending, busy: pending !== null, run };
}

/* ── Odds and ends ─────────────────────────────────────────────────── */

export function Empty({ emoji, title, message, action }: { emoji: string; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-4 py-12 text-center">
      <div className="text-3xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="text-[15.5px] font-semibold tracking-tight">{title}</h3>
      <p className="max-w-[40ch] text-[13px] leading-relaxed text-ink-3">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 sm:px-5', className)}>
      {children}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16 text-[13px] text-ink-3">
      <span className="size-6 animate-breathe rounded-full bg-flame" aria-hidden />
      {label}
    </div>
  );
}

/** A read-only figure with its unit, used across analytics tables. */
export function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">{label}</div>
      <div className={cx('mt-0.5 text-[15px] font-semibold tnum', tone === 'good' && 'text-mint', tone === 'bad' && 'text-berry')}>
        {value}
      </div>
    </div>
  );
}
