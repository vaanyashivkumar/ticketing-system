import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { StaticPermission } from '@domain/types/auth.types';
import { useAuthStore } from '@stores/authStore';
import { AuthService } from '@services/AuthService';

/**
 * Route Guard Engine (P12 §5/§10/§14). Decides access BEFORE the page renders, so
 * unauthorised users never see protected content. Authorization is asked of the
 * Permission Engine, never a role-name check.
 */
export function RouteGuard({
  children,
  requirePermission,
}: {
  children: ReactNode;
  requirePermission?: StaticPermission;
}) {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const can = useAuthStore((s) => s.can);
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg text-body text-text-muted">
        Loading…
      </div>
    );
  }

  // Not authenticated → login, preserving intended destination.
  if (status !== 'authenticated' || !session) {
    return <Navigate to="/login" replace state={{ returnTo: location.pathname }} />;
  }

  // Authenticated but lacking the required permission → graceful 403 (no crash, no leak).
  if (requirePermission && !can(requirePermission)) {
    AuthService.recordUnauthorized(session.user.id, location.pathname);
    return <Navigate to="/unauthorized" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
