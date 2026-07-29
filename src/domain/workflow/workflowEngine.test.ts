import { describe, it, expect } from 'vitest';
import { resolveTransition, transitionsFrom, actorMatches, mayPerform, applyTransition, requiredNoteGuard } from './workflowEngine';
import { STATUS_TRANSITIONS } from '@config/statusTransitions.config';
import { PERMISSION_FOR_ACTION } from '@config/permissions.config';
import type { Session, User } from '@domain/types/auth.types';
import type { Ticket, TicketStatus } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';

const mkSession = (deptCode: keyof typeof DEPARTMENTS, id: string): Session => {
  const d = DEPARTMENTS[deptCode];
  const user: User = {
    id, name: 'U', email: 'u@t.test', departmentId: d.id, departmentCode: d.code, avatarInitials: 'U',
    role: { departmentId: d.id, departmentCode: d.code, capabilities: [] },
  };
  return { user, authenticatedAt: new Date().toISOString() };
};

const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1', code: 'FIN-0001', subject: 's', description: 'd', status: 'InProgress', priority: 'Medium',
  fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'C', categoryData: {},
  createdById: 'u-sales', createdByName: 'Sales', assignedToId: 'u-fin', assignedToName: 'Fin',
  createdAt: '', updatedAt: '',
  sla: { startedAt: null, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' },
  resolutionNote: null,
  reopenCount: 0, rejectionReason: null,
  comments: [], attachments: [], activity: [], ...over,
});

/**
 * The canonical edge set, transcribed from BUSINESS_DOMAIN_MODEL §4.1 (which reproduces
 * phase-0 §5). This is the immutable Business Constitution, not a restatement of the code:
 * the config is asserted AGAINST it, so a dropped or invented edge fails the build.
 *
 * Defect WF-001 (P18): edge 23 Reopened→Rejected was absent from the config for five
 * phases. The P17 suite only asserted that *illegal* edges are rejected, never that the
 * legal set was COMPLETE — so nothing caught it. This test is that missing assertion.
 */
const CANONICAL_EDGES: readonly (readonly [TicketStatus, TicketStatus])[] = [
  ['Draft', 'Submitted'], ['Draft', 'Cancelled'],
  ['Submitted', 'Assigned'], ['Submitted', 'Rejected'], ['Submitted', 'Cancelled'],
  ['Assigned', 'InProgress'], ['Assigned', 'AwaitingInformation'], ['Assigned', 'Rejected'], ['Assigned', 'Cancelled'],
  ['InProgress', 'AwaitingInformation'], ['InProgress', 'Resolved'], ['InProgress', 'Rejected'], ['InProgress', 'Cancelled'],
  ['AwaitingInformation', 'InProgress'], ['AwaitingInformation', 'Rejected'], ['AwaitingInformation', 'Cancelled'],
  ['Resolved', 'Closed'], ['Resolved', 'Reopened'],
  ['Closed', 'Reopened'],
  ['Rejected', 'Reopened'],
  ['Reopened', 'Assigned'], ['Reopened', 'InProgress'], ['Reopened', 'Rejected'],
];

/**
 * The A3 LOCKSTEP SUITE (WORKFLOW_ENGINE §A3): "a lockstep test asserts `actors` and
 * PERMISSION_FOR_ACTION[action] agree across all edges."
 *
 * Why this exists: for five phases `canOnTicket` was fully built, defended by 11 tests, and
 * CALLED BY NOTHING — the live code authorised with `actorMatches` alone. The two halves happened
 * to agree, so nothing broke and no test noticed. These tests bind the halves together so they
 * cannot silently drift apart again.
 *
 * "Agree" is given teeth by the reachability assertion below: if the mapped verb contradicted an
 * edge's actors, NO ONE could perform that edge — a legal transition would become dead. That is
 * exactly the failure a naive mapping introduces, and it is what this catches.
 */
