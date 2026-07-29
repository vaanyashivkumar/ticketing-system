import { api } from './client';
import type { LeaveRecord, LeaveBalance, LeaveTypeName } from '@domain/leave/leaveTypes';

/**
 * Leave API client. One place that knows the leave endpoints; the store branches on USE_API and
 * calls these in API mode. The server is authoritative for the paid/unpaid split and for who may
 * approve — these calls carry no user id, exactly like the notification client.
 */

export interface LeaveOverview {
  balance: LeaveBalance;
  accruedToDate: number;
  ledger: LeaveRecord[];
  approvals: LeaveRecord[];
}

export interface LeaveApplyInput {
  type: LeaveTypeName;
  startDate: string;
  endDate: string;
  reason?: string;
}

export const LeaveApi = {
  /** The caller's balance, own ledger, and applications awaiting their decision. */
  overview: () => api.get<LeaveOverview>('/leave'),
  apply: (input: LeaveApplyInput) => api.post<{ record: LeaveRecord }>('/leave', input),
  decide: (id: string, action: 'Approved' | 'Rejected', note?: string) =>
    api.post<{ record: LeaveRecord }>(`/leave/${id}/decide`, { action, ...(note ? { note } : {}) }),
  cancel: (id: string) => api.post<{ record: LeaveRecord }>(`/leave/${id}/cancel`),
};
