import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../ui';
import { ADMIN_PRIMARY } from './kit';
import { useDiscardBack } from './useDiscardBack';

/** The sheet's one action, pinned to the bottom so it never scrolls out of reach on a phone. */
export const SHEET_FOOT =
  'sticky bottom-0 z-10 -mx-5 mt-1 flex items-center gap-2 border-t border-hairline bg-surface px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]';
export const FOOT_PRIMARY = cx(ADMIN_PRIMARY, 'h-11 flex-1 text-[15px]');

/**
 * A native <dialog> (focus trap, Esc, backdrop) that slides up on phones and in from the right on wider
 * screens, and leaves the same way. Every way of closing (button, backdrop, Esc) goes through `close`,
 * which plays the exit before the dialog shuts. Same frame as the stock sheets on `admin/Inventory`.
 */
export function Sheet({ label, onClose, wide, children }: { label: string; onClose: () => void; wide?: boolean; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useDiscardBack();
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  const close = () => {
    const el = ref.current;
    if (!el || !el.open || el.hasAttribute('data-closing')) return;
    el.setAttribute('data-closing', '');
    window.setTimeout(() => el.close(), 200);
  };
  return (
    <dialog
      ref={ref}
      // A dialog nested inside this one (a sub-sheet) fires the same events, and React bubbles them up.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onCancel={(e) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-label={label}
      className={cx(
        'sheet fixed m-0 flex max-h-none flex-col overflow-hidden bg-surface p-0 text-ink shadow-deep outline-none backdrop:bg-black/55 backdrop:backdrop-blur-[2px]',
        'inset-x-0 bottom-0 top-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl',
        'sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:h-dvh sm:max-h-none sm:rounded-none sm:rounded-l-3xl',
        wide ? 'sm:w-[min(720px,100vw)]' : 'sm:w-[460px]',
      )}
    >
      {children(close)}
    </dialog>
  );
}
