import { encodeQr } from '../src/domain/qr';
import { readQrFromPixels } from '../src/domain/readQr';

function paint(text: string): { data: Uint8ClampedArray; size: number } {
  const matrix = encodeQr(text);
  const px = 4;
  const quiet = 4;
  const size = matrix.size * px + quiet * 2;
  const data = new Uint8ClampedArray(size * size * 4);
  data.fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.modules[y][x]) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = ((quiet + y * px + dy) * size + (quiet + x * px + dx)) * 4;
          data[i] = data[i + 1] = data[i + 2] = 0;
        }
      }
    }
  }
  return { data, size };
}

const payload = 'https://pay.example/static';
const qr = paint(payload);
if (readQrFromPixels(qr.data, qr.size, qr.size) !== payload) throw new Error('a drawn QR was not read back');

const blank = new Uint8ClampedArray(80 * 80 * 4);
blank.fill(255);
if (readQrFromPixels(blank, 80, 80) !== null) throw new Error('a blank image was accepted as a QR');

console.log('read-qr ok');
