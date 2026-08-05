import { useEffect, useMemo, useState } from 'react';
import { UserPlus, UserMinus, ShieldPlus, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { useRoleStore } from '@stores/roleStore';
import { useAuth } from '@hooks/useAuth';
import { MOCK_USERS, titleOf } from '@config/mockUsers.config';
import { DEPARTMENT_LIST, DEPARTMENTS } from '@config/departments.config';
import { UserService } from '@services/userService';
import { AdminUserApi } from '@services/api/roleApi';
import { USE_API } from '@config/runtime.config';
import {
  ASSIGNABLE_STATIC_PERMISSIONS, ASSIGNABLE_TICKET_PERMISSIONS, TICKET_OVERRIDE_WARNINGS,
} from '@config/roles.config';
import { PERMISSION_CATALOGUE } from '@config/permissionCatalogue';
import type { StaticPermission, TicketPermission } from '@domain/types/auth.types';

/**
 * THE GOVERNANCE BAR — add and remove people, assign roles, and build new ones.
 *
 * Restricted to holders of `MANAGE_USERS` / `MANAGE_ROLES`, which today means the two Managing
 * Directors. The page's own banner explains that permissions are derived; this bar is where that
 * model can now be OVERRIDDEN, so the two sit together deliberately rather than on separate
 * screens where the caveat could be read without the consequence.
 *
 * ── WHAT THIS SCREEN REFUSES TO HIDE ──────────────────────────────────────────────────────────
 * Ticket overrides suspend ratified Business Constitution rules — two-step closure, assignee-only
 * resolution. Each one states the rule it breaks AT THE MOMENT OF TICKING, not in documentation
 * somebody reads later, and a role carrying any of them is badged wherever it appears. An
 * administrator is entitled to grant them; they are not entitled to be surprised by them.
 */

type Panel = 'add-user' | 'remove-user' | 'assign' | 'create-role';

const labelFor = (id: string): string =>
  PERMISSION_CATALOGUE.find((p) => p.id === id)?.name ?? id;

export function GovernanceBar() {
  const { session } = useAuth();
  const { roles, assignments, load, createRole, deleteRole, assignRoles, loading, loadError } = useRoleStore();
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { void load(); }, [load]);

  // Add-user form
  const [nu, setNu] = useState({ name: '', email: '', departmentCode: 'SAL', title: '', roleIds: [] as string[] });
  // Assignment form
  const [targetUser, setTargetUser] = useState('');
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  // Role builder
  const [nr, setNr] = useState({
    name: '', description: '',
    staticPermissions: [] as StaticPermission[],
    ticketPermissions: [] as TicketPermission[],
  });

  const users = useMemo(
    () => [...MOCK_USERS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  const toggleIn = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const openAssign = (userId: string) => {
    setTargetUser(userId);
    setTargetRoles([...(assignments[userId] ?? [])]);
  };

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setNote(null);
    try { await fn(); setNote({ kind: 'ok', text: ok }); }
    catch (e) { setNote({ kind: 'err', text: e instanceof Error ? e.message : 'That did not work.' }); }
    finally { setBusy(false); }
  };

  if (!session) return null;

  const tab = (id: Panel, icon: React.ReactNode, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => { setPanel(panel === id ? null : id); setNote(null); }}
      aria-expanded={panel === id}
      className={`btn-neutral ${panel === id ? 'border-primary' : ''}`}
    >
      {icon} {label}
    </button>
  );

  return (
    <section aria-labelledby="gov-h" className="card card-p mt-6">
      <h2 id="gov-h" className="text-h3 text-text">Administration</h2>
      <p className="mt-1 text-body-sm text-text-secondary">
        Add or remove people, change what someone can reach, and define new roles. Every action here
        is written to the audit trail.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {tab('add-user', <UserPlus size={15} aria-hidden />, 'Add user')}
        {tab('remove-user', <UserMinus size={15} aria-hidden />, 'Remove user')}
        {tab('assign', <Check size={15} aria-hidden />, 'Assign roles')}
        {tab('create-role', <ShieldPlus size={15} aria-hidden />, 'Create role')}
      </div>

      {loadError && (
        <p className="mt-3 text-body-sm text-danger-text" role="alert">
          Roles could not be loaded, so nothing here would be accurate. {loadError}
        </p>
      )}
      {note && (
        <p className={`mt-3 text-body-sm ${note.kind === 'ok' ? 'text-success-text' : 'text-danger-text'}`} role="status">
          {note.text}
        </p>
      )}

      {/* ── ADD USER ────────────────────────────────────────────────────────────────────── */}
      {panel === 'add-user' && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">Full name</span>
              <input className="input w-full" value={nu.name} onChange={(e) => setNu({ ...nu, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">Email</span>
              <input type="email" className="input w-full" value={nu.email} onChange={(e) => setNu({ ...nu, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">Department</span>
              <select className="input w-full" value={nu.departmentCode} onChange={(e) => setNu({ ...nu, departmentCode: e.target.value })}>
                {DEPARTMENT_LIST.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">Designation</span>
              <input className="input w-full" placeholder="e.g. Sales Executive" value={nu.title} onChange={(e) => setNu({ ...nu, title: e.target.value })} />
            </label>
          </div>
          <fieldset className="mt-3">
            <legend className="mb-1 text-body-sm text-text">Roles to hand over</legend>
            <div className="flex flex-wrap gap-2">
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-body-sm">
                  <input
                    type="checkbox"
                    checked={nu.roleIds.includes(r.id)}
                    onChange={() => setNu({ ...nu, roleIds: toggleIn(nu.roleIds, r.id) })}
                  />
                  {r.name}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="mt-2 text-caption text-text-muted">
            They sign in with the shared development password until credentials are provisioned
            properly — this build has no invitation email.
          </p>
          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy || !nu.name.trim() || !nu.email.trim()}
            onClick={() => void run(async () => {
              if (!USE_API) throw new Error('Adding people needs the API — localStorage mode has a fixed cast.');
              const r = await AdminUserApi.create(nu);
              if (!r.ok) throw new Error(r.error);
              if (nu.roleIds.length) await assignRoles(r.value.user.id, nu.roleIds);
              setNu({ name: '', email: '', departmentCode: 'SAL', title: '', roleIds: [] });
            }, `${nu.name} was added.`)}
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <UserPlus size={14} aria-hidden />}
            Add user
          </button>
        </div>
      )}

      {/* ── REMOVE USER ─────────────────────────────────────────────────────────────────── */}
      {panel === 'remove-user' && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="flex items-start gap-2 rounded-md bg-warning-bg p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning-text" aria-hidden />
            <p className="text-body-sm text-warning-text">
              Two steps, deliberately. <strong>Deactivate</strong> first — it ends their sessions and
              revokes every capability at once, and it is reversible. Only then can the account be
              deleted, and deletion is refused outright for anyone with ticket history, because that
              history is the record of work they did.
            </p>
          </div>
          <ul className="mt-3 divide-y divide-border">
            {users.map((u) => {
              const active = UserService.isActive(u.id);
              return (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-body-sm text-text">
                    {u.name}
                    <span className="ml-2 text-caption text-text-muted">
                      {titleOf(u.id)} · {DEPARTMENTS[u.departmentCode].name}
                    </span>
                    {!active && (
                      <span className="ml-2 rounded-full bg-surface-sunken px-1.5 py-0.5 text-label-sm text-text-secondary">
                        deactivated
                      </span>
                    )}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="btn-neutral text-caption"
                      disabled={busy || u.id === session.user.id}
                      onClick={() => void run(async () => {
                        // The service refuses to strip the last active administrator; surface its
                        // reason rather than reporting a success that did not happen.
                        const r = UserService.setActive(u.id, !active, session);
                        if (!r.ok) throw new Error(r.error);
                      }, `${u.name} ${active ? 'deactivated' : 'reactivated'}.`)}
                    >
                      {active ? 'Deactivate' : 'Reactivate'}
                    </button>
                    <button
                      type="button"
                      className="btn-danger text-caption"
                      // Enforced on the server too — the UI merely refuses to offer the shortcut.
                      disabled={busy || active || u.id === session.user.id}
                      title={active ? 'Deactivate first' : 'Delete permanently'}
                      onClick={() => void run(async () => {
                        if (!USE_API) throw new Error('Deleting needs the API — localStorage mode has a fixed cast.');
                        const r = await AdminUserApi.remove(u.id);
                        if (!r.ok) throw new Error(r.error);
                      }, `${u.name} was deleted.`)}
                    >
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── ASSIGN ROLES ────────────────────────────────────────────────────────────────── */}
      {panel === 'assign' && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-body-sm text-text-secondary">
            A promotion or a change of duties. Roles <strong>add</strong> to what someone already has
            by virtue of their department, so nobody is locked out of their own work by an
            assignment.
          </p>
          <label className="mt-3 block max-w-sm">
            <span className="mb-1 block text-body-sm text-text">Person</span>
            <select className="input w-full" value={targetUser} onChange={(e) => openAssign(e.target.value)}>
              <option value="">Choose…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} — {titleOf(u.id)}</option>
              ))}
            </select>
          </label>
          {targetUser && (
            <>
              <fieldset className="mt-3">
                <legend className="mb-1 text-body-sm text-text">Roles</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {roles.map((r) => (
                    <label key={r.id} className="flex items-start gap-2 rounded-md border border-border p-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={targetRoles.includes(r.id)}
                        onChange={() => setTargetRoles(toggleIn(targetRoles, r.id))}
                      />
                      <span className="min-w-0">
                        <span className="block text-body-sm text-text">
                          {r.name}
                          {r.ticketPermissions.length > 0 && (
                            <span className="ml-2 rounded-full bg-warning-bg px-1.5 py-0.5 text-label-sm text-warning-text">
                              overrides rules
                            </span>
                          )}
                        </span>
                        <span className="block text-caption text-text-muted">{r.description}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <button
                type="button"
                className="btn-primary mt-3"
                disabled={busy}
                onClick={() => void run(async () => { await assignRoles(targetUser, targetRoles); },
                  'Roles updated. They apply on that person’s next request.')}
              >
                Save roles
              </button>
            </>
          )}
        </div>
      )}

      {/* ── CREATE ROLE ─────────────────────────────────────────────────────────────────── */}
      {panel === 'create-role' && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">Role name</span>
              <input className="input w-full" value={nr.name} onChange={(e) => setNr({ ...nr, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="mb-1 block text-body-sm text-text">What it is for</span>
              <input className="input w-full" value={nr.description} onChange={(e) => setNr({ ...nr, description: e.target.value })} />
            </label>
          </div>

          <fieldset className="mt-4">
            <legend className="text-body-sm text-text">Pages and features</legend>
            <p className="mb-2 text-caption text-text-muted">What this role can open.</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {ASSIGNABLE_STATIC_PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={nr.staticPermissions.includes(p)}
                    onChange={() => setNr({ ...nr, staticPermissions: toggleIn(nr.staticPermissions, p) })}
                  />
                  {labelFor(p)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4 rounded-md border border-warning-text/40 bg-warning-bg/40 p-3">
            <legend className="flex items-center gap-1.5 px-1 text-body-sm text-warning-text">
              <AlertTriangle size={14} aria-hidden /> Ticket rule overrides
            </legend>
            <p className="mb-2 text-caption text-warning-text">
              Ticket rights are normally worked out per ticket from who raised it, who holds it and
              which departments it runs between. Anything ticked here <strong>suspends that rule</strong>
              {' '}for whoever holds this role. Leave them all unticked unless you mean it.
            </p>
            <div className="grid gap-1">
              {ASSIGNABLE_TICKET_PERMISSIONS.map((p) => (
                <label key={p} className="flex items-start gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={nr.ticketPermissions.includes(p)}
                    onChange={() => setNr({ ...nr, ticketPermissions: toggleIn(nr.ticketPermissions, p) })}
                  />
                  <span>
                    {labelFor(p)}
                    {TICKET_OVERRIDE_WARNINGS[p] && (
                      <span className="block text-caption text-warning-text">{TICKET_OVERRIDE_WARNINGS[p]}</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button
            type="button"
            className="btn-primary mt-3"
            disabled={busy || !nr.name.trim() || !nr.description.trim()}
            onClick={() => void run(async () => {
              const created = await createRole(nr);
              if (!created) throw new Error('The server refused that role — the name may already exist.');
              setNr({ name: '', description: '', staticPermissions: [], ticketPermissions: [] });
            }, `Role “${nr.name}” created. Assign it from “Assign roles”.`)}
          >
            {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ShieldPlus size={14} aria-hidden />}
            Create role
          </button>

          {roles.some((r) => !r.isSystem) && (
            <div className="mt-5">
              <p className="text-body-sm text-text">Custom roles</p>
              <ul className="mt-2 divide-y divide-border">
                {roles.filter((r) => !r.isSystem).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 text-body-sm text-text">
                      {r.name}
                      <span className="ml-2 text-caption text-text-muted">
                        {r.staticPermissions.length} page rights · {r.ticketPermissions.length} overrides
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn-quiet text-caption"
                      disabled={busy}
                      onClick={() => void run(async () => {
                        const ok = await deleteRole(r.id);
                        if (!ok) throw new Error('Built-in roles cannot be deleted.');
                      }, `Role “${r.name}” deleted.`)}
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {loading && <p className="mt-3 text-caption text-text-muted">Loading roles…</p>}
    </section>
  );
}
