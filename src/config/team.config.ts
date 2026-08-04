import type { MemberSummary, TeamTotals } from '@domain/team/teamMetrics';

/**
 * TEAM VIEW CONFIGURATION.
 *
 * Every number on the page is declared here with the QUESTION it answers, the same rule B05/B07
 * apply to dashboards and reports: a metric that cannot state its business question is decoration,
 * and decoration on a management screen is worse than nothing because people act on it.
 *
 * The plain-English wording is the point. This screen is read by a line manager between other
 * tasks, so the labels say "being worked on" rather than "InProgress" and "waiting on them"
 * rather than "requesterActionRequired". The status vocabulary is correct in the ticket UI, where
 * it is the domain language; here it would be jargon.
 *
 * KEEP THIS COUNTS-ONLY. `ENTERPRISE_REPORTING_SYSTEM.md §3` ratifies §8 literally — no rankings,
 * no per-person timings, no leaderboards. Adding an average-time-per-person column here needs a
 * ratified amendment, not a config line.
 */

export interface TeamKpi {
  readonly id: keyof TeamTotals;
  readonly label: string;
  readonly question: string;
  /** Draws attention when non-zero: this is the only number that means "something is wrong". */
  readonly alarm?: boolean;
}

export const TEAM_KPIS: readonly TeamKpi[] = [
  /**
   * FIRST, because for Sales, Marketing and Administration it is the only non-zero figure here:
   * nothing routes to them, so they hold and complete nothing and their entire contribution is
   * outbound. Without this the headline told a requester department's manager they had no work.
   */
  { id: 'raised', label: 'Requests we raised', question: 'What has my team asked other departments for, still open?' },
  { id: 'inPipeline', label: 'In the pipeline', question: 'How much work is my team currently holding?' },
  { id: 'inProgress', label: 'Being worked on', question: 'How much of it has someone actually started?' },
  { id: 'needsSomeone', label: 'Waiting on us', question: 'What is blocked on an answer from one of my people?' },
  { id: 'completed', label: 'Completed', question: 'How much has my team finished?' },
  { id: 'overdue', label: 'Overdue', question: 'What has already missed its deadline?', alarm: true },
];

/**
 * Only the COUNT fields of a member summary are addressable as a column — `name` and `isManager`
 * are not numbers and are rendered separately. Narrowing it here rather than casting at the call
 * site means a column pointing at a non-count is a compile error, not a `NaN` on a manager's
 * screen.
 */
type CountKey = {
  [K in keyof MemberSummary]: MemberSummary[K] extends number ? K : never;
}[keyof MemberSummary];

export interface TeamColumn {
  readonly id: CountKey;
  readonly label: string;
  readonly hint: string;
  readonly alarm?: boolean;
}

/**
 * The per-person columns, in reading order: what they hold, what is moving, what is stuck, what
 * is done. Deliberately NOT ordered to invite comparison down a column — the hint on each says
 * what it measures so a manager reads a row as a person's situation, not a score.
 */
export const TEAM_COLUMNS: readonly TeamColumn[] = [
  { id: 'holding', label: 'Holding', hint: 'Open work assigned to them right now' },
  { id: 'inProgress', label: 'Started', hint: 'Of what they hold, actively being worked on' },
  { id: 'raisedOpen', label: 'Raised', hint: 'Requests they have sent that are still open' },
  { id: 'needsThem', label: 'Needs them', hint: 'Their own requests now waiting on their answer' },
  { id: 'completed', label: 'Completed', hint: 'Work they have resolved or closed' },
  { id: 'overdue', label: 'Overdue', hint: 'Their open work that has missed its deadline', alarm: true },
];
