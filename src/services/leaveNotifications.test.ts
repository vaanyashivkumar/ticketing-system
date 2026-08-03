import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '@services/notificationService';

/**
 * THE RETURN PATH (stakeholder, 2026-08-03).
 *
 * "based on his decision to grant or not the message follows the same track back the very same
 * path backwards" — so an outcome reaches exactly the approvers the application travelled through,
 * plus the applicant, and reaches nobody else. These tests pin that "and nobody else", because it
 * is the half that silently breaks: over-notifying looks like a working feature.
 *
 * Recipients are asserted through the real `publishLeave` → storage → `forUser` path rather than
 * against an exported pure function, so a change to the write shape cannot pass by agreeing with a
 * unit test about an argument list. That was the exact failure the API's content-leak test hit.
 */

const CHAIN = {
  employee: 'u-fin-2', // Sofia Nowak (Finance)
  manager: 'u-fin', // James Carrow, her department's line manager
  hr: 'u-hr', // Nadia Okonkwo
  md: 'u-sys', // Marcus Vane
};

const notifiedBy = (userId: string) =>
  NotificationService.forUser(userId).map((n) => n.type);

beforeEach(() => {
  localStorage.clear();
});

describe('forward hop — only the person who has to act', () => {
  it('tells the waiting approver and nobody else', () => {
    NotificationService.publishLeave({
      type: 'LeaveAwaitingApproval',
      leaveId: 'l1', code: 'LV-0007', employeeId: CHAIN.employee,
      approverId: CHAIN.manager, travelled: [],
      actorId: CHAIN.employee,
    });

    expect(notifiedBy(CHAIN.manager)).toEqual(['LeaveAwaitingApproval']);
    // The applicant already knows — they just filed it. HR and the MD are not involved yet.
    expect(notifiedBy(CHAIN.employee)).toEqual([]);
    expect(notifiedBy(CHAIN.hr)).toEqual([]);
    expect(notifiedBy(CHAIN.md)).toEqual([]);
  });
});

describe('backward hop — the very same path, reversed', () => {
  it('tells everyone it passed through, plus the applicant, on final approval', () => {
    // The MD signs off last, having received it from HR, who received it from the line manager.
    NotificationService.publishLeave({
      type: 'LeaveApproved',
      leaveId: 'l1', code: 'LV-0007', employeeId: CHAIN.employee,
      approverId: null, travelled: [CHAIN.manager, CHAIN.hr],
      actorId: CHAIN.md,
    });

    expect(notifiedBy(CHAIN.employee)).toEqual(['LeaveApproved']);
    expect(notifiedBy(CHAIN.hr)).toEqual(['LeaveApproved']);
    expect(notifiedBy(CHAIN.manager)).toEqual(['LeaveApproved']);
    // Author suppression: the MD decided it and is not told about their own decision.
    expect(notifiedBy(CHAIN.md)).toEqual([]);
  });

  it('does NOT tell a stage the application never reached', () => {
    // HR rejects. It had reached the line manager and HR — never the MD, who therefore hears
    // nothing. This is the assertion that separates "the same path back" from "tell everyone".
    NotificationService.publishLeave({
      type: 'LeaveRejected',
      leaveId: 'l2', code: 'LV-0008', employeeId: CHAIN.employee,
      approverId: null, travelled: [CHAIN.manager],
      actorId: CHAIN.hr,
    });

    expect(notifiedBy(CHAIN.employee)).toEqual(['LeaveRejected']);
    expect(notifiedBy(CHAIN.manager)).toEqual(['LeaveRejected']);
    expect(notifiedBy(CHAIN.md)).toEqual([]);
    expect(notifiedBy(CHAIN.hr)).toEqual([]); // the rejecter, suppressed as author
  });

  it('sends a line manager’s own application back down its shorter path', () => {
    // James manages Finance, so his own application skips MANAGER and runs HR → MD. The return
    // path is correspondingly shorter: HR and James, never a "manager" who was never involved.
    NotificationService.publishLeave({
      type: 'LeaveApproved',
      leaveId: 'l3', code: 'LV-0009', employeeId: CHAIN.manager,
      approverId: null, travelled: [CHAIN.hr],
      actorId: CHAIN.md,
    });

    expect(notifiedBy(CHAIN.manager)).toEqual(['LeaveApproved']); // the applicant
    expect(notifiedBy(CHAIN.hr)).toEqual(['LeaveApproved']);
    expect(notifiedBy(CHAIN.employee)).toEqual([]); // Sofia is not in her manager's chain
  });
});

describe('what a leave notification is allowed to say', () => {
  it('names the leave code and the actor, and carries no reason', () => {
    NotificationService.publishLeave({
      type: 'LeaveRejected',
      leaveId: 'l4', code: 'LV-0010', employeeId: CHAIN.employee,
      approverId: null, travelled: [], actorId: CHAIN.hr,
    });

    const [note] = NotificationService.forUser(CHAIN.employee);
    expect(note!.message).toContain('LV-0010');
    expect(note!.message).toContain('Nadia Okonkwo');
    // The reason lives on the record, behind the screen's own access rules. `publishLeave` is
    // never handed one — the event type has no such field — so this can only ever be a pointer.
    expect(note!.message).toContain('the reason is on the record');
    expect(note!.leaveId).toBe('l4');
    expect(note!.ticketId).toBe(''); // a leave notification borrows no ticket
  });
});
