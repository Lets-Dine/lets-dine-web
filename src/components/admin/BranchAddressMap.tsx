import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { findPlace, placeName, type LatLng } from '../../domain/location';
import { PinMap } from '../PinMap';
import { MapPin, Search, X } from '../icons';
import { CHIP, CHIP_OFF } from '../ui';
import { ADMIN_PRIMARY, ADMIN_TINY, INPUT_BOX } from './kit';
import { useDiscardBack } from './useDiscardBack';

const KATHMANDU: LatLng = { lat: 27.7172, lng: 85.324 };

/** What the readout under the map says: nothing yet, a lookup in flight, a name, or "no name here". */
type Place = { status: 'idle' } | { status: 'looking' } | { status: 'found'; name: string } | { status: 'none' };

/** A button that opens a map in a modal: drop or drag a pin and the address text follows it (still editable by hand). */
export function BranchAddressMap({
  pin,
  onPick,
  onAddress,
  clearOnMiss,
  title = 'Where is this branch?',
}: {
  pin: LatLng | null;
  onPick: (pin: LatLng) => void;
  onAddress: (name: string) => void;
  /** A spot with no name clears the address instead of leaving the old spot's name beside the new pin. */
  clearOnMiss?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<Place>({ status: 'idle' });
  // Only the newest lookup may land; a miss leaves the typed address alone.
  const lookup = useRef(0);
  const adopt = (next: LatLng) => {
    onPick(next);
    const mine = ++lookup.current;
    setPlace({ status: 'looking' });
    void placeName(next).then((name) => {
      if (mine !== lookup.current) return;
      setPlace(name ? { status: 'found', name } : { status: 'none' });
      if (name) onAddress(name);
      else if (clearOnMiss) onAddress('');
    });
  };
  return (
    <>
      <div>
        <button type="button" onClick={() => {
            setPlace({ status: 'idle' });
            setOpen(true);
          }}
          className={`${CHIP} ${CHIP_OFF}`}>
          <MapPin size={15} />
          {pin ? 'Change on map' : 'Set from map'}
        </button>
      </div>
      {open && <MapDialog title={title} pin={pin} place={place} onPick={adopt} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A centered popup on a native <dialog> (focus trap, Esc, top layer). Portaled out of the form it was opened from, so Enter in the search box cannot submit that form. */
function MapDialog({ title, pin, place, onPick, onClose }: { title: string; pin: LatLng | null; place: Place; onPick: (pin: LatLng) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useDiscardBack();
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<'search' | 'locate' | null>(null);
  useEffect(() => ref.current?.showModal(), []);
  const close = () => ref.current?.close();

  const search = async () => {
    const q = query.trim();
    if (q.length < 2 || busy) return;
    setBusy('search');
    setNote(null);
    const hit = await findPlace(q);
    setBusy(null);
    if (!hit) return setNote(`Nothing found for “${q}”. Try a nearby landmark, or tap the map.`);
    onPick({ lat: hit.lat, lng: hit.lng });
  };

  const locate = () => {
    if (!navigator.geolocation) return setNote("This device can't share its location. Tap the map instead.");
    setBusy('locate');
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setBusy(null);
        onPick({ lat: coords.latitude, lng: coords.longitude });
      },
      (err) => {
        setBusy(null);
        setNote(err.code === err.PERMISSION_DENIED ? 'Location is blocked for this site. Allow it in your browser settings, or tap the map.' : "Couldn't find your location. Try again, or tap the map.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  };

  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby="branch-map-title"
      onClose={onClose}
      // A backdrop click targets the dialog itself, and so does a click on its padding or a drag released off the map; only a click outside its box is the backdrop.
      onClick={(e) => {
        const box = e.currentTarget.getBoundingClientRect();
        const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
        if (e.target === e.currentTarget && outside) close();
      }}
      className="animate-pop m-auto w-[min(68rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-3xl bg-surface p-5 text-ink shadow-deep ring-1 ring-hairline ring-inset outline-none backdrop:bg-black/60 backdrop:backdrop-blur-sm sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="branch-map-title" className="font-display text-[22px] leading-tight font-black">
            {title}
          </h2>
          <p className="mt-1 text-[13px] text-ink-3">Tap the map, drag the pin, or search for a landmark.</p>
        </div>
        <button type="button" aria-label="Close" className={`${ADMIN_TINY} text-ink-3 hover:text-ink`} onClick={close}>
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              void search();
            }}
            maxLength={120}
            placeholder={busy === 'search' ? 'Searching…' : 'Search a place, e.g. Lazimpat'}
            aria-label="Search for a place"
            className={`${INPUT_BOX} pl-9`}
          />
        </div>
        <button type="button" onClick={locate} disabled={busy === 'locate'} className={`${CHIP} ${CHIP_OFF} h-10`}>
          {busy === 'locate' ? 'Locating…' : 'Use my location'}
        </button>
      </div>
      {note && (
        <p role="status" className="mt-2 text-[13px] font-medium text-ink-3">
          {note}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-2xl ring-1 ring-hairline ring-inset">
        <PinMap value={pin ?? KATHMANDU} onChange={(next) => onPick(next)} label="Map: drag the pin or tap to set the branch's location" className="h-[clamp(18rem,calc(100dvh-20rem),46rem)]" theme="dark" scrollZoom />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-56" aria-live="polite">
          {place.status === 'looking' ? (
            <div className="place-shimmer h-6 w-3/4 rounded-md" aria-label="Looking up the address" />
          ) : place.status === 'found' ? (
            <p key={place.name} className="animate-rise truncate font-display text-[18px] leading-tight font-black">
              {place.name}
            </p>
          ) : (
            <p className="text-[14px] text-ink-3">{place.status === 'none' ? 'No name for this spot. Type the address by hand after.' : pin ? 'Drag the pin to adjust.' : 'No pin yet.'}</p>
          )}
          {pin && (
            <p className="mt-0.5 font-mono text-[12px] text-ink-4 tabular-nums">
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </p>
          )}
        </div>
        <button type="button" className={`${ADMIN_PRIMARY} h-10`} onClick={close}>
          {pin ? 'Use this spot' : 'Close'}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
