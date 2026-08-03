import { describe, it, expect } from 'vitest';
import {
  completedMonths,
  accruedDays,
  leaveDayCount,
  computeBalance,
  splitPaidUnpaid,
  firstStageFor,
  nextStageFor,
  canDecide,
} from './leaveEngine';
import type { LeaveRecord } from './leaveTypes';
import { HR_APPROVER_ID, MD_APPROVER_ID } from '@config/leave.config';

const rec = (over: Partial<LeaveRecord>): LeaveRecord => ({
  id: 'l1', employeeId: 'u-sal', type: 'Annual',
  startDate: '2026-01-10', endDate: '2026-01-12', requestedDays: 3,
  paidDays: 3, unpaidDays: 0, status: 'Pending', stage: 'MANAGER',
  history: [], createdAt: '2026-01-01T00:00:00.000Z', ...over,
});

describe('accrual', () => {
  it('counts only COMPLETED months — the current month accrues on its anniversary', () => {
    expect(completedMonths('2024-01-15', '2024-01-15')).toBe(0);
    expect(completedMonths('2024-01-15', '2024-02-14')).toBe(0); // day-of-month not yet reached
    expect(completedMonths('2024-01-15', '2024-02-15')).toBe(1);
    expect(completedMonths('2024-01-15', '2025-01-15')).toBe(12);
  });

  it('never returns negative for a future join date', () => {
    expect(completedMonths('2027-01-01', '2026-01-01')).toBe(0);
  });

  it('accrues 2.5 days per completed month', () => {
    expect(accruedDays('2024-01-15', '2024-07-15')).toBe(15); // 6 months × 2.5
  });
});

describe('leaveDayCount', () => {
  it('is inclusive of both endpoints', () => {
    expect(leaveDayCount('2026-01-10', '2026-01-10')).toBe(1);
    expect(leaveDayCount('2026-01-10', '2026-01-12')).toBe(3);
  });

  it('subtracts public holidays that fall in range, and only those', () => {
    expect(leaveDayCount('2026-01-10', '2026-01-14', ['2026-01-12'])).toBe(4);
    expect(leaveDayCount('2026-01-10', '2026-01-14', ['2026-02-01'])).toBe(5); // out of range
  });

  it('returns 0 for an inverted range rather than a negative length', () => {
    expect(leaveDayCount('2026-01-12', '2026-01-10')).toBe(0);
  });
});

describe('computeBalance', () => {
  it('reserves pending AND approved paid days, but not rejected/cancelled', () => {
    const records = [
      rec({ id: 'a', status: 'Approved', paidDays: 5 }),
      rec({ id: 'b', status: 'Pending', paidDays: 3 }),
      rec({ id: 'c', status: 'Rejected', paidDays: 4 }),
      rec({ id: 'd', status: 'Cancelled', paidDays: 2 }),
    ];
    // join 2024-01-15 → 2025-01-15 = 12mo × 2.5 = 30 accrued; consumed = 5 + 3 = 8.
    const b = computeBalance('2024-01-15', '2025-01-15', records);
    expect(b.accrued).toBe(30);
    expect(b.consumed).toBe(8);
    expect(b.available).toBe(22);
  });

  it('excludes a record from its own tally when re-assessing', () => {
    const records = [rec({ id: 'self', status: 'Pending', paidDays: 10 })];
    const b = computeBalance('2024-01-15', '2025-01-15', records, { excludeId: 'self' });
    expect(b.consumed).toBe(0);
    expect(b.available).toBe(30);
  });

  it('counts ONLY the named employee — one person\'s leave never touches another\'s balance', () => {
    const records = [
      rec({ id: 'mine', employeeId: 'u-sal', status: 'Approved', paidDays: 4 }),
      rec({ id: 'theirs', employeeId: 'u-fin-2', status: 'Approved', paidDays: 9 }),
    ];
    const b = computeBalance('2024-01-15', '2025-01-15', records, { employeeId: 'u-sal' });
    expect(b.consumed).toBe(4);
  });

  it('floors available at zero when over-consumed', () => {
    const records = [rec({ status: 'Approved', paidDays: 999 })];
    expect(computeBalance('2024-01-15', '2025-01-15', records).available).toBe(0);
  });
});

