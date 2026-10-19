export interface LatLng {
  lat: number;
  lng: number;
}

/** Opens Google Maps on the exact spot — what a rider or dispatcher taps. */
export const mapsUrl = ({ lat, lng }: LatLng) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** The order's shared location, if it has one — both coordinates or none. */
export const locationOf = (o: { deliveryLatitude?: number | null; deliveryLongitude?: number | null }): LatLng | null =>
  o.deliveryLatitude != null && o.deliveryLongitude != null ? { lat: o.deliveryLatitude, lng: o.deliveryLongitude } : null;

interface Reverse {
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

/**
 * A short, human name for a spot ("Lazimpat, Kathmandu"), from OpenStreetMap's free Nominatim service.
 * The coordinates leave the device for it. Null when it can't be reached or knows nothing there — the
 * caller keeps the coordinates either way.
 */
export async function placeName({ lat, lng }: LatLng, timeoutMs = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=en&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as Reverse;
    const a = data.address ?? {};
    const parts = [
      data.name || a.road,
      a.neighbourhood || a.suburb || a.quarter,
      a.city || a.town || a.village || a.municipality || a.county,
    ].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i);
    if (parts.length) return parts.join(', ');
    return data.display_name?.split(',').slice(0, 3).join(',').trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