describe('Permission Engine ⋀ actors — the A3 conjunction (lockstep)', () => {
  // A ticket raised by Sales, routed to Finance, assigned to a specific Finance member.
  const t = (status: TicketStatus) => ticket({ status, fromDeptCode: 'SAL', toDeptCode: 'FIN', createdById: 'u-sales', assignedToId: 'u-fin' });

  const creator = mkSession('SAL', 'u-sales');
  const assignee = mkSession('FIN', 'u-fin');
  const destOther = mkSession('FIN', 'u-fin-colleague'); // destination dept, NOT the assignee
  const stranger = mkSession('MKT', 'u-mkt');

  it('maps every action in the legal set — no edge is unmapped', () => {
    const unmapped = STATUS_TRANSITIONS.filter((e) => !PERMISSION_FOR_ACTION[e.action]);
    expect(unmapped.map((e) => e.action)).toEqual([]);
  });

  it('LOCKSTEP: the mapped verb never contradicts the edge actors — no legal edge is unreachable', () => {
    const everyone = [creator, assignee, destOther, stranger];
    const unreachable: string[] = [];
    for (const edge of STATUS_TRANSITIONS) {
      // System-only edges are deliberately unreachable by any user session.
      if (edge.actors.every((a) => a === 'system')) continue;
      const ticketAt = t(edge.from);
      if (!everyone.some((s) => mayPerform(s, edge, ticketAt))) {
        unreachable.push(`${edge.from}->${edge.to} (${edge.action})`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('a third-party department can perform NO edge whatsoever', () => {
    const allowed = STATUS_TRANSITIONS.filter((e) => mayPerform(stranger, e, t(e.from)));
    expect(allowed.map((e) => e.action)).toEqual([]);
  });

  /**
   * D04 #7 regression. Start/Resume were narrowed to `['assignee']` by the P13 implementation —
   * a narrowing NO amendment ratified: BDM §4.1 edges 6/22 say `A/D`, and A3 names only AutoClose
   * (system) and Resolve (assignee) as the narrow cases. The effect was an operational dead end:
   * when the assignee went on leave, no colleague could pick the ticket up.
   *
   * HONESTY NOTE. An earlier version of this test asserted the opposite — that a destination
   * colleague could NOT Start — and cited it as proof the `actors` half of the A3 conjunction was
   * load-bearing. That proof rested on the unratified narrowing. With the canonical actors
   * restored, NO edge has `actors` narrower than its mapped verb, so for a user session the two
   * halves now agree everywhere and `actors` changes no outcome. It is still kept (A3 forbids
   * demoting it) for the `system` actor, defence in depth, and single-source-of-truth — but the
   * claim "it is load-bearing today" would be false, and is not made here.
   */
  it('D04 #7: a destination colleague CAN start work — canonical A/D, not assignee-only', () => {
    const edge = resolveTransition('Assigned', 'Start')!;
    expect(edge.actors).toEqual(['assignee', 'destination']);
    expect(mayPerform(destOther, edge, t('Assigned'))).toBe(true); // the colleague, previously blocked
    expect(mayPerform(assignee, edge, t('Assigned'))).toBe(true); // and the assignee still may
    expect(mayPerform(creator, edge, t('Assigned'))).toBe(false); // but never the requester
  });

  it('D04 #7: Resume is A/D too — a reopened ticket is not hostage to one person', () => {
    const edge = resolveTransition('Reopened', 'Resume')!;
    expect(edge.actors).toEqual(['assignee', 'destination']);
    expect(mayPerform(destOther, edge, t('Reopened'))).toBe(true);
  });

  it('the A/D widening is paired with assigneeSet — work cannot start with nobody doing it', () => {
    // The narrowing made an assignee structurally certain; A/D does not, which is exactly why
    // BDM §9 rows 6/22 pair the wider actor set with this guard.
    for (const [from, action] of [['Assigned', 'Start'], ['Reopened', 'Resume']] as const) {
      expect(resolveTransition(from, action)?.guards).toContain('assigneeSet');
    }
  });

  it('assigneeSet is NOT treated as a text guard — it is a precondition, not a prompt', () => {
    expect(requiredNoteGuard(resolveTransition('Assigned', 'Start')!)).toBeNull();
  });

  it('a destination colleague who is not the assignee cannot Resolve', () => {
    const edge = resolveTransition('InProgress', 'Resolve')!;
    expect(mayPerform(destOther, edge, t('InProgress'))).toBe(false);
    expect(mayPerform(assignee, edge, t('InProgress'))).toBe(true);
  });

  it('the destination can never Close — enforced through the live conjunction, not just config', () => {
    const edge = resolveTransition('Resolved', 'Close')!;
    expect(mayPerform(assignee, edge, t('Resolved'))).toBe(false);
    expect(mayPerform(destOther, edge, t('Resolved'))).toBe(false);
    expect(mayPerform(creator, edge, t('Resolved'))).toBe(true);
  });

  it('the requester cannot Assign or Reject their own ticket', () => {
    expect(mayPerform(creator, resolveTransition('Submitted', 'Assign')!, t('Submitted'))).toBe(false);
    expect(mayPerform(creator, resolveTransition('Submitted', 'Reject')!, t('Submitted'))).toBe(false);
  });

  it('a system-only actor cannot be satisfied by any user session', () => {
    // Close is actors:['requester','system'] — reachable by the requester, never *as* the system.
    const edge = resolveTransition('Resolved', 'Close')!;
    expect(edge.actors).toContain('system');
    expect(actorMatches(stranger, ['system'], t('Resolved'))).toBe(false);
    expect(actorMatches(creator, ['system'], t('Resolved'))).toBe(false);
  });
});

/**
 * Mandatory closure evidence (D04 #6). BUSINESS_DOMAIN_MODEL §4.1 edge 11 reads
 * "Resolve (note mandatory)" and BR-038/041/045/047/050 mandate a reason on every Reject and
 * Reopen — yet no field existed to hold one, and `commit()` accepted no text. The destination
 * resolved SILENTLY and the requester was asked to accept-or-reopen a resolution they could not
 * read, which removes the whole point of two-step closure.
 */
describe('Workflow Engine — mandatory reason / resolution note (D04 #6)', () => {
  const actor = { id: 'u-fin', name: 'Fin' };

  it('EVERY Reject edge demands a reason (BR-050 names all five)', () => {
    const rejects = STATUS_TRANSITIONS.filter((e) => e.to === 'Rejected');
    expect(rejects.map((e) => e.from).sort()).toEqual(
      ['Assigned', 'AwaitingInformation', 'InProgress', 'Reopened', 'Submitted'],
    );
    expect(rejects.every((e) => e.guards?.includes('reasonRequired'))).toBe(true);
  });

  it('Resolve demands a resolution note (BR-041)', () => {
    expect(resolveTransition('InProgress', 'Resolve')?.guards).toContain('resolutionNoteRequired');
  });

  it('every Reopen demands a reason (BR-045 / BR-047, and R7 for Closed→Reopened)', () => {
    const reopens = STATUS_TRANSITIONS.filter((e) => e.to === 'Reopened');
    expect(reopens.length).toBe(3);
    expect(reopens.every((e) => e.guards?.includes('reasonRequired'))).toBe(true);
  });

  /**
   * R7 (PROJECT_CONSTITUTION §9, ratified 2026-07-16). BR-045 covers Resolved→Reopened and BR-047
   * covers Rejected→Reopened; NO BR named Closed→Reopened. It shipped as a (B) derived guard,
   * flagged in code, and was ratified — so all three reopen paths behave alike. Asserted
   * explicitly because its provenance is a stakeholder decision, not a BR clause: a future reader
   * grepping the BRS for it will find nothing, and should find this instead.
   */
  it('R7: Closed→Reopened demands a reason — ratified, not derived from a BR', () => {
    expect(resolveTransition('Closed', 'Reopen')?.guards).toContain('reasonRequired');
  });

  /**
   * R8 (PROJECT_CONSTITUTION §9, ratified 2026-07-16). BDM §4.1 names `questionRequired` on both
   * RequestInformation edges but named no guard on the ANSWER. Ratified because an empty answer
   * silently RESTARTS the SLA clock — the exact thing the pause exists to prevent.
   */
  it('R8: ProvideInformation demands text — an empty answer must not restart the clock', () => {
    const edge = resolveTransition('AwaitingInformation', 'ProvideInformation')!;
    expect(edge.guards).toContain('questionRequired');
    expect(edge.effects).toContain('resumeClock'); // the reason the guard matters
    expect(requiredNoteGuard(edge)).toBe('questionRequired');
  });

  it('routine actions are NOT gated behind a note — the guard is targeted, not blanket', () => {
    for (const action of ['Submit', 'Assign', 'Start', 'Close', 'Resume'] as const) {
      const edge = STATUS_TRANSITIONS.find((e) => e.action === action)!;
      expect(requiredNoteGuard(edge)).toBeNull();
    }
  });

  it('BOTH RequestInformation edges demand a question (BDM §4.1 edges 7 and 10)', () => {
    const asks = STATUS_TRANSITIONS.filter((e) => e.action === 'RequestInformation');
    expect(asks.map((e) => e.from).sort()).toEqual(['Assigned', 'InProgress']);
    expect(asks.every((e) => e.guards?.includes('questionRequired'))).toBe(true);
  });

  it('the question lands in the CONVERSATION as an info-request comment, not just the trail', () => {
    const def = resolveTransition('InProgress', 'RequestInformation')!;
    const { ticket: next } = applyTransition(
      ticket({ status: 'InProgress' }), def,
      { id: 'u-fin', name: 'Fin', departmentCode: 'FIN' }, undefined,
      'Which cost centre should this be booked to?',
    );
    const c = next.comments.at(-1)!;
    expect(c.kind).toBe('info-request');
    expect(c.body).toBe('Which cost centre should this be booked to?');
    expect(c.authorName).toBe('Fin');
    // ...and the clock pauses, as it always did.
    expect(next.sla.pausedSince).not.toBeNull();
  });

  it("the requester's answer is an info-response comment, and un-pauses the clock", () => {
    const def = resolveTransition('AwaitingInformation', 'ProvideInformation')!;
    const paused = ticket({ status: 'AwaitingInformation', sla: { ...ticket().sla, pausedSince: new Date().toISOString() } });
    const { ticket: next } = applyTransition(
      paused, def, { id: 'u-sales', name: 'Sales', departmentCode: 'SAL' }, undefined, 'Cost centre 4471.',
    );
    expect(next.comments.at(-1)?.kind).toBe('info-response');
    expect(next.sla.pausedSince).toBeNull();
  });

  it('a transition with no text guard adds NO comment — the conversation is not spammed', () => {
    const def = resolveTransition('Assigned', 'Start')!;
    const { ticket: next } = applyTransition(ticket({ status: 'Assigned' }), def, { id: 'u-fin', name: 'Fin' });
    expect(next.comments).toEqual([]);
  });

  it('a resolution note is stored in its ratified field AND the immutable trail', () => {
    const def = resolveTransition('InProgress', 'Resolve')!;
    const { ticket: next } = applyTransition(ticket({ status: 'InProgress' }), def, actor, undefined, '  Refunded via BACS, ref 8871.  ');
    expect(next.resolutionNote).toBe('Refunded via BACS, ref 8871.'); // trimmed
    expect(next.activity.at(-1)?.note).toBe('Refunded via BACS, ref 8871.');
    expect(next.rejectionReason).toBeNull();
  });

  it('a rejection reason lands in rejectionReason, not resolutionNote', () => {
    const def = resolveTransition('Submitted', 'Reject')!;
    const { ticket: next } = applyTransition(ticket({ status: 'Submitted' }), def, actor, undefined, 'Wrong department.');
    expect(next.rejectionReason).toBe('Wrong department.');
    expect(next.resolutionNote).toBeNull();
  });

  it("a reopen's reason rides the activity trail — the spec defines no reopenReason column", () => {
    const def = resolveTransition('Resolved', 'Reopen')!;
    const { ticket: next } = applyTransition(ticket({ status: 'Resolved' }), def, actor, undefined, 'Still not paid.');
    expect(next.activity.at(-1)?.note).toBe('Still not paid.');
    expect(next.resolutionNote).toBeNull();
    expect(next.rejectionReason).toBeNull();
  });
});

describe('Workflow Engine — completeness vs the canonical set (WF-001 regression)', () => {
  it('implements EVERY canonical edge — none dropped', () => {
    const actual = new Set(STATUS_TRANSITIONS.map((t) => `${t.from}->${t.to}`));
    const missing = CANONICAL_EDGES.map(([f, t]) => `${f}->${t}`).filter((e) => !actual.has(e));
    expect(missing).toEqual([]);
  });

  it('invents NO edge outside the canonical set — none added', () => {
    const canonical = new Set(CANONICAL_EDGES.map(([f, t]) => `${f}->${t}`));
    const extra = STATUS_TRANSITIONS.map((t) => `${t.from}->${t.to}`).filter((e) => !canonical.has(e));
    expect(extra).toEqual([]);
  });

  it('a Reopened ticket can be rejected by the destination (canonical edge 23)', () => {
    const t = resolveTransition('Reopened', 'Reject');
    expect(t?.to).toBe('Rejected');
    expect(t?.actors).toEqual(['destination']);
  });

  it('every non-terminal active state offers the destination a rejection path', () => {
    const active: TicketStatus[] = ['Submitted', 'Assigned', 'InProgress', 'AwaitingInformation', 'Reopened'];
    for (const status of active) {
      expect(transitionsFrom(status).map((t) => t.to)).toContain('Rejected');
    }
  });
});

describe('Workflow Engine — the legal transition set', () => {
  it('rejects transitions that are not in the ratified table', () => {
    expect(resolveTransition('Draft', 'Close')).toBeUndefined();
    expect(resolveTransition('Closed', 'Assign')).toBeUndefined();
    expect(resolveTransition('Closed', 'Start')).toBeUndefined();
    expect(resolveTransition('Cancelled', 'Reopen')).toBeUndefined(); // Cancelled is absorbing
  });

  it('has NO transition targeting Overdue — it is a derived flag, never a status', () => {
    expect(STATUS_TRANSITIONS.some((t) => (t.to as string) === 'Overdue')).toBe(false);
    expect(STATUS_TRANSITIONS.some((t) => (t.from as string) === 'Overdue')).toBe(false);
  });

  it('has NO Awaiting Information → Resolved edge (must route via In Progress)', () => {
    expect(resolveTransition('AwaitingInformation', 'Resolve')).toBeUndefined();
    const edges = transitionsFrom('AwaitingInformation').map((t) => t.to);
    expect(edges).not.toContain('Resolved');
  });

  it('Awaiting Information → In Progress is ProvideInformation, actor = requester', () => {
    const t = resolveTransition('AwaitingInformation', 'ProvideInformation');
    expect(t?.to).toBe('InProgress');
    expect(t?.actors).toEqual(['requester']);
    expect(t?.effects).toContain('resumeClock');
  });

  it('Resolved → Closed is requester/system only — never the destination', () => {
    const t = resolveTransition('Resolved', 'Close');
    expect(t?.actors).toContain('requester');
    expect(t?.actors).not.toContain('destination');
    expect(t?.actors).not.toContain('assignee');
  });

  it('Resolve requires the assignee actor', () => {
    expect(resolveTransition('InProgress', 'Resolve')?.actors).toEqual(['assignee']);
  });

  it('every transition target is one of the 10 ratified statuses', () => {
    const valid: TicketStatus[] = ['Draft', 'Submitted', 'Assigned', 'InProgress', 'AwaitingInformation', 'Resolved', 'Closed', 'Rejected', 'Cancelled', 'Reopened'];
    STATUS_TRANSITIONS.forEach((t) => {
      expect(valid).toContain(t.from);
      expect(valid).toContain(t.to);
    });
  });
});

describe('Workflow Engine — actorMatches (route-derived authorisation)', () => {
  it('matches requester by creator id, destination by department', () => {
    expect(actorMatches(mkSession('SAL', 'u-sales'), ['requester'], ticket())).toBe(true);
    expect(actorMatches(mkSession('FIN', 'u-fin'), ['destination'], ticket())).toBe(true);
    expect(actorMatches(mkSession('MKT', 'u-mkt'), ['destination'], ticket())).toBe(false);
  });

  it('assignee matches only the holder of the ticket', () => {
    expect(actorMatches(mkSession('FIN', 'u-fin'), ['assignee'], ticket())).toBe(true);
    expect(actorMatches(mkSession('FIN', 'u-fin-other'), ['assignee'], ticket())).toBe(false);
  });

  it('the destination cannot satisfy the Close edge’s actors', () => {
    const close = resolveTransition('Resolved', 'Close')!;
    expect(actorMatches(mkSession('FIN', 'u-fin'), close.actors, ticket({ status: 'Resolved' }))).toBe(false);
    expect(actorMatches(mkSession('SAL', 'u-sales'), close.actors, ticket({ status: 'Resolved' }))).toBe(true);
  });

  it('a system-only edge cannot be satisfied by a user', () => {
    // AutoClose is system-only; a requester must not be able to satisfy 'system'
    expect(actorMatches(mkSession('SAL', 'u-sales'), ['system'], ticket())).toBe(false);
  });
});

/**
 * BR-052 — the reopen tally (BUSINESS_DOMAIN_MODEL §6.6).
 *
 * A ratified, System-owned field on the canonical Ticket aggregate that was never implemented:
 * a reopened ticket was indistinguishable from a first-pass one, so "separate reporting of
 * reopen cycles" — the stated purpose of the field — could not be computed at all.
 *
 * Found by auditing B03's Ticket Entity list against §6.6 rather than against the code.
 */
describe('BR-052 — reopen tally', () => {
  const reopen = (t: Ticket) =>
    applyTransition(t, resolveTransition(t.status, 'Reopen')!, { id: t.createdById, name: 'Requester' }, undefined, 'Wrong amount.').ticket;

  it('starts at zero and increments once per reopen', () => {
    const resolved = { ...ticket(), status: 'Resolved' as const, reopenCount: 0 };
    const once = reopen(resolved);
    expect(once.reopenCount).toBe(1);
    // Reopened -> Assigned -> ... -> Resolved -> Reopened again
    const twice = reopen({ ...once, status: 'Resolved' as const });
    expect(twice.reopenCount).toBe(2);
  });

  it('does NOT increment on transitions that are not a reopen', () => {
    const submitted = { ...ticket(), status: 'Submitted' as const, reopenCount: 3 };
    const assigned = applyTransition(
      submitted, resolveTransition('Submitted', 'Assign')!,
      { id: 'u-fin', name: 'Dest' }, { id: 'u-fin', name: 'Dest' },
    ).ticket;
    expect(assigned.reopenCount).toBe(3);
  });

  it('treats a ticket persisted before the field existed as zero reopens', () => {
    // Backward compatibility: older stored tickets carry no `reopenCount` at all.
    const legacy = { ...ticket(), status: 'Closed' as const } as Ticket;
    delete (legacy as { reopenCount?: number }).reopenCount;
    expect(reopen(legacy).reopenCount).toBe(1);
  });
});
