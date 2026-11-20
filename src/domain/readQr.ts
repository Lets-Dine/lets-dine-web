import jsQR from 'jsqr';

/** Longest edge we scan. A code that is a small sticker in a wide photo may not be read; upload the code itself. */
const MAX_EDGE = 1200;

/** The text inside one QR, or null when the pixels do not contain a readable code. */
export function readQrFromPixels(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

function isSvg(file: Blob): boolean {
  return file.type === 'image/svg+xml' || (file instanceof File && file.name.toLowerCase().endsWith('.svg'));
}

function px(value: string | null): number {
  if (!value || value.includes('%')) return 0;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** SVG has no pixels until drawn. Longest edge lands on MAX_EDGE so a small viewBox still decodes. */
async function drawSvg(file: Blob): Promise<HTMLCanvasElement | null> {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName !== 'svg') return null;
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const box = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const bw = box?.length === 4 && box[2] > 0 ? box[2] : 0;
  const bh = box?.length === 4 && box[3] > 0 ? box[3] : 0;
  const w = px(svg.getAttribute('width')) || bw || MAX_EDGE;
  const h = px(svg.getAttribute('height')) || bh || MAX_EDGE;
  const scale = MAX_EDGE / Math.max(w, h);
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('svg'));
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SVG becomes a PNG. ponytail: Cloudinary rejects SVG unless the account allows it; upload the PNG until it does. */
export async function imageForUpload(file: File): Promise<Blob> {
  if (!isSvg(file)) return file;
  const canvas = await drawSvg(file);
  const png = await new Promise<Blob | null>((resolve) => canvas?.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Could not read this SVG');
  return png;
}

/** Reads a QR out of an image file. Null when there isn't one. */
export async function readQr(file: Blob): Promise<string | null> {
  if (isSvg(file)) {
    const canvas = await drawSvg(file);
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return null;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return readQrFromPixels(data, canvas.width, canvas.height);
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    return readQrFromPixels(data, width, height);
  } finally {
    bitmap.close();
  }
}
