import { api, setToken, loadToken } from './client';
import { DEPARTMENTS } from '@config/departments.config';
import type { Session, User, DepartmentCode, Capability } from '@domain/types/auth.types';

/**
 * Authentication against the real backend.
 *
 * The signature difference from the prototype is the whole point and must not be smoothed over:
 * `authenticate(userId)` became `login(email, password)`. The mock was identity SELECTION; this is
 * credential VERIFICATION. BACKEND_HANDOFF §4 anticipated exactly this ("materially different
 * input shape, not merely an async version of the mock").
 */

type ApiUser = {
  id: string; name: string; email: string; avatarInitials: string;
  departmentCode: string; capabilities: string[];
};

/**
 * The API returns a department CODE; the SPA's `User` also carries `departmentId` and a nested
 * `role`. Both are derivable from the code via the ratified department config, so the server does
 * not need to send them — and deriving locally keeps `DEPARTMENTS` the single source of truth for
 * what a department *is*.
 */
function toUser(u: ApiUser): User {
  const code = u.departmentCode as DepartmentCode;
  const departmentId = DEPARTMENTS[code].id;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarInitials: u.avatarInitials,
    departmentCode: code,
    departmentId,
    role: {
      departmentId,
      departmentCode: code,
      capabilities: u.capabilities as Capability[],
    },
  };
}

export const AuthApi = {
  /** Real credential exchange. Stores the bearer token on success. */
  async login(email: string, password: string): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
    const r = await api.post<{ token: string; user: ApiUser }>('/auth/login', { email, password });
    if (!r.ok) return { ok: false, error: r.error };
    setToken(r.value.token);
    return { ok: true, session: { user: toUser(r.value.user), authenticatedAt: new Date().toISOString() } };
  },

  /**
   * Re-establish a session on boot. The server re-validates the token AND re-checks that the
   * account is still active on every request, so a deactivated user's open tab is ended here
   * rather than being trusted because it once signed in.
   */
  async restore(): Promise<Session | null> {
    if (!loadToken()) return null;
    const r = await api.get<{ user: ApiUser }>('/auth/session');
    if (!r.ok) return null;
    return { user: toUser(r.value.user), authenticatedAt: new Date().toISOString(), restored: true };
  },

  /** Revokes SERVER-SIDE, then clears locally. Clearing alone would leave a usable token. */
  async logout(): Promise<void> {
    if (loadToken()) await api.post('/auth/logout');
    setToken(null);
  },
};
