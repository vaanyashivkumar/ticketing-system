import { create } from 'zustand';
import { StorageAdapter } from '@services/storage/localStorageAdapter';
import { USE_API } from '@config/runtime.config';
import { RoleApi } from '@services/api/roleApi';
import { SYSTEM_ROLES } from '@config/roles.config';
import type { Role, RoleDraft } from '@domain/types/role.types';
import type { StaticPermission, TicketPermission } from '@domain/types/auth.types';

/**
 * ROLES AND THEIR ASSIGNMENTS — dual-mode, like every other store here.
 *
 * Roles are DATA, not config: administrators create and delete them at runtime, so they live in a
 * store and a table rather than a `config/` module that ships with the build. `SYSTEM_ROLES` is the
 * seed, not the vocabulary.
 *
 * ── THE RULE THAT KEEPS THIS HONEST ───────────────────────────────────────────────────────────
 * The SERVER is authoritative in API mode. This store is how the screens read and write, never how
 * a permission is decided: `resolveGrants` feeds the session, and the API re-resolves the same
 * grants independently on every request. B06 shipped a page that wrote to localStorage and told the
 * user "Saved · versioned · audited" while the server was untouched; a role that only the browser
 * believes in would be that defect again, with authorisation instead of SLA policy.
 */

const ROLES_KEY = 'roles';
const ASSIGNMENTS_KEY = 'roleAssignments';

/** userId → role ids. Kept separate from the roles themselves so deleting a role is one write. */
type Assignments = Record<string, string[]>;

function loadRoles(): Role[] {
  const stored = StorageAdapter.read<Role[]>(ROLES_KEY);
  if (stored) {
    // System roles are re-merged every load: they describe how the software works, so a stale copy
    // in storage must never outlive a change to the built-ins.
    const custom = stored.filter((r) => !r.isSystem);
    return [...SYSTEM_ROLES, ...custom];
  }
  StorageAdapter.write(ROLES_KEY, [...SYSTEM_ROLES]);
  return [...SYSTEM_ROLES];
}

const loadAssignments = (): Assignments => StorageAdapter.read<Assignments>(ASSIGNMENTS_KEY) ?? {};

interface RoleState {
  roles: Role[];
  assignments: Assignments;
  loading: boolean;
  loadError: string | null;
  load: () => Promise<void>;
  createRole: (draft: RoleDraft) => Promise<Role | null>;
  deleteRole: (roleId: string) => Promise<boolean>;
  assignRoles: (userId: string, roleIds: readonly string[]) => Promise<void>;
  rolesFor: (userId: string) => Role[];
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: USE_API ? [] : loadRoles(),
  assignments: USE_API ? {} : loadAssignments(),
  loading: USE_API,
  loadError: null,

  load: async () => {
    if (!USE_API) {
      set({ roles: loadRoles(), assignments: loadAssignments(), loading: false, loadError: null });
      return;
    }
    set({ loading: true });
    const r = await RoleApi.overview();
    if (r.ok) set({ roles: r.value.roles, assignments: r.value.assignments, loading: false, loadError: null });
    else set({ loading: false, loadError: r.error });
  },

  createRole: async (draft) => {
    if (USE_API) {
      const r = await RoleApi.create(draft);
      if (!r.ok) return null;
      await get().load();
      return r.value.role;
    }
    const role: Role = {
      ...draft,
      id: `role-${Date.now()}`,
      isSystem: false,
      createdAt: new Date().toISOString(),
    };
    const next = [...get().roles, role];
    StorageAdapter.write(ROLES_KEY, next.filter((x) => !x.isSystem));
    set({ roles: next });
    return role;
  },

  deleteRole: async (roleId) => {
    // A built-in describes how the software works; deleting one would leave the screen unable to
    // explain itself. Refused in both modes, and the server refuses it again.
    if (SYSTEM_ROLES.some((r) => r.id === roleId)) return false;
    if (USE_API) {
      const r = await RoleApi.remove(roleId);
      if (r.ok) await get().load();
      return r.ok;
    }
    const roles = get().roles.filter((r) => r.id !== roleId);
    // Assignments are cleaned in the same write: a dangling role id would resolve to no grants,
    // which LOOKS like a permission bug rather than a deleted role.
    const assignments: Assignments = Object.fromEntries(
      Object.entries(get().assignments).map(([uid, ids]) => [uid, ids.filter((id) => id !== roleId)]),
    );
    StorageAdapter.write(ROLES_KEY, roles.filter((x) => !x.isSystem));
    StorageAdapter.write(ASSIGNMENTS_KEY, assignments);
    set({ roles, assignments });
    return true;
  },

  assignRoles: async (userId, roleIds) => {
    if (USE_API) {
      const r = await RoleApi.assign(userId, roleIds);
      if (r.ok) await get().load();
      return;
    }
    const assignments = { ...get().assignments, [userId]: [...roleIds] };
    StorageAdapter.write(ASSIGNMENTS_KEY, assignments);
    set({ assignments });
  },

  rolesFor: (userId) => {
    const ids = get().assignments[userId] ?? [];
    return get().roles.filter((r) => ids.includes(r.id));
  },
}));

/**
 * A user's assigned roles flattened into the two grant lists the session carries.
 *
 * Exported as a plain function over explicit inputs — NOT reading the store — so the auth store can
 * call it and tests can exercise it without mounting anything. The permission engine never sees
 * this; it only ever sees the resolved arrays on the session.
 */
export function resolveGrants(
  roles: readonly Role[],
  assignments: Readonly<Record<string, readonly string[]>>,
  userId: string,
): { grantedStatic: StaticPermission[]; grantedTicket: TicketPermission[] } {
  const ids = assignments[userId] ?? [];
  const mine = roles.filter((r) => ids.includes(r.id));
  return {
    grantedStatic: [...new Set(mine.flatMap((r) => r.staticPermissions))],
    grantedTicket: [...new Set(mine.flatMap((r) => r.ticketPermissions))],
  };
}

/** Read the current grants for a user without subscribing — for session assembly. */
export function currentGrantsFor(userId: string) {
  const { roles, assignments } = useRoleStore.getState();
  return resolveGrants(roles, assignments, userId);
}
