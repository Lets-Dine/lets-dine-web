import { Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { BTN_GHOST, DISPLAY, GLASS, ICON_BTN, NARROW, SHELL, cx } from '../components/ui';
import { ChevronLeft } from '../components/icons';

/** Back-capable sticky header used by every secondary screen. */
export function TopBar({
  title,
  subtitle,
  right,
  fallbackTo,
  width = NARROW,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  fallbackTo?: string;
  width?: string;
}) {
  const navigate = useNavigate();
  return (
    <header className={cx('sticky top-0 z-55 shadow-[0_1px_0_var(--color-hairline)]', GLASS)}>
      <div className={cx(width, 'grid grid-cols-[40px_1fr_40px] items-center gap-3 py-2.5 pt-[calc(10px+var(--safe-t))]')}>
        <button
          type="button"
          className={ICON_BTN}
          aria-label="Go back"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallbackTo ?? '/'))}
        >
          <ChevronLeft size={19} />
        </button>
        <div className="flex min-w-0 flex-col items-center leading-tight">
          <b className="max-w-full truncate text-[15.5px] font-semibold tracking-tight">{title}</b>
          {subtitle && <span className="text-[11.5px] text-ink-3">{subtitle}</span>}
        </div>
        <div className="flex justify-end">{right}</div>
      </div>
    </header>
  );
}

export function BootScreen() {
  return (
    <div className={cx(SHELL, 'grid place-content-center justify-items-center gap-5')}>
      <div className="grid size-13 animate-breathe place-items-center rounded-full bg-flame shadow-flame" aria-hidden>
        <span className="size-4 rounded-full bg-bg" />
      </div>
      <p className="text-[14px] text-ink-3">Setting your table…</p>
    </div>
  );
}

export function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className={cx(SHELL, 'grid place-content-center justify-items-center gap-3 px-6 py-10 text-center')}>
      <div className="text-5xl" aria-hidden>
        🫗
      </div>
      <h1 className={cx(DISPLAY, 'text-2xl')}>{title}</h1>
      <p className="mb-2.5 max-w-[30ch] text-[14.5px] text-ink-3">{message}</p>
      <Link to="/" className={BTN_GHOST}>
        Back to start
      </Link>
    </div>
  );
}

export function EmptyState({
  emoji,
  title,
  message,
  action,
}: {
  emoji: string;
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-2.5 rounded-3xl bg-surface px-5 py-11 text-center ring-1 ring-hairline ring-inset">
      <div className="text-4xl" aria-hidden>
        {emoji}
      </div>
      <h3 className="text-[16.5px] font-semibold tracking-tight">{title}</h3>
      <p className="mb-1.5 max-w-[36ch] text-[13.5px] leading-relaxed text-ink-3">{message}</p>
      {action}
    </div>
  );
}
