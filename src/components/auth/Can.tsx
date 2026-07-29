import type { ReactNode } from 'react';
import type { StaticPermission } from '@domain/types/auth.types';
import { usePermissions } from '@hooks/usePermissions';

/**
 * Declarative feature-level authorization (P12 §11). Renders children only if the
 * session holds the static permission. Components gate actions by asking the engine,
 * never by inspecting the role. (Ticket-scoped gating uses usePermissions().canOnTicket.)
 */
export function Can({
  permission,
  children,
  fallback = null,
}: {
  permission: StaticPermission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { can } = usePermissions();
  return <>{can(permission) ? children : fallback}</>;
}
