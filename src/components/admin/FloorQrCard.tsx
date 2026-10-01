import type { Floor } from '../../domain/types';
import { DISPLAY, cx } from '../ui';
import { QrImage } from './QrCard';
import { qrSvgDocument, encodeQr } from '../../domain/qr';

/**
 * §16b. The floor counterpart of `QrCard.tsx` — one code for the whole floor
 * rather than per table, so there is no seat count to print alongside it and
 * the link shape is `/r/:slug/f/:token` instead of `/r/:slug/t/:token`.
 */

export function floorUrl(slug: string, floor: Floor, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/r/${slug}/f/${floor.qrToken}`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/** Downloads a vector file, so a print shop can scale it to any size. */
export function downloadFloorQr(floor: Floor, url: string): void {
  const svg = qrSvgDocument(encodeQr(url, { ecl: 'Q' }));
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${floor.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-qr.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** A single floor's code, printed receipt-width — same shape as `printSingleQr`, minus the seat count. */
export function printSingleFloorQr(floor: Floor, restaurantName: string, url: string): boolean {
  const sheet = window.open('', '_blank', 'width=420,height=640');
  if (!sheet) return false;

  const svg = qrSvgDocument(encodeQr(url, { ecl: 'Q' }), 2);
  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(floor.name)} QR</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { width: 320px; margin: 0 auto; text-align: center; }
    .name { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6a5a45; }
    .floor { font-size: 34px; font-weight: 900; margin: 6px 0 2px; letter-spacing: -0.01em; }
    .hint { font-size: 11px; color: #6a5a45; margin: 0 0 14px; }
    .rule { border-top: 1px dashed rgba(33,26,17,.35); margin: 14px 0; }
    .qr { width: 200px; height: 200px; margin: 0 auto; }
    .qr svg { width: 100%; height: 100%; }
    .url { font-size: 10px; word-break: break-all; margin-top: 14px; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <div class="sheet">
    <p class="name">${escapeHtml(restaurantName)}</p>
    <h1 class="floor">${escapeHtml(floor.name)}</h1>
    <p class="hint">scan to order from anywhere on this floor</p>
    <div class="qr">${svg}</div>
    <div class="rule"></div>
    <p class="url">${escapeHtml(url)}</p>
  </div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}

export function FloorQrDialog({
  floor,
  url,
  restaurantName,
  onClose,
  onCopy,
}: {
  floor: Floor | null;
  url: string;
  restaurantName: string;
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
          <QrImage value={url} />
        </div>

        <p className="mt-4 text-[9px] break-all text-ink-4">{url}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="col-span-2 rounded-[14px] bg-flame py-3.5 text-[13px] font-bold tracking-wide transition-transform active:translate-y-px text-white"
            onClick={() => printSingleFloorQr(floor, restaurantName, url)}
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
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => downloadFloorQr(floor, url)}>
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
