import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { useWordReveal } from './motion';

/**
 * The marketing page's own small design system.
 *
 * The product app's kit (components/ui.ts) is built for touch targets on a
 * phone at a table. This page is a printed object: it needs a type scale
 * three times larger, printed rules instead of cards-on-cards, and a way to
 * flip a whole band to the night palette. Everything below is shared by every
 * section so no two bands drift apart.
 */

/* ── Type scale ───────────────────────────────────────────────────
   Four sizes, and the page uses no others. Fraunces carries the argument,
   Inter Tight carries the explanation, Space Mono carries every number.  */

export const DISPLAY_XL =
  'font-display font-semibold tracking-[-0.032em] leading-[0.96] [font-optical-sizing:auto] text-[clamp(34px,5.9vw,74px)]';

export const DISPLAY_LG =
  'font-display font-semibold tracking-[-0.026em] leading-[1.04] [font-optical-sizing:auto] text-[clamp(29px,4.2vw,52px)]';

export const DISPLAY_MD =
  'font-display font-semibold tracking-[-0.02em] leading-[1.1] [font-optical-sizing:auto] text-[clamp(22px,2.8vw,32px)]';

export const LEAD = 'text-pretty text-[16.5px] leading-[1.62] text-ink-2 sm:text-[18px]';
export const BODY = 'text-pretty text-[15px] leading-[1.6] text-ink-2';

/** Page rail. Wider than the product app — this page has editorial gutters. */
export const RAIL = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8 lg:px-12';

/* ── Band ─────────────────────────────────────────────────────────── */

/**
 * One horizontal band of the page. Bands are separated by a single printed
 * hairline rule rather than by whitespace alone, which is what stops fifteen
 * sections reading as fifteen floating cards.
 */
export function Band({
  id,
  children,
  night = false,
  rule = true,
  className,
  ref,
}: {
  id?: string;
  children: ReactNode;
  night?: boolean;
  rule?: boolean;
  className?: string;
  ref?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      id={id}
      ref={ref}
      className={cx(
        'relative',
        night && 'night',
        rule && 'rule-t',
        'py-20 sm:py-24 lg:py-32',
        className,
      )}
    >
      {children}
    </section>
  );
}

/** `03 — Dish intelligence`. The page numbers itself like a menu. */
export function Mark({ n, children, className }: { n: string; children: ReactNode; className?: string }) {
  return (
    <p data-reveal className={cx('label flex items-center gap-2.5 text-ink-4', className)}>
      <span className="text-flame-1">{n}</span>
      <span className="h-px w-6 bg-hairline-strong" aria-hidden />
      {children}
    </p>
  );
}

/* ── Headings ─────────────────────────────────────────────────────── */

/**
 * A heading that reveals word by word.
 *
 * The real text ships once, visible and unsplit, as the element's own content
 * — that is the accessible name, and it is what a visitor sees if JavaScript
 * never runs. The animated copy is a second, `aria-hidden` rendering stacked
 * on top; GSAP swaps which one is visible only after it has taken over.
 */
export function SplitHeading({
  text,
  as: Tag = 'h2',
  className,
  start,
}: {
  text: string;
  as?: 'h1' | 'h2' | 'p';
  className?: string;
  start?: string;
}) {
  const ref = useWordReveal<HTMLHeadingElement>(start);
  const words = text.split(' ');

  return (
    <Tag ref={ref as never} className={cx('text-balance', className)}>
      <span aria-hidden className="inline">
        {words.map((word, i) => (
          <span key={i} data-reveal-word className="inline-block overflow-hidden align-bottom pb-[0.08em]">
            <span className="inline-block">
              {word}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          </span>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </Tag>
  );
}

/* ── Actions ──────────────────────────────────────────────────────── */

const ACTION =
  'group inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight select-none ' +
  'transition-move active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40';

export function PrimaryCta({ to, children, size = 'md' }: { to: string; children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Link
      to={to}
      className={cx(
        ACTION,
        size === 'lg' ? 'h-13 w-full px-7 text-[16px] sm:h-14 sm:w-auto sm:px-8 sm:text-[16.5px]' : 'h-12.5 px-6.5 text-[15.5px]',
        'bg-flame text-white shadow-flame hover:shadow-flame-lg',
      )}
    >
      {children}
      <span className="transition-move group-hover:translate-x-0.5" aria-hidden>
        →
      </span>
    </Link>
  );
}

export function SecondaryCta({ to, children, size = 'md' }: { to: string; children: ReactNode; size?: 'md' | 'lg' }) {
  return (
    <Link
      to={to}
      className={cx(
        ACTION,
        size === 'lg' ? 'h-13 w-full px-7 text-[16px] sm:h-14 sm:w-auto sm:px-8 sm:text-[16.5px]' : 'h-12.5 px-6.5 text-[15.5px]',
        'bg-transparent text-ink ring-1 ring-hairline-strong ring-inset hover:bg-surface-2',
      )}
    >
      {children}
    </Link>
  );
}

/* ── Product surfaces ─────────────────────────────────────────────── */

/**
 * The one chrome every product mockup on this page sits in. A single radius,
 * a single hairline, a single shadow — so a dashboard in one band and an
 * admin table in another are visibly the same application.
 */
export function Panel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div
      className={cx(
        'overflow-hidden rounded-[20px] bg-surface shadow-deep ring-1 ring-hairline ring-inset',
        className,
      )}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** Product chrome header: traffic-light-free, just a title rule like the real app. */
export function PanelBar({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-5">
      <span className="truncate text-[13px] font-semibold tracking-tight text-ink">{title}</span>
      {right}
    </div>
  );
}

/** The phone chrome, shared by every mobile mockup. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'relative aspect-[9/19.3] w-full rounded-[2.75rem] bg-[#171310] p-[9px] shadow-deep',
        'ring-1 ring-black/25',
        className,
      )}
    >
      <span
        className="absolute left-1/2 top-[17px] z-10 h-[22px] w-[74px] -translate-x-1/2 rounded-full bg-[#0c0908]"
        aria-hidden
      />
      <div className="night relative size-full overflow-hidden rounded-[2.3rem] bg-bg">{children}</div>
    </div>
  );
}

/* ── Figures ──────────────────────────────────────────────────────── */

/** A number and what it counts. Mono, tabular, so nothing jitters as it counts. */
export function Figure({
  value,
  label,
  refCb,
  className,
}: {
  value: ReactNode;
  label: string;
  refCb?: (node: HTMLElement | null) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <div ref={refCb} className="font-mono text-[26px] font-bold tabular-nums tracking-tight text-ink sm:text-[30px]">
        {value}
      </div>
      <div className="mt-1 text-[12.5px] leading-snug text-ink-3">{label}</div>
    </div>
  );
}
