import { apiRequest, IS_LIVE_API } from './http';
import type { UploadSignature } from './admin';
import { authHeaders } from './live-admin';
import { platformHeaders } from './platform';
import { ApiError } from './store';

/**
 * The platform's shared dish photo library. The operator curates it
 * (`/platform/dish-photos`, platform key); restaurants only read it while adding
 * or editing a dish (`/restaurant/dish-photos`, staff session).
 */

export interface LibraryPhoto {
  id: string;
  name: string;
  imageUrl: string;
}

const NEEDS_LIVE = new ApiError(400, 'The photo library needs a live backend.');

/** Photos matching a dish name, or the whole library when no name is given. Never throws — suggestions are a nicety, not a blocker. */
export async function suggestPhotos(name?: string): Promise<LibraryPhoto[]> {
  if (!IS_LIVE_API) return [];
  const query = name?.trim() ? `?name=${encodeURIComponent(name.trim())}` : '';
  try {
    return await apiRequest<LibraryPhoto[]>(`/restaurant/dish-photos${query}`, { headers: authHeaders() });
  } catch {
    return [];
  }
}

export async function listLibrary(): Promise<LibraryPhoto[]> {
  if (!IS_LIVE_API) return [];
  return apiRequest<LibraryPhoto[]>('/platform/dish-photos', { headers: platformHeaders() });
}

export async function addLibraryPhoto(name: string, imageUrl: string): Promise<LibraryPhoto> {
  if (!IS_LIVE_API) throw NEEDS_LIVE;
  return apiRequest<LibraryPhoto>('/platform/dish-photos', {
    method: 'POST',
    headers: platformHeaders(),
    body: JSON.stringify({ name: name.trim(), imageUrl }),
  });
}

export async function removeLibraryPhoto(id: string): Promise<void> {
  if (!IS_LIVE_API) throw NEEDS_LIVE;
  await apiRequest<null>(`/platform/dish-photos/${id}`, { method: 'DELETE', headers: platformHeaders() });
}

export async function getLibrarySignature(): Promise<UploadSignature> {
  if (!IS_LIVE_API) throw NEEDS_LIVE;
  return apiRequest<UploadSignature>('/platform/dish-photos/signature', { method: 'POST', headers: platformHeaders() });
}
