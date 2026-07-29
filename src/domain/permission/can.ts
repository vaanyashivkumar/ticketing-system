import type {
  DepartmentCode,
  Session,
  StaticPermission,
  TicketPermission,
  TicketAuthView,
} from '@domain/types/auth.types';
import { DEPARTMENTS } from '@config/departments.config';
import {
  BASE_STATIC_PERMISSIONS,
  DESTINATION_STATIC_PERMISSIONS,
  SYSADMIN_STATIC_PERMISSIONS,
} from '@config/permissions.config';

/**
 * The Permission Engine (FRONTEND_ARCHITECTURE §11, corrected A6). UI asks this engine —
 * NEVER `if (role === 'Finance')`. Two evaluation paths:
 *   - canStatic(session, permission): identity-level (page/nav/admin access).
 *   - canOnTicket(session, verb, ticket): ROUTE-DERIVED (source/destination/creator/assignee).
 * Ticket verbs are never static role grants: e.g. CLOSE is the requester's, never the
 * destination's; RESOLVE is the destination's only on its own inbound tickets.
 */

function isSysadmin(session: Session): boolean {
  return session.user.role.capabilities.includes('SUPER_ADMIN');
}

// ---- Static (identity-level) ----------------------------------------------

/** The full static permission set a session holds, derived (never a scattered role check). */
export function resolveStaticPermissions(session: Session): ReadonlySet<StaticPermission> {
  const perms = new Set<StaticPermission>(BASE_STATIC_PERMISSIONS);
  const dept = DEPARTMENTS[session.user.departmentCode];
  if (dept.isDestination) DESTINATION_STATIC_PERMISSIONS.forEach((p) => perms.add(p));
  if (isSysadmin(session)) SYSADMIN_STATIC_PERMISSIONS.forEach((p) => perms.add(p));
  return perms;
}

export function canStatic(session: Session, permission: StaticPermission): boolean {
  return resolveStaticPermissions(session).has(permission);
}

// ---- Ticket-scoped (route-derived) ----------------------------------------

/**
 * Adapt a stored Ticket to the shape the engine authorises against.
 *
 * A Ticket stores department CODES; TicketAuthView is keyed by department IDs. Without this
 * translation `canOnTicket` simply cannot accept a Ticket — which is why the engine sat
 * unused for five phases while callers hand-rolled the rule against codes instead. Keep this
 * adapter as the single bridge; do not re-hand-roll the comparison at a call site.
 */
export function authViewOf(ticket: {
  createdById: string;
  assignedToId: string | null;
  fromDeptCode: DepartmentCode;
  toDeptCode: DepartmentCode;
  status: string;
}): TicketAuthView {
  return {
    createdById: ticket.createdById,
    assignedToId: ticket.assignedToId,
    route: { fromDeptId: DEPARTMENTS[ticket.fromDeptCode].id, toDeptId: DEPARTMENTS[ticket.toDeptCode].id },
    status: ticket.status,
  };
}

type Relationship = 'source' | 'destination' | 'creator' | 'assignee' | 'none';

function relationships(session: Session, t: TicketAuthView): Set<Relationship> {
  const rels = new Set<Relationship>();
  const deptId = session.user.departmentId;
  if (t.route.fromDeptId === deptId) rels.add('source');
  if (t.route.toDeptId === deptId) rels.add('destination');
  if (t.createdById === session.user.id) rels.add('creator');
  if (t.assignedToId && t.assignedToId === session.user.id) rels.add('assignee');
  if (rels.size === 0) rels.add('none');
  return rels;
}

/**
 * Route-derived ticket authorization. The relationship rules encode the binding model;
 * fine-grained status guards (which status permits which action) are enforced by the
 * Workflow Engine, not here — this answers "may this party ever perform this verb?".
 */
export function canOnTicket(
  session: Session,
  verb: TicketPermission,
  ticket: TicketAuthView,
): boolean {
  const rel = relationships(session, ticket);
  const sys = isSysadmin(session);

  switch (verb) {
    // View: source OR destination OR sysadmin. No third department, ever.
    case 'VIEW_TICKET':
      /**
       * D09-1 — A DRAFT IS PRIVATE TO ITS CREATOR.
       *
       * This previously returned `source || destination || sysadmin` for every status, so the
       * destination department could open another department's UNSUBMITTED draft and read it.
       * The queue happened not to list drafts, which masked it — but the details route was
       * reachable directly, and the API (which has no such incidental filter) leaked it in both
       * the list and the detail.
       *
       * This is a DEFECT against documented intent, not a rule change. phase-0 §158 justifies
       * suppressing the Discard notification with "the destination never saw it", and §206 gives
       * every Draft action to "R (creator only)". A draft is a private working copy until Submit.
       *
       * Sysadmin is excluded deliberately: the capability is governance, and there is no
       * governance screen that lists drafts. Nothing is lost and the private thing stays private.
       */
      if (ticket.status === 'Draft') return rel.has('creator');
      return sys || rel.has('source') || rel.has('destination');

    // In-ticket collaboration: any party to the ticket.
    case 'ADD_COMMENT':
    case 'UPLOAD_ATTACHMENT':
      // Same rule: you cannot comment on, or attach to, a draft you are not allowed to see.
      if (ticket.status === 'Draft') return rel.has('creator');
      return sys || rel.has('source') || rel.has('destination');

    // Requester (creator) content actions.
    case 'EDIT_DRAFT':
    case 'SUBMIT_TICKET':
      return rel.has('creator');

    // ProvideInformation: the requester supplies info; this is what un-pauses the SLA clock.
    case 'RESPOND_INFORMATION':
      return rel.has('creator');

    // Closure / reopen / cancel are the REQUESTER's only. The destination NEVER closes.
    case 'CLOSE_TICKET':
    case 'REOPEN_TICKET':
    case 'CANCEL_TICKET':
      return rel.has('creator');

    // Destination adjudication.
    case 'ASSIGN_TICKET':
    case 'REASSIGN_TICKET':
    case 'REQUEST_INFORMATION':
    case 'REJECT_TICKET':
      return rel.has('destination');

    // Starting/resuming work is a DESTINATION capability. Narrowing it to the SPECIFIC
    // assignee is the transition's `actors` job, applied conjunctively (A3) — that is exactly
    // the assignee-only fact a capability check cannot express.
    case 'START_TICKET':
      return rel.has('destination');

    // Resolve is the assignee's (a destination member with the ticket assigned to them).
    case 'RESOLVE_TICKET':
      return rel.has('assignee');

    /**
      * BR-060 in full: "Priority is set by the requester at Draft only; after Submit only the
      * destination/assignee/sysadmin may change it."
      *
      * The sysadmin arm was missing — `sys` was computed at the top of this function and every
      * other branch that needed it used it, so a sysadmin could not re-grade a mis-filed ticket
      * even though the ratified rule names them. The assignee needs no separate arm: an assignee
      * is by definition a member of the destination department.
      */
    case 'CHANGE_PRIORITY':
      return ticket.status === 'Draft' ? rel.has('creator') : sys || rel.has('destination');

    default:
      return false;
  }
}
