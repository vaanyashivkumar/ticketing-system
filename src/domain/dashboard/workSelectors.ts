import type { Session } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import { isOpen, requesterActionRequired } from '@domain/workflow/statusEngine';
import { priorityDef } from '@domain/workflow/priorityEngine';
import type { DataScope } from './dataScope';

/**
 * WORK SELECTORS — the named, ordered ticket sets a dashboard queue widget can show.
 *
 * Two defects in the dashboard this replaces are structural, not cosmetic, and both are fixed by
 * making the ORDER part of the definition rather than an afterthought:
 *
 *   - The "Needs attention" list was never sorted and was then truncated to six rows. With twenty
 *     qualifying tickets the user saw an arbitrary six in store-insertion order, so an Overdue
 *     Urgent ticket sitting at index seven was structurally invisible on the screen whose entire
 *     job is to surface it.
 *   - The list showed a true total ("Needs attention 23") beside six rows and no way to reach the
 *     other seventeen. A count with no drill-down is a dead end.
 *
 * So every selector below declares its sort, and every widget that renders one is required to
 * carry a `viewAll` route. The preview is a preview; it is never the only way to the work.
 */

export type WorkSelectorId =
  | 'needs-me'
  | 'my-open-requests'
  | 'assigned-to-me'
  | 'unassigned-incoming'
  | 'incoming-open'
  | 'at-risk';

export type WorkSort = 'sla-then-priority' | 'oldest-first' | 'priority';

export interface WorkSelector {
  readonly id: WorkSelectorId;
  readonly label: string;
  /** The operational question the list answers. */
  readonly question: string;
  readonly dataScope: DataScope;
  readonly sort: WorkSort;
  /** Why this order — rendered, so the truncation is explicable rather than arbitrary. */
  readonly sortLabel: string;
  readonly emptyTitle: string;
  readonly emptyDescription: string;
  readonly select: (tickets: readonly Ticket[], session: Session) => readonly Ticket[];
}

const slaRank = (t: Ticket): number => (t.sla.flag === 'Overdue' ? 0 : t.sla.flag === 'DueSoon' ? 1 : 2);

/** Oldest first by creation — the ageing signal for an intake queue. */
const byOldest = (a: Ticket, b: Ticket) => a.createdAt.localeCompare(b.createdAt);

export function sortWork(tickets: readonly Ticket[], sort: WorkSort): Ticket[] {
  const rows = [...tickets];
  switch (sort) {
    case 'sla-then-priority':
      // Breaching first, then most urgent, then oldest. A stable third key matters: without it
      // two Overdue Urgent tickets could swap places between renders, and a list that reorders
      // itself while being read is one people stop trusting.
      return rows.sort(
        (a, b) =>
          slaRank(a) - slaRank(b) ||
          priorityDef(a.priority).rank - priorityDef(b.priority).rank ||
          byOldest(a, b),
      );
    case 'oldest-first':
      return rows.sort(byOldest);
    case 'priority':
      return rows.sort((a, b) => priorityDef(a.priority).rank - priorityDef(b.priority).rank || byOldest(a, b));
  }
}

export const WORK_SELECTORS: readonly WorkSelector[] = [
  {
    id: 'needs-me',
    label: 'Needs me',
    question: 'What is blocked on an answer or a decision from me?',
    dataScope: 'created-by-me',
    sort: 'sla-then-priority',
    sortLabel: 'Breaching first, then most urgent',
    emptyTitle: 'Nothing is waiting on you',
    emptyDescription: 'When a department asks you a question, or resolves something for you to accept, it appears here.',
    /**
     * NOT wrapped in `isOpen`. The predicate names the two states where the requester is the next
     * actor — Awaiting Information and Resolved — and `Resolved` is deliberately not an open
     * status. The page this replaces applied an `isOpen` pre-filter around the same rule, which
     * made the Resolved half unreachable: the list looked right and could not contain the case
     * two-step closure exists to create.
     *
     * It is also NOT gated on being a requester-only department. A Finance user who raised a
     * ticket to Academics is a requester on that ticket, and the previous gate meant their own
     * blocked request appeared nowhere at all.
     */
    select: (tickets, session) =>
      tickets.filter(
        (t) => t.createdById === session.user.id && t.status !== 'Draft' && requesterActionRequired(t.status),
      ),
  },
  {
    id: 'my-open-requests',
    label: 'My open requests',
    question: 'Where have my requests got to?',
    dataScope: 'created-by-me',
    sort: 'sla-then-priority',
    sortLabel: 'Breaching first, then most urgent',
    emptyTitle: 'No open requests',
    emptyDescription: 'Everything you have raised is finished or not yet submitted.',
    select: (tickets, session) => tickets.filter((t) => t.createdById === session.user.id && isOpen(t.status)),
  },
  {
    id: 'assigned-to-me',
    label: 'Assigned to me',
    question: 'What is on my desk?',
    dataScope: 'assigned-to-me',
    sort: 'sla-then-priority',
    sortLabel: 'Breaching first, then most urgent',
    emptyTitle: 'Nothing assigned to you',
    emptyDescription: 'Work assigned to you from your department queue will appear here.',
    select: (tickets, session) => tickets.filter((t) => t.assignedToId === session.user.id && isOpen(t.status)),
  },
  {
    id: 'unassigned-incoming',
    label: 'Waiting to be assigned',
    question: 'What has arrived that nobody owns yet?',
    dataScope: 'dept-incoming',
    // Oldest first, not SLA first: an intake queue is about how long something has sat unclaimed,
    // and the SLA clock has barely moved on most of it.
    sort: 'oldest-first',
    sortLabel: 'Longest waiting first',
    emptyTitle: 'Everything is assigned',
    emptyDescription: 'New arrivals in your queue will show here until someone picks them up.',
    select: (tickets) => tickets.filter((t) => !t.assignedToId && isOpen(t.status)),
  },
  {
    id: 'incoming-open',
    label: 'Department queue',
    question: 'What is my department working on?',
    dataScope: 'dept-incoming',
    sort: 'sla-then-priority',
    sortLabel: 'Breaching first, then most urgent',
    emptyTitle: 'Queue is clear',
    emptyDescription: 'No open work is routed to your department right now.',
    select: (tickets) => tickets.filter((t) => isOpen(t.status)),
  },
  {
    id: 'at-risk',
    label: 'At risk',
    question: 'What breaches next if nobody acts?',
    dataScope: 'department-wide',
    sort: 'sla-then-priority',
    sortLabel: 'Breaching first, then most urgent',
    emptyTitle: 'Nothing is at risk',
    emptyDescription: 'No open ticket in your scope is overdue or close to its target.',
    select: (tickets) =>
      tickets.filter((t) => isOpen(t.status) && (t.sla.flag === 'Overdue' || t.sla.flag === 'DueSoon')),
  },
];

const BY_ID = new Map<WorkSelectorId, WorkSelector>(WORK_SELECTORS.map((s) => [s.id, s]));

export function workSelector(id: WorkSelectorId): WorkSelector {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`No work selector for "${id}"`);
  return s;
}
