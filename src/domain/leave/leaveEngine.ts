/**
 * THE LEAVE ENGINE — pure functions, no I/O, no store. Every leave rule the stakeholder specified
 * (2026-07-24) lives here exactly once, so the store and the UI compute nothing themselves.
 *
 * The accrual model, stated so it can be checked:
 *   • Accrual is 2.5 days per COMPLETED month of service, from join date to the reference date.
 *     A partial current month does not accrue until its monthly anniversary passes.
 *   • Untaken balance accumulates with NO cap.
 *   • A leave's length is calendar days start→end INCLUSIVE, minus any supplied public holidays.
 *   • On application, available balance is measured AS OF THE START DATE (you may only spend what
 *     you have accrued by the day the leave begins). Days within balance are paid and deducted;
 *     days beyond it are recorded UNPAID and still go through (stakeholder decision).
 *   • Pending applications RESERVE their paid days, so the same balance cannot be applied twice.
 */
import {
  MONTHLY_ACCRUAL_DAYS,
  ALWAYS_UNPAID_TYPES,
  APPROVAL_STAGES,
  approverForStage,
  type ApprovalStage,
} from '@config/leave.config';
import type { LeaveBalance, LeaveRecord, LeaveTypeName } from './leaveTypes';

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD as a UTC midnight, so day arithmetic never drifts across DST. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m! - 1), d!));
}

/** Whole months of service completed between join and reference (monthly anniversaries passed). */
export function completedMonths(joinISO: string, asOfISO: string): number {
  const join = parseDay(joinISO);
  const asOf = parseDay(asOfISO);
  let months =
    (asOf.getUTCFullYear() - join.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - join.getUTCMonth());
  // The current month has not completed until the day-of-month anniversary is reached.
  if (asOf.getUTCDate() < join.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

/** Total paid days accrued by the reference date. */
export function accruedDays(joinISO: string, asOfISO: string): number {
  return completedMonths(joinISO, asOfISO) * MONTHLY_ACCRUAL_DAYS;
}

/**
 * Calendar days in [startISO, endISO] inclusive, minus any dates in `holidays` that fall in range.
 * Returns 0 when the range is inverted rather than a negative length.
 */
export function leaveDayCount(
  startISO: string,
  endISO: string,
  holidays: readonly string[] = [],
): number {
  const start = parseDay(startISO).getTime();
  const end = parseDay(endISO).getTime();
  if (end < start) return 0;
  const span = Math.round((end - start) / MS_PER_DAY) + 1;
  const holidaysInRange = holidays.filter((h) => {
    const t = parseDay(h).getTime();
    return t >= start && t <= end;
  }).length;
  return Math.max(0, span - holidaysInRange);
}

/** A record consumes balance unless it was rejected or cancelled (pending ones reserve). */
export function consumesBalance(r: Pick<LeaveRecord, 'status'>): boolean {
  return r.status !== 'Rejected' && r.status !== 'Cancelled';
}

/**
 * Balance as of a reference date: accrued minus the paid days of every consuming record.
 *
 * `opts.employeeId` restricts the tally to ONE person's records — mandatory in practice, because a
 * balance is always someone's, and summing a shared record pool without it counts other people's
 * leave against this person's accrual (the exact defect this guard was added to kill). `excludeId`
 * drops one record — used when re-assessing an application so it does not count against itself.
 */
export function computeBalance(
  joinISO: string,
  asOfISO: string,
  records: readonly LeaveRecord[],
  opts: { employeeId?: string; excludeId?: string } = {},
): LeaveBalance {
  const accrued = accruedDays(joinISO, asOfISO);
  const consumed = records
    .filter((r) => (opts.employeeId ? r.employeeId === opts.employeeId : true))
    .filter((r) => r.id !== opts.excludeId && consumesBalance(r))
    .reduce((sum, r) => sum + r.paidDays, 0);
  return { accrued, consumed, available: Math.max(0, accrued - consumed) };
}

/**
 * Split a requested length into paid (within `available`) and unpaid (beyond it). Always-unpaid
 * types put every day on the unpaid side and touch no balance.
 */
export function splitPaidUnpaid(
  type: LeaveTypeName,
  requestedDays: number,
  available: number,
): { paidDays: number; unpaidDays: number } {
  if (ALWAYS_UNPAID_TYPES.includes(type)) return { paidDays: 0, unpaidDays: requestedDays };
  const paidDays = Math.max(0, Math.min(available, requestedDays));
  return { paidDays, unpaidDays: Math.max(0, requestedDays - paidDays) };
}

/**
 * The first stage that actually needs a decision for this applicant — skipping any stage whose
 * approver IS the applicant (you do not approve your own leave; the MD's manager-stage and any
 * self-referential stage auto-pass). Returns null when every stage self-resolves → auto-approved.
 */
export function firstStageFor(
  applicantId: string,
  from: ApprovalStage = APPROVAL_STAGES[0]!,
): ApprovalStage | null {
  const startIdx = APPROVAL_STAGES.indexOf(from);
  for (let i = startIdx; i < APPROVAL_STAGES.length; i++) {
    const stage = APPROVAL_STAGES[i]!;
    const approver = approverForStage(stage, applicantId);
    // A stage with no resolvable approver, or one the applicant occupies, is skipped.
    if (approver && approver !== applicantId) return stage;
  }
  return null;
}

/** The stage after `current` that needs a decision, or null when the chain is exhausted. */
export function nextStageFor(applicantId: string, current: ApprovalStage): ApprovalStage | null {
  const idx = APPROVAL_STAGES.indexOf(current);
  if (idx < 0 || idx + 1 >= APPROVAL_STAGES.length) return null;
  return firstStageFor(applicantId, APPROVAL_STAGES[idx + 1]!);
}

/**
 * True when `userId` is the approver the given record is currently waiting on.
 *
 * THE SELF-APPROVAL GUARD IS ITS OWN LINE, not a consequence of routing. Until 2026-08-03 the
 * claim "self-approval is impossible" was true only because `firstStageFor` never PLACED anyone on
 * a stage they occupied — this function itself would happily have agreed that Priya may approve
 * Priya. That was survivable while one person was self-managed; per-department managers made four
 * of six departments self-managed, and a record already sitting on a MANAGER stage (a stale row, a
 * fixture, a manager reassigned while an application was in flight) becomes self-approvable.
 * Routing decides where an application GOES; this decides who may act, and it must not delegate.
 */
export function canDecide(record: LeaveRecord, userId: string): boolean {
  if (record.status !== 'Pending' || record.stage === null) return false;
  if (userId === record.employeeId) return false;
  return approverForStage(record.stage, record.employeeId) === userId;
}
