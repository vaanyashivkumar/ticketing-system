import { api } from './client';
import type { Role, RoleDraft, UserDraft } from '@domain/types/role.types';

/**
 * Roles and user administration API client.
 *
 * The server is authoritative: it re-resolves a caller's grants on every request and refuses to
 * delete a system role or the last administrator. These calls carry no permission claims of their
 * own — the browser asks, the server decides.
 */

export interface RoleOverview {
  roles: Role[];
  /** userId → role ids. */
  assignments: Record<string, string[]>;
}

export const RoleApi = {
  overview: () => api.get<RoleOverview>('/roles'),
  create: (draft: RoleDraft) => api.post<{ role: Role }>('/roles', draft),
  remove: (roleId: string) => api.del<{ ok: true }>(`/roles/${roleId}`),
  assign: (userId: string, roleIds: readonly string[]) =>
    api.put<{ ok: true }>(`/roles/assignments/${userId}`, { roleIds }),
};

export const AdminUserApi = {
  create: (draft: UserDraft) => api.post<{ user: { id: string } }>('/admin/users', draft),
  /**
   * Two calls, never one, and that is the point: deactivation and deletion are separate decisions
   * (stakeholder, 2026-08-04). Deactivating ends live sessions and strips capabilities immediately
   * and is reversible; deleting is not, and the server refuses it unless the account is already
   * inactive — so nobody can remove a working account in a single click.
   */
  remove: (userId: string) => api.del<{ ok: true }>(`/admin/users/${userId}`),
};
