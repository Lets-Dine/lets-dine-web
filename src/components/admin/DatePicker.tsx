import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { INPUT_BOX } from './kit';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WIDTH = 304;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const parse = (v: string) => {
  const hit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return hit ? { y: +hit[1], m: +hit[2] - 1, d: +hit[3] } : null;
};
/** What a person types: 12/03/1994 (day first), 1994-03-12, or just 12031994. Only a real date inside `min`/`max` counts. */
const readTyped = (text: string, min?: string, max?: string) => {
  const t = text.trim();
  const a = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  const b = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/.exec(t);
  const [y, m, d] = a ? [+a[1], +a[2], +a[3]] : b ? [+b[3], +b[2], +b[1]] : [0, 0, 0];
  if (y < 1000 || m < 1 || m > 12 || d < 1 || d > daysIn(y, m - 1)) return null;
  const s = iso(y, m - 1, d);
  return (min && s < min) || (max && s > max) ? null : s;
};
/** The editable form of a stored date. */
const typedForm = (v: string) => {
  const p = parse(v);
  return p ? `${pad(p.d)}/${pad(p.m + 1)}/${p.y}` : '';
};
/**
 * Keeps what is typed in DD/MM/YYYY shape: digits that overflow a part spill into the next, so `01/012026`
 * and `01012026` both become `01/01/2026`. A year-first date (`1994-03-12`) is left as typed.
 */
const shape = (raw: string) => {
  const t = raw.replace(/[^\d/.\- ]/g, '');
  if (/^\d{4}[-/. ]/.test(t)) return t;
  let [a = '', b, c] = t.split(/[/.\- ]+/).filter(Boolean);
  if (a.length > 2) [a, b] = [a.slice(0, 2), a.slice(2) + (b ?? '')];
  if (b !== undefined && b.length > 2) [b, c] = [b.slice(0, 2), b.slice(2) + (c ?? '')];
  const parts = [a, b, c?.slice(0, 4)].filter((x) => x !== undefined);
  // A separator typed after the last part stays, so `01/` does not lose its slash.
  return parts.join('/') + (/[/.\- ]$/.test(t) && parts.length < 3 ? '/' : '');
};
const longDay = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const NAV =
  'grid size-9 shrink-0 place-items-center rounded-full text-ink-3 transition-move hover:bg-surface-2 hover:text-ink active:scale-90 disabled:pointer-events-none disabled:opacity-25';

type Place = { left: number; top?: number; bottom?: number };

/**
 * A date field that opens a calendar in the top layer, so it clears the sheet it sits in. The year is the
 * big, tappable thing: tap it for a grid of years, because a birthday is decades away and month-by-month
 * paging would never get there. Value is `YYYY-MM-DD` (what `<input type="date">` gave), or '' when empty.
 */
