import qz from 'qz-tray';
import { fetchQzCertificate, signQzRequest } from '../api/printers';

/**
 * Prints raw ESC/POS to a network printer through QZ Tray — a small desktop app that must be running on the
 * PC this page is open on. When the server has a certificate, each request is signed with it. The laptop
 * still has to install that certificate once (Settings → Printing) or QZ keeps asking to trust the site.
 *
 * A network printer is addressed by IP, so one on another floor needs no computer of its own. A Bluetooth
 * printer is a name QZ lists on this PC: an installed printer, or a serial port.
 */

export type PrintTarget = { host: string; port: number } | { device: string; serial: boolean };

/** Network uses IP. Bluetooth uses the OS printer name, or a serial port when `serial` is set. */
export function targetOf(printer: {
  link?: 'NETWORK' | 'BLUETOOTH';
  ipAddress?: string;
  host?: string;
  port: number;
  deviceName?: string;
  device?: string;
  serial?: boolean;
}): PrintTarget {
  const device = printer.link === 'BLUETOOTH' ? printer.deviceName : printer.device;
  if (device) return { device, serial: !!printer.serial };
  return { host: (printer.ipAddress ?? printer.host ?? '').trim(), port: printer.port };
}

function asNames(found: string | string[]): string[] {
  return (Array.isArray(found) ? found : found ? [found] : []).filter(Boolean);
}

/** Printers and serial ports QZ Tray can see on this PC. Bluetooth shows up as one or the other. */
export async function listLocalDevices(): Promise<{ name: string; serial: boolean }[]> {
  await connect();
  const [printers, ports] = await Promise.all([
    qz.printers.find().then(asNames).catch(() => [] as string[]),
    qz.serial.findPorts().then(asNames).catch(() => [] as string[]),
  ]);
  return [...printers.map((name) => ({ name, serial: false })), ...ports.map((name) => ({ name, serial: true }))];
}

export function isConnected(): boolean {
  return qz.websocket.isActive();
}

let connecting: Promise<void> | null = null;
let signingReady = false;

/** No-op when the server has no certificate yet: QZ then shows its usual trust prompt. */
async function armSigning(): Promise<void> {
  if (signingReady) return;
  const certificate = await fetchQzCertificate().catch(() => null);
  if (!certificate) return;
  qz.security.setCertificatePromise((resolve) => resolve(certificate));
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    signQzRequest(toSign).then(resolve, reject);
  });
  signingReady = true;
}

/** One attempt at a time: QZ rejects a second `connect()` made while the first is still pending. */
export function connect(): Promise<void> {
  if (qz.websocket.isActive()) return Promise.resolve();
  connecting ??= armSigning()
    .then(() => qz.websocket.connect({ retries: 2, delay: 1 }))
    .finally(() => {
      connecting = null;
    });
  return connecting;
}

/** Drop the connection — used when this PC is switched off from printing. Printing again reconnects on demand. */
export async function disconnect(): Promise<void> {
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function onClosed(callback: () => void): void {
  qz.websocket.setClosedCallbacks(callback);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function printRaw(target: PrintTarget, bytes: Uint8Array): Promise<void> {
  await connect();
  const data = toBase64(bytes);
  if ('device' in target) {
    if (target.serial) {
      // ponytail: 9600 8N1, QZ's default. Add a baud field if a printer prints garbage.
      await qz.serial.openPort(target.device, { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'NONE', flowControl: 'NONE' });
      try {
        await qz.serial.sendData(target.device, { type: 'BASE64', data });
      } finally {
        await qz.serial.closePort(target.device).catch(() => {});
      }
      return;
    }
    const config = qz.configs.create(target.device);
    await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'base64', data }]);
    return;
  }
  const config = qz.configs.create({ host: target.host, port: target.port });
  await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'base64', data }]);
}
