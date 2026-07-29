import type { Session, User, DepartmentCode } from '@domain/types/auth.types';
import { MOCK_USERS } from '@config/mockUsers.config';
import { StorageAdapter } from './storage/localStorageAdapter';
import { AuditService } from './AuditService';

/**
 * User administration (P15 §2). Users are seeded from configuration; administrative
 * changes persist as OVERRIDES and are audited. There is no hard delete — deactivation
 * only (governance is recoverable and traceable).
 */
const K_USERS = 'admin.users';

export interface UserOverride {
  active?: boolean;
  departmentCode?: DepartmentCode;
}

export interface AdminUser extends User {
  active: boolean;
}

function overrides(): Record<string, UserOverride> {
  return StorageAdapter.read<Record<string, UserOverride>>(K_USERS) ?? {};
}

export const UserService = {
  all(): AdminUser[] {
    const o = overrides();
    return MOCK_USERS.map((u) => ({
      ...u,
      ...(o[u.id]?.departmentCode ? { departmentCode: o[u.id]!.departmentCode! } : {}),
      active: o[u.id]?.active ?? true,
    }));
  },

  byId(id: string): AdminUser | undefined {
    return UserService.all().find((u) => u.id === id);
  },

  /**
   * May this identity hold a session? Consulted by AuthService at sign-in AND at session
   * restore (D04 #36: deactivation used to flip a badge and write an audit entry while the
   * account carried on signing in with full rights — the control governed nothing).
   * Unknown ids are inactive: an identity that does not exist cannot be active.
   */
  isActive(userId: string): boolean {
    return UserService.byId(userId)?.active ?? false;
  },

  /** Activate / deactivate. Guard: never deactivate the last active sysadmin. */
  setActive(userId: string, active: boolean, session: Session): { ok: true } | { ok: false; error: string } {
    const users = UserService.all();
    const target = users.find((u) => u.id === userId);
    if (!target) return { ok: false, error: 'User not found.' };

    if (!active && target.role.capabilities.includes('SUPER_ADMIN')) {
      const otherActiveSysadmins = users.filter(
        (u) => u.id !== userId && u.active && u.role.capabilities.includes('SUPER_ADMIN'),
      );
      if (otherActiveSysadmins.length === 0) {
        return { ok: false, error: 'Cannot deactivate the last active system administrator.' };
      }
    }
    if (!active && userId === session.user.id) {
      return { ok: false, error: 'You cannot deactivate your own account.' };
    }

    const all = overrides();
    StorageAdapter.write(K_USERS, { ...all, [userId]: { ...all[userId], active } });
    AuditService.recordAdmin({
      type: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      actorId: session.user.id,
      actorName: session.user.name,
      departmentCode: session.user.departmentCode,
      entityType: 'user',
      entityId: userId,
      before: JSON.stringify({ active: target.active }),
      after: JSON.stringify({ active }),
    });
    return { ok: true };
  },
};