export function DatePicker({
  value,
  onChange,
  min,
  max,
  startYear,
  placeholder = 'DD/MM/YYYY',
  className,
  compact,
  clearable = true,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  min?: string;
  max?: string;
  /** The year the calendar opens on while nothing is chosen. */
  startYear?: number;
  placeholder?: string;
  /** Sizes the field's wrapper, e.g. `w-40` in a filter bar. */
  className?: string;
  /** The shorter filter-bar height. */
  compact?: boolean;
  /** Show the × that empties the field; off where a date is always needed. */
  clearable?: boolean;
  'aria-label'?: string;
}) {
  const panelId = useId();
  const box = useRef<HTMLSpanElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const [years, setYears] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>({ left: 0 });

  const picked = parse(value);
  const now = new Date();
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const lo = min ? parse(min) : null;
  const hi = max ? parse(max) : null;

  function locate() {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const above = window.innerHeight - rect.bottom < 420 && rect.top > 420;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - WIDTH - 8)),
      top: above ? undefined : rect.bottom + 6,
      bottom: above ? window.innerHeight - rect.top + 6 : undefined,
    });
  }

  function show() {
    const base = picked ?? {
      y: startYear ?? now.getFullYear(),
      m: picked ? 0 : now.getMonth(),
    };
    setView({ y: base.y, m: base.m });
    setYears(false);
    locate();
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) field.current?.focus();
  }

  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    el.showPopover();
    const follow = () => locate();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || el.contains(t)) return;
      commitNow.current();
      setOpen(false);
    };
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, true);
    document.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, true);
      document.removeEventListener('pointerdown', outside, true);
      if (el.matches(':popover-open')) el.hidePopover();
    };
  }, [open]);

  // Arrow-down from the field steps into the grid: onto the chosen day, else today, else the first open day.
  function focusGrid() {
    const grid = panel.current;
    (
      grid?.querySelector<HTMLButtonElement>('[aria-pressed="true"]:not(:disabled)') ??
      grid?.querySelector<HTMLButtonElement>('[data-today]:not(:disabled)') ??
      grid?.querySelector<HTMLButtonElement>('[data-day]:not(:disabled)')
    )?.focus({ preventScroll: true });
  }

  /** Settle what was typed: a good date is taken, an empty field clears, anything else snaps back. */
  function commit() {
    if (draft === null) return;
    const text = draft;
    setDraft(null);
    if (text.trim() === '') onChange('');
    else {
      const next = readTyped(text, min, max);
      if (next) onChange(next);
    }
  }

  const commitNow = useRef(commit);
  commitNow.current = commit;

  const typedDate = draft === null ? null : readTyped(draft, min, max);
  const bad = draft !== null && draft.replace(/\D/g, '').length >= 8 && !typedDate;

  const outOf = (y: number, m: number, d: number) => {
    const s = iso(y, m, d);
    return (!!min && s < min) || (!!max && s > max);
  };
  const monthOut = (y: number, m: number) => outOf(y, m, 1) && outOf(y, m, daysIn(y, m));

  const step = (dy: number) => setView((v) => ({ ...v, y: v.y + dy }));
  const decade = Math.floor(view.y / 12) * 12;

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      // Without this the sheet around the picker takes the Esc and closes too.
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const d = (e.target as HTMLElement).dataset.day;
    const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!d || !delta) return;
    e.preventDefault();
    const next = Math.min(daysIn(view.y, view.m), Math.max(1, +d + delta));
    panel.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]:not(:disabled)`)?.focus();
  }

  const lead = new Date(view.y, view.m, 1).getDay();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1)];

  return (
    <span ref={box} className={cx('relative block w-full', className)}>
      <input
        ref={field}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-invalid={bad || undefined}
        maxLength={10}
        value={draft ?? typedForm(value)}
        placeholder={placeholder}
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onBlur={(e) => {
          // Arrowing into the calendar is not leaving the field.
          if (panel.current?.contains(e.relatedTarget as Node)) return;
          commit();
          setOpen(false);
        }}
        onClick={() => !open && show()}
        onChange={(e) => {
          const text = shape(e.target.value);
          setDraft(text);
          if (!open) show();
          const hit = readTyped(text, min, max);
          const p = hit && parse(hit);
          if (p) setView({ y: p.y, m: p.m });
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            if (open) close(false);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (!open) show();
            else focusGrid();
          } else if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
            close(false);
          }
        }}
        className={cx(
          INPUT_BOX,
          compact ? 'h-10' : 'h-[42px]',
          clearable ? 'pr-16' : 'pr-10',
          'hover:bg-surface-3 tnum',
          bad && 'ring-berry/60 focus:ring-berry/60',
        )}
      />
      <span className="absolute inset-y-0 right-2 flex items-center gap-0.5">
        {picked && clearable && (
          <button
            type="button"
            aria-label="Clear date"
            onClick={() => {
              onChange('');
              setDraft(null);
              if (open) close();
            }}
            className="grid size-7 place-items-center rounded-full text-ink-4 transition-move hover:bg-surface-3 hover:text-ink active:scale-90"
          >
            <X size={14} />
          </button>
        )}
        <span
          className={cx(
            'pointer-events-none grid size-7 place-items-center text-ink-4 transition-[color,transform] duration-150',
            open && 'rotate-180 text-flame-2',
          )}
        >
          <ChevronDown size={16} />
        </span>
      </span>

      {open && (
        <div
          ref={panel}
          id={panelId}
          popover="manual"
          role="dialog"
          aria-label="Choose a date"
          onKeyDown={onKey}
          onMouseDown={(e) => e.preventDefault()}
          // The picker usually sits inside a <label> (Field); a click here would otherwise be relayed to the trigger and shut the panel.
          onClick={(e) => e.preventDefault()}
          style={{
            top: place.top ?? 'auto',
            bottom: place.bottom ?? 'auto',
            left: place.left,
            width: WIDTH,
            right: 'auto',
            height: 'auto',
            margin: 0,
          }}
          className="animate-swap rounded-2xl border-0 bg-surface p-3 text-ink shadow-lift ring-1 ring-hairline ring-inset"
        >
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={years ? 'Earlier years' : 'Previous year'}
              onClick={() => step(years ? -12 : -1)}
              disabled={!!lo && (years ? decade <= lo.y : view.y <= lo.y)}
              className={NAV}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-expanded={years}
              onClick={() => setYears((v) => !v)}
              className={cx(
                DISPLAY,
                'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[24px] leading-none tracking-[-0.02em] transition-move hover:bg-surface-2 active:scale-95 tnum',
              )}
            >
              {years ? `${decade}–${decade + 11}` : view.y}
              <ChevronDown size={14} className={cx('text-ink-4 transition-transform duration-150', years && 'rotate-180')} />
            </button>
            <button
              type="button"
              aria-label={years ? 'Later years' : 'Next year'}
              onClick={() => step(years ? 12 : 1)}
              disabled={!!hi && (years ? decade + 11 >= hi.y : view.y >= hi.y)}
              className={NAV}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {years ? (
            <div key="years" className="mt-3 grid animate-swap grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => decade + i).map((y) => {
                const off = (!!lo && y < lo.y) || (!!hi && y > hi.y);
                const on = y === view.y;
                return (
                  <button
                    key={y}
                    type="button"
                    disabled={off}
                    aria-pressed={y === picked?.y}
                    onClick={() => {
                      setView((v) => ({ ...v, y }));
                      setYears(false);
                    }}
                    className={cx(
                      'h-11 rounded-xl text-[14.5px] font-semibold transition-move active:scale-95 disabled:pointer-events-none disabled:opacity-25 tnum',
                      on ? 'bg-flame text-white' : 'bg-surface-2 text-ink-2 hover:bg-surface-3',
                    )}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          ) : (
            <div key="days" className="animate-swap">
              <div className="mt-3 grid grid-cols-6 gap-1">
                {MONTHS.map((name, m) => (
                  <button
                    key={name}
                    type="button"
                    disabled={monthOut(view.y, m)}
                    aria-pressed={m === view.m}
                    onClick={() => setView((v) => ({ ...v, m }))}
                    className={cx(
                      'h-8 rounded-lg text-[12.5px] font-semibold transition-move active:scale-95 disabled:pointer-events-none disabled:opacity-25',
                      m === view.m ? 'bg-ink text-surface' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-4" aria-hidden>
                {WEEK.map((w, i) => (
                  <span key={i} className="py-1">
                    {w}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5" role="group" aria-label={`${MONTHS[view.m]} ${view.y}`}>
                {cells.map((d, i) => {
                  if (d === null) return <span key={`gap${i}`} />;
                  const s = iso(view.y, view.m, d);
                  const on = s === value;
                  return (
                    <button
                      key={d}
                      type="button"
                      data-day={d}
                      data-today={s === today ? '' : undefined}
                      disabled={outOf(view.y, view.m, d)}
                      aria-pressed={on}
                      aria-label={longDay.format(new Date(view.y, view.m, d))}
                      onClick={() => {
                        onChange(s);
                        setDraft(null);
                        close();
                      }}
                      className={cx(
                        'mx-auto grid size-9 place-items-center rounded-full text-[14px] font-medium transition-move active:scale-90 disabled:pointer-events-none disabled:opacity-25 tnum',
                        on ? 'bg-flame font-bold text-white' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                        s === today && !on && 'text-flame-1 ring-1 ring-flame-2/50 ring-inset',
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
