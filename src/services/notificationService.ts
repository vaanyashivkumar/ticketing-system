import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { MOCK_USERS } from '@config/mockUsers.config';
import { StorageAdapter } from './storage/localStorageAdapter';
import { composeNotificationMessage, type WorkflowEventType } from '@config/notifications.config';
import { newId, nowIso } from '@lib/id';

/**
 * Notification Engine (P13 §16; FRONTEND_ARCHITECTURE §14). EVENT-SUBSCRIBED: the workflow
 * PUBLISHES a WorkflowEvent (keyed by business fact), this engine SUBSCRIBES and maps it to
 * recipients + an in-app Notification. Author-suppressed: the actor never gets its own event.
 * A future Email/Push channel subscribes to the SAME events with no workflow change.
 */
/** Re-exported so every existing import keeps working; the union itself is configuration. */
export type { WorkflowEventType } from '@config/notifications.config';

export interface WorkflowEvent {
  readonly type: WorkflowEventType;
  readonly ticket: Ticket;
  readonly actorId: string;
}

/**
 * A leave-chain event. Separate from `WorkflowEvent` because a leave application is not a ticket
 * and never becomes one — giving it a fake `Ticket` to reuse the pipeline would put a second,
 * lying shape into the store.
 *
 * `travelled` is the approvers it has already passed through, and it is what makes the outcome
 * come back "the very same path": a decision is announced to those people and to the applicant,
 * never to a stage the application never reached.
 */
export interface LeaveNotificationEvent {
  readonly type: 'LeaveAwaitingApproval' | 'LeaveApproved' | 'LeaveRejected' | 'LeaveCancelled';
  readonly leaveId: string;
  readonly code: string;
  readonly employeeId: string;
  readonly approverId: string | null;
  readonly travelled: readonly string[];
  readonly actorId: string;
}

export interface AppNotification {
  readonly id: string;
  readonly recipientId: string;
  /** The ticket this is about. Empty for a leave notification — see `leaveId`. */
  readonly ticketId: string;
  /** `FIN-0001` or `LV-0001`: whichever code the message names. */
  readonly ticketCode: string;
  readonly type: WorkflowEventType;
  readonly message: string;
  readonly at: string;
  /** Set instead of `ticketId` when this is about a leave application. Exactly one is ever set. */
  readonly leaveId?: string;
  read: boolean;
}

const DOMAIN = 'notifications';

/**
 * Bounded, like the audit trail (D04 #31). This collection grew WITHOUT LIMIT while
 * `StorageAdapter.append` — the helper that exists precisely to cap this class of data — sat
 * unused next door. Unbounded growth in localStorage ends as a quota failure, i.e. ST-001.
 * Oldest-first eviction is safe here: a notification is a nudge, not a record. The ticket's
 * activity trail is the record, and it is never truncated.
 */
const NOTIFICATION_CAP = 500;

function usersInDept(code: DepartmentCode): string[] {
  return MOCK_USERS.filter((u) => u.departmentCode === code).map((u) => u.id);
}

/** Resolve recipients for an event (author-suppressed). */
function recipients(evt: WorkflowEvent): string[] {
  const t = evt.ticket;
  const source = usersInDept(t.fromDeptCode);
  const dest = usersInDept(t.toDeptCode);
  let list: string[] = [];
  switch (evt.type) {
    case 'TicketSubmitted':
    case 'TicketReopened':
    case 'InformationProvided':
      list = dest; // the receiving department must act
      break;
    case 'TicketAssigned':
      list = [...(t.assignedToId ? [t.assignedToId] : []), t.createdById];
      break;
    case 'InformationRequested':
    case 'TicketResolved':
    case 'TicketRejected':
      list = [t.createdById]; // the requester
      break;
    case 'TicketClosed':
    case 'TicketCancelled':
      list = dest;
      break;
    /**
      * N3 — BR-095 is explicit that the priority-change recipients are "Requester + Assignee
      * only (not Watchers)". Deliberately NOT the whole destination department: a re-grade is
      * news to the two people whose work it changes, and broadcasting it to a queue is how
      * notification feeds become noise nobody reads.
      */
    case 'PriorityChanged':
      list = [t.createdById, ...(t.assignedToId ? [t.assignedToId] : [])];
      break;
    case 'CommentAdded':
      list = [...source, ...dest]; // both parties; author suppressed below
      break;
  }
  return [...new Set(list)].filter((id) => id !== evt.actorId); // author suppression
}

