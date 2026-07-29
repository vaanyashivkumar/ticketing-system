import type { DepartmentCode, Session } from '@domain/types/auth.types';
import type { ActivityEntry, Comment, Ticket, TicketStatus } from '@domain/types/ticket.types';
import { STATUS_TRANSITIONS, type TransitionActor, type TransitionDef, type TransitionGuard } from '@config/statusTransitions.config';
import { PERMISSION_FOR_ACTION } from '@config/permissions.config';
import { canOnTicket, authViewOf } from '@domain/permission/can';
import { newId, nowIso } from '@lib/id';

/**
 * Workflow Engine — pure transition logic (FRONTEND_ARCHITECTURE §12). No persistence,
 * no notifications here; the service composes those around it. `status` changes ONLY via
 * applyTransition — never by patching a ticket elsewhere.
 */

export function transitionsFrom(status: TicketStatus): readonly TransitionDef[] {
  return STATUS_TRANSITIONS.filter((t) => t.from === status);
}

export function resolveTransition(status: TicketStatus, action: string): TransitionDef | undefined {
  return STATUS_TRANSITIONS.find((t) => t.from === status && t.action === action);
}

/** Does the session satisfy at least one of the transition's normative actor roles? */
export function actorMatches(session: Session, actors: readonly TransitionActor[], ticket: Ticket): boolean {
  return actors.some((a) => {
    switch (a) {
      case 'requester':
        return ticket.createdById === session.user.id;
      case 'destination':
        return ticket.toDeptCode === session.user.departmentCode;
      case 'assignee':
        return ticket.assignedToId === session.user.id;
      case 'system':
        return false; // system-only edges are invoked by the system, not a user
      default:
        return false;
    }
  });
}

/**
 * THE authorization rule for performing a transition — FRONTEND_ARCHITECTURE §12 step 3,
 * corrected A3. It is a CONJUNCTION and both halves are load-bearing:
 *
 *   1. canOnTicket(...)  — the route-derived capability: may this PARTY (source / destination /
 *      creator / assignee, + sysadmin overlay) ever perform this verb?
 *   2. actorMatches(...) — the edge's normative actors: is this SPECIFIC session the requester,
 *      the assignee, or the system? These are facts a capability cannot express.
 *
 * Dropping (1) is what the code did for five phases: the Permission Engine was fully built,
 * unit-tested and never called, while callers hand-rolled the rule. Dropping (2) would let any
 * destination member Resolve and a requester force a system AutoClose.
 *
 * Every caller — the service chokepoint AND the UI — must go through this, so that what the UI
 * offers and what the service permits cannot drift apart.
 */
export function mayPerform(session: Session, def: TransitionDef, ticket: Ticket): boolean {
  return (
    canOnTicket(session, PERMISSION_FOR_ACTION[def.action], authViewOf(ticket)) &&
    actorMatches(session, def.actors, ticket)
  );
}

/** The transitions this session may actually perform on this ticket, right now. */
export function permittedTransitions(session: Session, ticket: Ticket): readonly TransitionDef[] {
  return transitionsFrom(ticket.status).filter((def) => mayPerform(session, def, ticket));
}

export interface ApplyResult {
  readonly ticket: Ticket;
  readonly activity: ActivityEntry;
}

/** The guards that demand mandatory text. Listed once so a new one cannot be silently ignored. */
const TEXT_GUARDS: readonly TransitionGuard[] = ['reasonRequired', 'resolutionNoteRequired', 'questionRequired'];

/**
 * Does this edge require mandatory text before it may commit?
 * BR-038/050 (every Reject), BR-041 (Resolve), BR-045/047 (Reopen), and `questionRequired` on
 * RequestInformation (BDM §4.1 edges 7/10). Returns the guard so the caller can name the field
 * it is asking for.
 */
export function requiredNoteGuard(def: TransitionDef): TransitionGuard | null {
  return def.guards?.find((g) => TEXT_GUARDS.includes(g)) ?? null;
}

