import { ApiError } from './store';

/**
 * Transport for the real backend. Vite injects `import.meta.env` at build time;
 * the smoke tests bundle these modules with esbuild and run them in node, where
 * it does not exist — hence the optional read rather than a bare access.
 */
const RAW_BASE_URL = import.meta.env?.VITE_API_URL ?? '';

export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '');

/**
 * With no `VITE_API_URL` configured the app keeps running against the
 * in-browser stand-in in `client.ts`, so `npm test` and a bare `npm run dev`
 * still work with no server in sight.
 */
export const IS_LIVE_API = API_BASE_URL.length > 0;

/** `{ data, message }` on success — the envelope every endpoint answers with. */
interface SuccessEnvelope<T> {
  data: T;
  message?: { key: string; message: string };
}

/** `{ data: null, statusCode, error: { key, message, details } }` on failure. */
interface ErrorEnvelope {
  error?: { key?: string; message?: string; details?: unknown };
}

/** Every list endpoint answers with this, never `items`/`total`. */
export interface Paginated<T> {
  rows: T[];
  count: number;
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : null),
        ...init.headers,
      },
    });
  } catch {
    // A dead server and a dead connection look the same from here, and the
    // diner can act on the same advice either way.
    throw new ApiError(0, 'We could not reach the restaurant. Check your connection and try again.');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (body as ErrorEnvelope | null)?.error?.message;
    throw new ApiError(response.status, message ?? 'Something went wrong. Please try again.');
  }

  return (body as SuccessEnvelope<T>).data;
}
