import { ShieldCheck, Info } from 'lucide-react';
import { DEPARTMENTS } from '@config/departments.config';
import { BASE_STATIC_PERMISSIONS, DESTINATION_STATIC_PERMISSIONS, SYSADMIN_STATIC_PERMISSIONS } from '@config/permissions.config';
import { UserService } from '@services/userService';
import { useAuth } from '@hooks/useAuth';
import { PageHeader } from '@components/common/PageHeader';
import { PermissionCatalogue } from './components/PermissionCatalogue';
import { EffectivePermissionsPanel } from './components/EffectivePermissionsPanel';

/**
 * Roles & Permissions (P15 §3/§4) — an INSPECTION surface.
 *
 * Honest reconciliation: P15 §3/§4 assume an editable role→permission table. This system
 * does not have one, by ratified design: ticket permissions are DERIVED from the actor's
 * relationship to a ticket's ROUTE (source / destination / creator / assignee), and static
 * permissions are derived from department + the sysadmin capability. There is nothing to
 * "edit" per role without changing the routing matrix (Categories) or the capability grant
 * (Users). Editable custom roles are future work and are shown as such — not faked here.
 */
const GROUPS = [
  { name: 'Granted to every authenticated user', perms: BASE_STATIC_PERMISSIONS, note: 'Reports are scope-clamped at the data layer (own / hub / global).' },
  { name: 'Granted to destination departments', perms: DESTINATION_STATIC_PERMISSIONS, note: 'Academics, HR and Finance receive tickets, so they hold a Department Queue.' },
  { name: 'Granted with the SUPER_ADMIN capability', perms: SYSADMIN_STATIC_PERMISSIONS, note: 'Governance only — the sysadmin never adjudicates another department’s ticket.' },
];

const TICKET_VERBS: { verb: string; holder: string }[] = [
  { verb: 'View ticket', holder: 'Source department · Destination department · Sysadmin' },
  { verb: 'Create / Submit / Edit draft', holder: 'Requester (creator)' },
  { verb: 'Assign · Re-assign · Request information · Reject', holder: 'Destination department' },
  // Re-assign is a non-status audited write (BDM §1118) — it moves the ticket without touching
  // the SLA clock, which is why it is not one of the 23 transition edges.
  { verb: 'Start · Resolve', holder: 'Assignee (a destination member holding the ticket)' },
  { verb: 'Provide information (un-pauses the SLA clock)', holder: 'Requester only' },
  { verb: 'Close · Cancel · Reopen', holder: 'Requester only — the destination never closes' },
];

export function RolesPermissionsPage() {
  const users = UserService.all();
  const { session } = useAuth();

  return (
    <section>
      <PageHeader icon={ShieldCheck} title="Roles & Permissions" description="How authorisation is derived across the platform." />

      <div className="mb-5 flex items-start gap-2 rounded-md border border-info bg-info-bg px-3 py-2 text-body-sm text-info-text">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Permissions are <strong>derived, not stored per role</strong>. Ticket rights come from the actor’s relationship to the
          ticket’s <strong>route</strong>; static rights from department + capability. To change them you change the routing matrix
          (Category Management) or a capability grant (User Management) — never a role table.
          {' '}
          <strong>
            B06 asks for role creation with per-role permission assignment. That is not built, and not because it
            was missed:
          </strong>{' '}
          the domain model states that “no role-keyed permission table is ever introduced”. Building one would
          reverse a ratified decision, and it would do it by creating exactly the stored-grant table the derived
          model exists to avoid. It needs stakeholder ratification, not a code change.
        </span>
      </div>

      <h2 className="mb-2 text-label uppercase text-text-muted">Departments &amp; capability</h2>
      {/**
       * A11Y-003 — this page is read-only: two tables and prose, and NOT ONE focusable element.
       * That left the app shell's scrolling `<main>` unreachable by keyboard, so the page could not
       * be scrolled at all without a mouse. Making the scrollable tables focusable regions fixes
       * both the tables and the shell, since `main` then contains something focus can land on.
       */}
      <div className="table-shell mb-6 overflow-x-auto" role="region" aria-label="Departments and capability" tabIndex={0}>
        <table className="w-full text-table">
          <thead>
            {/**
             * `.th` carries the column-header treatment. The colour is pinned back to
             * `text-secondary` because the class default (`text-muted`) measures 4.34:1 on
             * `surface-sunken` in the light theme — below AA, the same pairing flagged as A11Y-008
             * in Category Management. Utilities beat the component layer, which is the sanctioned
             * escape hatch; drop the override once `.th` itself is corrected.
             */}
            <tr className="border-b border-border">
              <th className="th text-text-secondary">Department</th>
              <th className="th text-text-secondary">Nature</th>
              <th className="th text-text-secondary">Holds queue</th>
              <th className="th text-text-secondary">Assigned users</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(DEPARTMENTS).map((d) => (
              <tr key={d.code} className="border-b border-border last:border-0">
                <td className="td">{d.name}</td>
                <td className="td text-text-secondary">{d.isDestination ? (d.code === 'FIN' ? 'Hub — receives and raises' : 'Dual — receives and raises') : 'Requester — raises only'}</td>
                <td className="td text-text-secondary">{d.isDestination ? 'Yes' : 'No'}</td>
                <td className="td text-text-secondary">{users.filter((u) => u.departmentCode === d.code).map((u) => u.name).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-label uppercase text-text-muted">Static permissions (identity-level)</h2>
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.name} className="card-p">
            <h3 className="text-body-medium text-text">{g.name}</h3>
            <p className="mb-2 text-caption text-text-muted">{g.note}</p>
            <ul className="space-y-1">
              {g.perms.map((p) => (
                <li key={p}><code className="font-mono text-body-sm text-text-secondary">{p}</code></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-label uppercase text-text-muted">Ticket permissions (route-derived)</h2>
      <div className="table-shell overflow-x-auto" role="region" aria-label="Ticket permissions" tabIndex={0}>
        <table className="w-full text-table">
          <thead>
            {/* `.th` with the same AA colour override as the table above. */}
            <tr className="border-b border-border">
              <th className="th text-text-secondary">Action</th>
              <th className="th text-text-secondary">Who holds it</th>
            </tr>
          </thead>
          <tbody>
            {TICKET_VERBS.map((v) => (
              <tr key={v.verb} className="border-b border-border last:border-0">
                <td className="td">{v.verb}</td>
                <td className="td text-text-secondary">{v.holder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-1 mt-8 text-label uppercase text-text-muted">Permission catalogue</h2>
      <p className="mb-3 text-caption text-text-secondary">
        Every permission in the system, what it allows, how much damage it enables and what actually enforces it.
      </p>
      <PermissionCatalogue />

      <h2 className="mb-1 mt-8 text-label uppercase text-text-muted">Effective permissions</h2>
      <p className="mb-3 text-caption text-text-secondary">
        What one identity actually holds right now, and the rule that produced each answer.
      </p>
      {session && <EffectivePermissionsPanel currentSession={session} />}

    </section>
  );
}
