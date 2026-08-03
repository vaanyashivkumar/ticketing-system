/**
 * Leave domain types. Kept import-free of config so both the engine and the config can depend on
 * it without a cycle.
 */
import type { ApprovalStage } from '@config/leave.config';

export type LeaveTypeName =
  | 'Annual' | 'Sick' | 'Unpaid' | 'Parental' | 'Compassionate' | 'Other';

/** The lifecycle of a single leave application. Deliberately NOT the ticket lifecycle. */
export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

/** One recorded decision on the approval chain — the audit trail the stakeholder asked to keep. */
export interface LeaveDecision {
  readonly stage: ApprovalStage;
  readonly actorId: string;
  readonly action: 'Approved' | 'Rejected';
  /** ISO timestamp. */
  readonly at: string;
  readonly note?: string;
}

export interface LeaveRecord {
  readonly id: string;
  /**
   * `LV-0001` — the human reference for this application.
   *
   * It exists because the approval chain notifies people, and the notification template's
   * `compose` takes a code and an actor and NOTHING else. That signature is deliberate: a leave
   * reason is often a medical or family circumstance, and it must never be broadcast in a preview
   * that fans out to three approvers. The code is what a notification is allowed to name instead.
   */
  readonly code: string;
  readonly employeeId: string;
  readonly type: LeaveTypeName;
  /** ISO dates (YYYY-MM-DD), inclusive. */
  readonly startDate: string;
  readonly endDate: string;
  /** Calendar days in [start, end], inclusive (minus holidays if a calendar is supplied). */
  readonly requestedDays: number;
  /** Days drawn from the accrued balance. */
  readonly paidDays: number;
  /** Days beyond the balance (or all days, for always-unpaid types). Recorded, never deducted. */
  readonly unpaidDays: number;
  readonly reason?: string;
  readonly status: LeaveStatus;
  /** The stage currently awaiting a decision, or null once resolved. */
  readonly stage: ApprovalStage | null;
  readonly history: readonly LeaveDecision[];
  /** ISO timestamp. */
  readonly createdAt: string;
  /** ISO timestamp of the final decision (approved/rejected), if any. */
  readonly decidedAt?: string;
}

/** A person's balance at a point in time. */
export interface LeaveBalance {
  /** Total accrued since joining (2.5 × completed months). */
  readonly accrued: number;
  /** Paid days consumed by non-rejected, non-cancelled applications (approved OR still pending). */
  readonly consumed: number;
  /** accrued − consumed, floored at 0. */
  readonly available: number;
}
