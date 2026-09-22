import { useMemo } from 'react';
import { encodeQr, qrDotsPath, qrEyesPath, qrSvgDocument, qrViewBox } from '../../domain/qr';
import type { DiningTable } from '../../domain/types';
import { DISPLAY, cx } from '../ui';

/**
 * §29/§53. The printed code carries the restaurant slug and an opaque table
 * token — nothing else. No menu data, no prices, no session: the backend
 * resolves the current state when the code is scanned, which is what lets a
 * restaurant laminate this once and never touch it again.
 *
 * Error correction is set to Q, because these get printed, taped to a table
 * and then spend a year collecting fingerprints and dal.
 */

export function tableUrl(slug: string, table: DiningTable, origin?: string): string {
  const base = origin ?? (typeof window === 'undefined' ? '' : window.location.origin);
  return `${base}/r/${slug}/t/${table.qrToken}`;
}

export function QrImage({ value, className }: { value: string; className?: string }) {
  const matrix = useMemo(() => encodeQr(value, { ecl: 'Q', }), [value]);
  const dots = useMemo(() => qrDotsPath(matrix), [matrix]);
  const eyes = useMemo(() => qrEyesPath(matrix), [matrix]);
  return (
    <svg
      viewBox={qrViewBox(matrix)}
      className={cx('block size-full', className)}
      role="img"
      aria-label="QR code for this table"
    >
      <rect width="100%" height="100%" fill="var(--color-paper)" />
      <path d={dots} fill="#000000" />
      <path d={eyes.ring} fill="#000000" fillRule="evenodd" />
      <path d={eyes.pupil} fill="#000000" />
    </svg>
  );
}

/** Downloads a vector file, so a print shop can scale it to any table tent. */
export function downloadQr(table: DiningTable, url: string): void {
  const svg = qrSvgDocument(encodeQr(url, { ecl: 'Q' }));
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${table.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-qr.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function card(table: DiningTable, restaurantName: string, url: string): string {
  const svg = qrSvgDocument(encodeQr(url, { ecl: 'Q' }), 2);
  return `<figure class="card">
    <div class="name">${escapeHtml(restaurantName)}</div>
    <div class="qr">${svg}</div>
    <div class="table">${escapeHtml(table.name)}</div>
    <div class="hint">Scan to see the menu, ratings and to order</div>
  </figure>`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/**
 * Opens a print-ready sheet: black on white, one card per table, sized so a
 * phone camera locks on from across the table.
 */
export function printQrSheet(tables: DiningTable[], restaurantName: string, slug: string): boolean {
  const sheet = window.open('', '_blank', 'width=900,height=1000');
  if (!sheet) return false;

  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — table codes</title>
  <style>
    @page { margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; color: #111; background: #fff; }
    .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
    .card { margin: 0; padding: 8mm 6mm; border: 1px dashed #bbb; border-radius: 4mm; text-align: center; break-inside: avoid; }
    .name { font-size: 11pt; font-weight: 600; letter-spacing: 0.02em; }
    .qr { width: 62mm; height: 62mm; margin: 5mm auto 4mm; }
    .qr svg { width: 100%; height: 100%; }
    .table { font-size: 20pt; font-weight: 700; letter-spacing: -0.01em; }
    .hint { margin-top: 2mm; font-size: 8.5pt; color: #555; }
    @media print { .card { border-color: #ddd; } }
  </style></head><body>
  <div class="sheet">${tables.map((t) => card(t, restaurantName, tableUrl(slug, t, window.location.origin))).join('')}</div>
  </body></html>`);
  sheet.document.close();

  // Every code is inline SVG, so there is nothing left to load before printing.
  sheet.focus();
  sheet.print();
  return true;
}

/**
 * A single table's code, printed on its own — a receipt-width slip rather
 * than the multi-table sheet, for the moment a manager just wants to reprint
 * one card without pulling the whole floor.
 */
export function printSingleQr(table: DiningTable, restaurantName: string, url: string): boolean {
  const sheet = window.open('', '_blank', 'width=420,height=640');
  if (!sheet) return false;

  const svg = qrSvgDocument(encodeQr(url, { ecl: 'Q' }), 2);
  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(table.name)} QR</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { width: 320px; margin: 0 auto; text-align: center; }
    .name { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6a5a45; }
    .table { font-size: 34px; font-weight: 900; margin: 6px 0 2px; letter-spacing: -0.01em; }
    .hint { font-size: 11px; color: #6a5a45; margin: 0 0 14px; }
    .rule { border-top: 1px dashed rgba(33,26,17,.35); margin: 14px 0; }
    .qr { width: 200px; height: 200px; margin: 0 auto; }
    .qr svg { width: 100%; height: 100%; }
    .url { font-size: 10px; word-break: break-all; margin-top: 14px; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <div class="sheet">
    <p class="name">${escapeHtml(restaurantName)}</p>
    <h1 class="table">${escapeHtml(table.name)}</h1>
    <p class="hint">${table.capacity} seats · scan to order</p>
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

/**
 * The scannable code, front and center — for the moment a manager wants to
 * check a table's link or print just that one code without pulling the whole
 * floor's sheet.
 */
export function QrDialog({
  table,
  url,
  restaurantName,
  onClose,
  onCopy,
}: {
  table: DiningTable | null;
  url: string;
  restaurantName: string;
  onClose: () => void;
  onCopy: (url: string) => void;
}) {
  if (!table) return null;

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
        aria-label={`${table.name} QR code`}
      >
        <p className="text-[10px] font-semibold tracking-[0.2em] text-ink-4 uppercase">Table QR · scan to order</p>
        <p className={cx(DISPLAY, 'mt-2 text-[30px] leading-none font-black')}>{table.name}</p>
        <p className="mt-1 text-[11px] text-ink-4">{table.capacity} seats</p>

        <div className="my-4 border-t border-dashed border-gray-400" />

        <div className="mx-auto size-60 overflow-hidden rounded-xl ring-1 ring-hairline ring-inset">
          <QrImage value={url} />
        </div>

        <p className="mt-4 text-[9px] break-all text-ink-4">{url}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="col-span-2 rounded-[14px] bg-flame py-3.5 text-[13px] font-bold tracking-wide transition-transform active:translate-y-px text-white"
            onClick={() => printSingleQr(table, restaurantName, url)}
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
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => downloadQr(table, url)}>
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
