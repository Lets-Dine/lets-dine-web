import { directionsUrl, locationOf } from '../../domain/location';
import { useDashboard } from '../../routes/admin/AdminLayout';
import { MapPin } from '../icons';
import { cx } from '../ui';

/** Directions from the restaurant's pin to a delivery order the diner pinned; nothing at all when they typed the address by hand. */
export function MapLink({ order, className }: { order: { deliveryLatitude?: number | null; deliveryLongitude?: number | null }; className?: string }) {
  const { restaurant } = useDashboard().menu;
  const at = locationOf(order);
  if (!at) return null;
  const from = restaurant.latitude != null && restaurant.longitude != null ? { lat: restaurant.latitude, lng: restaurant.longitude } : null;
  return (
    <a href={directionsUrl(at, from)} target="_blank" rel="noreferrer" className={cx('inline-flex items-center gap-1.5 text-[13px] font-semibold text-flame-1 hover:underline', className)}>
      <MapPin size={14} /> {from ? 'Get directions' : 'Open in Maps'}
    </a>
  );
}
