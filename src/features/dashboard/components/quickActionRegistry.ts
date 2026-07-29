import type { LucideIcon } from 'lucide-react';
import { PlusCircle, Inbox, Bell, BarChart3, Users, ScrollText, ListChecks } from 'lucide-react';
import type { Session, StaticPermission } from '@domain/types/auth.types';
import { canStatic } from '@domain/permission/can';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * QUICK ACTIONS (B05 §Quick Action Engine) — a permission-aware registry, not a hand-written row
 * of links.
 *
 * Every action declares the static permission it needs and is hidden when the session does not
 * hold it. "Hide when unauthorized" rather than disable: a greyed-out control tells a user a
 * capability exists that they cannot have, which is a disclosure and not something they can act
 * on.
 *
 * B05: "Avoid adding quick actions that do not perform meaningful work." Every entry leads to a
 * real route that does something. There is deliberately no "Assign Ticket" or "Review Approval
 * Requests" action — assignment happens on a specific ticket (you cannot assign in the abstract),
 * and there is no approval workflow in this system to review.
 */

export interface QuickAction {
  readonly id: string;
  readonly label: string;
  readonly to: string;
  readonly icon: LucideIcon;
  readonly permission?: StaticPermission;
  /** Only for departments that receive tickets — a queue link for Sales would go nowhere useful. */
  readonly destinationOnly?: boolean;
  readonly primary?: boolean;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'create', label: 'Create ticket', to: '/app/tickets/new', icon: PlusCircle, permission: 'CREATE_TICKET', primary: true },
  { id: 'queue', label: 'Open queue', to: '/app/queue', icon: Inbox, permission: 'VIEW_DEPARTMENT_QUEUE', destinationOnly: true },
  { id: 'mine', label: 'My tickets', to: '/app/tickets', icon: ListChecks, permission: 'VIEW_MY_TICKETS' },
  { id: 'notifications', label: 'Notifications', to: '/app/notifications', icon: Bell, permission: 'VIEW_NOTIFICATIONS' },
  { id: 'reports', label: 'Reports', to: '/app/reports', icon: BarChart3, permission: 'VIEW_REPORTS' },
  { id: 'users', label: 'Manage users', to: '/admin/users', icon: Users, permission: 'MANAGE_USERS' },
  { id: 'audit', label: 'Audit log', to: '/admin/audit', icon: ScrollText, permission: 'VIEW_AUDIT_LOGS' },
];

export function permittedQuickActions(session: Session): readonly QuickAction[] {
  const isDestination = DEPARTMENTS[session.user.departmentCode].isDestination;
  return QUICK_ACTIONS.filter(
    (a) => (!a.destinationOnly || isDestination) && (!a.permission || canStatic(session, a.permission)),
  );
}
