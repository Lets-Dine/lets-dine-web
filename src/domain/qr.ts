/**
 * A QR encoder, because §29 asks for codes a restaurant can print and stick to
 * a table permanently. Anything that merely looks like a QR would be worse
 * than nothing — it gets laminated, and then nobody can order.
 *
 * Byte and numeric modes, error-correction levels L–H, versions 1–10, which
 * covers any table URL several times over. Self-contained: no dependency, and
 * the output is an SVG path, so printing it is a browser print dialog rather
 * than an image pipeline.
 *
 * Verified against the ISO/IEC 18004 worked example — see `tests/rules.smoke.ts`.
 */

export type Ecl = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  version: number;
  ecl: Ecl;
  size: number;
  /** `modules[y][x]` — true is a dark module. */
  modules: boolean[][];
}

const MAX_VERSION = 10;

/** Format-info bits per level. Deliberately not in level order. */
const ECL_BITS: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };
const ECL_INDEX: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 };

/** Error-correction codewords per block, indexed [ecl][version - 1]. */
const EC_PER_BLOCK: number[][] = [
  [7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];

/** Number of error-correction blocks, indexed [ecl][version - 1]. */
const BLOCKS: number[][] = [
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];

/** Alignment-pattern centres per version; version 1 has none. */
const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

/** Total data-and-EC modules a version has room for, function patterns removed. */
function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function totalCodewords(version: number): number {
  return Math.floor(rawDataModules(version) / 8);
}

export function dataCodewords(version: number, ecl: Ecl): number {
  const e = ECL_INDEX[ecl];
  return totalCodewords(version) - EC_PER_BLOCK[e][version - 1] * BLOCKS[e][version - 1];
}

/* ── GF(256) and Reed–Solomon ──────────────────────────────────────── */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // the QR primitive polynomial
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generator polynomial for `degree` error-correction codewords. */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

export function reedSolomon(data: number[], degree: number): number[] {
  const gen = generator(degree);
  const remainder = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < degree; i++) remainder[i] ^= gfMul(gen[i + 1], factor);
  }
  return remainder;
}

/* ── Segment encoding ──────────────────────────────────────────────── */

class BitBuffer {
  bits: number[] = [];

  push(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) this.bits.push((value >>> i) & 1);
  }
}

type Mode = 'numeric' | 'byte';

function charCountBits(mode: Mode, version: number): number {
  // Versions 1–9 share the smallest count field; 10 is the first step up.
  if (mode === 'numeric') return version < 10 ? 10 : 12;
  return version < 10 ? 8 : 16;
}

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const byte of new TextEncoder().encode(text)) out.push(byte);
  return out;
}

function pickMode(text: string): Mode {
  return /^[0-9]+$/.test(text) ? 'numeric' : 'byte';
}

function segmentBitCount(mode: Mode, text: string): number {
  if (mode === 'numeric') {
    const groups = Math.floor(text.length / 3);
    const rest = text.length % 3;
    return groups * 10 + (rest === 0 ? 0 : rest === 1 ? 4 : 7);
  }
  return utf8(text).length * 8;
}

function writeSegment(buf: BitBuffer, mode: Mode, text: string, version: number): void {
  buf.push(mode === 'numeric' ? 1 : 4, 4);
  const count = mode === 'numeric' ? text.length : utf8(text).length;
  buf.push(count, charCountBits(mode, version));

  if (mode === 'numeric') {
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      buf.push(Number(chunk), chunk.length * 3 + 1);
    }
  } else {
    for (const byte of utf8(text)) buf.push(byte, 8);
  }
}

