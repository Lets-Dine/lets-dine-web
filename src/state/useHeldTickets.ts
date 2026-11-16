import { useCallback, useEffect, useState } from 'react';
import { randomId } from '../api/store';

/** One line of a ticket set aside: ids only, so it is read back against whatever the menu is when it comes back. */
export interface HeldLine {
  dishId: string;
  variantId: string | null;
  addOnIds: string[];
  qty: number;
}

export interface HeldTicket {
  id: string;
  at: string;
  /** Where it goes back to: the table it was being built for, or the floor of a quick sale. */
  kind: 'TABLE' | 'FLOOR';
  targetId: string;
  label: string;
  /** A quick sale's name or number. */
  spot: string;
  lines: HeldLine[];
}

/** A ticket nobody came back for in a day is not coming back. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const keyOf = (branch: string) => `FeastoX.pos-held.v1:${branch}`;

function read(branch: string): HeldTicket[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(keyOf(branch)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return (parsed as HeldTicket[]).filter((t) => t && Array.isArray(t.lines) && Date.now() - Date.parse(t.at) < MAX_AGE_MS);
  } catch {
    return [];
  }
}

/**
 * Tickets set aside while a waiter deals with something else. Kept in this browser, per branch: they are drafts
 * (nothing exists on the server), so a refresh or a dropped connection must not lose them, but they are not shared.
 */
export function useHeldTickets(branch: string) {
  const [held, setHeld] = useState<HeldTicket[]>(() => read(branch));

  // Another tab on this device sees the same shelf: every change starts from what is stored now, not from what this tab last saw,
  // and a change made elsewhere shows up here.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === keyOf(branch) && setHeld(read(branch));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [branch]);

  const change = useCallback(
    (edit: (current: HeldTicket[]) => HeldTicket[]) => {
      const next = edit(read(branch));
      setHeld(next);
      try {
        localStorage.setItem(keyOf(branch), JSON.stringify(next));
      } catch {
        /* private mode: they last until the page does */
      }
    },
    [branch],
  );

  const hold = useCallback((ticket: Omit<HeldTicket, 'id' | 'at'>) => change((cur) => [...cur, { ...ticket, id: randomId(), at: new Date().toISOString() }]), [change]);
  const release = useCallback((id: string) => change((cur) => cur.filter((t) => t.id !== id)), [change]);
  return { held, hold, release };
}
