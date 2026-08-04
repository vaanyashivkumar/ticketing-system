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
import { HR_APPROVER_ID, lineManagerFor, managerOfDepartment, eligibleApprovers } from '@config/leave.config';
import { MOCK_USERS } from '@config/mockUsers.config';

const rec = (over: Partial<LeaveRecord>): LeaveRecord => ({
  id: 'l1', code: 'LV-0001', employeeId: 'u-iqra', type: 'Annual',
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
      rec({ id: 'mine', employeeId: 'u-iqra', status: 'Approved', paidDays: 4 }),
      rec({ id: 'theirs', employeeId: 'u-hasna', status: 'Approved', paidDays: 9 }),
    ];
    const b = computeBalance('2024-01-15', '2025-01-15', records, { employeeId: 'u-iqra' });
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
  /**
   * The organisation, 2026-08-04. Managers: Hafeez (Sales), Balu (Marketing), Raza (Finance),
   * Sneha (HR, sole member), Amna (Operations). Academics and Administration have NO manager —
   * their "head, for final approval" is an MD, which is the MD stage, not the manager stage.
   * HR is Sneha; the MD stage is held JOINTLY by Raja and Maha.
   */
  it('starts at MANAGER when the applicant department has a manager who is not them', () => {
    expect(firstStageFor('u-iqra')).toBe('MANAGER'); // Sales → Hafeez
    expect(firstStageFor('u-hasna')).toBe('MANAGER'); // Finance → Raza
    expect(firstStageFor('u-hussain')).toBe('MANAGER'); // Operations → Amna
    expect(firstStageFor('u-sakshi')).toBe('MANAGER'); // Marketing → Balu
  });

  it('sends a LINE MANAGER’S OWN application straight to HR, then the MD', () => {
    // Nobody sits above a line manager inside their own department, so their own stage skips and
    // the chain starts at HR. No separate branch: the self-approval skip already expresses it.
    expect(firstStageFor('u-hafeez')).toBe('HR'); // manages Sales
    expect(firstStageFor('u-balu')).toBe('HR'); // manages Marketing
    expect(firstStageFor('u-raza')).toBe('HR'); // manages Finance
    expect(firstStageFor('u-amna')).toBe('HR'); // manages Operations
    expect(nextStageFor('u-hafeez', 'HR')).toBe('MD');
  });

  it('skips MANAGER for a department that has none, starting at HR', () => {
    // Academics and Administration name no line manager. `null` is a decision, not missing data.
    expect(firstStageFor('u-radhika')).toBe('HR'); // Academics
    expect(firstStageFor('u-susrita')).toBe('HR'); // Administration
  });

  it('walks MANAGER → HR → MD in order', () => {
    expect(nextStageFor('u-iqra', 'MANAGER')).toBe('HR');
    expect(nextStageFor('u-iqra', 'HR')).toBe('MD');
    expect(nextStageFor('u-iqra', 'MD')).toBeNull();
  });

  it('ALWAYS hands over from HR to the MD — every employee, no exceptions', () => {
    // HR signing off is never the end of an application; it is the handover to final approval.
    // Exhaustive over the real cast so adding a person cannot introduce an early termination.
    // With TWO MDs there is now no exception at all: each MD's own stage is covered by the other.
    for (const u of MOCK_USERS) {
      expect(nextStageFor(u.id, 'HR'), `${u.name} must go HR → MD`).toBe('MD');
    }
  });

  it('gives HR’s own application no MANAGER and no HR stage — it begins at the MD', () => {
    // Sneha is Human Resources' only member, so she is both its line manager and the HR approver.
    // Two stages are hers, both skip, and the MDs decide.
    expect(firstStageFor(HR_APPROVER_ID)).toBe('MD');
  });

  it('lets the OTHER Managing Director approve an MD’s own leave', () => {
    // The single-MD model had to skip the MD stage for want of anyone eligible. With two, the
    // stage runs and the co-director decides — which falls out of asking the SET who is eligible.
    expect(lineManagerFor('u-raja')).toBeNull(); // nobody is above an MD
    expect(firstStageFor('u-raja')).toBe('HR');
    expect(nextStageFor('u-raja', 'HR')).toBe('MD');
    expect(eligibleApprovers('MD', 'u-raja')).toEqual(['u-maha']);
    expect(eligibleApprovers('MD', 'u-maha')).toEqual(['u-raja']);
  });

  it('treats an unknown employee as having no manager rather than guessing one', () => {
    expect(lineManagerFor('nobody-at-all')).toBeNull();
    expect(managerOfDepartment(undefined)).toBeNull();
  });

  it('lets EITHER Managing Director decide an MD-stage application', () => {
    const r = rec({ employeeId: 'u-iqra', stage: 'MD', status: 'Pending' });
    expect(canDecide(r, 'u-raja')).toBe(true);
    expect(canDecide(r, 'u-maha')).toBe(true);
    expect(canDecide(r, 'u-sneha')).toBe(false); // HR cannot decide the MD's stage
  });

  it('lets only the current-stage approver decide', () => {
    const r = rec({ employeeId: 'u-hasna', stage: 'MANAGER', status: 'Pending' });
    expect(canDecide(r, 'u-raza')).toBe(true); // Hasna's manager, via the Finance department
    expect(canDecide(r, 'u-sneha')).toBe(false); // HR cannot decide before the manager
    expect(canDecide({ ...r, status: 'Approved', stage: null }, 'u-raza')).toBe(false);
  });

  it('never routes a self-managed applicant to a MANAGER stage they alone could decide', () => {
    // Hafeez IS the Sales manager, so a MANAGER stage on his own application resolves to himself —
    // and `canDecide` refuses self-approval, leaving a row nobody can move. The engine must
    // therefore never put him there, which the second assertion pins.
    const stranded = rec({ employeeId: 'u-hafeez', stage: 'MANAGER', status: 'Pending' });
    expect(MOCK_USERS.some((u) => canDecide(stranded, u.id))).toBe(false);
    expect(firstStageFor('u-hafeez')).not.toBe('MANAGER');
  });
});
