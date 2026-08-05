import type { Role } from '@domain/types/role.types';
import type { StaticPermission, TicketPermission } from '@domain/types/auth.types';
import { STATIC_PERMISSIONS, BASE_STATIC_PERMISSIONS, SYSADMIN_STATIC_PERMISSIONS } from './permissions.config';

/**
 * THE BUILT-IN ROLES — the starting points, not the whole vocabulary.
 *
 * Each one WRITES DOWN an arrangement the system already had. "Line manager" is not a new power:
 * `VIEW_TEAM` was already derived from `Department.managerId`, and this is that same reach named
 * so a promotion is one assignment rather than a permission audit. Nothing here grants a right the
 * derived model would not already have given the same person.
 *
 * They are `isSystem` and therefore undeletable. An administrator can create as many custom roles
 * as they like beside them, but removing the descriptions of how the software actually works would
 * leave the screen unable to explain itself.
 *
 * SYSTEM ROLES GRANT NO TICKET OVERRIDES — every `ticketPermissions` below is empty, deliberately.
 * The derived rules (two-step closure, assignee-only resolve) remain untouched for anyone holding
 * only built-in roles, which is what keeps the ratified lifecycle true by default.
 */
const AT = '2026-08-04T00:00:00.000Z';

const NO_TICKET_OVERRIDES: readonly TicketPermission[] = [];

export const SYSTEM_ROLES: readonly Role[] = [
  {
    id: 'role-employee',
    name: 'Employee',
    description:
      'What everyone in the organisation can already do: raise a request, follow their own work, read their notifications, and open Reports scoped to their own department.',
    isSystem: true,
    createdAt: AT,
    staticPermissions: BASE_STATIC_PERMISSIONS,
    ticketPermissions: NO_TICKET_OVERRIDES,
  },
  {
    id: 'role-line-manager',
    name: 'Line manager',
    description:
      'An employee plus the Team view for the department they manage. Matches what Department.managerId already confers — naming it means a promotion is an assignment rather than an audit.',
    isSystem: true,
    createdAt: AT,
    staticPermissions: [...BASE_STATIC_PERMISSIONS, 'VIEW_TEAM'],
    ticketPermissions: NO_TICKET_OVERRIDES,
  },
  {
    id: 'role-administrator',
    name: 'Administrator',
    description:
      'Full governance: user management, roles, categories, SLA policy, audit logs and system configuration, plus the organisation-wide Team view. The reach the Managing Directors hold today.',
    isSystem: true,
    createdAt: AT,
    staticPermissions: [...BASE_STATIC_PERMISSIONS, ...SYSADMIN_STATIC_PERMISSIONS, 'VIEW_TEAM'],
    ticketPermissions: NO_TICKET_OVERRIDES,
  },
];

/** Every static right an administrator may tick when building a role. */
export const ASSIGNABLE_STATIC_PERMISSIONS: readonly StaticPermission[] = STATIC_PERMISSIONS;

/**
 * Every ticket right an administrator may OVERRIDE, each with the rule it breaks.
 *
 * The text is the point. These are not features to switch on — each one suspends a ratified
 * Business Constitution rule for whoever holds it, and an administrator ticking a box deserves to
 * read which rule, at the moment of ticking, rather than discovering it from behaviour later.
 */
export const TICKET_OVERRIDE_WARNINGS: Readonly<Partial<Record<TicketPermission, string>>> = {
  CLOSE_TICKET: 'Overrides two-step closure — the holder can close work they did not request.',
  RESOLVE_TICKET: 'Overrides assignee-only resolution — the holder can resolve another person’s work.',
  REOPEN_TICKET: 'Overrides requester-only reopening.',
  REJECT_TICKET: 'Lets the holder reject work outside the destination department.',
  ASSIGN_TICKET: 'Lets the holder assign work in a department that is not theirs.',
  REASSIGN_TICKET: 'Lets the holder move another department’s assignee.',
  CHANGE_PRIORITY: 'Re-grades urgency, which moves the SLA deadline.',
  CANCEL_TICKET: 'Lets the holder cancel a request that is not theirs.',
  VIEW_TICKET: 'Bypasses route-derived visibility — the holder sees tickets outside their department.',
};

export const ASSIGNABLE_TICKET_PERMISSIONS: readonly TicketPermission[] = [
  'VIEW_TICKET', 'ASSIGN_TICKET', 'REASSIGN_TICKET', 'CHANGE_PRIORITY', 'START_TICKET',
  'REQUEST_INFORMATION', 'RESPOND_INFORMATION', 'RESOLVE_TICKET', 'REJECT_TICKET',
  'CLOSE_TICKET', 'REOPEN_TICKET', 'CANCEL_TICKET', 'ADD_COMMENT', 'UPLOAD_ATTACHMENT',
];
