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
export const HR_APPROVER_ID = 'u-sneha'; // Sneha — the sole HR member, so every chain passes her

/**
 * BOTH Managing Directors, 2026-08-04. The MD stage is held JOINTLY: either Raja or Maha may give
 * final approval, and whoever acts first decides it (stakeholder decision).
 *
 * A LIST, not a pair of constants, because the number of MDs is data. The engine asks "who may
 * decide this stage" and gets back a set — one name, two, or none — so a third MD or a return to
 * one needs no code change. It also fixes something the single-MD model could not express: an
 * MD's own application is now approvable BY THE OTHER MD rather than having to skip the stage for
 * want of anyone eligible.
 */
export const MD_APPROVER_IDS: readonly string[] = ['u-raja', 'u-maha'];

/** True for a Managing Director. They sit outside the line-management chain — see `lineManagerFor`. */
export const isManagingDirector = (userId: string): boolean => MD_APPROVER_IDS.includes(userId);

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
  SAL: 'u-hafeez', // Hafeez — Sales Executive AND Manager; the title does not confer this, the field does
  MKT: 'u-balu', // Balu — Digital Marketing Manager
  FIN: 'u-raza', // Raza — Finance Manager
  HR: 'u-sneha', // Sneha — sole member, so also her own department's manager
  OPS: 'u-amna', // Amna — Operations General Manager
  /**
   * NULL, and deliberately so: the org chart names no line manager for either department — their
   * "head, for final approval" is an MD, which is the MD stage, not the manager stage. Their
   * people's leave therefore skips MANAGER and starts at HR, the ratified behaviour. Naming a
   * manager here to avoid a null would invent a reporting line the business did not state.
   */
  ACA: null, // Radhika, Henoc, Anu — final approval sits with MD Raja
  ADM: null, // Susrita; the two MDs sit here too and have no line manager by rule
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
  // Leadership — longest service, so their balances are the largest on the Team view.
  'u-raja': { joinDate: '2016-02-01' }, // MD
  'u-maha': { joinDate: '2016-02-01' }, // MD
  'u-susrita': { joinDate: '2021-08-16' },
  // Digital Marketing
  'u-balu': { joinDate: '2019-03-11' },
  'u-sakshi': { joinDate: '2023-07-03' },
  'u-mufeeda': { joinDate: '2022-09-19' },
  'u-minhaj': { joinDate: '2023-02-06' },
  'u-anas': { joinDate: '2024-05-13' },
  'u-john': { joinDate: '2021-11-08' },
  'u-manahil': { joinDate: '2024-01-15' },
  'u-absal': { joinDate: '2025-03-24' },
  // Sales
  'u-hafeez': { joinDate: '2018-06-04' },
  'u-iqra': { joinDate: '2022-01-17' },
  'u-vakas': { joinDate: '2021-04-12' },
  'u-rajesh': { joinDate: '2020-10-05' },
  'u-ranjit': { joinDate: '2023-09-11' },
  'u-nisha': { joinDate: '2024-08-19' },
  'u-bakar': { joinDate: '2025-02-10' },
  // Finance
  'u-raza': { joinDate: '2019-07-22' },
  'u-hasna': { joinDate: '2023-03-06' },
  // Academics
  'u-radhika': { joinDate: '2020-05-18' },
  'u-henoc': { joinDate: '2022-08-08' },
  'u-anu': { joinDate: '2024-03-25' },
  // Operations
  'u-amna': { joinDate: '2018-11-26' },
  'u-hussain': { joinDate: '2022-06-13' },
  'u-samah': { joinDate: '2024-11-04' },
  // Human Resources
  'u-sneha': { joinDate: '2020-09-14' },
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
 *
 * AN MD HAS NO LINE MANAGER, and that is a business fact rather than missing data: nobody is
 * above a Managing Director. Without this they would inherit their department's manager and the
 * head of the company would be sending leave upward to one of their own reports.
 *
 * Note what changed when a SECOND MD arrived: an MD's chain is no longer HR-only. Their MD stage
 * now has an eligible approver — the other MD — so it runs. HR → MD, with the co-director
 * deciding. That falls out of the set-based rule below; it is not special-cased.
 */
export function lineManagerFor(userId: string): string | null {
  if (isManagingDirector(userId)) return null;
  return managerOfDepartment(MOCK_USERS.find((u) => u.id === userId)?.departmentCode);
}

/**
 * EVERYONE who may decide a stage — a SET, because the MD stage is held jointly by both Managing
 * Directors and whichever acts first decides it.
 *
 * The applicant is NOT filtered here. Callers do that, and they must: "who holds this stage" and
 * "who may act on it" are different questions, and collapsing them is how a self-approval guard
 * gets lost. `firstStageFor` skips a stage with no ELIGIBLE approver; `canDecide` refuses the
 * applicant outright.
 */
export function approversForStage(stage: ApprovalStage, applicantId: string): readonly string[] {
  switch (stage) {
    case 'MANAGER': {
      const manager = lineManagerFor(applicantId);
      return manager ? [manager] : [];
    }
    case 'HR': return [HR_APPROVER_ID];
    case 'MD': return MD_APPROVER_IDS;
  }
}

/** Display helper: who a pending stage is currently waiting on, for the UI to name. */
export function eligibleApprovers(stage: ApprovalStage, applicantId: string): readonly string[] {
  return approversForStage(stage, applicantId).filter((id) => id !== applicantId);
}
