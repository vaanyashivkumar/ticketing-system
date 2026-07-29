import { describe, it, expect, beforeEach } from 'vitest';
import type { Priority } from '@domain/types/ticket.types';
import type { Session, User } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';
import { DEFAULT_SLA_POLICY } from '@config/sla.config';
import { PRIORITY_DEFINITIONS } from '@config/priority.config';
import { initialSla, addBusinessHours } from '@domain/sla/slaEngine';
import { TicketRepository } from '@services/ticketRepository';
import { TicketService } from '@services/ticketService';
import {
  priorityDef,
  ORDERED_PRIORITIES,
  SELECTABLE_PRIORITIES,
  byPriority,
  isMoreUrgent,
  DEFAULT_PRIORITY,
} from './priorityEngine';
import { canChangePriority } from './statusEngine';

/** Compiler-exhaustive against the `Priority` union, like the status engine's anchor. */
const ALL: Record<Priority, true> = { Low: true, Medium: true, High: true, Urgent: true };
const EVERY_PRIORITY = Object.keys(ALL) as Priority[];

describe('priority configuration', () => {
  it('defines every priority exactly once, with unique ranks', () => {
    expect([...PRIORITY_DEFINITIONS.map((p) => p.id)].sort()).toEqual([...EVERY_PRIORITY].sort());
    const ranks = PRIORITY_DEFINITIONS.map((p) => p.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('exposes both orderings rather than letting one win', () => {
    // Sorting wants most-urgent-first; a chooser wants escalation to be a deliberate move.
    expect(ORDERED_PRIORITIES).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(SELECTABLE_PRIORITIES).toEqual(['Low', 'Medium', 'High', 'Urgent']);
  });

  it('never defaults to the highest priority (BRS §502)', () => {
    expect(DEFAULT_PRIORITY).not.toBe('Urgent');
    expect(priorityDef(DEFAULT_PRIORITY)).toBeDefined();
  });

  it('sorts and compares by rank', () => {
    expect([...EVERY_PRIORITY].sort(byPriority)).toEqual(['Urgent', 'High', 'Medium', 'Low']);
    expect(isMoreUrgent('Urgent', 'Low')).toBe(true);
    expect(isMoreUrgent('Low', 'Urgent')).toBe(false);
    expect(isMoreUrgent('Medium', 'Medium')).toBe(false);
  });

  it('gives every priority a distinct SLA target, so a re-grade always means something', () => {
    const hours = EVERY_PRIORITY.map((p) => DEFAULT_SLA_POLICY.resolutionHours[p]);
    expect(new Set(hours).size).toBe(hours.length);
  });
});

/**
 * BR-060 — "Priority is set by the requester at Draft only; after Submit only the
 * destination/assignee/sysadmin may change it."
 *
 * Category A since the first requirements document, and implemented by nothing until B04: the
 * permission existed, the activity action existed, the notification was specified, and no code
 * path ever reached any of them.
 */
describe('BR-060 — changing priority', () => {
  const dept = (code: keyof typeof DEPARTMENTS, id: string, sysadmin = false): Session => {
    const d = DEPARTMENTS[code];
    const user: User = {
      id, name: id, email: `${id}@t.test`, departmentId: d.id, departmentCode: d.code, avatarInitials: 'U',
      role: { departmentId: d.id, departmentCode: d.code, capabilities: sysadmin ? ['SUPER_ADMIN'] : [] },
    };
    return { user, authenticatedAt: new Date().toISOString() };
  };

  const requester = dept('SAL', 'u-sales');
  const destination = dept('FIN', 'u-fin');
  const stranger = dept('HR', 'u-hr');
  const sysadmin = dept('ADM', 'u-admin', true);

  // Thu 16 Jul 2026 09:00 — a business morning, so targets land predictably.
  const anchored = new Date(2026, 6, 16, 9, 0, 0).toISOString();

  const seed = (over: Partial<Ticket> = {}): Ticket => {
    const t: Ticket = {
      id: 't-prio', code: 'FIN-0001', subject: 's', description: 'd',
      status: 'Assigned', priority: 'Low',
      fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'C', categoryData: {},
      createdById: 'u-sales', createdByName: 'Sales', assignedToId: 'u-fin', assignedToName: 'Fin',
      createdAt: anchored, updatedAt: anchored,
      sla: initialSla('Low', anchored, DEFAULT_SLA_POLICY),
      resolutionNote: null, reopenCount: 0, rejectionReason: null,
      comments: [], attachments: [], activity: [], ...over,
    };
    TicketRepository.save(t);
    return t;
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('lets the destination re-grade a submitted ticket', () => {
    const t = seed();
    const r = TicketService.changePriority(t.id, 'Urgent', destination);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.priority).toBe('Urgent');
  });

  it('refuses the requester after submission, and says why', () => {
    const t = seed();
    const r = TicketService.changePriority(t.id, 'Urgent', requester);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('destination department');
  });

  it('lets the requester re-grade their OWN draft', () => {
    const t = seed({ status: 'Draft', code: '', sla: { startedAt: null, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' } });
    expect(TicketService.changePriority(t.id, 'High', requester).ok).toBe(true);
  });

  it('refuses the destination on a draft — a draft is the requester’s private working copy', () => {
    const t = seed({ status: 'Draft', code: '' });
    const r = TicketService.changePriority(t.id, 'High', destination);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('requester');
  });

  it('lets a sysadmin re-grade — the arm of BR-060 the permission engine was missing', () => {
    const t = seed();
    expect(TicketService.changePriority(t.id, 'Urgent', sysadmin).ok).toBe(true);
  });

  it('refuses a department with no relationship to the ticket', () => {
    const t = seed();
    expect(TicketService.changePriority(t.id, 'Urgent', stranger).ok).toBe(false);
  });

  it('refuses a no-op rather than writing an audit entry that records nothing', () => {
    const t = seed({ priority: 'Medium' });
    const r = TicketService.changePriority(t.id, 'Medium', destination);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('already');
  });

  it('refuses once the work is finished, in every finished state', () => {
    for (const status of ['Resolved', 'Closed', 'Rejected', 'Cancelled'] as const) {
      expect(canChangePriority(status), status).toBe(false);
      const t = seed({ id: `t-${status}`, status });
      expect(TicketService.changePriority(t.id, 'Urgent', destination).ok, status).toBe(false);
    }
  });

  it('allows it in every OPEN state, including Submitted where there is no assignee yet', () => {
    for (const status of ['Submitted', 'Assigned', 'InProgress', 'AwaitingInformation', 'Reopened'] as const) {
      expect(canChangePriority(status), status).toBe(true);
    }
  });

  it('MOVES the SLA target, measured from the original anchor', () => {
    const t = seed(); // Low = 80 business hours
    const r = TicketService.changePriority(t.id, 'Urgent', destination);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Urgent = 8 business hours from the SAME anchor — not from now.
    const expected = addBusinessHours(new Date(anchored), DEFAULT_SLA_POLICY.resolutionHours.Urgent).toISOString();
    expect(r.value.sla.dueAt).toBe(expected);
    expect(r.value.sla.startedAt).toBe(anchored);
    // Re-grading must never hand a late ticket a fresh window: the anchor is untouched, so a
    // ticket already past its new target is immediately Overdue rather than reset to OnTrack.
    expect(r.value.sla.dueAt).not.toBe(t.sla.dueAt);
  });

  it('leaves a draft’s clock alone — there is no anchor to move yet', () => {
    const t = seed({ status: 'Draft', code: '', sla: { startedAt: null, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' } });
    const r = TicketService.changePriority(t.id, 'Urgent', requester);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sla.dueAt).toBeNull();
  });

  it('records the BEFORE as well as the after', () => {
    const t = seed(); // Low
    const r = TicketService.changePriority(t.id, 'Urgent', destination, 'Deadline moved');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.value.activity.at(-1)!;
    expect(entry.action).toBe('PRIORITY_CHANGED');
    // A re-grade with no record of what it was re-graded FROM is not an audit trail. It lands in
    // `fromValue`/`toValue`, not `from`/`to` — those mean statuses, and sharing them made a
    // re-grade indistinguishable from a transition in the activity feed.
    expect(entry.fromValue).toBe('Low');
    expect(entry.toValue).toBe('Urgent');
    expect(entry.from).toBeUndefined();
    expect(entry.note).toBe('Deadline moved');
    expect(entry.actorId).toBe(destination.user.id);
  });

  it('describes the direction when no reason is given', () => {
    const t = seed({ priority: 'Urgent' });
    const r = TicketService.changePriority(t.id, 'Low', destination);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.activity.at(-1)!.note).toContain('lowered');
  });
});
