import type { TicketStatus } from '@domain/types/ticket.types';

/**
 * STATUS ENGINE — the single definition of what each status IS (B04 §Status Engine:
 * "Never hardcode status behaviour").
 *
 * Before this file the same knowledge was copied into thirteen places and had already drifted:
 *
 *   - the OPEN set existed FIVE times   (domain/dashboard/metrics, domain/reports/reportMetrics,
 *     features/dashboard/DashboardPage — untyped as `string[]` — and, in the API,
 *     routes/reports.ts; plus the ASSIGNABLE variant in services/ticketService,
 *     features/tickets/TicketDetailsPage and the API's routes/ticketActions)
 *   - the LABEL map existed THREE times and DISAGREED: `AwaitingInformation` rendered as
 *     "Awaiting Information" on the badge but "Awaiting Info" in the chart and the filter, so a
 *     user filtered for one string and got rows labelled with another
 *   - the ORDERED status list existed TWICE and the two lists were different: ReportsPage's
 *     filter silently omitted `Draft` and `Cancelled`, so a cancelled ticket could not be
 *     filtered for at all
 *
 * The divergence was not arbitrary — a chart axis genuinely needs a shorter string than a badge.
 * So the resolution is `label` + optional `shortLabel`, not one string forced on both.
 *
 * WHAT IS DELIBERATELY *NOT* HERE
 *
 * 1. Allowed previous/next status. B04 lists them as status properties, but they are already
 *    stated by `STATUS_TRANSITIONS`, which is the ratified 23-edge matrix. Copying them here
 *    would create a second, hand-maintained source of exactly the kind this file exists to
 *    delete. They are DERIVED instead — see `nextStatuses` / `previousStatuses` in
 *    `domain/workflow/statusEngine.ts`.
 *
 * 2. Notification rules. A notification is triggered by a TRANSITION, not by a state: `Start`
 *    and `Resume` both land on `InProgress` and only one of them is news. The action -> event
 *    mapping therefore stays on the edge (see the API's `domain/events.ts`).
 *
 * 3. Permission rules. Authorisation is route-derived and edge-scoped
 *    (`canOnTicket && actorMatches`); a per-status permission list would be a third parallel
 *    copy of the rule the Permission Engine already owns.
 */

/**
 * The six operational queues every destination department maintains (B04 §Queue Engine).
 *
 * Buckets are a VIEW over status, not a stored field — a ticket is in exactly one bucket because
 * it has exactly one status, so a queue can never disagree with the ticket it contains.
 */
export type QueueBucket = 'incoming' | 'assigned' | 'in-progress' | 'waiting' | 'completed' | 'archived';

export interface StatusDefinition {
  readonly id: TicketStatus;
  /** Canonical human label. Badges, filters, tables. */
  readonly label: string;
  /** Space-constrained alternative for chart axes and dense cells. Falls back to `label`. */
  readonly shortLabel?: string;
  /** One line explaining what this state means and who is expected to act. */
  readonly description: string;
  /** Display order — filter lists, queue tabs, chart categories. Follows the lifecycle. */
  readonly order: number;
  /**
   * Badge classes. Colour is never the only signal (phase-2 §9) — the label and the icon carry
   * it too. This is a plain string, so it costs this module no dependency.
   *
   * The matching ICON is deliberately NOT here. An icon means importing `lucide-react`, and this
   * module is imported by the API (via its `@config/*` path alias) to answer "is this status
   * open?" — coupling a server-side question to a React icon library would break exactly the
   * shared-definition property the file exists to provide. The icon lives in a compiler-checked
   * `Record<TicketStatus, LucideIcon>` beside the badge component instead, so it cannot fall out
   * of sync either.
   */
  readonly badgeClass: string;
  /**
   * Counts as live, unfinished work. THE definition of "open" for KPIs, backlog and reports —
   * the set that previously existed five times over.
   */
  readonly open: boolean;
  /**
   * The requester is the one who has to move next. Drives the dashboard's "needs your attention"
   * grouping, which previously hardcoded `status === 'AwaitingInformation'` and so missed
   * `Resolved` — where the requester must accept or reopen, and where a ticket sits until the
   * (not yet built) auto-close sweeper runs.
   */
  readonly requesterActionRequired: boolean;
  /**
   * May the ticket be RE-ASSIGNED while in this state? Re-assignment is a non-status audited
   * write (BDM §11.8) and needs the work to be live and already held by someone.
   *
   * Re-prioritisation is the OTHER non-status write and deliberately does NOT share this flag:
   * its window is wider, because `Submitted` — which has no assignee to change — is precisely
   * when a destination triaging its queue re-grades urgency. See `canChangePriority` in the
   * Status Engine, which derives that wider window instead of adding a near-duplicate column.
   */
  readonly assignable: boolean;
  /** Which department queue the ticket appears in. `null` = never in a queue (drafts are private). */
  readonly queue: QueueBucket | null;
}

