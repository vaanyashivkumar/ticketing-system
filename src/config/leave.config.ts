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
import type { DepartmentCode } from '@domain/types/auth.types';
import { MOCK_USERS } from './mockUsers.config';

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
 * manager is PER DEPARTMENT (below), resolved from the applicant's own department at read time.
 */
export const HR_APPROVER_ID = 'u-hr'; // Nadia Okonkwo
export const MD_APPROVER_ID = 'u-sys'; // Marcus Vane

/**
 * ── PER-DEPARTMENT LINE MANAGERS (stakeholder decision, 2026-08-03). ──────────────────────────
 * Supersedes the per-EMPLOYEE `lineManagerId` this file carried from 2026-07-24. The manager is a
 * property of the DEPARTMENT, not of the person: one manager per department or none, so the
 * stage-1 approver can never be ambiguous. In API mode the authoritative copy is the DB column
 * `Department.managerId`; this map is what the seed writes there, and what localStorage mode reads.
 *
 * `null` is a first-class value, not missing data: a department with no manager SKIPS the MANAGER
 * stage entirely and the chain begins at HR (ratified rule — see `firstStageFor` in leaveEngine).
 * Four of the six departments have a single member, so they have nobody to report to internally.
 *
 * NOT a role: nothing here grants a permission. It answers "who signs off leave for this
 * department", and is read only by the leave chain. Permissions remain route-derived
 * (BUSINESS_DOMAIN_MODEL §2.3 — no stored role, no role-keyed permission table).
 */
export const DEPARTMENT_MANAGERS: Readonly<Record<DepartmentCode, string | null>> = {
  SAL: 'u-sal', // Priya Raman
  MKT: 'u-mkt', // Tom Whitfield
  ACA: 'u-aca', // Dr Elena Marsh
  HR: 'u-hr', // Nadia Okonkwo
  FIN: 'u-fin', // James Carrow — Sofia Nowak reports to him
  ADM: 'u-adm', // Ruth Bello — Marcus Vane reports to her
};

interface LeaveEmployee {
  /** ISO date (YYYY-MM-DD) of joining — the anchor for all accrual. */
  readonly joinDate: string;
}

/**
 * Per-employee leave facts. Join dates are spread across several years so accrued balances differ
 * and the ledger is worth looking at. The line manager is NO LONGER here — it now comes from the
 * applicant's department (`DEPARTMENT_MANAGERS`), so this map holds only what is genuinely
 * per-person. A stage whose approver IS the applicant auto-passes (see leaveEngine).
 */
export const LEAVE_EMPLOYEES: Readonly<Record<string, LeaveEmployee>> = {
  'u-sal': { joinDate: '2022-03-01' }, // Priya Raman
  'u-mkt': { joinDate: '2023-06-15' }, // Tom Whitfield
  'u-aca': { joinDate: '2021-09-01' }, // Dr Elena Marsh
  'u-hr': { joinDate: '2020-01-20' }, // Nadia Okonkwo
  'u-fin': { joinDate: '2022-11-10' }, // James Carrow
  'u-fin-2': { joinDate: '2024-02-05' }, // Sofia Nowak
  'u-adm': { joinDate: '2019-05-06' }, // Ruth Bello
  'u-sys': { joinDate: '2018-04-02' }, // Marcus Vane
};

/** The line manager of a department, or null when it has none (the chain then starts at HR). */
export function managerOfDepartment(code: DepartmentCode | null | undefined): string | null {
  return code ? DEPARTMENT_MANAGERS[code] ?? null : null;
}

/**
 * The line manager for an applicant: their department's manager. Null when the department has no
 * manager OR the user is unknown (defensive — an unknown user gets no MANAGER stage, never a
 * wrong one). The department comes from MOCK_USERS, which is the identity source in localStorage
 * mode and the list the API seeds from, so both modes resolve the same manager.
 */
export function lineManagerFor(userId: string): string | null {
  return managerOfDepartment(MOCK_USERS.find((u) => u.id === userId)?.departmentCode);
}

/** The user id who approves a given stage for a given applicant. */
export function approverForStage(stage: ApprovalStage, applicantId: string): string | null {
  switch (stage) {
    case 'MANAGER': return lineManagerFor(applicantId);
    case 'HR': return HR_APPROVER_ID;
    case 'MD': return MD_APPROVER_ID;
  }
}
