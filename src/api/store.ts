import { CATEGORIES, DISHES, RESTAURANT, TABLES } from '../data/menu';
import type {
  AuditEntry,
  DiningSession,
  DiningTable,
  Dish,
  MenuCategory,
  Order,
  Restaurant,
  Review,
} from '../domain/types';

/**
 * The one place demo state is persisted. Both halves of the product read and
 * write through here: the diner client (`client.ts`) and the restaurant
 * dashboard (`admin.ts`). That shared table is the point — a manager marking a
 * dish unavailable has to actually stop a diner from ordering it, or the
 * dashboard is a puppet show.
 */

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Exported so tests can reach in and age an order without a time machine. */
export const STORE_KEY = 'myfood.store.v3';

export interface MenuState {
  categories: MenuCategory[];
  dishes: Dish[];
}

export interface Store {
  orders: Order[];
  reviews: Review[];
  idempotency: Record<string, string>;
  sessions: Record<string, DiningSession>;
  /** Null until someone edits: the seed menu materialises into the store then. */
  menu: MenuState | null;
  tables: DiningTable[] | null;
  restaurantPatch: Partial<Restaurant> | null;
  audit: AuditEntry[];
  /**
   * The demo kitchen advances orders on a timer so the diner flow works with
   * nobody at the pass. Staff working the real queue turn it off, otherwise
   * the timer would keep overtaking their decisions.
   */
  autoKitchen: boolean;
  /** Order references are sequential per restaurant, never derived from a count. */
  nextRef: number;
  /** Set once the dashboard has planted its opening shift of live orders. */
  seededQueue: boolean;
}

export function emptyStore(): Store {
  return {
    orders: [],
    reviews: [],
    idempotency: {},
    sessions: {},
    menu: null,
    tables: null,
    restaurantPatch: null,
    audit: [],
    autoKitchen: true,
    nextRef: 1000,
    seededQueue: false,
  };
}

export function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    return { ...emptyStore(), ...(JSON.parse(raw) as Partial<Store>) };
  } catch {
    return emptyStore();
  }
}

export function writeStore(store: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    /* storage full or blocked — the demo degrades to in-memory */
  }
}

export const latency = () => new Promise<void>((r) => setTimeout(r, 90 + Math.random() * 160));

/** crypto.randomUUID is unavailable outside secure contexts (e.g. LAN testing). */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function uid(prefix: string): string {
  const rand = randomId().replace(/-/g, '').slice(0, 12);
  return `${prefix}_${rand}`;
}

/** A printed QR token has to survive being read off a laminated card. */
const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newQrToken(): string {
  let out = '';
  for (let i = 0; i < 14; i++) out += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  return out;
}

/* ── Reading through the overlay ───────────────────────────────────
   Seed data is the starting state, not the source of truth. Once the
   dashboard has touched something, the store's copy wins.            */

export function menuOf(store: Store): MenuState {
  return store.menu ?? { categories: CATEGORIES, dishes: DISHES };
}

export function tablesOf(store: Store): DiningTable[] {
  return store.tables ?? TABLES;
}

export function restaurantOf(store: Store): Restaurant {
  return store.restaurantPatch ? { ...RESTAURANT, ...store.restaurantPatch } : RESTAURANT;
}

/** Copies the seed menu into the store so it can be edited in place. */
export function withEditableMenu(store: Store): Store & { menu: MenuState } {
  if (store.menu) return store as Store & { menu: MenuState };
  return {
    ...store,
    menu: {
      categories: CATEGORIES.map((c) => ({ ...c })),
      dishes: DISHES.map((d) => ({ ...d, stats: { ...d.stats } })),
    },
  };
}

export function withEditableTables(store: Store): Store & { tables: DiningTable[] } {
  if (store.tables) return store as Store & { tables: DiningTable[] };
  return { ...store, tables: TABLES.map((t) => ({ ...t })) };
}

export function takeReference(store: Store): { store: Store; reference: string } {
  const next = Math.max(store.nextRef, 1000) + 1;
  return { store: { ...store, nextRef: next }, reference: `#${next}` };
}
