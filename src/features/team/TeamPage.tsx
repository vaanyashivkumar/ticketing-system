import { Fragment, useMemo, useState } from 'react';
import { Users, AlertTriangle, RefreshCw, Info, FilterX } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { scopedTickets } from '@domain/dashboard/scope';
import { teamOf, summariseTeam, teamTotals, type TeamScope } from '@domain/team/teamMetrics';
import { WorkFlowMap } from './components/WorkFlowMap';
import { TEAM_KPIS, TEAM_COLUMNS } from '@config/team.config';
import { MOCK_USERS } from '@config/mockUsers.config';
import { managerOfDepartment, DEPARTMENT_MANAGERS } from '@config/leave.config';
import { DEPARTMENTS, DEPARTMENT_LIST } from '@config/departments.config';
import {
  applyFilters, activeFilterCount, EMPTY_FILTERS, type TicketFilters,
} from '@domain/filters/ticketFilters';
import { ORDERED_STATUSES, statusLabel } from '@domain/workflow/statusEngine';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';
import { PageHeader } from '@components/common/PageHeader';

/**
 * TEAM — the line manager's view of the people who report to them.
 *
 * WHAT IT IS NOT. Not a productivity scoreboard. `ENTERPRISE_REPORTING_SYSTEM.md §3` ratifies §8
 * literally — counts only, no rankings, no per-person timings, no leaderboards — and this screen
 * is the most likely place for that to erode, because "a summary of every employee" is one step
 * from a league table. Every number here is a count of work in a state, rows render in the team's
 * own order rather than sorted by any column, and there is no score anywhere. Adding a timing
 * needs a ratified amendment.
 *
 * IT GRANTS NO NEW VISIBILITY. A manager already sees every ticket their department sends or
 * receives; `scopedTickets` applies the same clamp as every other page and this view narrows
 * within it. Nothing here reaches a ticket the manager could not already open.
 */
