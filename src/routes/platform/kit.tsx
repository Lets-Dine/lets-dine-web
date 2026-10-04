import type { ReactNode } from 'react';
import { STATUS_LABEL, STATUS_TONE } from '../../domain/subscription';
import type { SubscriptionStatus, Tone } from '../../domain/subscription';
import { formatMoney } from '../../domain/money';
import type { Minor } from '../../domain/types';
import type { InvoiceState } from '../../api/platformConsole';
import { cx } from '../../components/ui';

/**
 * Small shared vocabulary for the operator console. It sits on the dashboard
 * kit (`components/admin/kit`) — same panels, buttons and fields — and only adds
 * the pieces an operator needs and a single restaurant's dashboard never did:
 * tenant avatars, tone badges, relative time and a handful of honest charts.
 */

/* ── Tone ──────────────────────────────────────────────────────────── */

export const TONE_BADGE: Record<Tone, string> = {
  good: 'bg-mint/16 text-mint-ink',
  info: 'bg-pass/16 text-pass',
  warn: 'bg-gold/20 text-gold-ink',
  bad: 'bg-berry/14 text-berry-ink',
  muted: 'bg-ink/8 text-ink-3',
};

const TONE_DOT: Record<Tone, string> = {
  good: 'bg-mint',
  info: 'bg-pass',
  warn: 'bg-gold',
  bad: 'bg-berry',
  muted: 'bg-ink-4',
};

