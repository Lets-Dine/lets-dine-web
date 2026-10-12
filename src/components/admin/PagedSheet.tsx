import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { X } from '../icons';
import { Sheet } from './Sheet';

/**
 * A sheet that lists everything a page could only preview. It loads one page when opened and the next
 * whenever the end of the list scrolls into view, until `count` rows are in. `render` draws all rows
 * loaded so far, so the page and the sheet can share the same row markup.
 */
export function PagedSheet<T>({
  title,
  load,
  onClose,
  render,
}: {
  title: string;
  /** Rows from `offset` on, and how many there are in all. */
  load: (offset: number) => Promise<{ rows: T[]; count: number }>;
  onClose: () => void;
  render: (rows: T[]) => ReactNode;
}) {
  const [rows, setRows] = useState<T[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const busy = useRef(false);
  const have = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const done = count !== null && rows.length >= count;

  const more = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await load(have.current);
      have.current += page.rows.length;
      setRows((prev) => [...prev, ...page.rows]);
      // An empty page ends the list even if `count` has since changed, so it can never loop.
      setCount(page.rows.length === 0 ? have.current : page.count);
      setError(false);
    } catch {
      setError(true);
    } finally {
      busy.current = false;
    }
  }, [load]);

  useEffect(() => {
    void more();
  }, [more]);

  // The sentinel sits below the rows: when it is visible, the next page is due.
  useEffect(() => {
    const el = end.current;
    if (!el || done || error || count === null || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && void more(), { root: scroller.current, rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [more, done, error, count, rows.length]);

  return (
    <Sheet label={title} onClose={onClose} wide>
      {(close) => (
        <>
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
            <h2 className="text-[20px] font-semibold tracking-tight">
              {title}
              {count !== null && <span className="ml-2 text-[14px] font-normal text-ink-3 tnum">{count}</span>}
            </h2>
            <button type="button" aria-label="Close" onClick={() => close()} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-3 ring-1 ring-hairline ring-inset transition-move hover:text-ink active:scale-90">
              <X size={16} />
            </button>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
            {render(rows)}
            <div ref={end} className="py-4 text-center text-[13px] text-ink-3" aria-live="polite">
              {error ? (
                <button type="button" className="font-semibold text-flame-1" onClick={() => void more()}>
                  Couldn’t load more. Try again
                </button>
              ) : done ? (
                rows.length > 0 && 'That’s everything'
              ) : (
                'Loading…'
              )}
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
