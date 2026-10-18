import type { Minor } from '../domain/types';
import { apiRequest } from './http';
import { authHeaders } from './live-admin';

export type ReceivableBucket = 'notDue' | 'overdue30' | 'overdue60' | 'overdue60plus';
export type ReceivableSort = 'owed' | 'oldest' | 'name';

export interface Receivable {
  customerId: string;
  name: string;
  phone: string;
  owed: Minor;
  billCount: number;
  oldestDueAt: string;
  /** For the oldest bill; negative while it is not yet due. */
  daysOverdue: number;
  bucket: ReceivableBucket;
  lastRemindedAt: string | null;
}

export interface Receivables {
  buckets: Record<ReceivableBucket, { owed: Minor; customers: number }>;
  rows: Receivable[];
  count: number;
}

export const fetchReceivables = (q: { bucket?: ReceivableBucket; sortBy?: ReceivableSort; offset?: number; limit?: number } = {}) => {
  const params = new URLSearchParams({ sortBy: q.sortBy ?? 'owed', offset: String(q.offset ?? 0), limit: String(q.limit ?? 20) });
  if (q.bucket) params.set('bucket', q.bucket);
  return apiRequest<Receivables>(`/restaurant/receivables?${params.toString()}`, { headers: authHeaders() });
};

/** Records that staff chased this customer; the server notes what they owed at that moment. */
export const recordReminder = (customerId: string) =>
  apiRequest<{ id: string; amount: Minor; createdAt: string }>(`/restaurant/receivables/${encodeURIComponent(customerId)}/reminders`, { method: 'POST', headers: authHeaders() });
