import type { Session, DepartmentCode } from '@domain/types/auth.types';
import type {
  ActivityAction,
  Attachment,
  CategoryData,
  Comment,
  Priority,
  Ticket,
} from '@domain/types/ticket.types';
import { categoryById, isRouteValid } from '@domain/routing/routingEngine';
import { initialSla, calendarOf, addBusinessHours, deriveFlag } from '@domain/sla/slaEngine';
import { applyTransition, mayPerform, requiredNoteGuard, resolveTransition } from '@domain/workflow/workflowEngine';
import { canOnTicket, authViewOf } from '@domain/permission/can';
import { fieldFormatError } from '@domain/validation/fieldFormat';
import { TicketRepository } from './ticketRepository';
import { NotificationService, type WorkflowEventType } from './notificationService';
import { ConfigService } from './configService';
import { ATTACHMENT_LIMITS } from '@config/attachments.config';
import { isAssignable, canChangePriority, statusLabel } from '@domain/workflow/statusEngine';
import { priorityLabel, isMoreUrgent } from '@domain/workflow/priorityEngine';
import { newId, nowIso } from '@lib/id';

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): ServiceResult<T> => ({ ok: true, value });
const fail = <T>(error: string): ServiceResult<T> => ({ ok: false, error });

/**
 * Re-assignment and re-prioritisation only make sense while the work is live and held by
 * someone. Both are non-status audited writes (BDM §11.8) and share the same window, which the
 * Status Engine states once as `assignable`.
 */

/**
 * ST-001: the storage layer now reports a failed write instead of swallowing it. Attachments are
 * base64 data: URLs in localStorage against a ~5 MB origin quota, so this is reachable — and a
 * failed write discards the WHOLE collection, not just the new record. Telling the user is the
 * entire point: the previous behaviour showed success while nothing persisted.
 */
const STORAGE_FULL =
  "Could not save — this browser's storage is full. NOTHING was saved. Remove an attachment and try again.";

function code(dest: DepartmentCode): string {
  return `${dest}-${String(TicketRepository.nextSeq(dest)).padStart(4, '0')}`;
}

const ACTIVITY_EVENT: Partial<Record<ActivityAction, WorkflowEventType>> = {
  SUBMITTED: 'TicketSubmitted',
  ASSIGNED: 'TicketAssigned',
  INFORMATION_REQUESTED: 'InformationRequested',
  INFORMATION_PROVIDED: 'InformationProvided',
  RESOLVED: 'TicketResolved',
  REJECTED: 'TicketRejected',
  CLOSED: 'TicketClosed',
  REOPENED: 'TicketReopened',
  CANCELLED: 'TicketCancelled',
};

export interface CreateTicketInput {
  toDeptCode: DepartmentCode;
  categoryId: string;
  subject: string;
  description: string;
  priority: Priority;
  subcategory?: string;
  categoryData: CategoryData;
}

/**
 * The BR-107/108/109 pre-write guard: reject oversize, over-count, over-budget AND wrong-type
 * BEFORE any write. Limits are configuration (BR-107/108), not literals in this service.
 *
 * Extracted so the Create form can run the SAME check while staging files (C32) instead of
 * duplicating the thresholds. A second copy would drift, and the copy that drifts is always the
 * one guarding the store budget — which is the load-bearing guard for ST-001: without it the
 * base64 store walks straight into the browser's ~5 MB quota.
 *
 * `pendingBytes` accounts for files already staged but not yet written, so three 1 MB screenshots
 * queued together are judged against their combined weight rather than each looking affordable
 * on its own.
 */
export function attachmentRejection(
  file: { size: number; contentType: string },
  existingCount: number,
  pendingBytes = 0,
): string | null {
  const { maxPerTicket, maxBytesPerFile, maxStoreBytes, acceptedMimeTypes } = ATTACHMENT_LIMITS;

  if (existingCount >= maxPerTicket) {
    return `A ticket may hold at most ${maxPerTicket} attachments.`;
  }
  if (file.size > maxBytesPerFile) {
    return `Each file must be ${Math.round(maxBytesPerFile / 1_048_576)} MB or smaller.`;
  }
  // BR-108, enforced at the SERVICE, not merely hinted by the picker's `accept` (D04 #40):
  // `accept` is a suggestion a determined user can bypass in the file dialog — and a drag-and-drop
  // zone bypasses it outright, since a dropped file never passes through the picker at all.
  if (!acceptedMimeTypes.includes(file.contentType)) {
    return 'Attachments must be PDF, PNG or JPEG.';
  }
  if (TicketRepository.attachmentBytes() + pendingBytes + file.size > maxStoreBytes) {
    return `Attachment storage is full (${Math.round(maxStoreBytes / 1_048_576)} MB limit across all tickets). Remove an attachment before adding another.`;
  }
  return null;
}

