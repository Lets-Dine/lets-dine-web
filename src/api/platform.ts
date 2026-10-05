import { RESTAURANT } from '../data/menu';
import { STAFF } from '../data/staff';
import { ApiError, latency, uid } from './store';
import { apiRequest, IS_LIVE_API } from './http';
import type { Paginated } from './http';
import type { StaffMember } from '../domain/types';

/**
 * Platform onboarding. The backend answers these from a shared operator key
 * (`x-platform-key`), not a restaurant staff session — a restaurant that does
 * not exist yet has nobody to sign in as.
 */

const KEY = 'FeastoX.platform.key.v1';
const MOCK_KEY = 'FeastoX.platform.restaurants.v1';

export interface PlatformRestaurant {
  id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  coverImageUrl: string | null;
  currency: string;
  timezone: string;
  serviceChargeRate: number;
  taxRate: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOwner extends StaffMember {
  role: 'OWNER';
}

export interface RegisteredRestaurant {
  restaurant: PlatformRestaurant;
  owner: PlatformOwner;
}

export interface RegisterRestaurantInput {
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  coverImageUrl?: string | null;
  currency?: string;
  timezone?: string;
  serviceChargeRate?: number;
  taxRate?: number;
  owner: { name: string; email: string; pin: string };
}

export function readPlatformKey(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function storePlatformKey(key: string): void {
  try {
    sessionStorage.setItem(KEY, key);
  } catch {
    /* private mode still lets this tab work */
  }
}

export function clearPlatformKey(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up */
  }
}

export function platformHeaders(): Record<string, string> {
  const key = readPlatformKey();
  if (!key) throw new ApiError(401, 'Enter the platform key to continue.');
  return { 'x-platform-key': key };
}

function asIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

function toRestaurant(row: PlatformRestaurant & { createdAt: string | Date; updatedAt: string | Date }): PlatformRestaurant {
  return {
    ...row,
    coverImageUrl: row.coverImageUrl ?? null,
    createdAt: asIso(row.createdAt),
    updatedAt: asIso(row.updatedAt),
  };
}

function seedRestaurant(): PlatformRestaurant {
  return {
    id: RESTAURANT.id,
    name: RESTAURANT.name,
    slug: RESTAURANT.slug,
    tagline: RESTAURANT.tagline,
    description: RESTAURANT.description,
    coverImageUrl: RESTAURANT.coverImageUrl,
    currency: RESTAURANT.currency,
    timezone: RESTAURANT.timezone,
    serviceChargeRate: RESTAURANT.serviceChargeRate,
    taxRate: RESTAURANT.taxRate,
    isActive: true,
    createdAt: '2026-01-12T04:00:00.000Z',
    updatedAt: '2026-01-12T04:00:00.000Z',
  };
}

interface MockRecord {
  restaurant: PlatformRestaurant;
  owner: { name: string; email: string };
}

function readMock(): MockRecord[] {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    return raw ? (JSON.parse(raw) as MockRecord[]) : [];
  } catch {
    return [];
  }
}

function writeMock(rows: MockRecord[]): void {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(rows));
  } catch {
    /* storage blocked */
  }
}

function allMockRestaurants(): PlatformRestaurant[] {
  return [seedRestaurant(), ...readMock().map((row) => row.restaurant)];
}

export async function unlockPlatform(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new ApiError(401, 'Enter the platform key to continue.');
  storePlatformKey(trimmed);
  try {
    await listPlatformRestaurants();
  } catch (error) {
    clearPlatformKey();
    throw error;
  }
}

export async function listPlatformRestaurants(keyword = ''): Promise<Paginated<PlatformRestaurant>> {
  if (IS_LIVE_API) {
    const query = new URLSearchParams({ limit: '100', sortBy: 'name', sortOrder: 'asc' });
    const term = keyword.trim();
    if (term) query.set('keyword', term);
    const page = await apiRequest<Paginated<PlatformRestaurant>>(`/platform/restaurants?${query}`, {
      headers: platformHeaders(),
    });
    return { rows: page.rows.map(toRestaurant), count: page.count };
  }

  await latency();
  if (!readPlatformKey()) throw new ApiError(401, 'Enter the platform key to continue.');
  const needle = keyword.trim().toLowerCase();
  const rows = allMockRestaurants().filter((row) => !needle || row.name.toLowerCase().includes(needle) || row.slug.includes(needle));
  return { rows, count: rows.length };
}

export async function registerRestaurant(input: RegisterRestaurantInput): Promise<RegisteredRestaurant> {
  if (IS_LIVE_API) {
    const registered = await apiRequest<RegisteredRestaurant>('/platform/restaurants', {
      method: 'POST',
      headers: platformHeaders(),
      body: JSON.stringify(input),
    });
    return {
      restaurant: toRestaurant(registered.restaurant),
      owner: {
        id: registered.owner.id,
        restaurantId: registered.owner.restaurantId,
        name: registered.owner.name,
        email: registered.owner.email,
        role: 'OWNER',
      },
    };
  }

  await latency();
  if (!readPlatformKey()) throw new ApiError(401, 'Enter the platform key to continue.');

  const slug = input.slug.trim();
  const email = input.owner.email.trim().toLowerCase();
  if (allMockRestaurants().some((row) => row.slug === slug)) {
    throw new ApiError(409, 'That slug is already taken.');
  }
  if (STAFF.some((member) => member.email.toLowerCase() === email) || readMock().some((row) => row.owner.email.toLowerCase() === email)) {
    throw new ApiError(409, 'That owner email already belongs to an account.');
  }

  const now = new Date().toISOString();
  const restaurant: PlatformRestaurant = {
    id: uid('rst'),
    name: input.name.trim(),
    slug,
    tagline: input.tagline?.trim() ?? '',
    description: input.description?.trim() ?? '',
    coverImageUrl: input.coverImageUrl ?? null,
    currency: (input.currency ?? 'NPR').toUpperCase(),
    timezone: input.timezone?.trim() || 'Asia/Kathmandu',
    serviceChargeRate: input.serviceChargeRate ?? 0,
    taxRate: input.taxRate ?? 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const owner: PlatformOwner = {
    id: uid('stf'),
    restaurantId: restaurant.id,
    name: input.owner.name.trim(),
    email,
    role: 'OWNER',
  };
  writeMock([...readMock(), { restaurant, owner: { name: owner.name, email: owner.email } }]);
  return { restaurant, owner };
}
