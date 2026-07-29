import { useEffect, useState } from 'react';
import { Users, Search, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { UserService, type AdminUser } from '@services/userService';
import { AdminApi } from '@services/api/adminApi';
import { USE_API } from '@config/runtime.config';
import { useTicketStore } from '@stores/ticketStore';
import { DEPARTMENTS } from '@config/departments.config';
import { PageHeader } from '@components/common/PageHeader';
import { InlineError } from '@components/common/InlineError';

/** User Management (P15 §2). Governance only — no operational ticket work here. */
export function UserManagementPage() {
  const { session } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * `version` is a deliberate cache-buster, not an unused dep: bumping it forces a re-read after a
   * mutation. Neither source is observable by React — localStorage cannot be subscribed to, and
   * the API is a fetch — so the dependency IS the invalidation signal in both modes.
   */
  const [users, setUsers] = useState<AdminUser[]>([]);
  useEffect(() => {
    if (!USE_API) {
      setUsers(UserService.all());
      return;
    }
    let live = true;
    void AdminApi.users().then((r) => {
      // `live` guards against a resolved fetch writing state after unmount or after a newer
      // request superseded it — otherwise a slow first response can overwrite a fresh one.
      if (!live) return;
      if (r.ok) setUsers(r.value);
      else setError(r.error);
    });
    return () => { live = false; };
  }, [version]);
  const filtered = users.filter(
    (u) =>
      (!q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase())) &&
      (!dept || u.departmentCode === dept),
  );

  const toggle = async (u: AdminUser) => {
    if (!session) return;
    setError(null);
    // The two lockout guards (no self-deactivation, never the last active sysadmin) live in the
    // SERVICE in prototype mode and on the SERVER in API mode. Either way the refusal surfaces
    // here as a message; this component never re-implements the rule.
    const r = USE_API
      ? await AdminApi.setActive(u.id, !u.active)
      : UserService.setActive(u.id, !u.active, session);
    if (!r.ok) setError(r.error);
    setVersion((v) => v + 1);
  };

  const counts = (userId: string) => ({
    created: tickets.filter((t) => t.createdById === userId).length,
    assigned: tickets.filter((t) => t.assignedToId === userId).length,
  });

  return (
    <section>
      <PageHeader icon={Users} title="User Management" description="Accounts, departments and capability. Governance only." />

      <InlineError message={error} className="mb-4" />

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center">
          <Search size={15} className="pointer-events-none absolute left-3 text-text-muted" aria-hidden />
          <input className="input pl-9" placeholder="Search name or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
        <select className="input max-w-[200px]" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Filter by department">
          <option value="">All departments</option>
          {Object.values(DEPARTMENTS).map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
        </select>
      </div>

      {/* `table-shell` clips the corners; `overflow-x-auto` still wins on the x axis, so a narrow
          viewport scrolls the table rather than the page. */}
      <div className="table-shell overflow-x-auto">
        <table className="w-full text-table">
          <thead>
            {/**
             * `.th` carries the column-header treatment. The colour is pinned back to
             * `text-secondary` because the class default (`text-muted`) measures 4.34:1 on
             * `surface-sunken` in the light theme — below AA, the same pairing already flagged as
             * A11Y-008 elsewhere in admin. Utilities beat the component layer, which is the
             * sanctioned escape hatch; drop the override once `.th` itself is corrected.
             */}
            <tr className="border-b border-border">
              <th className="th text-text-secondary">User</th>
              <th className="th text-text-secondary">Department</th>
              <th className="th text-text-secondary">Capability</th>
              {/* Right-aligned so the header sits over the right-aligned figures below. */}
              <th className="th text-right text-text-secondary">Raised</th>
              <th className="th text-right text-text-secondary">Assigned</th>
              <th className="th text-text-secondary">Status</th>
              <th className="th text-text-secondary">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const c = counts(u.id);
              const sysadmin = u.role.capabilities.includes('SUPER_ADMIN');
              return (
                <tr key={u.id} className="row-hover border-b border-border last:border-0">
                  <td className="td">
                    <span className="block text-body-sm text-text">{u.name}</span>
                    <span className="block text-caption text-text-muted">{u.email}</span>
                  </td>
                  <td className="td text-text-secondary">{DEPARTMENTS[u.departmentCode].name}</td>
                  <td className="td">
                    {sysadmin ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-label-sm text-info-text">
                        <ShieldCheck size={11} aria-hidden /> Sysadmin
                      </span>
                    ) : (
                      <span className="text-caption text-text-muted">—</span>
                    )}
                  </td>
                  {/* Counts are compared down the column, so they align right with tabular figures. */}
                  <td className="td-num text-text-secondary">{c.created}</td>
                  <td className="td-num text-text-secondary">{c.assigned}</td>
                  <td className="td">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-label-sm ${u.active ? 'bg-success-bg text-success-text' : 'bg-surface-sunken text-text-secondary'}`}>
                      {u.active ? <CheckCircle2 size={11} aria-hidden /> : <XCircle size={11} aria-hidden />}
                      {u.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="td">
                    <button type="button" onClick={() => { void toggle(u); }} className="btn-neutral">
                      {u.active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="px-4 py-8 text-center text-body-sm text-text-muted">No users match those filters.</p>}
      </div>
      <p className="mt-3 text-caption text-text-muted">
        Users are seeded from configuration; changes persist as audited overrides. Account creation and password reset are future work (real identity provider — AUTHENTICATION_ARCHITECTURE §15).
      </p>
    </section>
  );
}
