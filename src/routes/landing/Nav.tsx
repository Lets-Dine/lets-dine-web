import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { X } from '../../components/icons';
import { scrollToSection } from './motion';

const LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#dish-intelligence', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/resources', label: 'Resources' },
];

const isAnchor = (href: string) => href.startsWith('#');

/** The wordmark. Two weights of one typeface and a printed rule — no logo art. */
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('font-display text-[19px] font-semibold tracking-[-0.03em] text-ink', className)}>
      letsDine
      <span className="text-flame-1">.</span>
    </span>
  );
}

export function LandingNav() {
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setCompact(window.scrollY > 24);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // The sheet is a focus trap while it is open, and Escape always closes it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>('a, button');
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const jump = (href: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    setOpen(false);
    scrollToSection(href);
  };

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-ink focus:px-5 focus:py-2.5 focus:text-[14px] focus:font-semibold focus:text-bg"
      >
        Skip to content
      </a>

      <header
        className={cx(
          'fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-400 ease-out-quart',
          compact
            ? 'border-b border-hairline bg-bg/88 backdrop-blur-xl backdrop-saturate-150'
            : 'border-b border-transparent bg-transparent',
        )}
      >
        <nav
          aria-label="Primary"
          className={cx(
            'mx-auto flex w-full max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12',
            'transition-[height] duration-400 ease-out-quart',
            compact ? 'h-[62px]' : 'h-[80px]',
          )}
        >
          <Link to="/" className="shrink-0 rounded-md" aria-label="letsDine — home">
            <Wordmark />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((link) => (
              <li key={link.label}>
                {isAnchor(link.href) ? (
                  <a
                    href={link.href}
                    onClick={jump(link.href)}
                    className="rounded-full px-3.5 py-2 text-[14.5px] font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    to={link.href}
                    className="rounded-full px-3.5 py-2 text-[14.5px] font-medium text-ink-2 transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/admin/signin"
              className="hidden rounded-full px-3.5 py-2 text-[14.5px] font-medium text-ink-2 transition-colors hover:text-ink sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              to="/get-started"
              className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14.5px] font-semibold text-bg transition-move active:scale-[0.97] hover:bg-flame-3"
            >
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="grid size-10 place-items-center rounded-full text-ink ring-1 ring-hairline-strong ring-inset transition-move active:scale-90 lg:hidden"
            >
              <span className="flex flex-col gap-[4.5px]" aria-hidden>
                <span className="block h-[1.5px] w-4 bg-current" />
                <span className="block h-[1.5px] w-4 bg-current" />
              </span>
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile sheet — a full menu card, not a cramped dropdown. */}
      {open && (
        <div className="fixed inset-0 z-[55] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/35 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-x-3 top-3 animate-rise rounded-[22px] bg-surface p-5 shadow-deep ring-1 ring-hairline ring-inset"
          >
            <div className="flex items-center justify-between">
              <Wordmark />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid size-9 place-items-center rounded-full text-ink-2 ring-1 ring-hairline ring-inset transition-move active:scale-90"
              >
                <X size={16} />
              </button>
            </div>

            <ul className="mt-5 flex flex-col divide-y divide-hairline border-y border-hairline">
              {LINKS.map((link) => (
                <li key={link.label}>
                  {isAnchor(link.href) ? (
                    <a href={link.href} onClick={jump(link.href)} className="block py-3.5 text-[17px] font-medium text-ink">
                      {link.label}
                    </a>
                  ) : (
                    <Link to={link.href} onClick={() => setOpen(false)} className="block py-3.5 text-[17px] font-medium text-ink">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>

            <div className="mt-5 flex flex-col gap-2.5">
              <Link
                to="/get-started"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-full bg-flame text-[15.5px] font-semibold text-white"
              >
                Get started
              </Link>
              <Link
                to="/admin/signin"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center rounded-full text-[15.5px] font-semibold text-ink ring-1 ring-hairline-strong ring-inset"
              >
                Log in
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
