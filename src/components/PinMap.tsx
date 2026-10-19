import { useEffect, useRef } from 'react';
import type { LatLng } from '../domain/location';

/**
 * A map with one pin the diner can drag, or move by tapping where their door is. Leaflet loads only
 * when this mounts, so the menu never pays for it. Tiles are OpenStreetMap's.
 */
export function PinMap({ value, onChange }: { value: LatLng; onChange: (next: LatLng) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const move = useRef<(next: LatLng) => void>(() => {});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let dead = false;
    let teardown = () => {};
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => {
      if (dead || !box.current) return;
      const map = L.map(box.current, {
        center: [value.lat, value.lng],
        zoom: 17,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(map);
      const marker = L.marker([value.lat, value.lng], {
        draggable: true,
        keyboard: false,
        icon: L.divIcon({
          className: '',
          html: '<span class="block size-6 rounded-full bg-flame ring-4 ring-white shadow-[0_4px_12px_rgb(0_0_0/0.45)]"></span>',
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(map);
      const report = (p: { lat: number; lng: number }) => onChangeRef.current({ lat: p.lat, lng: p.lng });
      marker.on('dragend', () => report(marker.getLatLng()));
      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        report(e.latlng);
      });
      // A new fix from the device moves the pin and the view; a drag the map already shows is left alone.
      move.current = (next) => {
        const at = marker.getLatLng();
        if (Math.abs(at.lat - next.lat) < 1e-7 && Math.abs(at.lng - next.lng) < 1e-7) return;
        marker.setLatLng([next.lat, next.lng]);
        map.setView([next.lat, next.lng]);
      };
      teardown = () => map.remove();
    });
    return () => {
      dead = true;
      teardown();
    };
    // The map is built once; later values arrive through `move`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => move.current(value), [value]);

  return <div ref={box} className="pin-map relative z-0 h-56 w-full" role="application" aria-label="Map: drag the pin or tap to set your delivery spot" />;
}
