import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { randomId } from '../api/client';
import type { CartLine } from '../domain/types';

interface CartValue {
  lines: CartLine[];
  count: number;
  quantityOf: (dishId: string) => number;
  add: (dishId: string, quantity?: number, note?: string) => void;
  setQuantity: (dishId: string, quantity: number) => void;
  setNote: (dishId: string, note: string) => void;
  remove: (dishId: string) => void;
  /** Puts a removed line back exactly where it was, so undo is a true reversal. */
  restore: (line: CartLine, index: number) => void;
  clear: () => void;
  /** Regenerated after every successful submit so retries stay idempotent. */
  idempotencyKey: string;
  rotateIdempotencyKey: () => void;
}

const CartContext = createContext<CartValue | null>(null);
const key = (sessionId: string) => `myfood.cart.${sessionId}`;

function load(sessionId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => load(sessionId));
  const [idempotencyKey, setIdempotencyKey] = useState(() => randomId());

  useEffect(() => {
    setLines(load(sessionId));
  }, [sessionId]);

  useEffect(() => {
    try {
      localStorage.setItem(key(sessionId), JSON.stringify(lines));
    } catch {
      /* ignore */
    }
  }, [lines, sessionId]);

  const setQuantity = useCallback((dishId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.dishId !== dishId)
        : prev.map((l) => (l.dishId === dishId ? { ...l, quantity: Math.min(30, quantity) } : l)),
    );
  }, []);

  const add = useCallback((dishId: string, quantity = 1, note = '') => {
    setLines((prev) => {
      const existing = prev.find((l) => l.dishId === dishId);
      if (!existing) return [...prev, { dishId, quantity, note }];
      return prev.map((l) =>
        l.dishId === dishId ? { ...l, quantity: Math.min(30, l.quantity + quantity), note: note || l.note } : l,
      );
    });
  }, []);

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      quantityOf: (dishId) => lines.find((l) => l.dishId === dishId)?.quantity ?? 0,
      add,
      setQuantity,
      setNote: (dishId, note) =>
        setLines((prev) => prev.map((l) => (l.dishId === dishId ? { ...l, note: note.slice(0, 140) } : l))),
      remove: (dishId) => setLines((prev) => prev.filter((l) => l.dishId !== dishId)),
      restore: (line, index) =>
        setLines((prev) => {
          // Re-adding a dish the diner has since ordered again must not double it.
          if (prev.some((l) => l.dishId === line.dishId)) return prev;
          const next = [...prev];
          next.splice(Math.min(Math.max(index, 0), next.length), 0, line);
          return next;
        }),
      clear: () => setLines([]),
      idempotencyKey,
      rotateIdempotencyKey: () => setIdempotencyKey(randomId()),
    }),
    [lines, add, setQuantity, idempotencyKey],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
