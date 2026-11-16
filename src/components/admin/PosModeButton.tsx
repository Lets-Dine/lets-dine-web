import { Link } from 'react-router-dom';
import { STAFF_ORDERS_ENABLED } from '../../api/staff';
import { enterFullscreen } from '../../platform/fullscreen';
import { useAuth } from '../../state/AuthContext';
import { Ticket } from '../icons';
import { cx } from '../ui';

/**
 * The only way into POS mode: from the Orders page. The route checks for the state this link carries, so typing the address or
 * following an old bookmark lands back on Orders. Hidden where staff cannot place orders (the offline demo, or a role without
 * `orders:advance`).
 */
export function PosModeButton({ className }: { className?: string }) {
  const { allows } = useAuth();
  if (!STAFF_ORDERS_ENABLED || !allows('orders:advance')) return null;
  return (
    <Link
      to="/admin/pos"
      state={{ pos: true }}
      // The click is the permission the browser wants for full screen; it carries over to the page the link opens.
      onClick={() => void enterFullscreen()}
      className={cx(
        'inline-flex h-12 items-center gap-2 rounded-full bg-surface-2 px-5 text-[15px] font-semibold text-ink ring-1 ring-hairline ring-inset transition-[scale,box-shadow] duration-200 hover:ring-hairline-strong active:scale-95',
        className,
      )}
    >
      <Ticket size={16} />
      POS mode
    </Link>
  );
}
