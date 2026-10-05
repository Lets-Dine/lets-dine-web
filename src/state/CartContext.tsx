import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { randomId } from '../api/client';
import type { CartLine } from '../domain/types';

interface CartValue {
  lines: CartLine[];
  count: number;
  quantityOf: (dishId: string, variantId?: string | null, addOnIds?: string[]) => number;
  add: (dishId: string, quantity?: number, note?: string, variantId?: string | null, addOnIds?: string[]) => void;
  setQuantity: (dishId: string, quantity: number, variantId?: string | null, addOnIds?: string[]) => void;
  setNote: (dishId: string, note: string, variantId?: string | null, addOnIds?: string[]) => void;
  remove: (dishId: string, variantId?: string | null, addOnIds?: string[]) => void;
  /** Puts a removed line back exactly where it was, so undo is a true reversal. */
  restore: (line: CartLine, index: number) => void;
  clear: () => void;
  /** Regenerated after every successful submit so retries stay idempotent. */
  idempotencyKey: string;
  rotateIdempotencyKey: () => void;
}

const CartContext = createContext<CartValue | null>(null);
const key = (sessionId: string) => `FeastoX.cart.${sessionId}`;

/** A line's real identity: the dish plus which add-ons it carries — a differently-customized order of the same dish is a different line. */
function addOnKey(addOnIds: string[]): string {
  return [...addOnIds].sort().join(',');
}

/** The chosen variant is part of a line's identity too — "Small" and "Large" of the same dish are different lines, same reasoning as add-ons. */
function sameLine(line: CartLine, dishId: string, variantId: string | null, addOnIds: string[]): boolean {
  return line.dishId === dishId && line.variantId === variantId && addOnKey(line.addOnIds) === addOnKey(addOnIds);
}

function load(sessionId: string): CartLine[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    // Carts saved before add-ons/variants existed have no `addOnIds`/`variantId` yet.
    return parsed.map((l) => ({ ...l, variantId: l.variantId ?? null, addOnIds: l.addOnIds ?? [] }));
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

  const setQuantity = useCallback(
    (dishId: string, quantity: number, variantId: string | null = null, addOnIds: string[] = []) => {
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => !sameLine(l, dishId, variantId, addOnIds))
          : prev.map((l) => (sameLine(l, dishId, variantId, addOnIds) ? { ...l, quantity: Math.min(30, quantity) } : l)),
      );
    },
    [],
  );

  const add = useCallback(
    (dishId: string, quantity = 1, note = '', variantId: string | null = null, addOnIds: string[] = []) => {
      setLines((prev) => {
        const existing = prev.find((l) => sameLine(l, dishId, variantId, addOnIds));
        if (!existing) return [...prev, { dishId, quantity, note, variantId, addOnIds }];
        return prev.map((l) =>
          l === existing ? { ...l, quantity: Math.min(30, l.quantity + quantity), note: note || l.note } : l,
        );
      });
    },
    [],
  );

  const value = useMemo<CartValue>(
    () => ({
      lines,
      count: lines.reduce((n, l) => n + l.quantity, 0),
      quantityOf: (dishId, variantId = null, addOnIds = []) =>
        lines.find((l) => sameLine(l, dishId, variantId, addOnIds))?.quantity ?? 0,
      add,
      setQuantity,
      setNote: (dishId, note, variantId = null, addOnIds = []) =>
        setLines((prev) =>
          prev.map((l) => (sameLine(l, dishId, variantId, addOnIds) ? { ...l, note: note.slice(0, 140) } : l)),
        ),
      remove: (dishId, variantId = null, addOnIds = []) =>
        setLines((prev) => prev.filter((l) => !sameLine(l, dishId, variantId, addOnIds))),
      restore: (line, index) =>
        setLines((prev) => {
          // Re-adding a dish the diner has since ordered again (same variant/add-ons) must not double it.
          if (prev.some((l) => sameLine(l, line.dishId, line.variantId, line.addOnIds))) return prev;
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
