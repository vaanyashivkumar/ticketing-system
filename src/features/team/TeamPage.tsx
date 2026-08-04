import { useMemo } from 'react';
import { Users, ArrowRight, AlertTriangle, RefreshCw, Info } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { scopedTickets } from '@domain/dashboard/scope';
import { teamOf, summariseTeam, teamTotals, workFlows } from '@domain/team/teamMetrics';
import { TEAM_KPIS, TEAM_COLUMNS } from '@config/team.config';
import { MOCK_USERS } from '@config/mockUsers.config';
import { managerOfDepartment } from '@config/leave.config';
import { DEPARTMENTS } from '@config/departments.config';
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

  const team = useMemo(
    () => (user ? teamOf(user.id, MOCK_USERS, managerOfDepartment(user.departmentCode)) : []),
    [user],
  );
  const scoped = useMemo(() => (session ? scopedTickets(session, tickets) : []), [session, tickets]);
  const rows = useMemo(() => summariseTeam(scoped, team), [scoped, team]);
  const totals = useMemo(() => teamTotals(rows), [rows]);
  const flows = useMemo(() => workFlows(scoped, team), [scoped, team]);

  if (!session || !user) return null;
  const deptName = DEPARTMENTS[user.departmentCode].name;

  return (
    <div className="w-full max-w-6xl">
      <PageHeader
        icon={Users}
        title="Team"
        description={`Everyone in ${deptName}, the work they are holding, and where it flows.`}
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
          {/* ── AT A GLANCE ─────────────────────────────────────────────────────────────── */}
          <section aria-labelledby="team-glance-h" className="mt-6">
            <h2 id="team-glance-h" className="text-h3 text-text">At a glance</h2>
            <p className="mt-1 text-body-sm text-text-secondary">
              Across {totals.people} {totals.people === 1 ? 'person' : 'people'} in {deptName}.
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
                  {rows.map((r) => (
                    <tr key={r.id} className="row-hover">
                      <td className="td whitespace-nowrap">
                        {r.name}
                        {r.isManager && (
                          <span className="ml-2 rounded-full bg-surface-sunken px-2 py-0.5 text-label-sm text-text-secondary">
                            you
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
              Who raised the work, and who is holding it now. People outside {deptName} are shown
              as their department.
            </p>
            {flows.length === 0 ? (
              <div className="card card-p mt-3">
                <p className="text-body-sm text-text-secondary">
                  No work has moved yet — nothing has been raised or handed over.
                </p>
              </div>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {flows.map((f) => (
                  <li key={`${f.from}-${f.to}`} className="card flex items-center justify-between gap-3 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2 text-body-sm">
                      <span className="truncate text-text">{f.from}</span>
                      <ArrowRight size={15} className="shrink-0 text-text-muted" aria-hidden />
                      <span className="truncate text-text">{f.to}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {f.internal && (
                        <span className="rounded-full bg-info-bg px-2 py-0.5 text-label-sm text-info-text">
                          within team
                        </span>
                      )}
                      <span className="text-body-medium text-text">{f.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="mt-8 flex items-start gap-2 text-caption text-text-muted">
            <Info size={14} className="mt-0.5 shrink-0" aria-hidden />
            This view re-cuts work you can already see as {deptName}’s manager. It shows counts
            only — no timings and no ranking of people — per the reporting ethics rule.
          </p>
        </>
      )}
    </div>
  );
}