/**
 * Compose from the TEMPLATE CATALOGUE, not from a switch here.
 *
 * The text lived in a `switch` in this file and in a `MESSAGE` map in the API's subscriber — two
 * independently maintained copies of the same user-facing strings, with nothing holding them
 * together. B08: "Do not hardcode messages across components."
 *
 * The API now calls `composeNotificationMessage` too, importing the catalogue across the repo
 * boundary, so the second copy is gone rather than merely tested against. All this function does
 * is resolve the actor's NAME — the one thing the two runtimes genuinely differ on, because here
 * it is a lookup in mock config and there it is the authenticated session.
 */
function message(evt: WorkflowEvent): string {
  const actorName = MOCK_USERS.find((u) => u.id === evt.actorId)?.name ?? 'Someone';
  return composeNotificationMessage(evt.type, { code: evt.ticket.code, actorName });
}

export const NotificationService = {
  /** The single subscription point. Workflow publishes here; never fired from a button. */
  publish(evt: WorkflowEvent): void {
    const notes = recipients(evt).map<AppNotification>((recipientId) => ({
      id: newId('ntf'),
      recipientId,
      ticketId: evt.ticket.id,
      ticketCode: evt.ticket.code,
      type: evt.type,
      message: message(evt),
      at: nowIso(),
      read: false,
    }));
    if (notes.length) {
      const all = StorageAdapter.read<AppNotification[]>(DOMAIN) ?? [];
      StorageAdapter.write(DOMAIN, [...all, ...notes].slice(-NOTIFICATION_CAP));
    }
  },

  /**
   * The leave chain's publish point — forward to the waiting approver, backward along the path.
   *
   * Recipient resolution mirrors the API's `leaveRecipients` decision for decision, but is not
   * shared with it: the rule is the same, the data source is not (mock config here, Postgres with
   * an `active` filter there). There is no shared implementation to have, only a shared decision.
   *
   * NO department fan-out anywhere in here, unlike a ticket. A leave application is between one
   * person and their approval chain; sending it to a whole department would be a privacy leak
   * wearing a notification's clothes.
   */
  publishLeave(evt: LeaveNotificationEvent): void {
    const back = [...evt.travelled].reverse();
    const to =
      evt.type === 'LeaveAwaitingApproval'
        ? (evt.approverId ? [evt.approverId] : [])
        : evt.type === 'LeaveCancelled'
          ? [...(evt.approverId ? [evt.approverId] : []), ...back]
          : [...back, evt.employeeId];

    const actorName = MOCK_USERS.find((u) => u.id === evt.actorId)?.name ?? 'Someone';
    const notes = [...new Set(to)]
      .filter((id) => id !== evt.actorId) // author suppression, the same rule tickets follow
      .map<AppNotification>((recipientId) => ({
        id: newId('ntf'),
        recipientId,
        ticketId: '',
        ticketCode: evt.code,
        leaveId: evt.leaveId,
        type: evt.type,
        message: composeNotificationMessage(evt.type, { code: evt.code, actorName }),
        at: nowIso(),
        read: false,
      }));

    if (notes.length) {
      const all = StorageAdapter.read<AppNotification[]>(DOMAIN) ?? [];
      StorageAdapter.write(DOMAIN, [...all, ...notes].slice(-NOTIFICATION_CAP));
    }
  },

  forUser(userId: string): AppNotification[] {
    return (StorageAdapter.read<AppNotification[]>(DOMAIN) ?? [])
      .filter((n) => n.recipientId === userId)
      .sort((a, b) => b.at.localeCompare(a.at));
  },

  markAllRead(userId: string): void {
    const all = StorageAdapter.read<AppNotification[]>(DOMAIN) ?? [];
    StorageAdapter.write(
      DOMAIN,
      all.map((n) => (n.recipientId === userId ? { ...n, read: true } : n)),
    );
  },
};
