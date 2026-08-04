import type { Session, StaticPermission } from '@domain/types/auth.types';
import { DEPARTMENTS } from '@config/departments.config';
import { resolveStaticPermissions } from '@domain/permission/can';
import { PERMISSION_CATALOGUE, DERIVATION_LABEL, type PermissionEntry } from '@config/permissionCatalogue';

/**
 * EFFECTIVE PERMISSION ENGINE (B06 §Effective Permission Engine).
 *
 * B06: "Provide a clear view showing Granted / Denied / Inherited / Explicit permissions and the
 * SOURCE of each. Avoid hidden or unexplained permission behaviour."
 *
 * That last sentence is the whole reason this exists. In a system where permissions are STORED,
 * an administrator can read the grant and see why. In this one they are DERIVED, so without an
 * explanation the model is opaque precisely where it matters — "why can Finance not close this?"
 * has an answer, and until now the only place it was written down was source code.
 *
 * Two of B06's four buckets do not exist here and are not faked:
 *   - **Inherited** — there is no role hierarchy to inherit through.
 *   - **Explicit** — there are no per-user overrides. Every static permission a user holds comes
 *     from exactly one of three rules, and `reason` names which.
 *
 * TICKET permissions are deliberately excluded from the "granted/denied" answer. They are not
 * standing rights: `CLOSE_TICKET` is held on tickets you raised and not on the one beside it, so
 * a single yes/no would be false either way. They are listed with their rule instead.
 */

export interface EffectiveStaticPermission {
  readonly entry: PermissionEntry;
  readonly granted: boolean;
  /** Why — in the same words for a grant and a refusal, so the model reads consistently. */
  readonly reason: string;
}

export interface EffectivePermissions {
  readonly userName: string;
  readonly departmentName: string;
  readonly isSysadmin: boolean;
  readonly isDestination: boolean;
  readonly staticPermissions: readonly EffectiveStaticPermission[];
  /** Route-derived verbs, which cannot be answered without naming a specific ticket. */
  readonly ticketPermissions: readonly PermissionEntry[];
  readonly grantedCount: number;
}

export function effectivePermissionsFor(session: Session): EffectivePermissions {
  const dept = DEPARTMENTS[session.user.departmentCode];
  const isSysadmin = session.user.role.capabilities.includes('SUPER_ADMIN');
  // The SAME function the guards call. Recomputing the rule here would be a second answer to the
  // question, and a viewer that disagrees with the system it describes is worse than no viewer.
  const held = resolveStaticPermissions(session);

  const staticPermissions = PERMISSION_CATALOGUE.filter((p) => p.kind === 'static').map<EffectiveStaticPermission>(
    (entry) => {
      const granted = held.has(entry.id as StaticPermission);
      return {
        entry,
        granted,
        reason: explain(entry, granted, dept.name, isSysadmin, dept.isDestination),
      };
    },
  );

  return {
    userName: session.user.name,
    departmentName: dept.name,
    isSysadmin,
    isDestination: dept.isDestination,
    staticPermissions,
    ticketPermissions: PERMISSION_CATALOGUE.filter((p) => p.kind === 'ticket'),
    grantedCount: staticPermissions.filter((p) => p.granted).length,
  };
}

function explain(
  entry: PermissionEntry,
  granted: boolean,
  departmentName: string,
  isSysadmin: boolean,
  isDestination: boolean,
): string {
  switch (entry.derivation) {
    case 'base':
      return granted
        ? 'Granted to every authenticated user.'
        : 'Should be held by every authenticated user — if it is not, the permission engine and this catalogue disagree.';
    case 'destination-department':
      return isDestination
        ? `Granted because ${departmentName} receives tickets.`
        : `Not granted: nothing routes to ${departmentName}, so there is no queue to view.`;
    case 'sysadmin-capability':
      return isSysadmin
        ? 'Granted by the system-administration capability.'
        : 'Not granted: this account does not hold the system-administration capability. It is granted per user, not by department.';
    case 'route-relationship':
      return DERIVATION_LABEL['route-relationship'];
    /**
     * Answered from `granted` rather than a new parameter: whether this account is the manager
     * IS the grant, so threading the fact separately would be a second place to get it wrong.
     */
    case 'department-manager':
      return granted
        ? `Granted because this account is ${departmentName}’s line manager.`
        : `Not granted: this account is not ${departmentName}’s line manager. It follows the department’s manager, so it moves with a reassignment rather than being held.`;
  }
}
