import type { StaticPermission, TicketPermission } from '@domain/types/auth.types';

/**
 * PERMISSION CATALOGUE (B06 §Permission Management Engine).
 *
 * B06 asks for a catalogue with an id, name, description, category, risk level, dependencies and
 * conflicting permissions. Five of those seven are real here. Two are not, and inventing them
 * would be worse than leaving them out:
 *
 *   - **Dependencies.** Static permissions are a plain union of three arrays; no permission
 *     requires another. `derivation` says where each one comes from, which is the question a
 *     dependency field is usually asked in order to answer.
 *   - **Conflicting permissions.** There are no deny-grants. A permission set is built by union,
 *     so two permissions cannot contradict each other — there is no mechanism by which they could.
 *
 * WHAT THIS IS NOT: an editing surface. Permissions are DERIVED — ticket verbs from the actor's
 * relationship to a ticket's route, static rights from department plus the `SUPER_ADMIN`
 * capability. There is no role→permission table, by ratified design (BUSINESS_DOMAIN_MODEL §2.3:
 * "no role-keyed permission table is ever introduced"). A catalogue that offered checkboxes would
 * be creating the table the Constitution refuses.
 *
 * `risk` is an ENGINEERING classification for review ordering, not a ratified field — ⚠️ C. It
 * ranks how much damage the permission enables, so a reviewer reading the catalogue starts at the
 * top rather than at the alphabet.
 */

export type PermissionRisk = 'low' | 'medium' | 'high';

export type PermissionCategory =
  | 'Tickets'
  | 'Collaboration'
  | 'Visibility'
  | 'Reporting'
  | 'Administration';

/** Where a permission comes from. This is the honest replacement for B06's "dependencies". */
export type Derivation =
  /** Everyone authenticated holds it. */
  | 'base'
  /** Held because the department receives tickets (`isDestination`). */
  | 'destination-department'
  /** Held because the user carries the SUPER_ADMIN capability. */
  | 'sysadmin-capability'
  /** Computed per ticket from the actor's relationship to its route. Never a standing grant. */
  | 'route-relationship';

export interface PermissionEntry {
  readonly id: StaticPermission | TicketPermission;
  readonly name: string;
  readonly description: string;
  readonly category: PermissionCategory;
  readonly risk: PermissionRisk;
  readonly derivation: Derivation;
  /** Static rights are identity-level; ticket verbs are evaluated against one ticket at a time. */
  readonly kind: 'static' | 'ticket';
  /**
   * What actually checks it. A permission with no consumer is dead config — the codebase's own
   * rule — and naming the consumer is what makes that checkable rather than asserted.
   * `null` means nothing checks it, which is a defect the catalogue surfaces rather than hides.
   */
  readonly enforcedBy: string | null;
}

