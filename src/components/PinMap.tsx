import { useEffect, useRef } from 'react';
import type { LatLng } from '../domain/location';
import { MAP_STYLE_URL, addSatellite, setSatellite, themeMap, type PinMapTheme } from '../domain/mapTheme';

export type { PinMapTheme };

// The teardrop's tip is the marker's anchor, so the coordinate is where the point touches.
const PIN_HTML =
  '<span class="pin-dot"><svg viewBox="0 0 32 42" aria-hidden="true">' +
  '<path d="M16 41S3 26.5 3 15.5a13 13 0 0 1 26 0C29 26.5 16 41 16 41z" fill="var(--color-flame)" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<circle cx="16" cy="15.5" r="5" fill="#fff"/></svg></span>';

/**
 * A map with one pin the diner can drag, or move by tapping where their door is. MapLibre loads only when
 * this mounts, so the menu never pays for it. Vector tiles are OpenFreeMap's (OpenStreetMap data); `theme`
 * recolors them, and the points of interest, to match the page (see domain/mapTheme).
 */
export function PinMap({
  value,
  onChange,
  label = 'Map: drag the pin or tap to set your delivery spot',
  className = 'h-56',
  theme = 'dark',
  scrollZoom = false,
}: {
  value: LatLng;
  onChange: (next: LatLng) => void;
  label?: string;
  className?: string;
  theme?: PinMapTheme;
  /** Wheel zoom. Off by default: in a scrolling page the wheel should scroll the page, not the map. */
  scrollZoom?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const move = useRef<(next: LatLng) => void>(() => {});
  const retheme = useRef<(t: PinMapTheme) => void>(() => {});
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let dead = false;
    let teardown = () => {};
    // MapLibre looks for its worker file beside its own module, which a bundler moves; hand it the file's real URL.
    void Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([ml, worker]) => {
      if (dead || !box.current) return;
      ml.setWorkerUrl(worker.default);
      const map = new ml.Map({
        container: box.current,
        style: MAP_STYLE_URL,
        center: [value.lng, value.lat],
        zoom: 18,
        dragRotate: true,
        pitchWithRotate: true,
        attributionControl: { compact: true },
      });
      if (!scrollZoom) map.scrollZoom.disable(); // the page scrolls over it; the +/- buttons and pinch zoom remain
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      // Moves the view (not the pin) to where the device is; the blue dot marks the spot.
      map.addControl(
        new ml.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 17 }, showAccuracyCircle: false }),
        'top-right',
      );
      let styled = false;
      let current = theme;
      let satellite = false;
      retheme.current = (t) => {
        current = t;
        if (styled) themeMap(map, t, satellite);
      };
      // Satellite toggle: a button in its own control group under the others.
      const group = document.createElement('div');
      group.className = 'maplibregl-ctrl maplibregl-ctrl-group';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'pin-sat-btn';
      toggle.title = 'Satellite view';
      toggle.setAttribute('aria-label', 'Satellite view');
      toggle.setAttribute('aria-pressed', 'false');
      toggle.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/></svg>';
      toggle.addEventListener('click', () => {
        satellite = !satellite;
        toggle.setAttribute('aria-pressed', String(satellite));
        toggle.title = satellite ? 'Map view' : 'Satellite view';
        if (!styled) return;
        setSatellite(map, satellite);
        themeMap(map, current, satellite);
      });
      group.append(toggle);
      map.addControl({ onAdd: () => group, onRemove: () => group.remove() }, 'top-right');
      // The credit line opens itself when it is added, after the style loads; fold it behind its (i) button once the map is idle. The credit must stay: OpenStreetMap's licence requires it.
      map.once('idle', () => box.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show'));
      map.on('style.load', () => {
        styled = true;
        addSatellite(map);
        themeMap(map, current, satellite);
      });

      const el = document.createElement('div');
      el.innerHTML = PIN_HTML;
      const dot = el.firstElementChild as HTMLElement;
      const marker = new ml.Marker({ element: el, anchor: 'bottom', draggable: true }).setLngLat([value.lng, value.lat]).addTo(map);
      // Replays the landing animation: drop the flag, force a reflow, set it again.
      const land = () => {
        dot.removeAttribute('data-landed');
        void dot.offsetWidth;
        dot.setAttribute('data-landed', '');
      };
      const report = (p: { lat: number; lng: number }) => onChangeRef.current({ lat: p.lat, lng: p.lng });
      marker.on('dragstart', () => dot.classList.add('pin-lifted'));
      marker.on('dragend', () => {
        dot.classList.remove('pin-lifted');
        land();
        report(marker.getLngLat());
      });
      map.on('click', (e) => {
        if (el.contains(e.originalEvent.target as Node)) return; // a tap on the pin itself is not a new spot
        marker.setLngLat(e.lngLat);
        map.easeTo({ center: e.lngLat });
        land();
        report(e.lngLat);
      });
      // A new fix from the device (or a searched place) moves the pin and flies the view there; a drag the map already shows is left alone.
      move.current = (next) => {
        const at = marker.getLngLat();
        if (Math.abs(at.lat - next.lat) < 1e-7 && Math.abs(at.lng - next.lng) < 1e-7) return;
        marker.setLngLat([next.lng, next.lat]);
        map.flyTo({ center: [next.lng, next.lat], zoom: Math.max(map.getZoom(), 16), duration: 1100 });
        map.once('moveend', land);
      };
      teardown = () => map.remove();
    });
    return () => {
      dead = true;
      teardown();
    };
    // The map is built once; later values arrive through `move` and `retheme`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => move.current(value), [value]);
  useEffect(() => retheme.current(theme), [theme]);

  return <div ref={box} data-theme={theme} className={`pin-map relative z-0 w-full ${className}`} role="application" aria-label={label} />;
}
