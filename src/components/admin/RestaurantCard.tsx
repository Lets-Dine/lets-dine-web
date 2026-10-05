import { useEffect, useId, useRef, useState } from 'react';
import type { Restaurant } from '../../domain/types';
import { useToast } from '../../state/ToastContext';
import { Download, Qr, Star } from '../icons';
import { DISPLAY, cx } from '../ui';
import { QrImage, downloadSlip, printSlips } from './QrCard';
import type { SlipContent } from './QrCard';

/**
 * The restaurant's name in the dashboard frame, opening a small card with what a manager reaches
 * for when someone asks "what's your link?" — the public delivery URL and its code, ready to copy,
 * print or save. The code carries the same slug-only URL as the diner app's own delivery route.
 */
export function RestaurantCard({
  restaurant,
  fallbackName,
  className,
  nameClassName,
  align = 'left',
}: {
  restaurant: Restaurant | undefined;
  fallbackName: string;
  className?: string;
  nameClassName?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = restaurant?.name ?? fallbackName;
  if (!restaurant) return <div className={cx(className, nameClassName)}>{name}</div>;

  const url = `${window.location.origin}/r/${restaurant.slug}/delivery`;
  const slip: SlipContent = { title: 'Order online', hint: 'Delivery · scan to order', url };

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast('Delivery link copied');
    } catch {
      toast('Could not copy. Select the link and copy it by hand.', '⚠️');
    }
  }

  return (
    <div ref={root} className={cx('relative', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full min-w-0 items-center gap-2 rounded-lg text-left"
      >
        <span className={cx('min-w-0 truncate', nameClassName)}>{name}</span>
        <Qr size={16} className="shrink-0 text-ink-4 transition-colors group-hover:text-flame-3" />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={`${name} profile`}
          className={cx(
            'absolute top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl bg-surface-2 p-4 shadow-xl shadow-black/30 ring-1 ring-hairline ring-inset',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <p className={cx(DISPLAY, 'text-[22px] leading-tight text-balance')}>{restaurant.name}</p>
          {restaurant.tagline && <p className="mt-1 text-[13px] text-ink-3">{restaurant.tagline}</p>}
          {restaurant.avgRating != null && restaurant.ratingCount > 0 && (
            <p className="mt-2 flex items-center gap-1 text-[12.5px] font-semibold text-ink-2 tnum">
              <Star size={13} className="text-gold" />
              {restaurant.avgRating.toFixed(1)}
              <span className="font-normal text-ink-4">· {restaurant.ratingCount} ratings</span>
            </p>
          )}

          <div className="mx-auto mt-4 size-44 overflow-hidden rounded-xl p-2 ring-1 ring-hairline ring-inset bg-paper">
            <QrImage value={url} />
          </div>

          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">Delivery link</p>
          <p className="mt-0.5 break-all text-[12.5px] text-ink-2 select-all">{url}</p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="h-10 rounded-xl bg-flame text-[13px] font-bold text-white transition-transform active:translate-y-px"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={() => printSlips([slip], restaurant.name, 'delivery QR') || toast('Allow pop-ups to print.', '⚠️')}
              className="h-10 rounded-xl bg-surface text-[13px] font-bold text-ink ring-1 ring-hairline ring-inset transition-transform active:translate-y-px"
            >
              Print QR
            </button>
          </div>
          <div className="mt-2 flex justify-center gap-4">
            <button
              type="button"
              onClick={() => downloadSlip(slip, restaurant.name)}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink-3 hover:text-ink"
            >
              <Download size={14} />
              Download
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-ink-3 hover:text-ink">
              Open page
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