export const STATUS_DEFINITIONS: readonly StatusDefinition[] = [
  {
    id: 'Draft',
    label: 'Draft',
    description: 'Being prepared by the requester. Not yet visible to the destination department.',
    order: 0,
    badgeClass: 'bg-surface-sunken text-text-secondary border border-border',
    open: false,
    requesterActionRequired: true,
    assignable: false,
    // Drafts never reach a destination queue (P13 §7) — an unsubmitted request is private to
    // its author, which is the confidentiality defect D09-1 fixed at the data layer.
    queue: null,
  },
  {
    id: 'Submitted',
    label: 'Submitted',
    description: 'Waiting for the destination department to assign an owner.',
    order: 1,
    badgeClass: 'bg-info-bg text-info-text',
    open: true,
    requesterActionRequired: false,
    assignable: false,
    queue: 'incoming',
  },
  {
    id: 'Assigned',
    label: 'Assigned',
    description: 'Has an owner in the destination department; work has not started yet.',
    order: 2,
    badgeClass: 'bg-info-bg text-info-text',
    open: true,
    requesterActionRequired: false,
    assignable: true,
    queue: 'assigned',
  },
  {
    id: 'InProgress',
    label: 'In Progress',
    description: 'Actively being worked on by the assignee.',
    order: 3,
    badgeClass: 'bg-info-bg text-info-text',
    open: true,
    requesterActionRequired: false,
    assignable: true,
    queue: 'in-progress',
  },
  {
    id: 'AwaitingInformation',
    label: 'Awaiting Information',
    shortLabel: 'Awaiting Info',
    description: 'Blocked on an answer from the requester. The SLA clock is paused.',
    order: 4,
    badgeClass: 'bg-warning-bg text-warning-text',
    open: true,
    requesterActionRequired: true,
    assignable: true,
    queue: 'waiting',
  },
  {
    id: 'Reopened',
    label: 'Reopened',
    description: 'Returned by the requester after resolution, rejection or closure. Needs re-work.',
    order: 5,
    badgeClass: 'bg-warning-bg text-warning-text',
    open: true,
    requesterActionRequired: false,
    assignable: true,
    // Reopened work is unassigned-or-re-assignable and competing for attention with new
    // arrivals, so it belongs in `incoming` rather than in a bucket of its own.
    queue: 'incoming',
  },
  {
    id: 'Resolved',
    label: 'Resolved',
    description: 'The destination has done the work. The requester must accept it or reopen it.',
    order: 6,
    badgeClass: 'bg-success-bg text-success-text',
    open: false,
    requesterActionRequired: true,
    assignable: false,
    queue: 'completed',
  },
  {
    id: 'Closed',
    label: 'Closed',
    description: 'Accepted by the requester. Can still be reopened with a stated reason.',
    order: 7,
    badgeClass: 'bg-surface-sunken text-text-secondary border border-border',
    open: false,
    requesterActionRequired: false,
    assignable: false,
    queue: 'archived',
  },
  {
    id: 'Rejected',
    label: 'Rejected',
    description: 'Declined by the destination with a mandatory reason. The requester may contest it.',
    order: 8,
    badgeClass: 'bg-error-bg text-error-text',
    open: false,
    requesterActionRequired: false,
    assignable: false,
    queue: 'archived',
  },
  {
    id: 'Cancelled',
    label: 'Cancelled',
    description: 'Withdrawn by the requester. This is the only state with no way out.',
    order: 9,
    badgeClass: 'bg-surface-sunken text-text-secondary line-through',
    open: false,
    requesterActionRequired: false,
    assignable: false,
    queue: 'archived',
  },
];

/**
 * Queue metadata. `statuses` is DERIVED from the status definitions above rather than listed
 * again, so a status can never be assigned to a bucket in one file and a different bucket in
 * another — the failure this whole file exists to prevent.
 */
export interface QueueDefinition {
  readonly id: QueueBucket;
  readonly label: string;
  readonly description: string;
}

export const QUEUE_DEFINITIONS: readonly QueueDefinition[] = [
  { id: 'incoming', label: 'Incoming', description: 'New and reopened requests waiting to be assigned.' },
  { id: 'assigned', label: 'Assigned', description: 'Owned but not yet started.' },
  { id: 'in-progress', label: 'In Progress', description: 'Actively being worked on.' },
  { id: 'waiting', label: 'Waiting', description: 'Blocked on the requester. SLA clock paused.' },
  { id: 'completed', label: 'Completed', description: 'Resolved and awaiting the requester’s acceptance.' },
  { id: 'archived', label: 'Archived', description: 'Closed, rejected or cancelled.' },
];
