import { useMemo } from 'react';
import { encodeQr, qrPath, qrSvgDocument, qrViewBox } from '../../domain/qr';
import type { DiningTable } from '../../domain/types';
import { cx } from '../ui';

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
  const matrix = useMemo(() => encodeQr(value, { ecl: 'Q' }), [value]);
  return (
    <svg
      viewBox={qrViewBox(matrix)}
      className={cx('block size-full', className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for this table"
    >
      <rect width="100%" height="100%" fill="#ffffff" />
      <path d={qrPath(matrix)} fill="#000000" />
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
