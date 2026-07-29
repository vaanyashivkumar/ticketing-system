import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthenticatedLayout } from '@layouts/AuthenticatedLayout';
import { RouteGuard } from '@components/auth/RouteGuard';
import { LoginPage } from '@features/auth/LoginPage';
import { LandingPage } from '@features/landing/LandingPage';
import { UnauthorizedPage } from '@features/auth/UnauthorizedPage';
import { CreateTicketPage } from '@features/tickets/CreateTicketPage';
import { MyTicketsPage } from '@features/tickets/MyTicketsPage';
import { DepartmentQueuePage } from '@features/tickets/DepartmentQueuePage';
import { TicketDetailsPage } from '@features/tickets/TicketDetailsPage';
import { DashboardPage } from '@features/dashboard/DashboardPage';
import { LeavePage } from '@features/leave/LeavePage';
import { NotificationsPage } from '@features/notifications/NotificationsPage';
import { ReportsPage } from '@features/reports/ReportsPage';
import { AdminOverviewPage } from '@features/admin/AdminOverviewPage';
import { UserManagementPage } from '@features/admin/UserManagementPage';
import { RolesPermissionsPage } from '@features/admin/RolesPermissionsPage';
import { CategoryManagementPage } from '@features/admin/CategoryManagementPage';
import { SlaManagementPage } from '@features/admin/SlaManagementPage';
import { AuditLogsPage } from '@features/admin/AuditLogsPage';
import { SystemConfigPage } from '@features/admin/SystemConfigPage';
import { PagePlaceholder } from '@components/common/PagePlaceholder';
import type { StaticPermission } from '@domain/types/auth.types';
import { FileQuestion } from 'lucide-react';

/** Wrap a route element in a permission guard (P12 §10 Route Guard Engine). */
const guard = (element: ReactNode, permission?: StaticPermission): ReactNode => (
  <RouteGuard {...(permission ? { requirePermission: permission } : {})}>{element}</RouteGuard>
);

// On GitHub Pages the app is served from a sub-path (/<repo>/); Vite's BASE_URL carries it and the
// router must match routes against it too. Resolves to '/' in dev and on Vercel (root).
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  // The public front door (2026-07-22): the organisation's landing page, not a blind redirect.
  // Signed-in visitors get an "Open dashboard" CTA there; deep links to /app/* still guard.
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },

  {
    path: '/app',
    element: guard(<AuthenticatedLayout />),
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'tickets', element: <MyTicketsPage /> },
      { path: 'tickets/new', element: <CreateTicketPage /> },
      { path: 'tickets/:id', element: <TicketDetailsPage /> },
      // Leave module (ratified Constitution amendment, 2026-07-24): balance, applications and the
      // Line manager → HR → MD approval chain. Available to every authenticated user.
      { path: 'leave', element: <LeavePage /> },
      // Destination departments only — pure requesters get a 403 on deep-link.
      { path: 'queue', element: guard(<DepartmentQueuePage />, 'VIEW_DEPARTMENT_QUEUE') },
      { path: 'notifications', element: <NotificationsPage /> },
      { path: 'reports', element: guard(<ReportsPage />, 'VIEW_REPORTS') },
      // Profile and Settings are deliberately ABSENT (D01).
      // Profile: no business decision exists to support yet — identity is mocked, department is
      // config-assigned and must never be user-editable (it drives route-derived permissions), and
      // no per-user preference model exists. It returns when real auth does.
      // Settings: retired. Theme already lives in the Header as a one-click toggle, and the
      // sysadmin System Config it was earmarked for is now at /admin/system behind
      // SYSTEM_CONFIGURATION — /app/settings was nav-gated by VIEW_PROFILE (everyone) and its
      // route carried NO guard, so building the recorded plan there would have leaked org config
      // and feature flags to every user.
    ],
  },

  {
    path: '/admin',
    element: guard(<AuthenticatedLayout />),
    children: [
      // The index was an unguarded redirect to User Management, so /admin had no page of its own
      // and no screen answered "is the configuration sound?". It is now the Administration
      // overview, guarded like every other admin route — an index that redirected past its own
      // guard was also the one route here without one.
      { index: true, element: guard(<AdminOverviewPage />, 'VIEW_AUDIT_LOGS') },
      { path: 'users', element: guard(<UserManagementPage />, 'MANAGE_USERS') },
      { path: 'roles', element: guard(<RolesPermissionsPage />, 'MANAGE_ROLES') },
      { path: 'categories', element: guard(<CategoryManagementPage />, 'MANAGE_CATEGORIES') },
      { path: 'sla', element: guard(<SlaManagementPage />, 'MANAGE_SLA') },
      { path: 'audit', element: guard(<AuditLogsPage />, 'VIEW_AUDIT_LOGS') },
      { path: 'system', element: guard(<SystemConfigPage />, 'SYSTEM_CONFIGURATION') },
    ],
  },

  {
    path: '*',
    element: (
      // `main`, not `div` (A11Y-005): the routes outside AppShell get no landmark from the shell,
      // so their whole content sat outside any landmark and "skip to main" had nothing to skip to.
      <main className="flex h-screen items-center justify-center bg-bg">
        <PagePlaceholder title="Page not found" icon={FileQuestion} description="This route does not exist." />
      </main>
    ),
  },
], { basename });
