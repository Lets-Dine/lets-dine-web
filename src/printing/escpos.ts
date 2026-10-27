import type { KitchenTicket } from '../api/kitchen';

/**
 * A kitchen or bar slip as raw ESC/POS bytes. Plain ASCII on purpose: a thermal printer's
 * built-in font has no Devanagari or curly quotes, so anything else prints as "?" — dish
 * names must be readable in Latin script on the slip. Paper width picks the column count
 * (80mm ≈ 48 columns, 58mm ≈ 32); measure on the real printer and adjust if a line wraps.
 */

export type Paper = '80mm' | '58mm';
export const COLUMNS: Record<Paper, number> = { '80mm': 48, '58mm': 32 };

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const INIT = [ESC, 0x40];
const ALIGN = { left: [ESC, 0x61, 0], center: [ESC, 0x61, 1] };
const BOLD = (on: boolean) => [ESC, 0x45, on ? 1 : 0];
/** GS ! n — width in the high nibble, height in the low: 0x11 is double both, 0x01 double height. */
const SIZE = (n: number) => [GS, 0x21, n];
const INVERSE = (on: boolean) => [GS, 0x42, on ? 1 : 0];
/** Feed then a partial cut — printers without a cutter ignore it. */
const CUT = [GS, 0x56, 0x42, 0x03];

/** Anything the printer's font cannot show becomes "?", never a garbled byte. */
export function ascii(text: string): string {
  return text
    .replace(/[×✕]/g, 'x')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?');
}

/** Greedy word wrap at `width`, hard-breaking a word longer than a whole line. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > width) {
      if (line) {
        lines.push(line);
        line = '';
      }
      lines.push(w.slice(0, width));
      w = w.slice(width);
    }
    if (!line) line = w;
    else if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function where(order: KitchenTicket['order']): string {
  if (!order) return '';
  if (order.orderType === 'DELIVERY') return 'DELIVERY';
  if (order.tableName) return order.tableName;
  return [order.floorName, order.floorVisitorName].filter(Boolean).join(' - ') || 'Dine-in';
}

class Slip {
  readonly bytes: number[] = [];
  raw(...codes: number[][]) {
    for (const c of codes) this.bytes.push(...c);
    return this;
  }
  text(s: string) {
    for (const ch of ascii(s)) this.bytes.push(ch.charCodeAt(0));
    this.bytes.push(LF);
    return this;
  }
}

function writeTicketLines(s: Slip, ticket: KitchenTicket, cols: number) {
  for (const line of ticket.lines) {
    const stop = line.qtyDelta < 0;
    const head = `${stop ? '-' : ''}${Math.abs(line.qtyDelta)}x ${line.dishNameSnapshot}`;
    s.raw(SIZE(0x01), BOLD(true));
    // Double height keeps the width, so the same column count applies.
    for (const l of wrap(stop ? `VOID ${head}` : head, cols)) s.text(l);
    s.raw(SIZE(0x00), BOLD(false));
    if (line.variantNameSnapshot) for (const l of wrap(`  ${line.variantNameSnapshot}`, cols)) s.text(l);
    for (const name of line.addOnNames) for (const l of wrap(`  + ${name}`, cols)) s.text(l);
    if (line.notes) {
      s.raw(BOLD(true));
      for (const l of wrap(`  >> ${line.notes}`, cols)) s.text(l);
      s.raw(BOLD(false));
    }
  }
}

/** Where it goes, the order reference and the time — the same few lines on every slip. */
function writeWhere(s: Slip, ticket: KitchenTicket, cols: number) {
  s.raw(ALIGN.left, SIZE(0x01), BOLD(true));
  for (const l of wrap(where(ticket.order), cols)) s.text(l);
  s.raw(SIZE(0x00), BOLD(false));

  const time = new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ref = ticket.order ? `Order ${ticket.order.reference}` : '';
  s.text(ref ? `${ref}${' '.repeat(Math.max(1, cols - ref.length - time.length))}${time}` : time).text('-'.repeat(cols));
}

const SLIP_LABEL: Record<string, string> = { KITCHEN: 'KOT', BAR: 'BOT' };

/** One station's slip: KOT (kitchen) or BOT (bar). */
export function buildSlip(ticket: KitchenTicket, paper: Paper = '80mm'): Uint8Array {
  const cols = COLUMNS[paper];
  const isVoid = ticket.lines.every((l) => l.qtyDelta < 0);
  const s = new Slip().raw(INIT, ALIGN.center);

  s.raw(SIZE(0x11), BOLD(true)).text(`${SLIP_LABEL[ticket.station] ?? ticket.station} #${ticket.number}`).raw(SIZE(0x00), BOLD(false));
  if (isVoid) s.raw(INVERSE(true), BOLD(true)).text(' CANCELLED - STOP MAKING ').raw(INVERSE(false), BOLD(false));
  writeWhere(s, ticket, cols);
  writeTicketLines(s, ticket, cols);

  s.text('-'.repeat(cols)).raw([LF, LF, LF], CUT);
  return Uint8Array.from(s.bytes);
}

/**
 * What one print job puts on paper: a single ticket as its own slip, or — for a full-KOT printer — every
 * ticket one change produced on ONE slip, each station in its own section.
 */
export function buildJobSlip(tickets: KitchenTicket[], paper: Paper = '80mm'): Uint8Array {
  if (tickets.length === 1) return buildSlip(tickets[0], paper);
  const cols = COLUMNS[paper];
  const first = tickets[0];
  const s = new Slip().raw(INIT, ALIGN.center);

  s.raw(SIZE(0x11), BOLD(true)).text('FULL ORDER').raw(SIZE(0x00), BOLD(false));
  s.text(tickets.map((t) => `${SLIP_LABEL[t.station] ?? t.station} #${t.number}`).join('  '));
  writeWhere(s, first, cols);

  for (const ticket of tickets) {
    const isVoid = ticket.lines.every((l) => l.qtyDelta < 0);
    s.raw(INVERSE(true), BOLD(true)).text(` ${SLIP_LABEL[ticket.station] ?? ticket.station} #${ticket.number}${isVoid ? ' - CANCELLED' : ''} `).raw(INVERSE(false), BOLD(false));
    writeTicketLines(s, ticket, cols);
    s.text('-'.repeat(cols));
  }

  s.raw([LF, LF, LF], CUT);
  return Uint8Array.from(s.bytes);
}

/** A short slip to prove the printer, paper width and cutter work, before a real ticket depends on them. */
export function buildTestSlip(label: string, paper: Paper = '80mm'): Uint8Array {
  const cols = COLUMNS[paper];
  const s = new Slip().raw(INIT, ALIGN.center, SIZE(0x11), BOLD(true)).text('TEST').raw(SIZE(0x00), BOLD(false));
  s.text(label).raw(ALIGN.left).text('0123456789'.repeat(Math.ceil(cols / 10)).slice(0, cols));
  s.text('If this line wraps, switch paper width.').raw([LF, LF, LF], CUT);
  return Uint8Array.from(s.bytes);
}
