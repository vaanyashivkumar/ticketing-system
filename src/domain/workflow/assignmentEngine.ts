import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import {
  DEFAULT_ASSIGNMENT_POLICY,
  type AssignmentPolicy,
  type AssignmentStrategy,
} from '@config/assignment.config';
import { isOpen } from './statusEngine';

/**
 * Assignment Engine — PURE. Given the candidates and the current ticket set, which member of the
 * destination department should this ticket go to?
 *
 * It decides nothing about permission: whether the caller may assign at all is the Permission
 * Engine's `ASSIGN_TICKET` conjoined with the edge's actors, exactly as for every other action.
 * This answers only "which of the people who could hold it should be offered first".
 */

export interface Candidate {
  readonly id: string;
  readonly name: string;
  readonly departmentCode: DepartmentCode;
  readonly active: boolean;
}

/** Members eligible to hold this ticket, per policy. */
export function eligibleCandidates(
  candidates: readonly Candidate[],
  toDeptCode: DepartmentCode,
  policy: AssignmentPolicy = DEFAULT_ASSIGNMENT_POLICY,
): readonly Candidate[] {
  return candidates.filter(
    (c) =>
      (!policy.activeOnly || c.active) &&
      (!policy.destinationOnly || c.departmentCode === toDeptCode),
  );
}

/** How many OPEN tickets each candidate currently holds. */
export function openLoad(candidates: readonly Candidate[], tickets: readonly Ticket[]): Map<string, number> {
  const load = new Map<string, number>(candidates.map((c) => [c.id, 0]));
  for (const t of tickets) {
    if (!t.assignedToId || !isOpen(t.status)) continue;
    const current = load.get(t.assignedToId);
    if (current !== undefined) load.set(t.assignedToId, current + 1);
  }
  return load;
}

/**
 * When each candidate was last assigned anything, from the activity trail. Absent = never, which
 * sorts FIRST — someone who has never been given a ticket is the most overdue for one, and that
 * is the whole point of round-robin.
 */
export function lastAssignedAt(candidates: readonly Candidate[], tickets: readonly Ticket[]): Map<string, string | null> {
  const last = new Map<string, string | null>(candidates.map((c) => [c.id, null]));
  for (const t of tickets) {
    for (const a of t.activity) {
      if (a.action !== 'ASSIGNED') continue;
      // The activity records who PERFORMED the assignment, not who received it; the ticket's
      // current assignee is the reliable link, so only count entries on tickets they still hold.
      if (!t.assignedToId || !last.has(t.assignedToId)) continue;
      const seen = last.get(t.assignedToId);
      if (!seen || a.at > seen) last.set(t.assignedToId, a.at);
    }
  }
  return last;
}

/**
 * The suggested assignee, or `null` when the policy makes no suggestion.
 *
 * Ties break on `id` so the result is DETERMINISTIC. A suggestion that changes between two
 * identical states would look like the system knows something it does not, and would make this
 * function untestable.
 */
export function selectAssignee(
  candidates: readonly Candidate[],
  toDeptCode: DepartmentCode,
  tickets: readonly Ticket[],
  policy: AssignmentPolicy = DEFAULT_ASSIGNMENT_POLICY,
): Candidate | null {
  const pool = eligibleCandidates(candidates, toDeptCode, policy);
  if (pool.length === 0) return null;

  const strategy: AssignmentStrategy = policy.strategy;
  if (strategy === 'manual') return null;

  if (strategy === 'workload') {
    const load = openLoad(pool, tickets);
    return [...pool].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0) || a.id.localeCompare(b.id))[0] ?? null;
  }

  // round-robin
  const last = lastAssignedAt(pool, tickets);
  return [...pool].sort((a, b) => {
    // `?? null` collapses "no entry in the map" and "never assigned" — the same fact, and the
    // map is built from `pool` so the first case cannot actually occur.
    const la = last.get(a.id) ?? null;
    const lb = last.get(b.id) ?? null;
    if (la === lb) return a.id.localeCompare(b.id);
    if (la === null) return -1; // never assigned: most overdue
    if (lb === null) return 1;
    return la.localeCompare(lb); // oldest first
  })[0] ?? null;
}

/**
 * The default the Assign control should start on.
 *
 * Falls back to the acting user when the policy makes no suggestion, which preserves the old
 * self-assignment behaviour as a DEFAULT rather than as the only possibility. `autoPlace` is
 * deliberately not consulted here: this function answers "what should the control show", and
 * placing a ticket without a human confirming is a separate decision the ratified policy
 * currently refuses.
 */
export function suggestedAssignee(
  candidates: readonly Candidate[],
  toDeptCode: DepartmentCode,
  tickets: readonly Ticket[],
  actor: { id: string; name: string },
  policy: AssignmentPolicy = DEFAULT_ASSIGNMENT_POLICY,
): { id: string; name: string } {
  const picked = selectAssignee(candidates, toDeptCode, tickets, policy);
  return picked ? { id: picked.id, name: picked.name } : actor;
}
