import { useEffect, useRef, type ReactNode } from 'react';
import { formatMoney } from '../domain/money';
import { useCustomerSnapshot } from '../platform/customerDisplay';
import { DISPLAY, cx } from '../components/ui';

/** The screen that faces the customer while staff ring up the order. Opened from POS; takes no input and needs no sign-in. */
export function CustomerDisplay() {
  const snap = useCustomerSnapshot();
  const listRef = useRef<HTMLUListElement>(null);
  const lastKey = snap?.lines.at(-1)?.key ?? '';
  const count = snap?.lines.length ?? 0;

  useEffect(() => {
    const last = listRef.current?.lastElementChild;
    if (!last) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    last.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [lastKey, count]);

  if (!snap) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col justify-center">
          <p className={cx(DISPLAY, 'animate-rise text-[64px] leading-[1.02] sm:text-[88px]')}>Welcome</p>
        </div>
      </Frame>
    );
  }

  const owed = snap.total !== 0;
  const paying = snap.payAmount ?? snap.total;

  if (snap.payQr) {
    return (
      <Frame>
        <header className="animate-rise">
          <p className="text-[15px] font-semibold text-ink-3">{snap.restaurant}</p>
          <h1 className={cx(DISPLAY, 'mt-1 text-[36px] leading-[1.05] sm:text-[44px]')}>Scan to pay</h1>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <img src={snap.payQr} alt="Payment QR" className="size-64 rounded-3xl bg-white object-contain p-4 sm:size-80" />
        </div>
        <footer className="mt-auto pt-8">
          <div aria-hidden className="mb-5 h-px origin-left bg-flame-3/80" />
          <div className="flex items-end justify-between gap-6">
            <span className={cx(DISPLAY, 'pb-1 text-[22px] text-ink-2')}>To pay</span>
            <span className={cx(DISPLAY, 'text-right text-[52px] leading-none text-flame-1 sm:text-[68px]')}>{formatMoney(paying, snap.currency)}</span>
          </div>
        </footer>
      </Frame>
    );
  }

  return (
    <Frame>
      <header className="animate-rise">
        <p className="text-[15px] font-semibold text-ink-3">{snap.restaurant}</p>
        <h1 className={cx(DISPLAY, 'mt-1 truncate text-[36px] leading-[1.05] sm:text-[44px]')}>{snap.label}</h1>
      </header>

      {snap.lines.length === 0 ? (
        snap.total === 0 && (
          <div className="animate-rise pt-16">
            <p className={cx(DISPLAY, 'max-w-[12ch] text-[40px] leading-[1.08] text-ink-2 sm:text-[52px]')}>Waiting for the first dish</p>
            <p className="mt-4 max-w-[34ch] text-[17px] leading-relaxed text-ink-3">Each one shows up here as it is added.</p>
          </div>
        )
      ) : (
        <ul ref={listRef} className="mt-8 space-y-1">
          {snap.lines.map((line) => (
            <li key={line.key} className="animate-rise flex scroll-mb-36 items-center gap-6 py-3">
              <span className="grid h-11 min-w-11 place-items-center rounded-full bg-ink px-2.5 font-mono text-[16px] font-bold text-bg tnum">{line.qty}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[22px] font-semibold leading-tight">{line.name}</span>
                {line.detail && <span className="mt-0.5 block truncate text-[15px] text-ink-3">{line.detail}</span>}
              </span>
              <span className="shrink-0 font-mono text-[18px] font-bold tnum">{formatMoney(line.amount, snap.currency)}</span>
            </li>
          ))}
        </ul>
      )}

      <footer className="sticky bottom-0 z-10 mt-10 bg-bg pt-4">
        <div aria-hidden className="mb-5 h-px origin-left animate-grow-x bg-flame-3/80" />
        <div className="flex items-end justify-between gap-6">
          <span className={cx(DISPLAY, 'pb-1 text-[22px] text-ink-2')}>Total</span>
          <span key={snap.total} className={cx(DISPLAY, owed && 'animate-pop', 'text-right text-[52px] leading-none sm:text-[68px]', owed ? 'text-flame-1' : 'text-ink-4')}>
            {formatMoney(snap.total, snap.currency)}
          </span>
        </div>
      </footer>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-dvh bg-bg text-ink">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--color-flame-3)_22%,transparent),transparent_70%)]"
      />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-7 py-8 sm:px-10 sm:py-12">{children}</div>
    </main>
  );
}
