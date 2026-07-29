import type { TicketStatus } from '@domain/types/ticket.types';
import {
  STATUS_DEFINITIONS,
  QUEUE_DEFINITIONS,
  type StatusDefinition,
  type QueueBucket,
} from '@config/statuses.config';
import { STATUS_TRANSITIONS } from '@config/statusTransitions.config';

/**
 * Status Engine — every question the application asks about a status, answered from
 * `statuses.config.ts` and the ratified transition matrix. Nothing here holds a status list of
 * its own; the moment it did, it would be the fourteenth copy.
 */

const BY_ID = new Map<TicketStatus, StatusDefinition>(STATUS_DEFINITIONS.map((s) => [s.id, s]));

/**
 * Non-null by construction: `StatusDefinition.id` is typed `TicketStatus` and the array below is
 * exhaustive, which `statusEngine.test.ts` asserts against the type's own member list. If a
 * status were ever added to the union without a definition, that test fails before any screen
 * can render an undefined label.
 */
export function statusDef(status: TicketStatus): StatusDefinition {
  const def = BY_ID.get(status);
  if (!def) throw new Error(`No status definition for "${status}"`);
  return def;
}

export const statusLabel = (status: TicketStatus): string => statusDef(status).label;

/** Label for space-constrained surfaces (chart axes, dense table cells). */
export const statusShortLabel = (status: TicketStatus): string => {
  const d = statusDef(status);
  return d.shortLabel ?? d.label;
};

/** All statuses in lifecycle order — the one ordered list. */
export const ORDERED_STATUSES: readonly TicketStatus[] = [...STATUS_DEFINITIONS]
  .sort((a, b) => a.order - b.order)
  .map((s) => s.id);

/** Live, unfinished work. Replaces five hand-copied `OPEN_STATUSES` arrays. */
export const OPEN_STATUSES: readonly TicketStatus[] = STATUS_DEFINITIONS.filter((s) => s.open).map((s) => s.id);
export const isOpen = (status: TicketStatus): boolean => statusDef(status).open;

/** States in which a ticket may be re-assigned or re-prioritised (both non-status writes). */
export const ASSIGNABLE_STATUSES: readonly TicketStatus[] = STATUS_DEFINITIONS.filter((s) => s.assignable).map((s) => s.id);
export const isAssignable = (status: TicketStatus): boolean => statusDef(status).assignable;

/**
 * May a ticket's PRIORITY be changed in this state? (BR-060, the who-may is the Permission
 * Engine's `CHANGE_PRIORITY`.)
 *
 * Wider than `assignable` and narrower than "always": open work plus the requester's own draft.
 * Finished work is excluded on purpose — priority sets the SLA target, so re-grading a resolved
 * ticket would silently move a target that has already been measured against, and every
 * compliance figure computed before the change would stop reconciling.
 */
export const canChangePriority = (status: TicketStatus): boolean => isOpen(status) || status === 'Draft';

/** The requester is the party who must move next. */
export const requesterActionRequired = (status: TicketStatus): boolean => statusDef(status).requesterActionRequired;

// ---- Derived from the transition matrix, never hand-listed ------------------

/** Statuses reachable from here in one legal edge. */
export function nextStatuses(status: TicketStatus): readonly TicketStatus[] {
  return [...new Set(STATUS_TRANSITIONS.filter((t) => t.from === status).map((t) => t.to))];
}

/** Statuses from which this one is legally reachable in one edge. */
export function previousStatuses(status: TicketStatus): readonly TicketStatus[] {
  return [...new Set(STATUS_TRANSITIONS.filter((t) => t.to === status).map((t) => t.from))];
}

/**
 * TRUE terminal: no outbound edge at all.
 *
 * This replaces the exported-but-never-imported `TERMINAL_STATUSES` constant, which listed
 * `['Closed', 'Cancelled', 'Rejected']` and was wrong on two of the three — `Closed → Reopened`
 * and `Rejected → Reopened` are both ratified edges (R7, and BR-047's Contest path). Only
 * `Cancelled` has nowhere to go. Deriving it means the answer cannot drift from the matrix.
 */
export const isTerminal = (status: TicketStatus): boolean => nextStatuses(status).length === 0;

// ---- Queues ----------------------------------------------------------------

export const queueOf = (status: TicketStatus): QueueBucket | null => statusDef(status).queue;

/** The statuses that make up a bucket — derived, so a status lands in exactly one queue. */
export function statusesInQueue(bucket: QueueBucket): readonly TicketStatus[] {
  return STATUS_DEFINITIONS.filter((s) => s.queue === bucket).map((s) => s.id);
}

export { QUEUE_DEFINITIONS, STATUS_DEFINITIONS };
export type { StatusDefinition, QueueBucket };
