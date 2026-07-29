/**
 * LEAVE MANAGEMENT CONFIGURATION (single source of truth for the leave module).
 *
 * ── RATIFIED CONSTITUTION AMENDMENT, 2026-07-24 (stakeholder-directed). ──────────────────────
 * The Business Constitution's §2.3 routes a "Leave Request" as a SINGLE hop → HR, and §519 of the
 * BDM records "no approval sub-workflow in scope". This module is the deliberate, stakeholder-
 * ratified exception to both: leave applications carry a THREE-STAGE approval chain
 * (Line manager → HR → MD). It is scoped to leave ONLY — the universal 10-status ticket lifecycle
 * is untouched, so no other category gains an approval sub-workflow. This is an EXTENSION in the
 * same spirit as the C35 routing extension: recorded here as the one place it is defined, not a
 * silent redesign. See [[ticketing-constitution-ratified]].
 *
 * ── Why leave-employee data lives HERE, keyed by user id, and not on the User object. ─────────
 * In API mode the `User` comes from the server and carries no join date or line manager; adding
 * required fields there would break it. Keying leave data by the STABLE user id (`u-sal`, `u-hr`,
 * …, which the API seeds from this same MOCK_USERS list) makes the module work identically in both
 * data-source modes and keeps leave concerns out of the identity model. Single source of truth for
 * leave-employee facts, nothing borrowed.
 */

import type { LeaveTypeName } from '@domain/leave/leaveTypes';

/** Days of paid leave accrued per COMPLETED month of service (stakeholder: 2.5). */
export const MONTHLY_ACCRUAL_DAYS = 2.5;

/** Leave types. Kept aligned with the `hr-leave` ticket category's options (routes.config.ts). */
export const LEAVE_TYPES: readonly LeaveTypeName[] = [
  'Annual', 'Sick', 'Unpaid', 'Parental', 'Compassionate', 'Other',
];

/**
 * Types that NEVER draw on the accrued balance — every day is unpaid by definition, so the
 * balance is neither checked nor deducted. Everything else deducts from the balance, and any
 * excess beyond it is recorded unpaid (stakeholder decision, 2026-07-24).
 */
export const ALWAYS_UNPAID_TYPES: readonly LeaveTypeName[] = ['Unpaid'];

/** The three sequential approval stages, in order. */
export type ApprovalStage = 'MANAGER' | 'HR' | 'MD';
export const APPROVAL_STAGES: readonly ApprovalStage[] = ['MANAGER', 'HR', 'MD'];

export const STAGE_LABEL: Readonly<Record<ApprovalStage, string>> = {
  MANAGER: 'Line manager',
  HR: 'HR',
  MD: 'Managing Director',
};

/**
 * The demo approver mapping (stakeholder-confirmed, 2026-07-24). HR and MD are global; the line
 * manager is per-employee (below), so departments can diverge later without touching this.
 */
export const HR_APPROVER_ID = 'u-hr'; // Nadia Okonkwo
export const MD_APPROVER_ID = 'u-sys'; // Marcus Vane

interface LeaveEmployee {
  /** ISO date (YYYY-MM-DD) of joining — the anchor for all accrual. */
  readonly joinDate: string;
  /** User id of this employee's line manager (stage 1 approver). */
  readonly lineManagerId: string;
}

/**
 * Per-employee leave facts. Join dates are spread across several years so accrued balances differ
 * and the ledger is worth looking at. Line manager defaults to Ruth Bello (`u-adm`) per the
 * confirmed demo mapping; Sofia reports to James (a second Finance member) to exercise a
 * department-local manager. A step whose approver IS the applicant auto-passes (see leaveEngine).
 */
export const LEAVE_EMPLOYEES: Readonly<Record<string, LeaveEmployee>> = {
  'u-sal': { joinDate: '2022-03-01', lineManagerId: 'u-adm' }, // Priya Raman
  'u-mkt': { joinDate: '2023-06-15', lineManagerId: 'u-adm' }, // Tom Whitfield
  'u-aca': { joinDate: '2021-09-01', lineManagerId: 'u-adm' }, // Dr Elena Marsh
  'u-hr': { joinDate: '2020-01-20', lineManagerId: 'u-adm' }, // Nadia Okonkwo
  'u-fin': { joinDate: '2022-11-10', lineManagerId: 'u-adm' }, // James Carrow
  'u-fin-2': { joinDate: '2024-02-05', lineManagerId: 'u-fin' }, // Sofia Nowak → James
  'u-adm': { joinDate: '2019-05-06', lineManagerId: 'u-sys' }, // Ruth Bello → MD
  'u-sys': { joinDate: '2018-04-02', lineManagerId: 'u-sys' }, // Marcus Vane (MD; self → auto-skip)
};

/** The line manager for an applicant, or null if unknown (defensive — unknown users get no chain). */
export function lineManagerFor(userId: string): string | null {
  return LEAVE_EMPLOYEES[userId]?.lineManagerId ?? null;
}

/** The user id who approves a given stage for a given applicant. */
export function approverForStage(stage: ApprovalStage, applicantId: string): string | null {
  switch (stage) {
    case 'MANAGER': return lineManagerFor(applicantId);
    case 'HR': return HR_APPROVER_ID;
    case 'MD': return MD_APPROVER_ID;
  }
}
