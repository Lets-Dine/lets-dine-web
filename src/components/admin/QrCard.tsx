import { useMemo } from 'react';
import { encodeQr, qrClearCentre, qrDotsPath, qrEyesPath, qrSvgDocument, qrViewBox } from '../../domain/qr';
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

export function QrImage({ value, className, logoUrl }: { value: string; className?: string; logoUrl?: string }) {
  const matrix = useMemo(() => (logoUrl ? qrClearCentre(encodeQr(value, { ecl: 'Q' })) : encodeQr(value, { ecl: 'Q' })), [value, logoUrl]);
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
      {logoUrl && <QrLogo extent={matrix.size + 4} href={logoUrl} />}
    </svg>
  );
}

/** Round restaurant mark in the middle of the code, ~24% of its width on a white disc — well inside what ecl Q can lose. `extent` is the full viewBox side, margin included. */
function QrLogo({ extent, href }: { extent: number; href: string }) {
  const r = extent * 0.12;
  const c = extent / 2;
  return (
    <g>
      <circle cx={c} cy={c} r={r + 1.2} fill="var(--color-paper)" />
      <clipPath id="qr-logo-clip"><circle cx={c} cy={c} r={r} /></clipPath>
      <image href={href} x={c - r} y={c - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath="url(#qr-logo-clip)" />
    </g>
  );
}

/** What one printed or downloaded slip says. Tables and floors fill it differently; the layout is shared. */
export interface SlipContent {
  title: string;
  hint: string;
  url: string;
  /** Restaurant mark drawn over the centre of the code. */
  logoUrl?: string;
}

export const tableSlip = (table: DiningTable, url: string, logoUrl?: string): SlipContent => ({ title: table.name, hint: `${table.capacity} seats · scan to order`, url, logoUrl });

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const BRAND = "FeastoX";

/** The mark beside "Powered by": a plate seen from above with a flame-lit rim. Drawn once, reused by the print and the vector download. */
const BRAND_MARK = `<circle cx="10" cy="10" r="9" fill="#ff8a3d"/><circle cx="10" cy="10" r="5.6" fill="none" stroke="#17110d" stroke-width="1.6"/><circle cx="10" cy="10" r="1.9" fill="#17110d"/>`;

/** One slip — a light table card with the code framed by viewfinder corners; every printed code uses it, for a table or a floor, alone or with the rest. */
function slip(content: SlipContent, restaurantName: string): string {
  const code = encodeQr(content.url, { ecl: 'Q' });
  const svg = qrSvgDocument(content.logoUrl ? qrClearCentre(code) : code, 2);
  return `<div class="sheet">
    <p class="name">${escapeHtml(restaurantName)}</p>
    <h1 class="table">${escapeHtml(content.title)}</h1>
    <p class="hint">${escapeHtml(content.hint)}</p>
    <div class="scan">
      <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
      <div class="qr">${svg}${content.logoUrl ? `<img class="logo" src="${escapeHtml(content.logoUrl)}" alt="">` : ''}</div>
    </div>
    <p class="cue">Point your camera here</p>
    <div class="foot">
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">${BRAND_MARK}</svg>
      <span>Powered by <b>${BRAND}</b></span>
    </div>
  </div>`;
}

const SLIP_CSS = `
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; padding: 24px; background: #fff; color: #17110d; font-family: 'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
    .sheet { position: relative; width: 320px; margin: 0 auto; padding: 26px 24px 18px; text-align: center; background: #fff; border: 1.5px solid #17110d; border-radius: 24px; overflow: hidden; break-inside: avoid; }
    /* A flame-lit band along the top edge, the one loud thing on the card — kept thin so the slip stays light on ink. */
    .sheet::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 6px; background: linear-gradient(90deg, #ffc24b, #ff8a3d 55%, #ff5e3a); }
    /* Several codes: flow them side by side so one page carries as many as fit. */
    .multi { display: grid; grid-template-columns: repeat(auto-fit, 320px); justify-content: center; gap: 8mm; }
    .multi .sheet { margin: 0; }
    .name { margin: 0; font-size: 10px; font-weight: 600; letter-spacing: 0.24em; text-transform: uppercase; color: #b4531a; }
    .table { margin: 10px 0 4px; font-family: 'Fraunces', Georgia, 'Times New Roman', serif; font-size: 46px; font-weight: 900; line-height: 1; letter-spacing: -0.02em; color: #17110d; overflow-wrap: anywhere; text-wrap: balance; }
    .hint { margin: 0 0 20px; font-size: 12px; color: #6a5a45; }
    .scan { position: relative; width: 224px; margin: 0 auto; padding: 12px; background: #ffffff; border-radius: 14px; }
    .qr { position: relative; width: 200px; height: 200px; }
    .logo { position: absolute; top: 50%; left: 50%; width: 48px; height: 48px; transform: translate(-50%, -50%); object-fit: cover; border-radius: 50%; border: 5px solid #fff; box-sizing: content-box; background: #fff; }
    .qr svg { display: block; width: 100%; height: 100%; }
    /* Viewfinder corners: the card tells you what to do before you read a word. */
    .c { position: absolute; width: 26px; height: 26px; border: 0 solid #e8691f; }
    .tl { top: -7px; left: -7px; border-top-width: 4px; border-left-width: 4px; border-top-left-radius: 14px; }
    .tr { top: -7px; right: -7px; border-top-width: 4px; border-right-width: 4px; border-top-right-radius: 14px; }
    .bl { bottom: -7px; left: -7px; border-bottom-width: 4px; border-left-width: 4px; border-bottom-left-radius: 14px; }
    .br { bottom: -7px; right: -7px; border-bottom-width: 4px; border-right-width: 4px; border-bottom-right-radius: 14px; }
    .cue { margin: 20px 0 0; font-family: 'Fraunces', Georgia, serif; font-style: italic; font-size: 15px; color: #17110d; }
    .foot { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 18px; padding-top: 12px; border-top: 1px dashed rgba(23, 17, 13, 0.3); font-size: 10px; letter-spacing: 0.08em; color: #6a5a45; }
    .foot b { font-weight: 700; color: #17110d; letter-spacing: 0.04em; }
    @page { margin: 10mm; }
    @media print { body { padding: 0; } }`;

const FONTS_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,900;1,9..144,400&family=Inter+Tight:wght@500;600;700&display=swap">`;

/** Opens a print window with one slip each; several are packed side by side, a single one prints alone. */
export function printSlips(items: SlipContent[], restaurantName: string, title: string, size = 'width=420,height=720'): boolean {
  const sheet = window.open('', '_blank', size);
  if (!sheet) return false;

  // Print once the display face has landed (or after a beat if the network never answers), so the card never prints in the fallback serif by accident.
  sheet.document.write(`<!doctype html><html><head><meta charset="utf-8">
  <title>${escapeHtml(restaurantName)} — ${escapeHtml(title)}</title>
  ${FONTS_LINK}
  <style>${SLIP_CSS}</style></head><body>
  <div class="${items.length > 1 ? 'multi' : ''}">${items.map((item) => slip(item, restaurantName)).join('')}</div>
  <script>
    (function () {
      var done = false;
      function go() { if (done) return; done = true; window.print(); }
      window.onload = function () {
        var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        ready.then(function () { setTimeout(go, 150); });
        setTimeout(go, 2500);
      };
    })();
  </script>
  </body></html>`);
  sheet.document.close();
  sheet.focus();
  return true;
}

/** The slip as a standalone vector drawing, laid out like the printed one, so a print shop can scale it to any size. */
function slipSvgDocument(content: SlipContent, restaurantName: string): string {
  const width = 320;
  const height = 456;
  // SVG does not wrap text, so a long name shrinks to stay inside the slip.
  const titleSize = Math.min(46, Math.floor(272 / (Math.max(content.title.length, 1) * 0.62)));
  const code = encodeQr(content.url, { ecl: 'Q' });
  const qr = qrSvgDocument(content.logoUrl ? qrClearCentre(code) : code, 2).replace(/^<svg ([^>]*?) width="\d+" height="\d+">/, '<svg $1 x="60" y="148" width="200" height="200">');
  const sans = "'Inter Tight', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";
  const serif = "'Fraunces', Georgia, 'Times New Roman', serif";
  const corner = (d: string) => `<path d="${d}" fill="none" stroke="#e8691f" stroke-width="4" stroke-linecap="round"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width * 3}" height="${height * 3}" font-family="${sans}" text-anchor="middle">`,
    `<defs><linearGradient id="band" x1="0" x2="1"><stop offset="0" stop-color="#ffc24b"/><stop offset=".55" stop-color="#ff8a3d"/><stop offset="1" stop-color="#ff5e3a"/></linearGradient><clipPath id="card"><rect width="${width}" height="${height}" rx="24"/></clipPath></defs>`,
    `<g clip-path="url(#card)"><rect width="${width}" height="${height}" fill="#ffffff"/><rect width="${width}" height="6" fill="url(#band)"/></g><rect x=".75" y=".75" width="${width - 1.5}" height="${height - 1.5}" rx="23.25" fill="none" stroke="#17110d" stroke-width="1.5"/>`,
    `<text x="160" y="46" font-size="10" font-weight="600" letter-spacing="2.4" fill="#b4531a">${escapeHtml(restaurantName.toUpperCase())}</text>`,
    `<text x="160" y="${70 + titleSize * 0.8}" font-family="${serif}" font-size="${titleSize}" font-weight="900" fill="#17110d">${escapeHtml(content.title)}</text>`,
    `<text x="160" y="124" font-size="12" fill="#6a5a45">${escapeHtml(content.hint)}</text>`,
    `<rect x="48" y="136" width="224" height="224" rx="14" fill="#ffffff"/>`,
    qr,
    content.logoUrl ? `<circle cx="160" cy="248" r="15.5" fill="#ffffff"/><clipPath id="logo"><circle cx="160" cy="248" r="12"/></clipPath><image href="${escapeHtml(content.logoUrl)}" xlink:href="${escapeHtml(content.logoUrl)}" x="148" y="236" width="24" height="24" preserveAspectRatio="xMidYMid slice" clip-path="url(#logo)"/>` : '',
    corner('M41 164 V150 a14 14 0 0 1 14 -14 H67'),
    corner('M279 164 V150 a14 14 0 0 0 -14 -14 H253'),
    corner('M41 332 V346 a14 14 0 0 0 14 14 H67'),
    corner('M279 332 V346 a14 14 0 0 1 -14 14 H253'),
    `<text x="160" y="396" font-family="${serif}" font-style="italic" font-size="15" fill="#17110d">Point your camera here</text>`,
    `<line x1="24" y1="414" x2="296" y2="414" stroke="#17110d" stroke-opacity=".3" stroke-dasharray="3 3"/>`,
    `<g transform="translate(86 424) scale(.7)">${BRAND_MARK}</g>`,
    `<text x="168" y="436" font-size="10" letter-spacing=".8" fill="#6a5a45">Powered by <tspan font-weight="700" fill="#17110d">${BRAND}</tspan></text>`,
    '</svg>',
  ].join('');
}

