import { IS_LIVE_API, apiRequest } from './http';
import { authHeaders } from './live-admin';

/** The picture lives on the backend. The offline demo has nowhere to keep it. */
export const STATIC_QR_ENABLED = IS_LIVE_API;

export interface StaticQr {
  imageUrl: string | null;
  enabled: boolean;
}

export function getStaticQr(): Promise<StaticQr> {
  return apiRequest<StaticQr>('/restaurant/static-qr', { headers: authHeaders() });
}

export function saveStaticQr(imageUrl: string): Promise<StaticQr> {
  return apiRequest<StaticQr>('/restaurant/static-qr', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ imageUrl }) });
}

export function setStaticQrEnabled(enabled: boolean): Promise<StaticQr> {
  return apiRequest<StaticQr>('/restaurant/static-qr', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ enabled }) });
}
