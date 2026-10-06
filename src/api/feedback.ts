import type { UploadSignature } from './admin';
import { IS_LIVE_API, apiRequest } from './http';
import type { Paginated } from './http';
import { platformHeaders } from './platform';
import { authHeaders } from './live-admin';

/** Restaurant staff writing to the product team. Live backend only — the offline demo has nobody to send it to. */
export const FEEDBACK_ENABLED = IS_LIVE_API;

export type FeedbackType = 'BUG' | 'IDEA' | 'QUESTION' | 'PRAISE';
export type FeedbackStatus = 'NEW' | 'REVIEWING' | 'DONE';

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = { BUG: 'Bug', IDEA: 'Idea', QUESTION: 'Question', PRAISE: 'Praise' };
export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = { NEW: 'New', REVIEWING: 'Reviewing', DONE: 'Done' };

export interface FeedbackDraft {
  type: FeedbackType;
  message: string;
  screenshotUrl?: string;
  /** The admin page the sender was on. */
  pagePath: string;
}

export const sendFeedback = (draft: FeedbackDraft) =>
  apiRequest<null>('/restaurant/feedback', { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export const getFeedbackSignature = () => apiRequest<UploadSignature>('/restaurant/feedback/screenshot-signature', { method: 'POST', headers: authHeaders() });

/* ── Operator inbox ────────────────────────────────────────────────── */

export interface FeedbackItem {
  id: string;
  restaurantId: string;
  restaurantName: string;
  senderName: string;
  senderEmail: string;
  senderRole: 'OWNER' | 'MANAGER' | 'STAFF';
  type: FeedbackType;
  message: string;
  screenshotUrl: string | null;
  pagePath: string;
  status: FeedbackStatus;
  createdAt: string;
}

export const listFeedback = () => apiRequest<Paginated<FeedbackItem>>('/platform/feedback?limit=200', { headers: platformHeaders() }).then((p) => p.rows);

export const setFeedbackStatus = (id: string, status: FeedbackStatus) =>
  apiRequest<null>(`/platform/feedback/${id}/status`, { method: 'PATCH', headers: platformHeaders(), body: JSON.stringify({ status }) });