/** Mode indicator, payload, terminator, padding — the final data codewords. */
export function encodeData(text: string, version: number, ecl: Ecl): number[] {
  const mode = pickMode(text);
  const capacity = dataCodewords(version, ecl) * 8;
  const needed = 4 + charCountBits(mode, version) + segmentBitCount(mode, text);
  if (needed > capacity) throw new Error('QR payload does not fit that version.');

  const buf = new BitBuffer();
  writeSegment(buf, mode, text, version);

  buf.push(0, Math.min(4, capacity - buf.bits.length));
  buf.push(0, (8 - (buf.bits.length % 8)) % 8);

  const codewords: number[] = [];
  for (let i = 0; i < buf.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | buf.bits[i + j];
    codewords.push(byte);
  }
  // The specified pad bytes, alternating, until the block is full.
  for (let pad = 0xec; codewords.length < capacity / 8; pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

/** Splits into blocks, adds error correction, and interleaves as the spec asks. */
export function interleave(data: number[], version: number, ecl: Ecl): number[] {
  const e = ECL_INDEX[ecl];
  const blockCount = BLOCKS[e][version - 1];
  const ecLength = EC_PER_BLOCK[e][version - 1];
  const shortBlockLength = Math.floor(totalCodewords(version) / blockCount) - ecLength;
  const longBlocks = totalCodewords(version) % blockCount;

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < blockCount; i++) {
    const length = shortBlockLength + (i < blockCount - longBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    ecBlocks.push(reedSolomon(block, ecLength));
  }

  const out: number[] = [];
  const longest = shortBlockLength + 1;
  for (let i = 0; i < longest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecLength; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

/* ── The matrix ────────────────────────────────────────────────────── */

class Builder {
  readonly version: number;
  readonly ecl: Ecl;
  size: number;
  modules: boolean[][];
  reserved: boolean[][];

  constructor(version: number, ecl: Ecl) {
    this.version = version;
    this.ecl = ecl;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
    this.reserved = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false));
  }

  private setFunction(x: number, y: number, dark: boolean): void {
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    this.modules[y][x] = dark;
    this.reserved[y][x] = true;
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      const timing = i % 2 === 0;
      this.setFunction(6, i, timing);
      this.setFunction(i, 6, timing);
    }

    this.finder(3, 3);
    this.finder(this.size - 4, 3);
    this.finder(3, this.size - 4);

    const centres = ALIGNMENT[this.version - 1];
    for (const cy of centres) {
      for (const cx of centres) {
        const atFinder =
          (cx === 6 && cy === 6) ||
          (cx === 6 && cy === this.size - 7) ||
          (cx === this.size - 7 && cy === 6);
        if (!atFinder) this.alignment(cx, cy);
      }
    }

    // Reserved now, filled once the mask is chosen.
    this.drawFormat(0);
    this.drawVersion();
  }

  private finder(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        this.setFunction(cx + dx, cy + dy, distance !== 2 && distance <= 3);
      }
    }
  }

  private alignment(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.setFunction(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormat(mask: number): void {
    const data = (ECL_BITS[this.ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.setFunction(8, i, bit(i));
    this.setFunction(8, 7, bit(6));
    this.setFunction(8, 8, bit(7));
    this.setFunction(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.setFunction(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.setFunction(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.setFunction(8, this.size - 15 + i, bit(i));
    this.setFunction(8, this.size - 8, true); // the always-dark module
  }

  private drawVersion(): void {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.setFunction(a, b, dark);
      this.setFunction(b, a, dark);
    }
  }

  /** Two-module-wide columns, right to left, alternating up and down. */
  placeData(codewords: number[]): void {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // the vertical timing pattern is not a column
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (this.reserved[y][x]) continue;
          if (i < codewords.length * 8) {
            this.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
          // Anything past the data is a remainder bit, and stays light.
        }
      }
    }
  }

  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.reserved[y][x]) continue;
        if (maskAt(mask, x, y)) this.modules[y][x] = !this.modules[y][x];
      }
    }
  }

  penalty(): number {
    const n = this.size;
    let score = 0;

    // Rule 1 — runs of five or more.
    const runScore = (run: number) => (run >= 5 ? 3 + (run - 5) : 0);
    for (let i = 0; i < n; i++) {
      let rowRun = 1;
      let colRun = 1;
      for (let j = 1; j < n; j++) {
        if (this.modules[i][j] === this.modules[i][j - 1]) {
          rowRun++;
        } else {
          score += runScore(rowRun);
          rowRun = 1;
        }
        if (this.modules[j][i] === this.modules[j - 1][i]) {
          colRun++;
        } else {
          score += runScore(colRun);
          colRun = 1;
        }
      }
      score += runScore(rowRun) + runScore(colRun);
    }

    // Rule 2 — solid 2×2 blocks.
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = this.modules[y][x];
        if (c === this.modules[y][x + 1] && c === this.modules[y + 1][x] && c === this.modules[y + 1][x + 1])
          score += 3;
      }
    }

    // Rule 3 — anything that could be mistaken for a finder pattern.
    const FINDERS = ['10111010000', '00001011101'];
    for (let i = 0; i < n; i++) {
      let row = '';
      let col = '';
      for (let j = 0; j < n; j++) {
        row += this.modules[i][j] ? '1' : '0';
        col += this.modules[j][i] ? '1' : '0';
      }
      for (const pattern of FINDERS) {
        score += 40 * (countOverlapping(row, pattern) + countOverlapping(col, pattern));
      }
    }

    // Rule 4 — drift away from an even balance of dark and light.
    let dark = 0;
    for (const row of this.modules) for (const cell of row) if (cell) dark++;
    const ratio = (dark * 100) / (n * n);
    score += Math.floor(Math.abs(ratio - 50) / 5) * 10;

    return score;
  }
}

