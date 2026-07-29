import type { StaticPermission, TicketPermission } from '@domain/types/auth.types';
import type { TransitionAction } from './statusTransitions.config';

/**
 * STATIC permission catalogue (P12 §8). Every permission has a stable id.
 * These are IDENTITY-level (not ticket-specific). Ticket-scoped verbs
 * (ASSIGN/RESOLVE/CLOSE…) are route-derived and live in domain/permission/can.ts —
 * they are deliberately NOT granted here as static role rights, because per the
 * binding model they depend on the actor's relationship to a specific ticket's route.
 *
 * There is deliberately no permission-management right. Permissions are derived
 * (route relationship for ticket verbs; department + capability for static rights),
 * never stored per role, so there is no grant table for such a right to gate —
 * changing authorisation means changing the routing matrix or a capability grant.
 * Every permission listed here MUST be checked by a guard, nav item or component;
 * one that is granted but never read is dead config (PERM-001). All of them now are:
 * SYSTEM_CONFIGURATION gates /admin/system, EXPORT_REPORTS gates the CSV buttons in
 * ReportsPage, and VIEW_PROFILE was REMOVED rather than left granted-but-unread when
 * D01 retired the Profile and Settings pages.
 *
 * Keep it that way. If you add a permission, add its consumer in the same change — and if
 * you remove the last consumer, remove the permission. A right nobody checks is a lie the
 * next reader will believe.
 */

export const STATIC_PERMISSIONS: readonly StaticPermission[] = [
  'VIEW_DASHBOARD',
  'CREATE_TICKET',
  'VIEW_MY_TICKETS',
  'VIEW_DEPARTMENT_QUEUE',
  'VIEW_NOTIFICATIONS',
  'VIEW_REPORTS',
  'EXPORT_REPORTS',
  'MANAGE_USERS',
  'MANAGE_ROLES',
  'MANAGE_CATEGORIES',
  'MANAGE_SLA',
  'VIEW_AUDIT_LOGS',
  'SYSTEM_CONFIGURATION',
];

/** Granted to every authenticated user regardless of department. */
export const BASE_STATIC_PERMISSIONS: readonly StaticPermission[] = [
  'VIEW_DASHBOARD',
  'CREATE_TICKET',
  'VIEW_MY_TICKETS',
  'VIEW_NOTIFICATIONS',
  // Reports are visible to all but SCOPE-CLAMPED at the data layer (own-dept / hub / global).
  'VIEW_REPORTS',
  'EXPORT_REPORTS',
];

/** Granted only to DESTINATION departments (Academics / HR / Finance) — the queue holders. */
export const DESTINATION_STATIC_PERMISSIONS: readonly StaticPermission[] = ['VIEW_DEPARTMENT_QUEUE'];

/** Granted only to holders of the SUPER_ADMIN capability (sysadmin governance). */
export const SYSADMIN_STATIC_PERMISSIONS: readonly StaticPermission[] = [
  'MANAGE_USERS',
  'MANAGE_ROLES',
  'MANAGE_CATEGORIES',
  'MANAGE_SLA',
  'VIEW_AUDIT_LOGS',
  'SYSTEM_CONFIGURATION',
];

/**
 * The frozen action → ticket-verb mapping mandated by WORKFLOW_ENGINE §A3 / FRONTEND_ARCHITECTURE
 * §12 step 3. It is HALF of the authorization rule; the other half is `edge.actors`, and the two
 * are CONJUNCTIVE (corrected A3):
 *
 *     canOnTicket(session, PERMISSION_FOR_ACTION[action], ticket) && actorMatches(session, edge.actors, ticket)
 *
 * Neither half is sufficient alone. The verb answers "may this PARTY ever do this?" (a
 * capability); `actors` answers "is this specific session the requester / the assignee / the
 * system?" — the assignee-only and system-only facts a capability cannot express. Demoting
 * either half is forbidden: it would let any destination member Resolve, or a requester force
 * a system AutoClose.
 *
 * Exhaustive by the compiler: `TransitionAction` is a closed union, so a new edge cannot be added
 * without deciding its permission. Translated from the spec's original verb vocabulary
 * (Discard:'cancel', Start:'start', AcceptAndClose/AutoClose:'close', Contest:'reopen') into the
 * implemented TicketPermission names; the merged Close edge covers AcceptAndClose + AutoClose,
 * and Reopen covers Contest.
 */
export const PERMISSION_FOR_ACTION: Readonly<Record<TransitionAction, TicketPermission>> = {
  Submit: 'SUBMIT_TICKET',
  Discard: 'CANCEL_TICKET',
  Cancel: 'CANCEL_TICKET',
  Assign: 'ASSIGN_TICKET',
  Start: 'START_TICKET',
  Resume: 'START_TICKET',
  RequestInformation: 'REQUEST_INFORMATION',
  ProvideInformation: 'RESPOND_INFORMATION',
  Resolve: 'RESOLVE_TICKET',
  Reject: 'REJECT_TICKET',
  Close: 'CLOSE_TICKET',
  Reopen: 'REOPEN_TICKET',
} as const;
