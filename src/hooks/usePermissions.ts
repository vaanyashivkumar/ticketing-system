import { useAuthStore } from '@stores/authStore';
import type { StaticPermission, TicketAuthView, TicketPermission } from '@domain/types/auth.types';
import { canOnTicket } from '@domain/permission/can';

/**
 * Permission access for components. Components ask "can I do X?" — never "is the user Finance?".
 * `can` covers static (identity-level) permissions; `canOnTicket` is route-derived per ticket.
 */
export function usePermissions() {
  const session = useAuthStore((s) => s.session);
  const can = useAuthStore((s) => s.can);

  return {
    can: (permission: StaticPermission): boolean => can(permission),
    canOnTicket: (verb: TicketPermission, ticket: TicketAuthView): boolean =>
      session ? canOnTicket(session, verb, ticket) : false,
  };
}
