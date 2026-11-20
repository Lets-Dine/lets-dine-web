import { STAFF_ORDERS_ENABLED } from '../../api/staff';
import { useAuth } from '../../state/AuthContext';
import { Ticket } from '../icons';
import { cx } from '../ui';

/**
 * The only way into POS mode: from the Orders page, in its own tab. `enter=1` is what the POS route accepts, so a typed
 * address or an old bookmark still lands back on Orders. Hidden where staff cannot place orders (the offline demo, or a role
 * without `orders:advance`).
 */
export function PosModeButton({ className }: { className?: string }) {
  const { allows } = useAuth();
  if (!STAFF_ORDERS_ENABLED || !allows('orders:advance')) return null;
  return (
    <a
      href="/admin/pos?enter=1"
      target="_blank"
      rel="opener"
      onClick={(event) => {
        event.preventDefault();
        const tab = window.open('/admin/pos?enter=1', '_blank');
        const root = tab?.document.documentElement as (HTMLElement & { webkitRequestFullscreen?: () => void }) | undefined;
        const ask = root?.requestFullscreen?.() ?? root?.webkitRequestFullscreen?.();
        void Promise.resolve(ask).catch(() => {});
      }}
      className={cx(
        'inline-flex h-12 items-center gap-2 rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-[scale,box-shadow] duration-200 hover:ring-hairline-strong active:scale-95',
        className,
      )}
    >
      <Ticket size={16} />
      POS mode
    </a>
  );
}
