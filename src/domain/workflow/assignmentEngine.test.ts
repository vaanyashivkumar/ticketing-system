import { describe, it, expect } from 'vitest';
import type { Ticket, TicketStatus } from '@domain/types/ticket.types';
import { DEFAULT_ASSIGNMENT_POLICY, type AssignmentPolicy } from '@config/assignment.config';
import {
  eligibleCandidates,
  openLoad,
  selectAssignee,
  suggestedAssignee,
  type Candidate,
} from './assignmentEngine';

const fin = (id: string, active = true): Candidate => ({ id, name: id.toUpperCase(), departmentCode: 'FIN', active });
const hr = (id: string): Candidate => ({ id, name: id.toUpperCase(), departmentCode: 'HR', active: true });

const ticket = (assignedToId: string | null, status: TicketStatus, at = '2026-07-16T09:00:00.000Z'): Ticket => ({
  id: `t-${assignedToId}-${status}-${at}`, code: 'FIN-0001', subject: 's', description: 'd',
  status, priority: 'Medium',
  fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'C', categoryData: {},
  createdById: 'u-sales', createdByName: 'S', assignedToId, assignedToName: assignedToId,
  createdAt: at, updatedAt: at,
  sla: { startedAt: at, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' },
  resolutionNote: null, reopenCount: 0, rejectionReason: null,
  comments: [], attachments: [],
  activity: assignedToId ? [{ id: 'a1', actorId: 'x', actorName: 'X', action: 'ASSIGNED', at }] : [],
});

const policy = (over: Partial<AssignmentPolicy> = {}): AssignmentPolicy => ({ ...DEFAULT_ASSIGNMENT_POLICY, ...over });

describe('candidate eligibility', () => {
  const pool = [fin('a'), fin('b', false), hr('c')];

  it('offers only ACTIVE members of the destination department', () => {
    expect(eligibleCandidates(pool, 'FIN').map((c) => c.id)).toEqual(['a']);
  });

  it('honours the policy switches rather than hardcoding the filter', () => {
    expect(eligibleCandidates(pool, 'FIN', policy({ activeOnly: false })).map((c) => c.id)).toEqual(['a', 'b']);
    expect(eligibleCandidates(pool, 'FIN', policy({ destinationOnly: false })).map((c) => c.id)).toEqual(['a', 'c']);
  });

  it('returns no suggestion when nobody is eligible', () => {
    expect(selectAssignee([hr('c')], 'FIN', [])).toBeNull();
  });
});

describe('workload strategy', () => {
  const pool = [fin('a'), fin('b'), fin('c')];

  it('counts only OPEN tickets — finished work is not a load', () => {
    const load = openLoad(pool, [
      ticket('a', 'InProgress'),
      ticket('a', 'Closed'),
      ticket('a', 'Resolved'),
      ticket('b', 'Assigned'),
    ]);
    expect(load.get('a')).toBe(1);
    expect(load.get('b')).toBe(1);
    expect(load.get('c')).toBe(0);
  });

  it('suggests the least loaded', () => {
    const tickets = [ticket('a', 'InProgress'), ticket('a', 'Assigned'), ticket('b', 'Assigned')];
    expect(selectAssignee(pool, 'FIN', tickets, policy({ strategy: 'workload' }))?.id).toBe('c');
  });

  it('breaks ties deterministically', () => {
    // Identical state must give an identical answer, or the suggestion is noise.
    const first = selectAssignee(pool, 'FIN', [], policy({ strategy: 'workload' }))?.id;
    const again = selectAssignee([...pool].reverse(), 'FIN', [], policy({ strategy: 'workload' }))?.id;
    expect(first).toBe('a');
    expect(again).toBe('a');
  });
});

describe('round-robin strategy', () => {
  const pool = [fin('a'), fin('b'), fin('c')];
  const rr = policy({ strategy: 'round-robin' });

  it('puts someone who has never been assigned anything first', () => {
    const tickets = [ticket('a', 'InProgress', '2026-07-10T09:00:00.000Z'), ticket('b', 'InProgress', '2026-07-11T09:00:00.000Z')];
    expect(selectAssignee(pool, 'FIN', tickets, rr)?.id).toBe('c');
  });

  it('otherwise picks whoever has waited longest', () => {
    const tickets = [
      ticket('a', 'InProgress', '2026-07-10T09:00:00.000Z'),
      ticket('b', 'InProgress', '2026-07-11T09:00:00.000Z'),
      ticket('c', 'InProgress', '2026-07-12T09:00:00.000Z'),
    ];
    expect(selectAssignee(pool, 'FIN', tickets, rr)?.id).toBe('a');
  });
});

describe('manual strategy and the suggestion contract', () => {
  const pool = [fin('a'), fin('b')];
  const actor = { id: 'u-me', name: 'Me' };

  it('makes no suggestion at all', () => {
    expect(selectAssignee(pool, 'FIN', [], policy({ strategy: 'manual' }))).toBeNull();
  });

  it('falls back to the acting user, preserving the old self-assign as a DEFAULT', () => {
    expect(suggestedAssignee(pool, 'FIN', [], actor, policy({ strategy: 'manual' }))).toEqual(actor);
  });

  it('falls back to the actor when the department is empty, never to nobody', () => {
    // The Assign edge requires an assignee; returning null here would produce a control with no
    // value and a service call that is guaranteed to fail.
    expect(suggestedAssignee([], 'FIN', [], actor)).toEqual(actor);
  });

  it('never places a ticket on its own — autoPlace stays off in the ratified policy', () => {
    expect(DEFAULT_ASSIGNMENT_POLICY.autoPlace).toBe(false);
  });
});
