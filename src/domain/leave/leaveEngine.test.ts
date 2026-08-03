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
import { HR_APPROVER_ID, MD_APPROVER_ID, lineManagerFor, managerOfDepartment } from '@config/leave.config';

const rec = (over: Partial<LeaveRecord>): LeaveRecord => ({
  id: 'l1', code: 'LV-0001', employeeId: 'u-sal', type: 'Annual',
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

  it('sends a LINE MANAGER’S OWN application straight to HR, then the MD', () => {
    // The stakeholder's second route (2026-08-03): when the line manager themselves applies there
    // is nobody above them inside their department, so the chain must start at HR and go on to the
    // MD. It needs no separate branch — the self-approval skip already expresses it exactly, which
    // is why this is a test rather than a feature.
    expect(firstStageFor('u-sal')).toBe('HR'); // Priya manages Sales
    expect(firstStageFor('u-mkt')).toBe('HR'); // Tom manages Marketing
    expect(firstStageFor('u-fin')).toBe('HR'); // James manages Finance
    expect(firstStageFor('u-adm')).toBe('HR'); // Ruth manages Administration
    // …and HR's sign-off then hands it to the MD, completing the two-stage manager route.
    expect(nextStageFor('u-sal', 'HR')).toBe('MD');
  });

  it('treats an unknown employee as having no manager rather than guessing one', () => {
    // Every department has a manager today, but `null` is still a representable state and the
    // engine must not invent an approver for someone it cannot place. A wrong approver is worse
    // than one fewer stage: it would route a colleague's leave to a stranger.
    expect(lineManagerFor('nobody-at-all')).toBeNull();
    expect(managerOfDepartment(undefined)).toBeNull();
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

  it('sends the MD’s OWN application to HR and nowhere else', () => {
    // Nobody is above the Managing Director, so there is no MANAGER stage to run — and their own
    // MD stage self-skips. HR alone signs it off (stakeholder, 2026-08-03). Asserting BOTH ends
    // matters: the first line proves the chain starts at HR, the second that it stops after.
    expect(lineManagerFor(MD_APPROVER_ID)).toBeNull();
    expect(firstStageFor(MD_APPROVER_ID)).toBe('HR');
    expect(nextStageFor(MD_APPROVER_ID, 'HR')).toBeNull();
  });

  it('treats the sysadmin as an ordinary employee now that the MD is their own identity', () => {
    // Marcus used to BE the MD, which made the System Administrator the company's final approver.
    // He is now just an Administration member: Ruth manages him, then HR, then the real MD.
    expect(MD_APPROVER_ID).not.toBe('u-sys');
    expect(firstStageFor('u-sys')).toBe('MANAGER');
    expect(nextStageFor('u-sys', 'HR')).toBe('MD');
  });

  it('lets only the current-stage approver decide', () => {
    const r = rec({ employeeId: 'u-fin-2', stage: 'MANAGER', status: 'Pending' });
    expect(canDecide(r, 'u-fin')).toBe(true); // Sofia's manager, via the Finance department
    expect(canDecide(r, 'u-hr')).toBe(false); // HR cannot decide before the manager
    expect(canDecide({ ...r, status: 'Approved', stage: null }, 'u-fin')).toBe(false);
  });

  it('never routes a self-managed applicant to a MANAGER stage they alone could decide', () => {
    // The strand guard. Priya IS the Sales manager, so a MANAGER stage on her own application
    // resolves to HERSELF — and `canDecide` refuses self-approval, leaving a row nobody at all can
    // move. The engine must therefore never PUT her there, which is what the second assertion pins.
    const stranded = rec({ employeeId: 'u-sal', stage: 'MANAGER', status: 'Pending' });
    const everyone = ['u-sal', 'u-adm', 'u-hr', 'u-sys', 'u-fin', 'u-fin-2'];
    expect(everyone.some((id) => canDecide(stranded, id))).toBe(false);
    expect(firstStageFor('u-sal')).not.toBe('MANAGER');
  });
});