export function TeamPage() {
  const { session, user } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  /**
   * Loading and error state, carried deliberately. B05 and B07 both shipped pages that ignored
   * them and rendered a confident set of zeroes on a failed fetch — which on a management screen
   * reads as "a quiet week" rather than "the data never arrived". A wrong zero is worse here than
   * a spinner, because a manager acts on it.
   */
  const loading = useTicketStore((s) => s.loading);
  const loadError = useTicketStore((s) => s.loadError);
  const refresh = useTicketStore((s) => s.refresh);

  /**
   * A sysadmin's Team view is the WHOLE COMPANY (stakeholder, 2026-08-04) — the Managing Directors
   * see every employee the way a line manager sees their team. Same screen, same counts, widened;
   * a separate company screen would be a second thing to keep in step with this one.
   */
  const scope: TeamScope = user?.role.capabilities.includes('SUPER_ADMIN') ? 'company' : 'department';
  const team = useMemo(
    () => (user
      ? teamOf(
          user.id,
          MOCK_USERS,
          managerOfDepartment(user.departmentCode),
          scope,
          (id, code) => DEPARTMENT_MANAGERS[code] === id,
        )
      : []),
    [user, scope],
  );
  const scoped = useMemo(() => (session ? scopedTickets(session, tickets) : []), [session, tickets]);

  /**
   * The same filter model Reports and the dashboard use — one vocabulary, not a third copy
   * (B05 SS Filter Engine). Filtering runs AFTER the scope clamp and only ever narrows; "At a
   * glance" stays on the page and simply recomputes over the filtered set, so the headline and
   * the table can never disagree about which population they describe.
   *
   * A department manager gets NO department control: their clamp already is their department, and
   * a select that could only echo it or return nothing is not a choice. The company view keeps
   * it, and there it narrows the PEOPLE as well as the tickets — an MD filtering to Sales means
   * "show me the Sales team", not "keep 27 rows but zero most of them".
   */
  const [f, setF] = useState<TicketFilters>(EMPTY_FILTERS);
  const setFilter = <K extends keyof TicketFilters>(k: K, v: TicketFilters[K]) =>
    setF((prevF) => ({ ...prevF, [k]: v }));
  const nActive = activeFilterCount(f);
  const visibleTeam = useMemo(
    () => (scope === 'company' && f.department ? team.filter((m) => m.departmentCode === f.department) : team),
    [team, scope, f.department],
  );
  const filtered = useMemo(() => applyFilters(scoped, f), [scoped, f]);
  const categoryOptions = useMemo(() => [...new Set(scoped.map((t) => t.categoryLabel))].sort(), [scoped]);

  const rows = useMemo(() => summariseTeam(filtered, visibleTeam), [filtered, visibleTeam]);
  const totals = useMemo(() => teamTotals(rows), [rows]);

  if (!session || !user) return null;
  const deptName = DEPARTMENTS[user.departmentCode].name;
  const subject = scope === 'company' ? 'the company' : deptName;
  // Not the org name: `org.config`'s default is a placeholder string, and naming the root after
  // what it actually contains is truer than borrowing a brand the config does not reliably hold.
  const rootLabel = scope === 'company' ? 'All departments' : deptName;

  return (
    <div className="w-full max-w-6xl">
      <PageHeader
        icon={Users}
        title={scope === 'company' ? 'Company' : 'Team'}
        description={
          scope === 'company'
            ? 'Every employee, the work they are holding, and how it moves between departments.'
            : `Everyone in ${deptName}, the work they are holding, and where it flows.`
        }
      />

      {loadError ? (
        <div className="card card-p mt-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger-text" aria-hidden />
            <div>
              <p className="text-body-medium text-text">The team’s work could not be loaded.</p>
              <p className="mt-1 text-body-sm text-text-secondary">
                Nothing below would be accurate, so no figures are shown. {loadError}
              </p>
              <button type="button" className="btn-neutral mt-3" onClick={() => refresh()}>
                <RefreshCw size={14} aria-hidden /> Try again
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <p className="mt-4 text-body-sm text-text-secondary">Loading your team’s work…</p>
      ) : team.length === 0 ? (
        <div className="card card-p mt-4">
          <p className="text-body-medium text-text">Nobody reports to you.</p>
          <p className="mt-1 text-body-sm text-text-secondary">
            This view lists the people in the department you manage. You are not currently set as
            any department’s line manager, so there is no team to show.
          </p>
        </div>
      ) : (
        <>
          {/* -- FILTERS ------------------------------------------------------------------- */}
          <section aria-label="Filters" className="card card-p mt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-label uppercase tracking-wide text-text-muted">Filters</p>
              {nActive > 0 && (
                <button type="button" className="btn-quiet text-caption" onClick={() => setF(EMPTY_FILTERS)}>
                  <FilterX size={14} aria-hidden /> Clear ({nActive})
                </button>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {scope === 'company' && (
                <label className="block">
                  <span className="mb-1 block text-body-sm text-text">Department</span>
                  <select
                    className="input w-full"
                    value={f.department}
                    onChange={(e) => setFilter('department', e.target.value as TicketFilters['department'])}
                  >
                    <option value="">All</option>
                    {DEPARTMENT_LIST.map((d) => (
                      <option key={d.code} value={d.code}>{d.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Category</span>
                <select className="input w-full" value={f.category} onChange={(e) => setFilter('category', e.target.value)}>
                  <option value="">All</option>
                  {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Priority</span>
                <select className="input w-full" value={f.priority} onChange={(e) => setFilter('priority', e.target.value as TicketFilters['priority'])}>
                  <option value="">All</option>
                  {ORDERED_PRIORITIES.map((pr) => <option key={pr} value={pr}>{pr}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Status</span>
                <select className="input w-full" value={f.status} onChange={(e) => setFilter('status', e.target.value as TicketFilters['status'])}>
                  <option value="">All</option>
                  {ORDERED_STATUSES.map((st) => <option key={st} value={st}>{statusLabel(st)}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Assignee</span>
                <select className="input w-full" value={f.assignee} onChange={(e) => setFilter('assignee', e.target.value)}>
                  <option value="">All</option>
                  {[...visibleTeam].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">SLA state</span>
                <select className="input w-full" value={f.sla} onChange={(e) => setFilter('sla', e.target.value as TicketFilters['sla'])}>
                  <option value="">All</option>
                  <option value="OnTrack">On track</option>
                  <option value="DueSoon">Due soon</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Created from</span>
                <input type="date" className="input w-full" value={f.from} onChange={(e) => setFilter('from', e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-body-sm text-text">Created to</span>
                <input type="date" className="input w-full" value={f.to} onChange={(e) => setFilter('to', e.target.value)} />
              </label>
            </div>
          </section>

          {/* ── AT A GLANCE ─────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="team-glance-h" className="mt-6">
            <h2 id="team-glance-h" className="text-h3 text-text">At a glance</h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              Across {totals.people} {totals.people === 1 ? 'person' : 'people'}
              {scope === 'company' ? ' across every department' : ` in ${deptName}`}.
              {nActive > 0 && ' Filtered - the figures describe only what matches.'}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TEAM_KPIS.map((k) => {
                const value = totals[k.id];
                const alarming = k.alarm && value > 0;
                return (
                  <div key={k.id} className="card card-p">
                    <p className="text-label uppercase tracking-wide text-text-muted">{k.label}</p>
                    <p className={`mt-1 text-h1 ${alarming ? 'text-danger-text' : 'text-text'}`}>{value}</p>
                    <p className="mt-1 text-caption text-text-muted">{k.question}</p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── PER PERSON ──────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="team-people-h" className="mt-8">
            <h2 id="team-people-h" className="text-h3 text-text">Each person</h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              What each person is carrying right now. These are counts of work, not a measure of
              anyone’s performance — the columns say what they mean, and none of them rank people.
            </p>
            <div className="table-shell mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th">Person</th>
                    {TEAM_COLUMNS.map((c) => (
                      <th key={c.id} className="th td-num" title={c.hint} scope="col">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <Fragment key={r.id}>
                    {scope === 'company' && (i === 0 || rows[i - 1]!.departmentCode !== r.departmentCode) && (
                      <tr key={`h-${r.departmentCode}`}>
                        <th
                          scope="colgroup"
                          colSpan={TEAM_COLUMNS.length + 1}
                          className="td bg-surface-sunken text-left text-label uppercase tracking-wide text-text-muted"
                        >
                          {DEPARTMENTS[r.departmentCode].name}
                        </th>
                      </tr>
                    )}
                    <tr className="row-hover">
                      <td className="td whitespace-nowrap">
                        {r.name}
                        {r.isManager && (
                          <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-label-sm text-text-secondary">
                            {/* In the company view this marks A line manager; in a team view it
                                marks the viewer, who is the only manager on screen. */}
                            {scope === 'company' ? 'manager' : 'you'}
                          </span>
                        )}
                      </td>
                      {TEAM_COLUMNS.map((c) => {
                        const value = r[c.id];
                        const alarming = c.alarm && value > 0;
                        return (
                          <td key={c.id} className={`td td-num ${alarming ? 'text-danger-text' : ''}`}>
                            {value === 0 ? <span className="text-text-muted">0</span> : value}
                          </td>
                        );
                      })}
                    </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {TEAM_COLUMNS.map((c) => (
                <li key={c.id} className="text-caption text-text-muted">
                  <span className="text-text-secondary">{c.label}</span> — {c.hint}
                </li>
              ))}
            </ul>
          </section>

          {/* ── FLOW ────────────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="team-flow-h" className="mt-8">
            <h2 id="team-flow-h" className="text-h3 text-text">How work flows</h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              {scope === 'company'
                ? 'Open a department to see its people, and open a person to see where their work lands.'
                : `Who raised the work, and who is holding it now. People outside ${deptName} are shown as their department.`}
            </p>
            <WorkFlowMap tickets={filtered} team={visibleTeam} scope={scope} rootLabel={rootLabel} />
          </section>

          <p className="mt-8 flex items-start gap-2 text-caption text-text-muted">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            This view re-cuts work you can already see as {subject === 'the company' ? 'a system administrator' : `${deptName}’s manager`}. It shows counts
            only — no timings and no ranking of people — per the reporting ethics rule.
          </p>
        </>
      )}
    </div>
  );
}