function countOverlapping(haystack: string, needle: string): number {
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) count++;
  return count;
}

function maskAt(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

export interface EncodeOptions {
  ecl?: Ecl;
  minVersion?: number;
}

export function encodeQr(text: string, options: EncodeOptions = {}): QrMatrix {
  const ecl = options.ecl ?? 'M';
  const mode = pickMode(text);

  let version = Math.max(1, options.minVersion ?? 1);
  for (; version <= MAX_VERSION; version++) {
    const capacity = dataCodewords(version, ecl) * 8;
    if (4 + charCountBits(mode, version) + segmentBitCount(mode, text) <= capacity) break;
  }
  if (version > MAX_VERSION) throw new Error('That text is too long for a printable table code.');

  const codewords = interleave(encodeData(text, version, ecl), version, ecl);

  const builder = new Builder(version, ecl);
  builder.drawFunctionPatterns();
  builder.placeData(codewords);

  // Every mask is drawn and scored; the least offensive one wins.
  let best = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    builder.applyMask(mask);
    builder.drawFormat(mask);
    const score = builder.penalty();
    if (score < bestScore) {
      bestScore = score;
      best = mask;
    }
    builder.applyMask(mask); // masking is its own inverse
  }
  builder.applyMask(best);
  builder.drawFormat(best);

  return { version, ecl, size: builder.size, modules: builder.modules };
}

/* ── Rendering ─────────────────────────────────────────────────────── */

/** One SVG path covering every dark module, at one unit per module. */
export function qrPath(matrix: QrMatrix, margin = 2): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.modules[y][x]) parts.push(`M${x + margin} ${y + margin}h1v1h-1z`);
    }
  }
  return parts.join('');
}

export function qrViewBox(matrix: QrMatrix, margin = 2): string {
  const extent = matrix.size + margin * 2;
  return `0 0 ${extent} ${extent}`;
}

/* ── Styled rendering ──────────────────────────────────────────────
   The softened look most diners now expect: capsule-shaped runs of
   modules instead of hard squares, and a rounded-square "eye" standing
   in for each finder pattern's flat ring. Purely cosmetic — the modules
   behind it are exactly what `qrPath` draws, so a scanner reads either
   rendering the same way.                                              */

interface CornerRadii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

function moduleDark(matrix: QrMatrix, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < matrix.size && y < matrix.size && matrix.modules[y][x];
}

/** Inside one of the three finder patterns' 7×7 footprint — drawn as an eye instead of loose dots. */
function inFinderZone(matrix: QrMatrix, x: number, y: number): boolean {
  const n = matrix.size;
  const zone = (cx: number, cy: number) => Math.abs(x - cx) <= 3 && Math.abs(y - cy) <= 3;
  return zone(3, 3) || zone(n - 4, 3) || zone(3, n - 4);
}

/** Half a module — a fully isolated module rounds to a full dot, a run of them to a capsule. */
const DOT_RADIUS = 0.5;

