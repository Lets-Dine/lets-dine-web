import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { haptic } from '../platform/haptics';
import { cx } from '../components/ui';

/** An escape hatch attached to the toast, so a slip is one tap from undone. */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Toast {
  id: number;
  message: string;
  icon: ReactNode;
  action?: ToastAction;
  leaving: boolean;
}

export type Push = (message: string, icon?: ReactNode, action?: ToastAction) => void;

const ToastContext = createContext<Push | null>(null);

let seq = 0;

/** A toast carrying an undo is worth reading; give it longer to be read. */
const LIFETIME = { plain: 2400, withAction: 5200 };
/** Matches the exit keyframe — long enough to read as leaving, short enough not to queue. */
const EXIT_MS = 200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>[]>());

  const forget = useCallback((id: number) => {
    for (const t of timers.current.get(id) ?? []) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      forget(id);
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
    },
    [forget],
  );

  const push = useCallback<Push>(
    (message, icon = '✓', action) => {
      const id = ++seq;
      setToasts((prev) => [...prev.slice(-2), { id, message, icon, action, leaving: false }]);
      const life = action ? LIFETIME.withAction : LIFETIME.plain;
      timers.current.set(id, [
        setTimeout(() => setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t))), life),
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
          timers.current.delete(id);
        }, life + EXIT_MS),
      ]);
    },
    [],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const list of pending.values()) for (const t of list) clearTimeout(t);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-h)+var(--safe-b)+22px)] z-90 flex flex-col items-center gap-2 px-4 lg:bottom-8"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            className={cx(
              'pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-surface-3/92 py-2.5 pl-3 pr-2 text-[14px]',
              'font-semibold shadow-deep ring-1 ring-hairline-strong ring-inset backdrop-blur-lg',
              t.leaving ? 'animate-sink' : 'animate-pop',
            )}
            key={t.id}
          >
            <span className="grid size-5.5 shrink-0 place-items-center rounded-full bg-flame text-ember" aria-hidden>
              {t.icon}
            </span>
            <span className="min-w-0 flex-1 truncate pr-1.5">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                className="-my-1 shrink-0 rounded-full px-3 py-2 text-[13.5px] font-bold text-flame-1 transition-move active:scale-90"
                onClick={() => {
                  haptic.tick();
                  t.action?.onAction();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : (
              <span className="w-1.5" aria-hidden />
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): Push {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
