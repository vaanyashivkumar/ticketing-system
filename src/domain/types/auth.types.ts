/**
 * Authentication & authorization domain types.
 * Aligned with FRONTEND_ARCHITECTURE §5 (canonical types) and §6 (route-derived
 * permission model). Identity (who) and authorization (what) are separate concerns.
 */

export type DepartmentCode = 'SAL' | 'MKT' | 'ACA' | 'HR' | 'FIN' | 'ADM';

export interface Department {
  readonly id: string;
  readonly code: DepartmentCode;
  readonly name: string;
  /** A destination department receives tickets (has a Department Queue). SAL/MKT do not. */
  readonly isDestination: boolean;
}

/** Orthogonal, department-agnostic governance capability (ratified R4). Not a 7th department. */
export type Capability = 'SUPER_ADMIN';

export interface Role {
  readonly departmentId: string;
  readonly departmentCode: DepartmentCode;
  readonly capabilities: readonly Capability[];
}

export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly departmentId: string;
  readonly departmentCode: DepartmentCode;
  readonly role: Role;
  readonly avatarInitials: string;
}

export interface Session {
  readonly user: User;
  /** ISO timestamp. */
  readonly authenticatedAt: string;
  readonly restored?: boolean;
}

/**
 * STATIC (identity-level) permissions — evaluated from department + sysadmin capability,
 * without reference to any specific ticket. Drive page access, nav, admin functions.
 */
export type StaticPermission =
  | 'VIEW_DASHBOARD'
  | 'CREATE_TICKET'
  | 'VIEW_MY_TICKETS'
  | 'VIEW_DEPARTMENT_QUEUE'
  | 'VIEW_NOTIFICATIONS'
  | 'VIEW_REPORTS'
  | 'EXPORT_REPORTS'
  /**
   * Open the Team view. Held by whoever is their DEPARTMENT'S line manager
   * (`DEPARTMENT_MANAGERS`) — a data fact, not a stored role, and the same fact the leave chain
   * already resolves its stage-1 approver from.
   *
   * It opens a PAGE and grants no new visibility: a manager already sees every ticket their
   * department sends or receives, so the Team view narrows that set rather than widening it.
   */
  | 'VIEW_TEAM'
  | 'MANAGE_USERS'
  | 'MANAGE_ROLES'
  | 'MANAGE_CATEGORIES'
  | 'MANAGE_SLA'
  | 'VIEW_AUDIT_LOGS'
  | 'SYSTEM_CONFIGURATION';

/**
 * TICKET-SCOPED verbs — ROUTE-DERIVED (source vs destination vs creator vs assignee
 * + sysadmin overlay). These are NOT static role grants; they are evaluated against a
 * specific ticket via canOnTicket(session, verb, ticket).
 * (FRONTEND_ARCHITECTURE §11, corrected A6; conjoined with edge.actors per §A3.)
 */
export type TicketPermission =
  | 'VIEW_TICKET'
  | 'EDIT_DRAFT'
  | 'SUBMIT_TICKET'
  | 'ASSIGN_TICKET'
  | 'REASSIGN_TICKET'
  | 'CHANGE_PRIORITY'
  | 'REQUEST_INFORMATION'
  | 'RESPOND_INFORMATION'
  | 'RESOLVE_TICKET'
  | 'REJECT_TICKET'
  // 'cancel' and 'start' in the canonical PERMISSION_FOR_ACTION mapping (WORKFLOW_ENGINE §A3).
  // The P12 implementation omitted them, leaving Cancel/Discard/Start/Resume with no verb to
  // conjoin against — one of the reasons the engine was never wired to the workflow.
  | 'CANCEL_TICKET'
  | 'START_TICKET'
  | 'CLOSE_TICKET'
  | 'REOPEN_TICKET'
  | 'ADD_COMMENT'
  | 'UPLOAD_ATTACHMENT';

export type Permission = StaticPermission | TicketPermission;

/** Minimal ticket shape needed to make a route-derived authorization decision. */
export interface TicketAuthView {
  readonly createdById: string;
  readonly assignedToId: string | null;
  readonly route: { readonly fromDeptId: string; readonly toDeptId: string };
  readonly status: string;
}