/** The logo as a data URI, so the downloaded file carries it instead of linking out. Falls back to the plain URL if the host blocks the fetch (CORS). */
async function inlineLogo(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

/** Downloads the slip as a vector file. */
export async function downloadSlip(content: SlipContent, restaurantName: string): Promise<void> {
  const logoUrl = content.logoUrl ? await inlineLogo(content.logoUrl) : undefined;
  const blob = new Blob([slipSvgDocument({ ...content, logoUrl }, restaurantName)], { type: 'image/svg+xml' });
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
export function printQrSheet(tables: DiningTable[], restaurantName: string, slug: string, logoUrl?: string): boolean {
  return printSlips(tables.map((t) => tableSlip(t, tableUrl(slug, t, window.location.origin), logoUrl)), restaurantName, 'table codes');
}

/** A single table's code, printed on its own. */
export function printSingleQr(table: DiningTable, restaurantName: string, url: string, logoUrl?: string): boolean {
  return printSlips([tableSlip(table, url, logoUrl)], restaurantName, `${table.name} QR`);
}

export function downloadQr(table: DiningTable, restaurantName: string, url: string, logoUrl?: string): Promise<void> {
  return downloadSlip(tableSlip(table, url, logoUrl), restaurantName);
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
  logoUrl,
  onClose,
  onCopy,
}: {
  table: DiningTable | null;
  url: string;
  restaurantName: string;
  logoUrl?: string;
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
          <QrImage value={url} logoUrl={logoUrl} />
        </div>

        <p className="mt-4 text-[9px] break-all text-ink-4">{url}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <button
            type="button"
            className="col-span-2 rounded-[14px] bg-flame py-3.5 text-[13px] font-bold tracking-wide transition-transform active:translate-y-px text-white"
            onClick={() => printSingleQr(table, restaurantName, url, logoUrl)}
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
          <button type="button" className="text-[11px] font-semibold text-ink-3 hover:text-ink" onClick={() => downloadQr(table, restaurantName, url, logoUrl)}>
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
