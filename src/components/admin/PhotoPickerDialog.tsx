import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { suggestPhotos } from '../../api/dishPhotos';
import type { LibraryPhoto } from '../../api/dishPhotos';
import { useAsync } from '../../state/useAsync';
import { cx } from '../ui';
import { Check, Search, X } from '../icons';
import { ADMIN_QUIET, INPUT_BOX } from './kit';

interface Section {
  title: string;
  tags: string[];
  urls: string[];
}

/**
 * The whole photo library, for when the suggestions miss. A strip can't hold
 * hundreds of photos, so this is a focused dialog: photos grouped under the dish
 * they show, a filter at the top, and one click both picks and closes.
 */
export function PhotoPickerDialog({
  value,
  menuPhotos,
  onPick,
  onClose,
}: {
  value: string | null;
  /** Photos this restaurant already uses on other dishes. */
  menuPhotos: string[];
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const library = useAsync(() => suggestPhotos(), []);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll under the dialog.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const sections = useMemo(() => {
    const byName = new Map<string, Section>();
    const photos: LibraryPhoto[] = library.data ?? [];
    for (const photo of photos) {
      const key = photo.name.trim().toLowerCase();
      const section = byName.get(key) ?? { title: photo.name.trim(), tags: [], urls: [] };
      section.urls.push(photo.imageUrl);
      for (const tag of photo.tags) if (!section.tags.includes(tag)) section.tags.push(tag);
      byName.set(key, section);
    }
    const q = filter.trim().toLowerCase();
    const known = new Set(photos.map((p) => p.imageUrl));
    const own = menuPhotos.filter((url) => !known.has(url));
    const result = [...byName.values()].filter((s) => `${s.title} ${s.tags.join(' ')}`.toLowerCase().includes(q));
    // A filter is a search by dish name — the restaurant's own photos have none, so they only show unfiltered.
    if (own.length > 0 && !q) result.push({ title: 'On your menu', tags: [], urls: own });
    return result;
  }, [library.data, menuPhotos, filter]);

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 sm:place-items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal
        aria-label="Choose a photo"
        className="flex h-[min(88vh,680px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-hairline px-4 py-3 sm:px-5">
          <label className="relative block min-w-0 flex-1">
            <span className="sr-only">Filter photos by dish</span>
            <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-4" />
            <input
              autoFocus
              className={cx(INPUT_BOX, 'h-10 py-0 pl-10')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by dish or other name"
            />
          </label>
          <button type="button" className={ADMIN_QUIET} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 sm:px-5">
          {!library.data && !library.error ? (
            <p className="py-16 text-center text-[13px] text-ink-3">Loading photos…</p>
          ) : sections.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-ink-3">
              {filter.trim() ? <>No photos for “{filter.trim()}”.</> : 'The library is empty for now.'}
            </p>
          ) : (
            sections.map((section) => (
              <section key={section.title} className="pt-6">
                <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-semibold">
                  {section.title}
                  <span className="font-normal text-ink-4 tnum">{section.urls.length}</span>
                </h3>
                <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5">
                  {section.urls.map((url) => {
                    const on = url === value;
                    return (
                      <li key={url}>
                        <button
                          type="button"
                          aria-pressed={on}
                          aria-label={`Use this ${section.title} photo`}
                          onClick={() => {
                            onPick(url);
                            onClose();
                          }}
                          className={cx(
                            'relative block aspect-square w-full overflow-hidden rounded-xl transition-move hover:scale-[1.03] active:scale-95',
                            on ? 'ring-2 ring-flame-2 ring-offset-2 ring-offset-surface' : 'ring-1 ring-hairline ring-inset',
                          )}
                        >
                          <img src={url} alt="" className="size-full object-cover" loading="lazy" />
                          {on && (
                            <span className="absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-flame text-white" aria-hidden>
                              <Check size={11} />
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
