import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { OPEN_STATUSES, requesterActionRequired } from '@domain/workflow/statusEngine';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * TEAM METRICS — what a line manager needs to see about the people who report to them.
 *
 * ── THE ETHICS RULE IS LOAD-BEARING HERE, NOT A FOOTNOTE. ─────────────────────────────────────
 * `ENTERPRISE_REPORTING_SYSTEM.md §3` ratifies §8 literally: **workload = counts only. No
 * rankings, no per-person timings, no leaderboards.** `reportMetrics.byAssignee` already carries
 * that constraint and says why — the numbers exist for WORKLOAD BALANCING, not surveillance.
 *
 * This module is the place that rule is most likely to be eroded, because a "summary of every
 * employee" is one small step from a productivity scoreboard. So it is stated as an invariant:
 * every field below is a COUNT of work in a state. There is deliberately no average resolution
 * time per person, no fastest/slowest, no ordering by output, and no derived score. Rows come
 * back in the team's own order, never sorted by any count, so the UI cannot accidentally render
 * a ranking by rendering them in order. Adding a timing here needs a ratified amendment.
 *
 * ── VISIBILITY ────────────────────────────────────────────────────────────────────────────────
 * These are pure reducers over a ticket set the CALLER has already clamped. They widen nothing:
 * a manager already sees every ticket their department sends or receives, so the team view is a
 * narrowing lens over that same set (`dataScope`: a scope narrows, never widens).
 */

export interface TeamMember {
  readonly id: string;
  readonly name: string;
  /** The manager themselves is included in their own team view — they carry work too. */
  readonly isManager: boolean;
  /** Needed to group 27 people by department in the company-wide view. */
  readonly departmentCode: DepartmentCode;
}

/**
 * Whose work a viewer is looking at.
 *
 * `department` — a line manager, seeing the people they manage.
 * `company` — a sysadmin (the Managing Directors), seeing every employee. It is the SAME view and
 *   the same counts, widened; deliberately not a second screen that could drift from this one.
 */
export type TeamScope = 'department' | 'company';

export interface MemberSummary extends TeamMember {
  /** Open work assigned to this person: their current load. */
  readonly holding: number;
  /** Of what they hold, actively started rather than merely queued. */
  readonly inProgress: number;
  /** Requests THEY raised that are still moving — outbound work they are waiting on. */
  readonly raisedOpen: number;
  /** Their own requests now waiting on THEM to answer or accept. The actionable column. */
  readonly needsThem: number;
  /** Finished by them: resolved or closed. */
  readonly completed: number;
  /** Open and past its resolution target. */
  readonly overdue: number;
}

export interface TeamTotals {
  readonly people: number;
  /**
   * Open requests the team has RAISED. Load-bearing for the three requester departments (Sales,
   * Marketing, Administration): nothing routes TO them, so `inPipeline` and `completed` are
   * permanently zero and a headline without this reads as an idle team while Sales sits on thirty
   * live requests. Their work is outbound, and this is the number that shows it.
   */
  readonly raised: number;
  readonly inPipeline: number;
  readonly inProgress: number;
  readonly needsSomeone: number;
  readonly completed: number;
  readonly overdue: number;
}

/** One directed edge of work: who it came from, who is holding it. */
export interface WorkFlow {
  readonly from: string;
  readonly to: string;
  readonly count: number;
  /** True when BOTH ends are people on this team — a genuine internal hand-off. */
  readonly internal: boolean;
}

/** Open, and past its target. Same population `reportMetrics.summarise` uses — not a new rule. */
const isOverdue = (t: Ticket): boolean =>
  OPEN_STATUSES.includes(t.status) && t.sla.flag === 'Overdue';

const isOpen = (t: Ticket): boolean => OPEN_STATUSES.includes(t.status);
const isDone = (t: Ticket): boolean => t.status === 'Resolved' || t.status === 'Closed';

/**
 * The people reporting to `managerId`, plus the manager.
 *
 * Membership is the department, because that is what a line manager manages here — there is no
 * separate reporting graph, and inventing one would be a second source of truth for a fact
 * `Department.managerId` already answers. Returns an empty list for someone who manages nothing,
 * which the page renders as an honest empty state rather than a broken one.
 */