/** A corner only bulges outward where nothing continues the shape past it — an `A r,r` with r=0 degenerates to a plain corner per the SVG spec, so every corner can go through the same arc command. */
function dotCorners(matrix: QrMatrix, x: number, y: number): CornerRadii {
  const up = moduleDark(matrix, x, y - 1);
  const down = moduleDark(matrix, x, y + 1);
  const left = moduleDark(matrix, x - 1, y);
  const right = moduleDark(matrix, x + 1, y);
  return {
    tl: !up && !left ? DOT_RADIUS : 0,
    tr: !up && !right ? DOT_RADIUS : 0,
    br: !down && !right ? DOT_RADIUS : 0,
    bl: !down && !left ? DOT_RADIUS : 0,
  };
}

function modulePath(x: number, y: number, r: CornerRadii): string {
  return (
    `M${x + r.tl} ${y}` +
    `L${x + 1 - r.tr} ${y}` +
    `A${r.tr} ${r.tr} 0 0 1 ${x + 1} ${y + r.tr}` +
    `L${x + 1} ${y + 1 - r.br}` +
    `A${r.br} ${r.br} 0 0 1 ${x + 1 - r.br} ${y + 1}` +
    `L${x + r.bl} ${y + 1}` +
    `A${r.bl} ${r.bl} 0 0 1 ${x} ${y + 1 - r.bl}` +
    `L${x} ${y + r.tl}` +
    `A${r.tl} ${r.tl} 0 0 1 ${x + r.tl} ${y}` +
    'Z'
  );
}

/** Every dark module outside the three finder eyes, rounded per `dotCorners`. */
export function qrDotsPath(matrix: QrMatrix, margin = 2): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y][x] || inFinderZone(matrix, x, y)) continue;
      parts.push(modulePath(x + margin, y + margin, dotCorners(matrix, x, y)));
    }
  }
  return parts.join('');
}

/** A square of the given side, centred at (cx, cy), with uniform rounded corners. */
function roundedSquare(cx: number, cy: number, side: number, radius: number): string {
  const r = Math.min(radius, side / 2);
  const x = cx - side / 2;
  const y = cy - side / 2;
  return (
    `M${x + r} ${y}` +
    `H${x + side - r}` +
    `A${r} ${r} 0 0 1 ${x + side} ${y + r}` +
    `V${y + side - r}` +
    `A${r} ${r} 0 0 1 ${x + side - r} ${y + side}` +
    `H${x + r}` +
    `A${r} ${r} 0 0 1 ${x} ${y + side - r}` +
    `V${y + r}` +
    `A${r} ${r} 0 0 1 ${x + r} ${y}` +
    'Z'
  );
}

/**
 * Each finder pattern redrawn as a rounded-square "eye" — an outer ring (an
 * evenodd hole cut through a 7-wide square down to a 5-wide one) plus a
 * solid 3-wide pupil — in place of the flat ring the raw matrix draws there.
 * `ring` needs `fill-rule="evenodd"`; `pupil` is a plain fill.
 */
export function qrEyesPath(matrix: QrMatrix, margin = 2): { ring: string; pupil: string } {
  const centres: [number, number][] = [
    [3, 3],
    [matrix.size - 4, 3],
    [3, matrix.size - 4],
  ];
  const ring: string[] = [];
  const pupil: string[] = [];
  for (const [mx, my] of centres) {
    const cx = mx + margin + 0.5;
    const cy = my + margin + 0.5;
    ring.push(roundedSquare(cx, cy, 7, 2.1));
    ring.push(roundedSquare(cx, cy, 5, 1.5));
    pupil.push(roundedSquare(cx, cy, 3, 0.9));
  }
  return { ring: ring.join(''), pupil: pupil.join('') };
}

/** A standalone black-on-white SVG file — what actually goes to the printer. */
export function qrSvgDocument(matrix: QrMatrix, margin = 4): string {
  const extent = matrix.size + margin * 2;
  const eyes = qrEyesPath(matrix, margin);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" width="${extent * 8}" height="${extent * 8}">`,
    `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`,
    `<path d="${qrDotsPath(matrix, margin)}" fill="#000000"/>`,
    `<path d="${eyes.ring}" fill="#000000" fill-rule="evenodd"/>`,
    `<path d="${eyes.pupil}" fill="#000000"/>`,
    '</svg>',
  ].join('');
}
