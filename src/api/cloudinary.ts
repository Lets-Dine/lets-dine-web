import { getUploadSignature } from './staff';
import type { UploadSignature } from './admin';
import type { UploadTarget } from './staff';
import { ApiError } from './store';

/**
 * Uploads straight from the browser to Cloudinary with a signature minted by
 * our backend (`getUploadSignature`) — the file never makes a round trip
 * through our server, and the API secret never reaches the browser. `target` is
 * a restaurant upload folder, or a function minting a signature for callers
 * that are not a restaurant (the platform's dish library).
 */
export async function uploadToCloudinary(file: Blob, target: UploadTarget | (() => Promise<UploadSignature>)): Promise<string> {
  const sig = await (typeof target === 'function' ? target() : getUploadSignature(target));

  const body = new FormData();
  body.append('file', file);
  body.append('api_key', sig.apiKey);
  body.append('timestamp', String(sig.timestamp));
  body.append('signature', sig.signature);
  body.append('folder', sig.folder);

  let response: Response;
  try {
    response = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body });
  } catch {
    throw new ApiError(0, 'Could not reach Cloudinary. Check your connection and try again.');
  }

  const result = await response.json().catch(() => null);
  if (!response.ok || typeof result?.secure_url !== 'string') {
    throw new ApiError(response.status || 502, result?.error?.message ?? 'Image upload failed. Try again.');
  }
  return result.secure_url as string;
}
