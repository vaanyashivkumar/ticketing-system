import type { Session, User } from '@domain/types/auth.types';
import { mockUserById } from '@config/mockUsers.config';
import { resolveStaticPermissions } from '@domain/permission/can';
import { StorageAdapter } from './storage/localStorageAdapter';
import { AuditService } from './AuditService';
import { UserService } from './userService';

/**
 * AuthService — mock authentication (P12 §3/§4/§15). Identity only; authorization is the
 * Permission Engine's job. Framework-independent; no React, no UI. A future JWT/OAuth/SSO
 * provider replaces THIS module's internals with zero change to callers (§15).
 *
 * "Credential validation" is mocked: selecting a seeded identity IS the sign-in. No password.
 */
const SESSION_DOMAIN = 'session';

function buildSession(user: User, restored: boolean): Session {
  return { user, authenticatedAt: new Date().toISOString(), restored };
}

export const AuthService = {
  /** Mock sign-in by seeded user id. Returns the session, or null if unknown OR deactivated. */
  authenticate(userId: string): Session | null {
    const user = mockUserById(userId);
    if (!user) return null;

    // A deactivated account may not sign in (D04 #36). Identity is SEEDED from config, but the
    // active state is an administrative OVERRIDE — reading config alone made the admin's
    // deactivation a no-op. Audited, so a refused attempt is visible rather than silent.
    if (!UserService.isActive(userId)) {
      AuditService.record('UNAUTHORIZED_ATTEMPT', userId, 'sign-in refused — account deactivated');
      return null;
    }

    const session = buildSession(user, false);
    StorageAdapter.write<Session>(SESSION_DOMAIN, session);

    // Audit the full P12 §2 sequence: identity → role → permissions.
    AuditService.record('LOGIN', user.id, user.email);
    AuditService.record('ROLE_LOADED', user.id, `${user.departmentCode}${user.role.capabilities.length ? ' +SUPER_ADMIN' : ''}`);
    AuditService.record('PERMISSION_LOADED', user.id, `${resolveStaticPermissions(session).size} static permissions`);
    return session;
  },

  logout(actorId: string | null): void {
    StorageAdapter.remove(SESSION_DOMAIN);
    AuditService.record('LOGOUT', actorId);
  },

  /** Restore a persisted session on app boot (P12 §4 session restore, §13 persistence). */
  restore(): Session | null {
    const stored = StorageAdapter.read<Session>(SESSION_DOMAIN);
    if (!stored?.user) return null;
    // Re-validate the identity still exists in config (guards against stale storage) AND is
    // still active — otherwise deactivation would only bite at the next sign-in, leaving an
    // already-open session running indefinitely with full rights (D04 #36).
    const user = mockUserById(stored.user.id);
    if (!user || !UserService.isActive(stored.user.id)) {
      StorageAdapter.remove(SESSION_DOMAIN);
      if (user) AuditService.record('UNAUTHORIZED_ATTEMPT', user.id, 'session ended — account deactivated');
      return null;
    }
    const session = buildSession(user, true);
    AuditService.record('SESSION_RESTORED', user.id);
    return session;
  },

  recordUnauthorized(actorId: string | null, attemptedPath: string): void {
    AuditService.record('UNAUTHORIZED_ATTEMPT', actorId, attemptedPath);
  },
};
