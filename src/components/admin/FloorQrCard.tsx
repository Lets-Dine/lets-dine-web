import type { Floor } from '../../domain/types';
import { DISPLAY, cx } from '../ui';
import { QrImage, downloadSlip, printSlips } from './QrCard';
import type { SlipContent } from './QrCard';

/**
 * §16b. The floor counterpart of `QrCard.tsx` — one code for the whole floor
 * rather than per table, so there is no seat count to print alongside it and
 * the link shape is `/r/:slug/f/:token` instead of `/r/:slug/t/:token`.
 */

export function floorUrl(slug: string, floor: Floor, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/r/${slug}/f/${floor.qrToken}`;
}

const floorSlip = (floor: Floor, url: string, logoUrl?: string): SlipContent => ({ title: floor.name, hint: 'scan to order from anywhere on this floor', url, logoUrl });

/** Downloads the floor's slip as a vector file — the same layout as a table's. */
export function downloadFloorQr(floor: Floor, restaurantName: string, url: string, logoUrl?: string): Promise<void> {
  return downloadSlip(floorSlip(floor, url, logoUrl), restaurantName);
}

/** A single floor's code, printed on the same slip as a table's. */
export function printSingleFloorQr(floor: Floor, restaurantName: string, url: string, logoUrl?: string): boolean {
  return printSlips([floorSlip(floor, url, logoUrl)], restaurantName, `${floor.name} QR`);
}

export function FloorQrDialog({
  floor,
  url,
  restaurantName,
  logoUrl,
  onClose,
  onCopy,
}: {
  floor: Floor | null;
  url: string;
  restaurantName: string;
  logoUrl?: string;
  onClose: () => void;
  onCopy: (url: string) => void;
}) {
  if (!floor) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-2 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-76 rounded-2xl bg-paper p-5 text-center ring-1 ring-hairline ring-inset text-black"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${floor.name} QR code`}
      >
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-4 uppercase">Floor QR · scan to order</p>
        <p className={cx(DISPLAY, 'mt-2 text-[30px] leading-none font-black')}>{floor.name}</p>
        <p className="mt-1 text-[11px] text-ink-4">any room on this floor</p>

        <div className="my-4 border-t border-dashed border-gray-400" />

        <div className="mx-auto size-60 overflow-hidden rounded-xl ring-1 ring-hairline ring-inset">
          <QrImage value={url} logoUrl={logoUrl} />
        </div>

        <p className="mt-4 text-[9px] break-all text-ink-4">{url}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="col-span-2 rounded-[14px] bg-flame py-3.5 text-[13px] font-bold tracking-wide transition-transform active:translate-y-px text-white"
            onClick={() => printSingleFloorQr(floor, restaurantName, url, logoUrl)}
          >
            Print QR
          </button>
          <button
            type="button"
            className="rounded-[14px] bg-surface-2 py-3.5 text-[12px] font-bold tracking-wide text-ink ring-1 ring-hairline ring-inset transition-transform active:translate-y-px"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-2 flex justify-center gap-3">
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => downloadFloorQr(floor, restaurantName, url, logoUrl)}>
            Download
          </button>
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => onCopy(url)}>
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
