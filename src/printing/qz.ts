import qz from 'qz-tray';
import { fetchQzCertificate, signQzRequest } from '../api/printers';

/**
 * Prints raw ESC/POS to a network printer through QZ Tray — a small desktop app that must be running on the
 * PC this page is open on. When the server has a certificate, each request is signed with it. The laptop
 * still has to install that certificate once (Settings → Printing) or QZ keeps asking to trust the site.
 *
 * The printer is addressed by IP, so a kitchen printer on another floor needs no computer of its own — only
 * to be on the same network as the PC running QZ Tray.
 */

export interface PrintTarget {
  host: string;
  port: number;
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
  const config = qz.configs.create({ host: target.host, port: target.port });
  await qz.print(config, [{ type: 'raw', format: 'command', flavor: 'base64', data: toBase64(bytes) }]);
}
