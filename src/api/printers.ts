import type { KitchenStation } from '../domain/types';
import type { KitchenTicket } from './kitchen';
import { apiRequest } from './http';
import { authHeaders } from './live-admin';

/** The branch's thermal printers, and the print queue the printing PC works through. Live API only. */

export type PaperWidth = 'MM80' | 'MM58';

export interface Printer {
  id: string;
  name: string;
  paperWidth: PaperWidth;
  ipAddress: string;
  port: number;
  /** The whole order on one slip, every station together. */
  fullKot: boolean;
  /** KITCHEN = KOT, BAR = BOT. Ignored while `fullKot` is on. */
  stations: KitchenStation[];
  /** When on, only these tables and floors print here. */
  tableAssignment: boolean;
  tableIds: string[];
  floorIds: string[];
  isActive: boolean;
  /** Warn the front of house when a slip for this printer sits unprinted. */
  warnIfUnprinted: boolean;
}

export type PrinterDraft = Omit<Printer, 'id'>;

export const listPrinters = () => apiRequest<Printer[]>('/restaurant/printers', { headers: authHeaders() });

export const createPrinter = (draft: PrinterDraft) =>
  apiRequest<Printer>('/restaurant/printers', { method: 'POST', headers: authHeaders(), body: JSON.stringify(draft) });

export const updatePrinter = (id: string, draft: Partial<PrinterDraft>) =>
  apiRequest<Printer>(`/restaurant/printers/${encodeURIComponent(id)}`, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify(draft) });

export const deletePrinter = (id: string) =>
  apiRequest<null>(`/restaurant/printers/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaders() });

export interface PrintJob {
  id: string;
  orderId: string;
  attempts: number;
  lastError: string | null;
  printer: { id: string; name: string; ipAddress: string; port: number; paperWidth: PaperWidth };
  /** One ticket, or every ticket one change produced for a full-KOT printer. */
  tickets: KitchenTicket[];
}

export const listPendingJobs = () => apiRequest<PrintJob[]>('/restaurant/print-jobs/pending', { headers: authHeaders() });

/** `claimed: false` means another PC took it — do not print. */
export const claimJob = (id: string, claimant: string) =>
  apiRequest<{ claimed: boolean }>(`/restaurant/print-jobs/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ claimant }),
  });

export const markJobPrinted = (id: string) =>
  apiRequest<null>(`/restaurant/print-jobs/${encodeURIComponent(id)}/printed`, { method: 'POST', headers: authHeaders() });

export const markJobFailed = (id: string, claimant: string, error: string) =>
  apiRequest<null>(`/restaurant/print-jobs/${encodeURIComponent(id)}/failed`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ claimant, error: error.slice(0, 300) || 'Print failed' }),
  });