/** Apply a legal transition to a ticket (pure): new status + SLA effects + activity entry. */
export function applyTransition(
  ticket: Ticket,
  def: TransitionDef,
  actor: { id: string; name: string; departmentCode?: DepartmentCode },
  assignee?: { id: string; name: string },
  note?: string,
): ApplyResult {
  const at = nowIso();
  let sla = { ...ticket.sla };

  for (const effect of def.effects ?? []) {
    if (effect === 'anchorClock') sla = { ...sla, startedAt: at };
    if (effect === 'pauseClock' && !sla.pausedSince) sla = { ...sla, pausedSince: at };
    if (effect === 'resumeClock' && sla.pausedSince) {
      sla = {
        ...sla,
        pausedMsAccrued: sla.pausedMsAccrued + (Date.parse(at) - Date.parse(sla.pausedSince)),
        pausedSince: null,
      };
    }
    if (effect === 'stampResolved') sla = { ...sla, resolvedAt: at };
    if (effect === 'stampClosed') sla = { ...sla, closedAt: at };
    if (effect === 'freshClock') sla = { ...sla, resolvedAt: null, closedAt: null, pausedSince: null, pausedMsAccrued: 0 };
  }

  const trimmed = note?.trim() || undefined;
  const actorDeptCode: DepartmentCode = actor.departmentCode ?? ticket.fromDeptCode;

  const activity: ActivityEntry = {
    id: newId('act'),
    actorId: actor.id,
    actorName: actor.name,
    action: def.activity,
    at,
    from: ticket.status,
    to: def.to,
    // The reason/note is part of the immutable trail, not just the current field — a later
    // reopen must not erase why the ticket was resolved or rejected the first time.
    ...(trimmed ? { note: trimmed } : {}),
  };

  // Closure evidence lands in its ratified field (BDM §594-595). Reopen's reason is carried by
  // the activity entry above — the spec defines no `reopenReason` column.
  const guard = requiredNoteGuard(def);
  const evidence =
    guard === 'resolutionNoteRequired'
      ? { resolutionNote: trimmed ?? null }
      : guard === 'reasonRequired' && def.to === 'Rejected'
        ? { rejectionReason: trimmed ?? null }
        : {};

  /**
   * An information request/response belongs in the CONVERSATION, not just the audit trail — it is
   * a question a person has to read and answer (D04 #3). `Comment.kind` has carried
   * 'info-request' | 'info-response' since P13: the type system anticipated the message and the
   * workflow never filled it, so the destination clicked "Request information" and the requester
   * received a status change with **no question attached**.
   */
  const infoComment: Comment[] =
    guard === 'questionRequired' && trimmed
      ? [{
          id: newId('cmt'),
          authorId: actor.id,
          authorName: actor.name,
          departmentCode: actorDeptCode,
          body: trimmed,
          kind: def.action === 'RequestInformation' ? 'info-request' : 'info-response',
          at,
        }]
      : [];

  const ticketNext: Ticket = {
    ...ticket,
    status: def.to,
    sla,
    updatedAt: at,
    /**
     * BR-052 reopen tally. System-owned and only ever moved by a `Reopen` ACTION — keyed off the
     * action rather than the target status, so a future edge that lands on `Reopened` by some
     * other route could not inflate the count by accident.
     *
     * `?? 0` covers tickets persisted before this field existed: they carry no `reopenCount`, and
     * treating that as zero is correct — an old ticket with no recorded reopens has had none we
     * can evidence.
     */
    reopenCount: (ticket.reopenCount ?? 0) + (def.action === 'Reopen' ? 1 : 0),
    ...(def.action === 'Assign' && assignee ? { assignedToId: assignee.id, assignedToName: assignee.name } : {}),
    ...evidence,
    comments: [...ticket.comments, ...infoComment],
    activity: [...ticket.activity, activity],
  };

  return { ticket: ticketNext, activity };
}