export const PERMISSION_CATALOGUE: readonly PermissionEntry[] = [
  // ---- Static (identity-level) --------------------------------------------
  { id: 'VIEW_DASHBOARD', name: 'View dashboard', description: 'Open the department dashboard.', category: 'Visibility', risk: 'low', derivation: 'base', kind: 'static', enforcedBy: 'Sidebar navigation' },
  { id: 'CREATE_TICKET', name: 'Create ticket', description: 'Raise a request on a route the department is allowed to use.', category: 'Tickets', risk: 'low', derivation: 'base', kind: 'static', enforcedBy: 'Quick actions, Create Ticket page' },
  { id: 'VIEW_MY_TICKETS', name: 'View my tickets', description: 'See the tickets you raised.', category: 'Visibility', risk: 'low', derivation: 'base', kind: 'static', enforcedBy: 'Sidebar navigation' },
  { id: 'VIEW_NOTIFICATIONS', name: 'View notifications', description: 'Open the notification feed, scoped to you.', category: 'Visibility', risk: 'low', derivation: 'base', kind: 'static', enforcedBy: 'Sidebar navigation' },
  { id: 'VIEW_REPORTS', name: 'View reports', description: 'Open Reports. The DATA is scope-clamped separately — this only opens the page.', category: 'Reporting', risk: 'low', derivation: 'base', kind: 'static', enforcedBy: 'Route guard on /app/reports' },
  { id: 'EXPORT_REPORTS', name: 'Export reports', description: 'Download the filtered ticket set as CSV.', category: 'Reporting', risk: 'medium', derivation: 'base', kind: 'static', enforcedBy: 'Export buttons; API GET /reports/export' },
  { id: 'VIEW_DEPARTMENT_QUEUE', name: 'View department queue', description: 'See work routed to your department. Only departments that receive tickets hold it.', category: 'Visibility', risk: 'medium', derivation: 'destination-department', kind: 'static', enforcedBy: 'Route guard on /app/queue' },

  { id: 'MANAGE_USERS', name: 'Manage users', description: 'View accounts and activate or deactivate them. Deactivation ends live sessions immediately.', category: 'Administration', risk: 'high', derivation: 'sysadmin-capability', kind: 'static', enforcedBy: 'Route guard on /admin/users; API GET/PATCH /admin/users' },
  {
    id: 'MANAGE_ROLES',
    name: 'Manage roles',
    description: 'Inspect the derived authorisation model. There is no role record to edit — permissions are derived, not granted.',
    category: 'Administration',
    risk: 'medium',
    derivation: 'sysadmin-capability',
    kind: 'static',
    // Was `null` before this build: the permission was granted to every sysadmin and gated
    // nothing anywhere — the exact defect PERM-001 exists to catch. It now gates the route it
    // was always meant to.
    enforcedBy: 'Route guard on /admin/roles',
  },
  { id: 'MANAGE_CATEGORIES', name: 'Manage categories', description: 'Enable or disable ticket categories. Cannot create or delete — the routing matrix is immutable.', category: 'Administration', risk: 'high', derivation: 'sysadmin-capability', kind: 'static', enforcedBy: 'Route guard on /admin/categories; API PATCH /config/categories/:id' },
  { id: 'MANAGE_SLA', name: 'Manage SLA policy', description: 'Change resolution targets and the Due Soon threshold. Governs every new ticket’s deadline.', category: 'Administration', risk: 'high', derivation: 'sysadmin-capability', kind: 'static', enforcedBy: 'Route guard on /admin/sla; API GET /config/sla' },
  { id: 'VIEW_AUDIT_LOGS', name: 'View audit logs', description: 'Read the append-only governance and authentication trail.', category: 'Administration', risk: 'medium', derivation: 'sysadmin-capability', kind: 'static', enforcedBy: 'Route guard on /admin/audit; API GET /admin/audit' },
  { id: 'SYSTEM_CONFIGURATION', name: 'System configuration', description: 'Change the business calendar and feature flags. The calendar governs every SLA calculation.', category: 'Administration', risk: 'high', derivation: 'sysadmin-capability', kind: 'static', enforcedBy: 'Route guard on /admin/system; API POST /admin/jobs/auto-close' },

  // ---- Ticket-scoped (route-derived) --------------------------------------
  // These are never held standing. Each is evaluated against ONE ticket, from the actor's
  // relationship to that ticket's route, and conjoined with the transition's own actor rule.
  { id: 'VIEW_TICKET', name: 'View ticket', description: 'Source or destination department, or a sysadmin. A DRAFT is visible to its creator only.', category: 'Visibility', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket; API SQL visibility clause' },
  { id: 'EDIT_DRAFT', name: 'Edit draft', description: 'The creator, before submission.', category: 'Tickets', risk: 'low', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket' },
  { id: 'SUBMIT_TICKET', name: 'Submit ticket', description: 'The creator. Anchors the SLA clock.', category: 'Tickets', risk: 'low', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'ASSIGN_TICKET', name: 'Assign ticket', description: 'The destination department, to any active member of it.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'REASSIGN_TICKET', name: 'Re-assign ticket', description: 'The destination department. Moves the holder without touching the SLA clock.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket; API PATCH /tickets/:id/assignee' },
  { id: 'CHANGE_PRIORITY', name: 'Change priority', description: 'The requester while it is a draft; the destination or a sysadmin thereafter (BR-060). Moves the SLA target.', category: 'Tickets', risk: 'high', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket; API PATCH /tickets/:id/priority' },
  { id: 'START_TICKET', name: 'Start work', description: 'The destination department. Requires an assignee.', category: 'Tickets', risk: 'low', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'REQUEST_INFORMATION', name: 'Request information', description: 'The destination department. Pauses the SLA clock and requires a question.', category: 'Collaboration', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition guards' },
  { id: 'RESPOND_INFORMATION', name: 'Provide information', description: 'The requester. Un-pauses the SLA clock.', category: 'Collaboration', risk: 'low', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition guards' },
  { id: 'RESOLVE_TICKET', name: 'Resolve ticket', description: 'The named assignee only, with a mandatory resolution note.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'REJECT_TICKET', name: 'Reject ticket', description: 'The destination department, with a mandatory reason.', category: 'Tickets', risk: 'high', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition guards' },
  { id: 'CLOSE_TICKET', name: 'Close ticket', description: 'The REQUESTER, never the destination. Two-step closure is the point of the lifecycle.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'REOPEN_TICKET', name: 'Reopen ticket', description: 'The requester, with a mandatory reason. Restarts the SLA clock.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition guards' },
  { id: 'CANCEL_TICKET', name: 'Cancel ticket', description: 'The requester. The only genuinely terminal state.', category: 'Tickets', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket + transition actors' },
  { id: 'ADD_COMMENT', name: 'Add comment', description: 'Any party to the ticket. Not on another department’s draft.', category: 'Collaboration', risk: 'low', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket' },
  { id: 'UPLOAD_ATTACHMENT', name: 'Upload attachment', description: 'Any party to the ticket, within the configured size and type limits.', category: 'Collaboration', risk: 'medium', derivation: 'route-relationship', kind: 'ticket', enforcedBy: 'canOnTicket' },
];

export const DERIVATION_LABEL: Readonly<Record<Derivation, string>> = {
  base: 'Every authenticated user',
  'destination-department': 'Departments that receive tickets',
  'sysadmin-capability': 'Holders of the system-administration capability',
  'route-relationship': 'Computed per ticket from the route relationship',
};

/**
 * B06 catalogue fields with no referent in this model, recorded rather than faked.
 * Rendered beside the catalogue so the omission is a stated position, not an apparent oversight.
 */
export const CATALOGUE_GAPS: readonly { readonly field: string; readonly why: string }[] = [
  {
    field: 'Dependencies',
    why: 'No permission requires another. The static set is a union of three flat arrays; “Derived from” answers the question a dependency field is usually asked to answer.',
  },
  {
    field: 'Conflicting permissions',
    why: 'There are no deny-grants. Sets are built by union, so two permissions have no mechanism by which they could contradict each other.',
  },
  {
    field: 'System protection status',
    why: 'Every permission is system-defined. None can be created, edited or deleted, so a protection flag would be true for all of them and distinguish nothing.',
  },
];