export const TicketService = {
  /** Create-ticket pipeline (P13 §6): permission → routing → validation → create/submit. */
  create(input: CreateTicketInput, session: Session, submit: boolean): ServiceResult<Ticket> {
    const from = session.user.departmentCode;
    // The administrative enable/disable override is injected here — the routing engine stays
    // pure. Without this the admin's "Disable" toggle governed nothing (D04 #1).
    if (!isRouteValid(from, input.toDeptCode, input.categoryId, ConfigService.isCategoryEnabled)) {
      // Distinguish "never allowed" from "withdrawn", so the requester is not told a lie.
      return fail(
        categoryById(from, input.toDeptCode, input.categoryId)
          ? 'That category has been disabled by an administrator and is no longer accepting new tickets.'
          : 'Your department cannot raise that category to that department.',
      );
    }
    const cat = categoryById(from, input.toDeptCode, input.categoryId)!;
    if (!input.subject.trim() || !input.description.trim()) {
      return fail('Subject and description are required.');
    }
    // Required category fields present?
    for (const fdef of cat.fields) {
      if (fdef.required && !String(input.categoryData[fdef.key] ?? '').trim()) {
        return fail(`Field "${fdef.label}" is required.`);
      }
    }
    // ...and well-formed (C30). A SEPARATE loop, so a missing required field is reported as
    // missing rather than as malformed. Applies to drafts too: a draft is allowed to be
    // INCOMPLETE, but storing a value already known to be malformed only defers the failure to
    // whoever submits it later.
    for (const fdef of cat.fields) {
      const formatError = fieldFormatError(fdef, input.categoryData[fdef.key]);
      if (formatError) return fail(formatError);
    }

    const at = nowIso();
    const actor = { id: session.user.id, name: session.user.name };
    const submitted = submit;
    const ticketCode = submitted ? code(input.toDeptCode) : '';

    const base: Ticket = {
      id: newId('tkt'),
      code: ticketCode,
      subject: input.subject.trim(),
      description: input.description.trim(),
      status: submitted ? 'Submitted' : 'Draft',
      priority: input.priority,
      fromDeptCode: from,
      toDeptCode: input.toDeptCode,
      categoryId: input.categoryId,
      categoryLabel: cat.label,
      ...(input.subcategory ? { subcategory: input.subcategory } : {}),
      categoryData: input.categoryData,
      createdById: session.user.id,
      createdByName: session.user.name,
      assignedToId: null,
      assignedToName: null,
      createdAt: at,
      updatedAt: at,
      sla: submitted
        ? initialSla(input.priority, at, ConfigService.slaPolicy(), calendarOf(ConfigService.org()))
        : { startedAt: null, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' },
      resolutionNote: null,
      reopenCount: 0,   // BR-052: a new ticket has been reopened zero times.
      rejectionReason: null,
      comments: [],
      attachments: [],
      activity: [
        { id: newId('act'), actorId: actor.id, actorName: actor.name, action: 'CREATED', at },
        ...(submitted
          ? [{ id: newId('act'), actorId: actor.id, actorName: actor.name, action: 'SUBMITTED' as ActivityAction, at, from: 'Draft', to: 'Submitted' }]
          : []),
      ],
    };

    // ST-001: never report success on a write that did not happen.
    if (!TicketRepository.save(base)) return fail(STORAGE_FULL);
    if (submitted) NotificationService.publish({ type: 'TicketSubmitted', ticket: base, actorId: actor.id });
    return ok(base);
  },

  /** Workflow chokepoint (P13 §11): the ONLY way a ticket's status changes post-creation. */
  commitAction(
    ticketId: string,
    action: string,
    session: Session,
    assignee?: { id: string; name: string },
    note?: string,
  ): ServiceResult<Ticket> {
    const ticket = TicketRepository.byId(ticketId);
    if (!ticket) return fail('Ticket not found.');

    const def = resolveTransition(ticket.status, action);
    if (!def) return fail(`Action "${action}" is not legal from status ${ticket.status}.`);

    // THE authorization chokepoint (FRONTEND_ARCHITECTURE §12 step 3, corrected A3): the
    // route-derived capability AND the edge's normative actors, conjunctively. This is the
    // decision that counts — the UI merely hides buttons.
    if (!mayPerform(session, def, ticket)) {
      return fail('You are not permitted to perform this action on this ticket.');
    }
    if (def.action === 'Assign' && !assignee) return fail('An assignee is required.');

    // `assigneeSet` (BDM §9 rows 6/22). Load-bearing since Start/Resume were restored to their
    // canonical A/D actors (D04 #7): the old `['assignee']` narrowing made an assignee
    // structurally certain, A/D does not. Work cannot be "in progress" with nobody doing it.
    if (def.guards?.includes('assigneeSet') && !ticket.assignedToId) {
      return fail('Assign this ticket to someone before starting work on it.');
    }

    // Mandatory-text guards (WORKFLOW_ENGINE §C.2 step 5; BR-038/041/045/047/050). Enforced HERE
    // so the rule holds regardless of what the UI offers — a resolution nobody can read is not a
    // resolution, and it is what the requester is being asked to accept.
    const guard = requiredNoteGuard(def);
    if (guard && !note?.trim()) {
      return fail(
        guard === 'resolutionNoteRequired'
          ? 'A resolution note is required — the requester has to read it to accept or reopen.'
          : guard === 'questionRequired'
            ? def.action === 'RequestInformation'
              ? 'State what information you need — the requester cannot answer a blank request, and the SLA clock pauses until they do.'
              : 'Provide the information requested — this restarts the SLA clock.'
            : 'A reason is required.',
      );
    }

    // Late code assignment if a draft is being submitted.
    const prepared = def.action === 'Submit' && !ticket.code ? { ...ticket, code: code(ticket.toDeptCode) } : ticket;

    const { ticket: next } = applyTransition(prepared, def, { id: session.user.id, name: session.user.name, departmentCode: session.user.departmentCode }, assignee, note);
    if (!TicketRepository.save(next)) return fail(STORAGE_FULL); // ST-001

    const evt = ACTIVITY_EVENT[def.activity];
    if (evt) NotificationService.publish({ type: evt, ticket: next, actorId: session.user.id });
    return ok(next);
  },

  /**
   * Re-assign a ticket to another member of the destination department.
   *
   * NOT a transition, by design: BUSINESS_DOMAIN_MODEL §1118 defines re-assignment as one of the
   * two "non-status audited writes" — it "changes `assigned_to_id` only, no clock touch". That is
   * exactly why no Assigned→Assigned edge exists in the canonical 23, and why inventing one would
   * have been wrong.
   *
   * Without this the Roles page advertised a "Re-assign" capability that existed nowhere (D04 #2),
   * REASSIGN_TICKET was a granted verb with no reachable UI (D04 #8), and a ticket held by someone
   * on leave could only be Rejected — discarding the request — or left to rot.
   */
  reassign(ticketId: string, assignee: { id: string; name: string }, session: Session): ServiceResult<Ticket> {
    const ticket = TicketRepository.byId(ticketId);
    if (!ticket) return fail('Ticket not found.');

    // Route-derived: re-assignment is the destination department's right.
    if (!canOnTicket(session, 'REASSIGN_TICKET', authViewOf(ticket))) {
      return fail('Only the destination department can re-assign this ticket.');
    }
    if (!isAssignable(ticket.status)) {
      return fail(`A ticket cannot be re-assigned while it is ${ticket.status}.`);
    }
    if (assignee.id === ticket.assignedToId) return fail('That person already holds this ticket.');

    const at = nowIso();
    const next: Ticket = {
      ...ticket,
      assignedToId: assignee.id,
      assignedToName: assignee.name,
      updatedAt: at,
      // No SLA effect — the clock belongs to the ticket, not to whoever is holding it.
      activity: [
        ...ticket.activity,
        {
          id: newId('act'),
          actorId: session.user.id,
          actorName: session.user.name,
          action: 'ASSIGNED',
          at,
          // B04 §Reassignment requires the PREVIOUS assignee on the record. `fromValue`/`toValue`,
          // not `from`/`to` — those mean STATUSES, and overloading them made a re-assignment
          // indistinguishable from a Submitted->Assigned transition.
          ...(ticket.assignedToName ? { fromValue: ticket.assignedToName } : {}),
          toValue: assignee.name,
          note: `Re-assigned to ${assignee.name}`,
        },
      ],
    };
    if (!TicketRepository.save(next)) return fail(STORAGE_FULL); // ST-001
    NotificationService.publish({ type: 'TicketAssigned', ticket: next, actorId: session.user.id });
    return ok(next);
  },

  /**
   * Change a ticket's priority — BR-060, the SECOND non-status audited write (BDM §11.8).
   *
   * This rule has been Category A since the first specification and was never implemented. The
   * permission existed (`CHANGE_PRIORITY`, with the Draft/post-Submit split already encoded), the
   * activity action existed (`PRIORITY_CHANGED`), the notification was specified (N3 / BR-095) —
   * and nothing in either codebase ever called any of them. Priority was chosen once on the
   * create form and then frozen for the life of the ticket.
   *
   * That is not cosmetic. Priority sets the SLA target (BRS §502): a request mis-filed as Low got
   * an 80-business-hour target and there was no way for the department receiving it to correct
   * that. Triage could see the mistake and not fix it.
   *
   * Unlike re-assignment, this DOES touch the clock — deliberately. The target is a function of
   * priority, so leaving `dueAt` at the old level would mean the ticket displayed one priority
   * and was measured against another. The clock is re-derived from the ORIGINAL anchor, never
   * restarted from now: re-grading must not hand a late ticket a fresh window.
   */
  changePriority(ticketId: string, priority: Priority, session: Session, reason?: string): ServiceResult<Ticket> {
    const ticket = TicketRepository.byId(ticketId);
    if (!ticket) return fail('Ticket not found.');

    // Route-derived: requester while it is a Draft, destination or sysadmin after Submit.
    if (!canOnTicket(session, 'CHANGE_PRIORITY', authViewOf(ticket))) {
      return fail(
        ticket.status === 'Draft'
          ? 'Only the requester can change the priority of a draft.'
          : 'Only the destination department can change the priority after submission.',
      );
    }
    if (!canChangePriority(ticket.status)) {
      return fail(`The priority of a ${statusLabel(ticket.status)} ticket can no longer be changed.`);
    }
    if (priority === ticket.priority) return fail(`This ticket is already ${priorityLabel(priority)}.`);

    const at = nowIso();
    const policy = ConfigService.slaPolicy();
    /**
     * Re-derive the due date from the ticket's own anchor. A Draft has no anchor yet (the clock
     * starts at Submit), so there is nothing to move — `initialSla` will use whatever priority
     * the ticket holds when it is finally submitted.
     */
    const sla = ticket.sla.startedAt
      ? {
          ...ticket.sla,
          dueAt: addBusinessHours(new Date(ticket.sla.startedAt), policy.resolutionHours[priority]).toISOString(),
        }
      : ticket.sla;

    const trimmed = reason?.trim() || undefined;
    const direction = isMoreUrgent(priority, ticket.priority) ? 'raised' : 'lowered';
    const next: Ticket = {
      ...ticket,
      priority,
      sla: { ...sla, flag: deriveFlag(sla, policy, new Date(at)) },
      updatedAt: at,
      activity: [
        ...ticket.activity,
        {
          id: newId('act'),
          actorId: session.user.id,
          actorName: session.user.name,
          action: 'PRIORITY_CHANGED',
          at,
          // The pair IS the record: a re-grade with no note of what it was re-graded from is not
          // an audit trail. In `fromValue`/`toValue`, because a priority is not a status.
          fromValue: ticket.priority,
          toValue: priority,
          note: trimmed ?? `Priority ${direction} to ${priorityLabel(priority)}`,
        },
      ],
    };
    if (!TicketRepository.save(next)) return fail(STORAGE_FULL); // ST-001
    // A draft is private to its creator, so there is nobody to tell yet.
    if (ticket.status !== 'Draft') {
      NotificationService.publish({ type: 'PriorityChanged', ticket: next, actorId: session.user.id });
    }
    return ok(next);
  },

  addComment(ticketId: string, body: string, session: Session, kind: Comment['kind'] = 'comment'): ServiceResult<Ticket> {
    const ticket = TicketRepository.byId(ticketId);
    if (!ticket) return fail('Ticket not found.');
    if (!body.trim()) return fail('Comment cannot be empty.');
    const at = nowIso();
    const comment: Comment = {
      id: newId('cmt'),
      authorId: session.user.id,
      authorName: session.user.name,
      departmentCode: session.user.departmentCode,
      body: body.trim(),
      kind,
      at,
    };
    const next: Ticket = {
      ...ticket,
      updatedAt: at,
      comments: [...ticket.comments, comment],
      activity: [...ticket.activity, { id: newId('act'), actorId: session.user.id, actorName: session.user.name, action: 'COMMENTED', at }],
    };
    if (!TicketRepository.save(next)) return fail(STORAGE_FULL); // ST-001
    NotificationService.publish({ type: 'CommentAdded', ticket: next, actorId: session.user.id });
    return ok(next);
  },

  addAttachment(
    ticketId: string,
    file: { fileName: string; contentType: string; size: number; dataUrl: string },
    session: Session,
  ): ServiceResult<Ticket> {
    const ticket = TicketRepository.byId(ticketId);
    if (!ticket) return fail('Ticket not found.');

    const rejection = attachmentRejection(file, ticket.attachments.length);
    if (rejection) return fail(rejection);

    const at = nowIso();
    const attachment: Attachment = {
      id: newId('att'),
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
      uploadedById: session.user.id,
      uploadedByName: session.user.name,
      at,
      dataUrl: file.dataUrl,
    };
    const next: Ticket = {
      ...ticket,
      updatedAt: at,
      attachments: [...ticket.attachments, attachment],
      activity: [...ticket.activity, { id: newId('act'), actorId: session.user.id, actorName: session.user.name, action: 'ATTACHMENT_ADDED', at, note: file.fileName }],
    };
    if (!TicketRepository.save(next)) return fail(STORAGE_FULL); // ST-001
    return ok(next);
  },
};
