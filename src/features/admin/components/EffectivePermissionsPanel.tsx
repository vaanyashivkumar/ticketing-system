import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { Session } from '@domain/types/auth.types';
import { MOCK_USERS } from '@config/mockUsers.config';
import { effectivePermissionsFor } from '@domain/admin/effectivePermissions';

/**
 * Effective permissions for one identity (B06 §Effective Permission Engine).
 *
 * The point is the REASON column. In a system with stored grants an administrator can read the
 * grant; here every permission is derived, so without an explanation the model is opaque exactly
 * where it matters. "Why can Finance not close this ticket?" has a precise answer, and until now
 * the only place it was written down was `can.ts`.
 *
 * It computes through `resolveStaticPermissions` — the same function the route guards call — so
 * this panel cannot drift from the system it describes. A viewer that disagrees with the engine
 * would be worse than none: it would be believed.
 */
export function EffectivePermissionsPanel({ currentSession }: { readonly currentSession: Session }) {
  const [userId, setUserId] = useState(currentSession.user.id);

  const result = useMemo(() => {
    const user = MOCK_USERS.find((u) => u.id === userId) ?? currentSession.user;
    // A synthetic session for the SELECTED identity. Read-only and never stored — the panel
    // answers "what would this person hold", which is a question about configuration, not a
    // session that could be acted with.
    return effectivePermissionsFor({ user, authenticatedAt: currentSession.authenticatedAt });
  }, [userId, currentSession]);

  return (
    <>
      <label className="mb-3 block max-w-sm">
        <span className="mb-1 block text-label text-text">Show effective permissions for</span>
        <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          {MOCK_USERS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} — {u.departmentCode}
              {u.role.capabilities.includes('SUPER_ADMIN') ? ' (administrator)' : ''}
            </option>
          ))}
        </select>
      </label>

      <p className="mb-3 text-body-sm text-text-secondary">
        <strong className="text-text">{result.userName}</strong> holds{' '}
        <strong className="text-text">{result.grantedCount}</strong> of {result.staticPermissions.length}{' '}
        identity-level permissions, from {result.departmentName}
        {result.isSysadmin ? ' plus the system-administration capability' : ''}. There are no per-user overrides
        and no role hierarchy — every one of these comes from exactly one rule.
      </p>

      <div className="table-shell overflow-x-auto" role="region" aria-label="Effective permissions" tabIndex={0}>
        <table className="w-full text-table">
          <caption className="sr-only">Identity-level permissions for {result.userName}, with the reason for each</caption>
          {/* `text-text-secondary` pins AA contrast back over `.th`'s muted token — see the note
              in AuditLogsPage. Remove once globals.css raises the `.th` colour. */}
          <thead>
            <tr className="border-b border-border">
              <th className="th text-text-secondary">Permission</th>
              <th className="th text-text-secondary">Held</th>
              <th className="th text-text-secondary">Why</th>
            </tr>
          </thead>
          <tbody>
            {result.staticPermissions.map(({ entry, granted, reason }) => (
              <tr key={entry.id} className="border-b border-border align-top last:border-0 row-hover">
                <td className="td">
                  <span className="text-body-sm text-text">{entry.name}</span>
                  <code className="block font-mono text-caption text-text-muted">{entry.id}</code>
                </td>
                <td className="td">
                  {/* Word plus icon. A tick alone is colour-and-shape only, and "granted"/"not
                      granted" is what a screen reader needs to hear. */}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm ${
                      granted ? 'bg-success-bg text-success-text' : 'bg-surface-sunken text-text-secondary'
                    }`}
                  >
                    {granted ? <Check size={11} aria-hidden /> : <X size={11} aria-hidden />}
                    {granted ? 'Granted' : 'Not granted'}
                  </span>
                </td>
                <td className="td text-caption text-text-secondary">{reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-caption text-text-muted">
        Ticket actions are <strong>not</strong> listed as held or not held, because they are not standing rights:
        the same person may close one ticket and not the one beside it. They are computed per ticket from the route
        relationship, and are listed with their rules in the catalogue above.
      </p>
    </>
  );
}
