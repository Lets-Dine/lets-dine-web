import { locationOf, mapsUrl } from '../../domain/location';
import { MapPin } from '../icons';
import { cx } from '../ui';

/** "Open in Maps" for a delivery order the diner pinned from their device; nothing at all when they typed the address by hand. */
export function MapLink({ order, className }: { order: { deliveryLatitude?: number | null; deliveryLongitude?: number | null }; className?: string }) {
  const at = locationOf(order);
  if (!at) return null;
  return (
    <a href={mapsUrl(at)} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold text-flame-1 hover:underline', className)}>
      <MapPin size={14} /> Open in Maps
    </a>
  );
}
