import { useCallback, useState } from 'react';
import type { LatLng } from '../domain/location';

/** Where the last delivery went: the address as the diner wrote it, and the exact pin if they shared one. */
export interface DeliveryPlace {
  address: string;
  pin: LatLng | null;
}

const STORAGE_KEY = 'FeastoX.delivery-place';

const isCoord = (n: unknown, limit: number): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit;

function readStoredPlace(): DeliveryPlace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: unknown; pin?: { lat?: unknown; lng?: unknown } | null };
    if (typeof parsed.address !== 'string' || !parsed.address.trim()) return null;
    const pin = parsed.pin && isCoord(parsed.pin.lat, 90) && isCoord(parsed.pin.lng, 180) ? { lat: parsed.pin.lat, lng: parsed.pin.lng } : null;
    return { address: parsed.address, pin };
  } catch {
    return null;
  }
}

function writeStoredPlace(place: DeliveryPlace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch {
    /* storage full or blocked — this device just won't offer it next time */
  }
}

/**
 * The delivery address and pin used last, remembered on this device like the diner's own name and phone
 * (`useDinerIdentity`): saved once an order is placed, offered again at the next delivery checkout.
 */
export function useDeliveryPlace(): [DeliveryPlace | null, (place: DeliveryPlace) => void] {
  const [place, setPlaceState] = useState<DeliveryPlace | null>(readStoredPlace);

  const setPlace = useCallback((next: DeliveryPlace) => {
    writeStoredPlace(next);
    setPlaceState(next);
  }, []);

  return [place, setPlace];
}
