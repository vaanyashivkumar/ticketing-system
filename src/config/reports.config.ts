import type { StaticPermission } from '@domain/types/auth.types';
import type { DataScope } from '@domain/dashboard/dataScope';

/**
 * REPORT REGISTRY (B07 §Report Configuration Schema).
 *
 * Every report declared once: the question it answers, who may open it, what data it is computed
 * over, and whether it needs history the current mode may not have.
 *
 * B07: "Every report must answer a measurable business question. Avoid reports that display data
 * without purpose." `question` is therefore a required field and is RENDERED — a report that
 * cannot state its question does not get built, and one whose question is answered better by a
 * different report does not get added.
 *
 * `needsActivityTrail` is the field that keeps this honest. Four of these reports are computed
 * from the activity trail, and the ticket LIST endpoint omits it — so against the API they would
 * silently return zeroes. The registry declares the dependency and the page refuses to render a
 * number it cannot stand behind.
 */

export type ReportId =
  | 'executive'
  | 'department'
  | 'category'
  | 'status'
  | 'priority'
  | 'sla'
  | 'workload'
  | 'trends';

export interface ReportDefinition {
  readonly id: ReportId;
  readonly name: string;
  /** The measurable business question. Rendered under the report title. */
  readonly question: string;
  /** Grouping in the report picker. */
  readonly section: 'Overview' | 'Operations' | 'Quality';
  /**
   * Required to open it. Every report today needs `VIEW_REPORTS`, which every authenticated user
   * holds — the confidentiality control is the DATA SCOPE, not the page. Stated per report anyway,
   * so a report that should be narrower has somewhere to say so.
   */
  readonly permission: StaticPermission;
  /**
   * The data this report is computed over. Always applied AFTER the visibility clamp, so it
   * narrows and never widens: `department-wide` for a line role is their department, and for a
   * sysadmin the clamp has already returned everything.
   */
  readonly dataScope: DataScope;
  /** True when the report reads `ticket.activity`, which the list endpoint does not send. */
  readonly needsActivityTrail: boolean;
  /** Shown when the filters exclude everything. Specific beats "no data". */
  readonly emptyHint: string;
}

export const REPORTS: readonly ReportDefinition[] = [
  {
    id: 'executive',
    name: 'Executive summary',
    question: 'How much work is in the system, how much is late, and are we meeting our targets?',
    section: 'Overview',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so there is nothing to summarise.',
  },
  {
    id: 'department',
    name: 'Departments',
    question: 'Which departments send the most work, which receive it, and who is keeping up?',
    section: 'Operations',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so no department has volume to report.',
  },
  {
    id: 'category',
    name: 'Categories',
    question: 'Which request types are most common, and which take longest to resolve?',
    section: 'Operations',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so no category has volume to report.',
  },
  {
    id: 'status',
    name: 'Status and dwell time',
    question: 'Where does work pile up, and how long does it sit at each stage?',
    section: 'Operations',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    // Dwell time is reconstructed from transition timestamps.
    needsActivityTrail: true,
    emptyHint: 'No tickets match the current filters.',
  },
  {
    id: 'priority',
    name: 'Priority and escalation',
    question: 'How is urgency distributed, and how often is work re-graded after it arrives?',
    section: 'Quality',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    // Escalation frequency reads PRIORITY_CHANGED entries.
    needsActivityTrail: true,
    emptyHint: 'No tickets match the current filters.',
  },
  {
    id: 'sla',
    name: 'SLA performance',
    question: 'What is breaching, what is about to, and where are the targets being missed?',
    section: 'Quality',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so there is no SLA position to report.',
  },
  {
    id: 'workload',
    name: 'Workload and backlog',
    question: 'Who is carrying what, how much is unowned, and what is going stale?',
    section: 'Operations',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so there is no workload to distribute.',
  },
  {
    id: 'trends',
    name: 'Trends',
    question: 'Is the rate of arriving work rising, and are we resolving it as fast as it comes in?',
    section: 'Quality',
    permission: 'VIEW_REPORTS',
    dataScope: 'department-wide',
    // Created and resolved timestamps are stored on the ticket.
    needsActivityTrail: false,
    emptyHint: 'No tickets match the current filters, so there is no trend to plot.',
  },
];

export const reportById = (id: ReportId): ReportDefinition => {
  const r = REPORTS.find((x) => x.id === id);
  if (!r) throw new Error(`No report definition for "${id}"`);
  return r;
};

export const REPORT_SECTIONS: readonly ReportDefinition['section'][] = ['Overview', 'Operations', 'Quality'];

/**
 * Reports B07 asked for that are NOT here, with the reason.
 *
 * Rendered on the reports page. Each would need data this system does not record, and a report is
 * the worst place to invent one: a chart is read as measurement, and a measured-looking number
 * that was guessed is acted on.
 */
export const UNBUILDABLE_REPORTS: readonly { readonly asked: string; readonly why: string }[] = [
  {
    asked: 'Status report covering Pending Assignment, Under Review and Approved',
    why: 'None of those three is a ratified status. The lifecycle has ten, and a report row for a state no ticket can occupy would read as "we have none" rather than "it does not exist".',
  },
  {
    asked: 'Critical priority volume',
    why: 'The ratified enum is Low, Medium, High, Urgent. Reporting a "Critical" band against Urgent data would invent a fifth level in the reader’s mental model.',
  },
  {
    asked: 'Historical status distribution over time',
    why: 'No point-in-time snapshot is stored, so "open tickets last Tuesday" cannot be reconstructed. Trends over event timestamps — created, resolved — are honest and are in the Trends report; trends over status counts are not.',
  },
  {
    asked: 'Average handling time',
    why: 'There is no concept of time actively worked, only elapsed time. Handling time would need work-start and work-stop events that nothing records.',
  },
  {
    asked: 'Approval completion',
    why: 'There is no approval sub-workflow. Reject is a destination decline with a mandatory reason, not the negative half of an approval, so an approval-completion rate has no numerator.',
  },
  {
    asked: 'Response-time breach (R11)',
    why: 'Response time is measured to first assignment and is reported, but no ratified RESPONSE target exists to breach against — only resolution targets are configured. A breach count would need a threshold nobody has set.',
  },
];
