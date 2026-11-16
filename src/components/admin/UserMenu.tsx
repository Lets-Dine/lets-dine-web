import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminTheme } from '../../state/AdminTheme';
import { FEEDBACK_ENABLED } from '../../api/feedback';
import { Avatar } from './Avatar';
import { ChevronRight } from '../icons';
import { cx } from '../ui';

/** Sidebar footer: one row (the signed-in user) that opens a small panel to its right with the account actions. */
export function UserMenu({ name, role, avatarUrl, onFeedback, onSignOut }: { name: string; role: string; avatarUrl?: string | null; onFeedback: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { theme, toggle } = useAdminTheme();
  const navigate = useNavigate();

  // Unmount after the exit animation; a timer rather than animationend so reduced-motion (no animation) still closes.
  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 160);
  };

  useEffect(() => {
    if (!open || closing) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open, closing]);

  const row = 'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink';
  const avatar = (size: string) => <Avatar name={name} src={avatarUrl} className={size} />;

  return (
    <div ref={ref} className="relative mt-auto border-t border-hairline pt-4">
      <button
        type="button"
        onClick={() => (open && !closing ? close() : (setClosing(false), setOpen(true)))}
        aria-haspopup="menu"
        aria-expanded={open && !closing}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left ring-1 ring-hairline ring-inset transition-colors hover:bg-surface-2"
      >
        {avatar('size-9 text-[13px]')}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold">{name}</span>
          <span className="block text-[12px] text-ink-4">{role}</span>
        </span>
        <ChevronRight size={14} className="text-ink-4" />
      </button>

      {open && (
        <div role="menu" className={cx('absolute bottom-0 left-full z-50 ml-6 w-72 origin-bottom-left rounded-2xl bg-surface p-3 shadow-xl ring-1 ring-hairline ring-inset', closing ? 'animate-menu-out' : 'animate-menu-in')}>
          <div className="flex items-center gap-3 border-b border-hairline px-1 pb-3">
            {avatar('size-12 text-[16px]')}
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold">{name}</div>
              <div className="text-[12.5px] text-ink-4">{role}</div>
            </div>
          </div>
          <div className="mt-2 flex flex-col">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close();
                navigate('/admin/profile');
              }}
              className={row}
            >
              Profile
            </button>
            <button type="button" role="menuitemcheckbox" aria-checked={theme === 'dark'} onClick={toggle} className={row}>
              Dark theme
              <span className={cx('relative h-5 w-9 rounded-full transition-colors', theme === 'dark' ? 'bg-ink' : 'bg-surface-2 ring-1 ring-hairline ring-inset')}>
                <span className={cx('absolute top-0.5 size-4 rounded-full bg-bg transition-all', theme === 'dark' ? 'left-4.5' : 'left-0.5 bg-ink-4')} />
              </span>
            </button>
            {FEEDBACK_ENABLED && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  onFeedback();
                }}
                className={row}
              >
                Give feedback
              </button>
            )}
          </div>
          <button type="button" role="menuitem" onClick={onSignOut} className="mt-2 w-full rounded-lg bg-surface-2 px-3 py-2.5 text-[13.5px] font-semibold text-ink transition-colors hover:bg-hairline">
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
