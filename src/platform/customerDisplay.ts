import { useEffect, useRef, useState } from 'react';

/*
 * The customer-facing screen. The POS terminal is the only writer; a window opened from it (on a second monitor, facing the
 * customer) only reads. Same origin, so a BroadcastChannel reaches it without a server. Only what the customer reads is sent:
 * no guest name or phone.
 */
const CHANNEL = 'feastox-customer-display';

export interface CustomerLine {
  key: string;
  name: string;
  detail: string;
  qty: number;
  amount: number;
}

export interface CustomerSnapshot {
  restaurant: string;
  label: string;
  currency: string;
  lines: CustomerLine[];
  total: number;
  /** The restaurant's payment QR, while the customer should be scanning it. */
  payQr?: string | null;
  /** What that scan is for. Falls back to `total`. */
  payAmount?: number | null;
}

type Message = { type: 'show'; snapshot: CustomerSnapshot | null } | { type: 'hello' };

/** Opens the customer screen in its own window. Call from a click, or the browser blocks it. */
export function openCustomerDisplay(): void {
  window.open('/customer-display', CHANNEL, 'popup,width=560,height=800');
}

/**
 * POS side. Keeps the customer screen on `snapshot`, and answers when a freshly opened screen asks what is on. Unmounting
 * (the board, leaving POS) clears it to idle.
 */
export function usePublishCustomerDisplay(snapshot: CustomerSnapshot): void {
  const channel = useRef<BroadcastChannel | null>(null);
  const latest = useRef(snapshot);
  // Compared by value, so a re-render with the same ticket does not re-send it.
  const payload = JSON.stringify(snapshot);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.type === 'hello') ch.postMessage({ type: 'show', snapshot: latest.current } satisfies Message);
    };
    return () => {
      ch.postMessage({ type: 'show', snapshot: null } satisfies Message);
      ch.close();
      channel.current = null;
    };
  }, []);

  useEffect(() => {
    const next = JSON.parse(payload) as CustomerSnapshot;
    latest.current = next;
    channel.current?.postMessage({ type: 'show', snapshot: next } satisfies Message);
  }, [payload]);
}

/** Customer side. `null` is idle: nothing is being rung up. */
export function useCustomerSnapshot(): CustomerSnapshot | null {
  const [snapshot, setSnapshot] = useState<CustomerSnapshot | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.type === 'show') setSnapshot(e.data.snapshot);
    };
    ch.postMessage({ type: 'hello' } satisfies Message);
    return () => ch.close();
  }, []);
  return snapshot;
}
