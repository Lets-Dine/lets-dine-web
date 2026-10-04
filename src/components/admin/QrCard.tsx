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

/** What one printed or downloaded slip says. Tables and floors fill it differently; the layout is shared. */
export interface SlipContent {
  title: string;
  hint: string;
  url: string;
}

export const tableSlip = (table: DiningTable, url: string): SlipContent => ({ title: table.name, hint: `${table.capacity} seats · scan to order`, url });

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** One slip — the receipt-width layout every printed or downloaded code uses, for a table or a floor, alone or with the rest. */
function slip(content: SlipContent, restaurantName: string): string {
  const svg = qrSvgDocument(encodeQr(content.url, { ecl: 'Q' }), 2);
  return `<div class="sheet">
    <p class="name">${escapeHtml(restaurantName)}</p>
    <h1 class="table">${escapeHtml(content.title)}</h1>
    <p class="hint">${escapeHtml(content.hint)}</p>
    <div class="qr">${svg}</div>
  </div>`;
}

const SLIP_CSS = `
    * { box-sizing: border-box; }
    body { margin: 0; padding: 24px; background: #fff; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { width: 320px; margin: 0 auto; text-align: center; }
    /* Several codes: flow them side by side so one page carries as many as fit. */
    .multi { display: grid; grid-template-columns: repeat(auto-fit, 320px); justify-content: center; gap: 8mm; }
    .multi .sheet { margin: 0; padding: 18px 0; break-inside: avoid; }
    .name { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #6a5a45; }
    .table { font-size: 34px; font-weight: 900; margin: 6px 0 2px; letter-spacing: -0.01em; }
    .hint { font-size: 11px; color: #6a5a45; margin: 0 0 14px; }
    .qr { width: 200px; height: 200px; margin: 0 auto; }
    .qr svg { width: 100%; height: 100%; }
    @page { margin: 10mm; }
    @media print { body { padding: 0; } }`;

/** Opens a print window with one slip each; several are packed side by side, a single one prints alone. */
export function printSlips(items: SlipContent[], restaurantName: string, title: string, size = 'width=420,height=640'): boolean {
  const sheet = window.open('', '_blank', size);
  if (!sheet) return false;

  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(title)}</title>
  <style>${SLIP_CSS}</style></head><body>
  <div class="${items.length > 1 ? 'multi' : ''}">${items.map((item) => slip(item, restaurantName)).join('')}</div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 350); };</script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}

/** The slip as a standalone vector drawing, laid out like the printed one, so a print shop can scale it to any size. */
function slipSvgDocument(content: SlipContent, restaurantName: string): string {
  const width = 320;
  const height = 342;
  // SVG does not wrap text, so a long name shrinks to stay inside the slip.
  const titleSize = Math.min(34, Math.floor(288 / (Math.max(content.title.length, 1) * 0.6)));
  const qr = qrSvgDocument(encodeQr(content.url, { ecl: 'Q' }), 2).replace(/^<svg ([^>]*?) width="\d+" height="\d+">/, '<svg $1 x="60" y="118" width="200" height="200">');
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" font-family="${font}" text-anchor="middle">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    `<text x="160" y="34" font-size="10" letter-spacing="1.8" fill="#6a5a45">${escapeHtml(restaurantName.toUpperCase())}</text>`,
    `<text x="160" y="${44 + titleSize * 0.8}" font-size="${titleSize}" font-weight="900" fill="#111111">${escapeHtml(content.title)}</text>`,
    `<text x="160" y="104" font-size="11" fill="#6a5a45">${escapeHtml(content.hint)}</text>`,
    qr,
    '</svg>',
  ].join('');
}

/** Downloads the slip as a vector file. */
export function downloadSlip(content: SlipContent, restaurantName: string): void {
  const blob = new Blob([slipSvgDocument(content, restaurantName)], { type: 'image/svg+xml' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = `${slugify(content.title)}-qr.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

/** Prints every given table's code on the same slip as a single table, packed side by side to use as few pages as possible. */
export function printQrSheet(tables: DiningTable[], restaurantName: string, slug: string): boolean {
  return printSlips(tables.map((t) => tableSlip(t, tableUrl(slug, t, window.location.origin))), restaurantName, 'table codes');
}

/** A single table's code, printed on its own. */
export function printSingleQr(table: DiningTable, restaurantName: string, url: string): boolean {
  return printSlips([tableSlip(table, url)], restaurantName, `${table.name} QR`);
}

export function downloadQr(table: DiningTable, restaurantName: string, url: string): void {
  downloadSlip(tableSlip(table, url), restaurantName);
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
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => downloadQr(table, restaurantName, url)}>
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