describe('splitPaidUnpaid — the over-balance rule', () => {
  it('pays what the balance covers and records the rest unpaid', () => {
    expect(splitPaidUnpaid('Annual', 5, 3)).toEqual({ paidDays: 3, unpaidDays: 2 });
  });

  it('pays all when within balance', () => {
    expect(splitPaidUnpaid('Annual', 3, 10)).toEqual({ paidDays: 3, unpaidDays: 0 });
  });

  it('treats an Unpaid-type leave as wholly unpaid, touching no balance', () => {
    expect(splitPaidUnpaid('Unpaid', 4, 100)).toEqual({ paidDays: 0, unpaidDays: 4 });
  });
});

describe('approval chain — Line manager → HR → MD, with self-approval skipped', () => {
  // The stage-1 approver is the applicant's DEPARTMENT manager (2026-08-03), so these cases are
  // chosen by department: FIN is managed by u-fin (James) and ADM by u-adm (Ruth); SAL/MKT/ACA/HR
  // have no manager at all. Each of the three ways MANAGER can resolve is covered below.
  it('starts at MANAGER when the applicant department has a manager who is not them', () => {
    expect(firstStageFor('u-fin-2')).toBe('MANAGER'); // Sofia (FIN) → James
    expect(firstStageFor('u-sys')).toBe('MANAGER'); // Marcus (ADM) → Ruth
  });

  it('skips MANAGER when the department has no manager, starting the chain at HR', () => {
    // The ratified rule: no manager is not an error, it is one fewer stage.
    expect(firstStageFor('u-sal')).toBe('HR'); // Priya — Sales has no manager
    expect(firstStageFor('u-mkt')).toBe('HR'); // Tom — Marketing likewise
  });

  it('skips MANAGER when the applicant IS their department manager', () => {
    expect(firstStageFor('u-fin')).toBe('HR'); // James manages Finance; he cannot approve himself
    expect(firstStageFor('u-adm')).toBe('HR'); // Ruth manages Administration, likewise
  });

  it('walks MANAGER → HR → MD in order', () => {
    expect(nextStageFor('u-fin-2', 'MANAGER')).toBe('HR');
    expect(nextStageFor('u-fin-2', 'HR')).toBe('MD');
    expect(nextStageFor('u-fin-2', 'MD')).toBeNull();
  });

  it('skips a stage the applicant themselves occupies', () => {
    // HR applicant (u-hr): the HR stage is their own, so MANAGER → MD.
    expect(nextStageFor('u-hr', 'MANAGER')).toBe('MD');
    // …and with no Human Resources manager either, their chain is the MD alone.
    expect(firstStageFor(HR_APPROVER_ID)).toBe('MD');
  });

  it('ends the chain early when the remaining stages are self-occupied (the MD applying)', () => {
    // Marcus (u-sys) is the MD, so his own MD stage is skipped; Ruth manages his department.
    expect(nextStageFor(MD_APPROVER_ID, 'HR')).toBeNull();
  });

  it('lets only the current-stage approver decide', () => {
    const r = rec({ employeeId: 'u-fin-2', stage: 'MANAGER', status: 'Pending' });
    expect(canDecide(r, 'u-fin')).toBe(true); // Sofia's manager, via the Finance department
    expect(canDecide(r, 'u-hr')).toBe(false); // HR cannot decide before the manager
    expect(canDecide({ ...r, status: 'Approved', stage: null }, 'u-fin')).toBe(false);
  });

  it('gives a department with no manager nobody who can decide the MANAGER stage', () => {
    // Guards the skip: if MANAGER were ever reachable for a manager-less department, the record
    // would strand — no user resolves as its approver, so nobody could move it on.
    const stranded = rec({ employeeId: 'u-sal', stage: 'MANAGER', status: 'Pending' });
    expect(['u-adm', 'u-hr', 'u-sys', 'u-fin'].some((id) => canDecide(stranded, id))).toBe(false);
    expect(firstStageFor('u-sal')).not.toBe('MANAGER');
  });
});
