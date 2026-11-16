import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, X } from '../icons';
import { DISPLAY, cx } from '../ui';
import { INPUT_BOX } from './kit';
import { MONTHS, NAV, WEEK, daysIn, iso, longDay, parse } from './DatePicker';

const WIDTH = 304;
const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const label = (v: string) => {
  const p = parse(v);
  return p ? short.format(new Date(p.y, p.m, p.d)) : '';
};

type Place = { left: number; top?: number; bottom?: number };

/**
 * One field for a from–to range: the first tap on the calendar starts the range, the second ends it (an earlier
 * second day just swaps them). Values are `YYYY-MM-DD`, or '' when empty. A range left half-picked is dropped.
 */
export function DateRangePicker({
  from,
  to,
  onChange,
  min,
  max,
  placeholder = 'Any dates',
  className,
  compact,
  clearable = true,
  'aria-label': ariaLabel,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  /** Sizes the field's wrapper, e.g. `w-56` in a filter bar. */
  className?: string;
  /** The shorter filter-bar height. */
  compact?: boolean;
  /** Show the × that empties the range; off where a range is always needed. */
  clearable?: boolean;
  'aria-label'?: string;
}) {
  const panelId = useId();
  const box = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState({ y: 0, m: 0 });
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>({ left: 0 });

  const now = new Date();
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());

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
    const p = parse(from) ?? { y: now.getFullYear(), m: now.getMonth() };
    setView({ y: p.y, m: p.m });
    setAnchor(null);
    setHover(null);
    locate();
    setOpen(true);
  }

  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }

  useLayoutEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    el.showPopover();
    const follow = () => locate();
    const outside = (e: PointerEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || el.contains(t)) return;
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

  const outOf = (s: string) => (!!min && s < min) || (!!max && s > max);

  function pick(s: string) {
    if (anchor === null) {
      setAnchor(s);
      return;
    }
    onChange(...((s < anchor ? [s, anchor] : [anchor, s]) as [string, string]));
    close();
  }

  function step(dm: number) {
    setView((v) => {
      const t = new Date(v.y, v.m + dm, 1);
      return { y: t.getFullYear(), m: t.getMonth() };
    });
  }

  // While a range is half-picked, the shade follows the pointer; otherwise it shows the saved range.
  const [lo, hi] = anchor !== null ? [anchor, hover ?? anchor].sort() : [from, to];

  const lead = new Date(view.y, view.m, 1).getDay();
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1)];
  const text = from && to ? (from === to ? label(from) : `${label(from)} – ${label(to)}`) : from ? `From ${label(from)}` : to ? `Until ${label(to)}` : '';
  const prevOff = !!min && iso(view.y, view.m, 1) <= min;
  const nextOff = !!max && iso(view.y, view.m, daysIn(view.y, view.m)) >= max;

  return (
    <span ref={box} className={cx('relative block w-full', className)}>
      <button
        ref={trigger}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => (open ? close(false) : show())}
        className={cx(INPUT_BOX, compact ? 'h-10' : 'h-[42px]', clearable ? 'pr-16' : 'pr-10', 'truncate text-left hover:bg-surface-3 tnum', !text && 'text-ink-4')}
      >
        {text || placeholder}
      </button>
      <span className="absolute inset-y-0 right-2 flex items-center gap-0.5">
        {text && clearable && (
          <button
            type="button"
            aria-label="Clear dates"
            onClick={() => {
              onChange('', '');
              if (open) close();
            }}
            className="grid size-7 place-items-center rounded-full text-ink-4 transition-move hover:bg-surface-3 hover:text-ink active:scale-90"
          >
            <X size={14} />
          </button>
        )}
        <span className={cx('pointer-events-none grid size-7 place-items-center text-ink-4 transition-[color,transform] duration-150', open && 'rotate-180 text-flame-2')}>
          <ChevronDown size={16} />
        </span>
      </span>

      {open && (
        <div
          ref={panel}
          id={panelId}
          popover="manual"
          role="dialog"
          aria-label="Choose dates"
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.preventDefault()}
          style={{ top: place.top ?? 'auto', bottom: place.bottom ?? 'auto', left: place.left, width: WIDTH, right: 'auto', height: 'auto', margin: 0 }}
          className="animate-swap rounded-2xl border-0 bg-surface p-3 text-ink shadow-lift ring-1 ring-hairline ring-inset"
        >
          <div className="flex items-center justify-between gap-1">
            <button type="button" aria-label="Previous month" onClick={() => step(-1)} disabled={prevOff} className={NAV}>
              <ChevronLeft size={18} />
            </button>
            <span className={cx(DISPLAY, 'text-[22px] leading-none tracking-[-0.02em] tnum')} aria-live="polite">
              {MONTHS[view.m]} {view.y}
            </span>
            <button type="button" aria-label="Next month" onClick={() => step(1)} disabled={nextOff} className={NAV}>
              <ChevronRight size={18} />
            </button>
          </div>

          <p className="mt-2 text-center text-[12px] text-ink-3">{anchor === null ? 'Pick the first day' : 'Now pick the last day'}</p>

          <div className="mt-2 grid grid-cols-7 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-ink-4" aria-hidden>
            {WEEK.map((w, i) => (
              <span key={i} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5" role="group" aria-label={`${MONTHS[view.m]} ${view.y}`} onMouseLeave={() => setHover(null)}>
            {cells.map((d, i) => {
              if (d === null) return <span key={`gap${i}`} />;
              const s = iso(view.y, view.m, d);
              const end = s === lo || s === hi;
              const within = !!lo && !!hi && s > lo && s < hi;
              // The shade runs behind the days as one band, with the two ends rounded off.
              const band = within || (end && !!lo && !!hi && lo !== hi);
              return (
                <span key={d} className={cx(band && 'bg-flame-2/20', s === lo && lo !== hi && 'rounded-l-full', s === hi && lo !== hi && 'rounded-r-full')}>
                  <button
                    type="button"
                    disabled={outOf(s)}
                    aria-pressed={end}
                    aria-label={longDay.format(new Date(view.y, view.m, d))}
                    onMouseEnter={() => setHover(s)}
                    onClick={() => pick(s)}
                    className={cx(
                      'mx-auto grid size-9 place-items-center rounded-full text-[14px] font-medium transition-move active:scale-90 disabled:pointer-events-none disabled:opacity-25 tnum',
                      end ? 'bg-flame font-bold text-white' : within ? 'text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                      s === today && !end && 'text-flame-1',
                    )}
                  >
                    {d}
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </span>
  );
}
