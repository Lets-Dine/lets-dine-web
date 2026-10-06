import { IS_LIVE_API, apiRequest } from './http';
import { authHeaders } from './live-admin';

/** Fonepay merchant credentials live on the backend; the offline demo has nowhere to keep them. */
export const FONEPAY_ENABLED = IS_LIVE_API;

/** The secrets are never sent back — only enough to show the restaurant it is set up. */
export interface FonepaySummary {
  configured: boolean;
  /** Saved credentials can be switched off without losing them. */
  enabled: boolean;
  merchantCode: string | null;
  username: string | null;
}

export interface FonepayDraft {
  merchantCode: string;
  username: string;
  secretKey: string;
  password: string;
}

export function getFonepay(): Promise<FonepaySummary> {
  return apiRequest<FonepaySummary>('/restaurant/fonepay', { headers: authHeaders() });
}

export function saveFonepay(draft: FonepayDraft): Promise<FonepaySummary> {
  return apiRequest<FonepaySummary>('/restaurant/fonepay', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(draft) });
}

export function setFonepayEnabled(enabled: boolean): Promise<FonepaySummary> {
  return apiRequest<FonepaySummary>('/restaurant/fonepay', { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ enabled }) });
}