export function teamOf(
  viewerId: string,
  users: readonly { id: string; name: string; departmentCode: DepartmentCode }[],
  departmentManagerId: string | null,
  scope: TeamScope = 'department',
  isDepartmentManager: (userId: string, code: DepartmentCode) => boolean = () => false,
): TeamMember[] {
  const mark = (u: { id: string; name: string; departmentCode: DepartmentCode }): TeamMember => ({
    id: u.id,
    name: u.name,
    departmentCode: u.departmentCode,
    // In the company view "manager" means *a* line manager, not the viewer — the viewer is the MD.
    isManager: scope === 'company' ? isDepartmentManager(u.id, u.departmentCode) : u.id === viewerId,
  });

  if (scope === 'company') return users.map(mark);

  if (departmentManagerId !== viewerId) return [];
  const manager = users.find((u) => u.id === viewerId);
  if (!manager) return [];
  return users.filter((u) => u.departmentCode === manager.departmentCode).map(mark);
}

/**
 * Per-person counts. COUNTS ONLY — see the header. Order follows `team`, never a count, so the
 * table cannot become a league table by accident.
 */
export function summariseTeam(
  tickets: readonly Ticket[],
  team: readonly TeamMember[],
): MemberSummary[] {
  return team.map((m) => {
    const assigned = tickets.filter((t) => t.assignedToId === m.id);
    const raised = tickets.filter((t) => t.createdById === m.id);
    return {
      ...m,
      holding: assigned.filter(isOpen).length,
      inProgress: assigned.filter((t) => t.status === 'InProgress').length,
      raisedOpen: raised.filter(isOpen).length,
      // Their own request has come back to them — a question to answer, or a resolution to accept.
      needsThem: raised.filter((t) => requesterActionRequired(t.status) && t.status !== 'Draft').length,
      completed: assigned.filter(isDone).length,
      overdue: assigned.filter(isOverdue).length,
    };
  });
}

/** The headline numbers, computed from the SAME per-person rows so the two can never disagree. */
export function teamTotals(rows: readonly MemberSummary[]): TeamTotals {
  const sum = (pick: (r: MemberSummary) => number): number => rows.reduce((n, r) => n + pick(r), 0);
  return {
    people: rows.length,
    raised: sum((r) => r.raisedOpen),
    inPipeline: sum((r) => r.holding),
    inProgress: sum((r) => r.inProgress),
    needsSomeone: sum((r) => r.needsThem),
    completed: sum((r) => r.completed),
    overdue: sum((r) => r.overdue),
  };
}

/**
 * How work moves: from whoever raised it to whoever is holding it.
 *
 * Read from the tickets themselves (`createdById` → `assignedToId`) rather than from the activity
 * trail, and that is deliberate: the list endpoint omits `activity` in API mode, so a trail-based
 * flow would render EMPTY against the real backend while looking perfectly healthy — the exact
 * failure `hasActivityTrail` exists to prevent in B07. This definition needs no trail and is
 * therefore true in both data modes.
 *
 * An end outside the team collapses to its DEPARTMENT name. A manager does not need to know which
 * individual in Finance picked something up; they need to know it went to Finance.
 */
export function workFlows(
  tickets: readonly Ticket[],
  team: readonly TeamMember[],
): WorkFlow[] {
  const byId = new Map(team.map((m) => [m.id, m.name]));
  const counts = new Map<string, { from: string; to: string; internal: boolean; count: number }>();

  for (const t of tickets) {
    if (t.status === 'Draft') continue; // never left its author; not yet a flow
    const fromPerson = byId.get(t.createdById);
    const toPerson = t.assignedToId ? byId.get(t.assignedToId) : undefined;
    const from = fromPerson ?? DEPARTMENTS[t.fromDeptCode].name;
    // Unassigned work has still MOVED — it is sitting with the destination department.
    const to = toPerson ?? DEPARTMENTS[t.toDeptCode].name;
    if (from === to) continue; // self-raised and self-held: no hand-off to show

    const key = `${from} ${to}`;
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { from, to, internal: !!fromPerson && !!toPerson, count: 1 });
  }

  // Busiest first: this orders ROUTES by volume, which is the question ("where does work go?"),
  // and never orders people by output.
  return [...counts.values()].sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}
