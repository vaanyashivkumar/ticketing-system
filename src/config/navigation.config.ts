import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  PlusCircle,
  Ticket,
  CalendarDays,
  Inbox,
  Bell,
  BarChart3,
  Users,
  ShieldCheck,
  Tags,
  Timer,
  ScrollText,
  SlidersHorizontal,
} from 'lucide-react';
import type { StaticPermission } from '@domain/types/auth.types';

/**
 * Navigation configuration — the single source of truth for the sidebar (P12 §7).
 * The sidebar is GENERATED from this + the Permission Engine: each item declares the
 * static permission it needs, and is shown only if the session holds it. No role-name
 * checks in the component. Mirrors the 15 canonical pages (INFORMATION_ARCHITECTURE §17).
 */
export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly icon: LucideIcon;
  readonly permission: StaticPermission;
}

export interface NavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'work',
    label: 'Work',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard, permission: 'VIEW_DASHBOARD' },
      { id: 'create', label: 'Create Ticket', path: '/app/tickets/new', icon: PlusCircle, permission: 'CREATE_TICKET' },
      { id: 'my-tickets', label: 'My Tickets', path: '/app/tickets', icon: Ticket, permission: 'VIEW_MY_TICKETS' },
      // Leave module — every authenticated user can apply, so it is gated by the base CREATE_TICKET
      // right (no new permission introduced, per the "every permission must have a consumer" rule).
      { id: 'leave', label: 'Leave', path: '/app/leave', icon: CalendarDays, permission: 'CREATE_TICKET' },
      // Department Queue: destination departments only (Academics/HR/Finance).
      { id: 'queue', label: 'Department Queue', path: '/app/queue', icon: Inbox, permission: 'VIEW_DEPARTMENT_QUEUE' },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { id: 'notifications', label: 'Notifications', path: '/app/notifications', icon: Bell, permission: 'VIEW_NOTIFICATIONS' },
      { id: 'reports', label: 'Reports', path: '/app/reports', icon: BarChart3, permission: 'VIEW_REPORTS' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { id: 'admin-overview', label: 'Overview', path: '/admin', icon: ShieldCheck, permission: 'VIEW_AUDIT_LOGS' },
      { id: 'users', label: 'User Management', path: '/admin/users', icon: Users, permission: 'MANAGE_USERS' },
      { id: 'roles', label: 'Roles & Permissions', path: '/admin/roles', icon: ShieldCheck, permission: 'MANAGE_ROLES' },
      { id: 'categories', label: 'Category Management', path: '/admin/categories', icon: Tags, permission: 'MANAGE_CATEGORIES' },
      { id: 'sla', label: 'SLA Management', path: '/admin/sla', icon: Timer, permission: 'MANAGE_SLA' },
      { id: 'audit', label: 'Audit Logs', path: '/admin/audit', icon: ScrollText, permission: 'VIEW_AUDIT_LOGS' },
      { id: 'system', label: 'System Configuration', path: '/admin/system', icon: SlidersHorizontal, permission: 'SYSTEM_CONFIGURATION' },
    ],
  },
];