export function Badge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-bold tracking-[0.02em]',
        TONE_BADGE[tone],
        className,
      )}
    >
      <span className={cx('size-1.5 rounded-full', TONE_DOT[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

const INVOICE_TONE: Record<InvoiceState, Tone> = { OPEN: 'info', OVERDUE: 'bad', PAID: 'good', VOID: 'muted' };
const INVOICE_LABEL: Record<InvoiceState, string> = { OPEN: 'Open', OVERDUE: 'Overdue', PAID: 'Paid', VOID: 'Void' };

export function InvoiceBadge({ state }: { state: InvoiceState }) {
  return <Badge tone={INVOICE_TONE[state]}>{INVOICE_LABEL[state]}</Badge>;
}

/* ── Avatar ────────────────────────────────────────────────────────── */

const AVATAR_TINTS = [
  'bg-flame-dim text-flame-1',
  'bg-mint/16 text-mint-ink',
  'bg-gold/20 text-gold-ink',
  'bg-pass/16 text-pass',
  'bg-berry/14 text-berry-ink',
];

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean);
  const initials = ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
  return (
    <span
      className={cx('grid shrink-0 place-items-center rounded-xl font-bold tracking-tight', AVATAR_TINTS[hash(name) % AVATAR_TINTS.length], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/* ── Time ──────────────────────────────────────────────────────────── */

export function relTime(iso: string | null, now = Date.now()): string {
  if (!iso) return 'Never';
  const diff = now - Date.parse(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "due in 3 days" / "2 days overdue" — what an operator scanning a list needs, not a date to compute from. */
export function dueLabel(iso: string, now = Date.now()): string {
  const days = Math.ceil((Date.parse(iso) - now) / 86400000);
  if (days > 1) return `due in ${days} days`;
  if (days === 1) return 'due tomorrow';
  if (days === 0) return 'due today';
  return `${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
}

export const rupees = (minor: Minor) => formatMoney(minor, 'NPR');

/** 1.2M / 231K — only for chart labels; tables show the exact figure. */
export function compact(minor: Minor): string {
  const major = minor / 100;
  if (major >= 1_000_000) return `Rs. ${(major / 1_000_000).toFixed(1)}M`;
  if (major >= 1_000) return `Rs. ${Math.round(major / 1_000)}K`;
  return `Rs. ${Math.round(major)}`;
}

/* ── Charts ────────────────────────────────────────────────────────── */

/**
 * Twelve months of recurring revenue as plain bars. The current month is the
 * only one in the accent colour; every bar is a focusable, labelled element so
 * the figure is reachable without a pointer.
 */
export function MonthBars({ data }: { data: { label: string; value: Minor }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5" role="list" aria-label="Monthly recurring revenue, last 12 months">
        {data.map((d, i) => {
          const last = i === data.length - 1;
          return (
            <div
              key={`${d.label}-${i}`}
              role="listitem"
              tabIndex={0}
              aria-label={`${d.label}: ${rupees(d.value)}`}
              title={`${d.label} · ${rupees(d.value)}`}
              className="group relative flex h-full min-w-0 flex-1 flex-col justify-end outline-none"
            >
              <span
                className={cx(
                  'pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-surface-3 px-2 py-1 text-[11.5px] font-semibold text-ink opacity-0 shadow-lift transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                )}
              >
                {d.label} · {compact(d.value)}
              </span>
              <span
                className={cx(
                  'block w-full origin-bottom rounded-t-md animate-grow-y transition-colors duration-150',
                  last ? 'bg-flame' : 'bg-ink-4/45 group-hover:bg-ink-3/70 group-focus-visible:bg-ink-3/70',
                )}
                style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, animationDelay: `${i * 22}ms` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1.5 text-[11px] text-ink-4" aria-hidden>
        {data.map((d, i) => (
          <span key={`${d.label}-${i}`} className="min-w-0 flex-1 truncate text-center">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Orders per week for one restaurant — eight small bars, no axes: the shape is the point, exact counts live in the title. */
export function WeekBars({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex h-10 items-end gap-1" role="img" aria-label={`Orders per week, last ${data.length} weeks: ${data.join(', ')}`}>
      {data.map((v, i) => (
        <span
          key={i}
          title={`${v.toLocaleString()} orders`}
          className={cx('block w-2 rounded-sm', i === data.length - 1 ? 'bg-flame' : 'bg-ink-4/45')}
          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** One stacked bar splitting a total into named parts, with the legend carrying every number. */
export function StackBar({ parts }: { parts: { label: string; value: number; display: string; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.display}`).join(', ')}>
        {parts.map((p) => (
          <span key={p.label} className={cx('block h-full first:rounded-l-full last:rounded-r-full', p.className)} style={{ width: `${(p.value / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 grid gap-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-[13px]">
            <span className={cx('size-2.5 rounded-sm', p.className)} aria-hidden />
            <span className="font-semibold">{p.label}</span>
            <span className="ml-auto text-ink-3 tnum">{p.display}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A usage bar. `limit` undefined means unlimited and the bar stays quiet. */
export function Meter({ label, used, limit, compactLabel = false }: { label: string; used: number; limit?: number; compactLabel?: boolean }) {
  const fraction = limit ? Math.min(1, used / limit) : 0;
  const over = limit !== undefined && used > limit;
  const near = limit !== undefined && !over && used / limit >= 0.85;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className={compactLabel ? 'sr-only' : 'font-semibold text-ink-2'}>{label}</span>
        <span className={cx('tnum', over ? 'font-semibold text-berry-ink' : 'text-ink-3')}>
          {used.toLocaleString()}
          {limit !== undefined ? ` / ${limit.toLocaleString()}` : ' · no limit'}
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
      >
        <span
          className={cx('block h-full rounded-full transition-[width] duration-300 ease-out-quart', over ? 'bg-berry' : near ? 'bg-gold' : limit === undefined ? 'bg-ink-4/50' : 'bg-mint')}
          style={{ width: limit === undefined ? '100%' : `${Math.max(fraction * 100, used > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/* ── Table scaffolding ─────────────────────────────────────────────── */

export const TH = 'px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-4 first:pl-5 last:pr-5';
export const TD = 'px-4 py-3.5 align-middle first:pl-5 last:pr-5';

/** Filter pills with live counts — the operator's main way of cutting a list. */
export function FilterPills<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-semibold transition-move active:scale-95',
              on ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-2 ring-1 ring-hairline ring-inset hover:text-ink',
            )}
          >
            {o.label}
            {o.count !== undefined && <span className={cx('tnum text-[12px]', on ? 'opacity-70' : 'text-ink-4')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** One definition in a facts list — label above, value below. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-4">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-semibold">{children}</dd>
    </div>
  );
}

/** Skeleton rows while a list loads — the shape of the content, not a spinner in the middle of nothing. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-hairline px-5 py-4 last:border-0">
          <span className="size-9 rounded-xl shimmer-bg" />
          <span className="grid flex-1 gap-2">
            <span className="h-3 w-1/3 rounded shimmer-bg" />
            <span className="h-2.5 w-1/2 rounded shimmer-bg" />
          </span>
        </div>
      ))}
    </div>
  );
}
