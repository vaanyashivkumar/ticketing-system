/**
 * THIS MODULE HAS NO IMPORTS, AND MUST KEEP NONE.
 *
 * It is loaded by the API server at runtime (`services/notificationSubscriber.ts`) to compose the
 * text of every notification it writes, so anything imported here is imported into a Node process
 * that has none of the SPA's dependencies installed. It previously imported `lucide-react` for an
 * icon field, which would have made the server's boot depend on the browser app's `node_modules`
 * being present — a deploy that shipped only the API would have failed to start.
 *
 * The same rule and the same reason apply to `statuses.config.ts`. Icons live in
 * `features/notifications/notificationIcons.ts`, in a compiler-exhaustive map that cannot fall
 * out of step with the events defined here.
 */

/**
 * The event vocabulary. Defined HERE rather than in the notification service, because it is
 * configuration — and because the service lives behind a `@services/*` alias the API cannot
 * resolve, which broke the cross-codebase contract test the moment it tried to read this file.
 * The service re-exports it, so every existing import keeps working.
 */
export type WorkflowEventType =
  | 'TicketSubmitted'
  | 'TicketAssigned'
  | 'InformationRequested'
  | 'InformationProvided'
  | 'TicketResolved'
  | 'TicketRejected'
  | 'TicketClosed'
  | 'TicketReopened'
  | 'TicketCancelled'
  | 'PriorityChanged'
  | 'CommentAdded'
  /**
   * N13, the day-5 pending-closure warning (BR-094). Added when the scheduler that emits it was
   * built — the API was already writing this exact string into the notification table while it
   * existed in no vocabulary anywhere, so the centre rendered it with no category, no priority
   * word and, worst, no action label: the one thing B08 requires every notification to answer.
   */
  | 'AutoCloseWarning';

/**
 * NOTIFICATION TEMPLATE CATALOGUE (B08 §Notification Template Model).
 *
 * B08: "Use reusable templates. Do not hardcode messages across components." They were hardcoded
 * in TWO places — a `message()` switch in the SPA's notification service and a `MESSAGE` map in
 * the API's subscriber — with no test holding them together. Two independently maintained copies
 * of user-facing text is the same failure mode that produced three disagreeing status-label maps
 * and, in B05, a feed that described a status transition as a re-assignment.
 *
 * This file is the single definition, and it is now the ONLY one: the API imports it directly and
 * its `MESSAGE` map is deleted, so the two copies are one. The API's `contract.test.ts` asserts
 * that every event the server can publish resolves to a template here.
 *
 * WHAT A TEMPLATE DELIBERATELY DOES NOT CARRY: the ticket subject, the comment body, the
 * information request, the rejection reason. B08 §Security: "Notification previews should reveal
 * only the minimum necessary information." A notification reaches a whole destination department;
 * the ticket itself is scope-clamped and permission-checked when opened. Putting the content in
 * the preview would route confidential text around the control that protects it.
 */

export type NotificationCategory =
  | 'Assignment'
  | 'Workflow'
  | 'Comment'
  | 'Information'
  | 'Resolution'
  | 'Priority';

/**
 * B08 asks for Low / Normal / High / Critical.
 *
 * `Critical` is deliberately NOT defined. B08 itself says it "must be reserved for genuinely
 * urgent operational events such as approved SLA breaches" — and this build has no SLA sweeper, so
 * no breach notification is ever emitted. A priority level with no event that can carry it would
 * be a band users learn to look for and never see.
 */
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface NotificationCategoryInfo {
  readonly label: string;
  readonly description: string;
  /**
   * Shape and text carry the meaning; the token only reinforces it (phase-2 §9). A plain string,
   * so it costs this module no dependency.
   *
   * There was an `icon` here too. It was the reason this file imported `lucide-react`, and NOTHING
   * READ IT — the notification centre badges the category with its label and colour, and takes its
   * row glyph from the template. A declared field with no consumer is the `TERMINAL_STATUSES`
   * defect again: it looks like a decision that was made, and it is only a decision that was
   * typed. Deleted rather than wired up, because the badge does not want a second glyph.
   */
  readonly badgeClass: string;
}

export const NOTIFICATION_CATEGORIES: Readonly<Record<NotificationCategory, NotificationCategoryInfo>> = {
  Assignment: { label: 'Assignment', description: 'Work given to you or moved between people.', badgeClass: 'bg-info-bg text-info-text' },
  Workflow: { label: 'Workflow', description: 'A ticket moved through its lifecycle.', badgeClass: 'bg-surface-sunken text-text-secondary border border-border' },
  Comment: { label: 'Comment', description: 'Someone added to the conversation.', badgeClass: 'bg-surface-sunken text-text-secondary border border-border' },
  Information: { label: 'Information', description: 'A question was asked, or answered.', badgeClass: 'bg-warning-bg text-warning-text' },
  Resolution: { label: 'Resolution', description: 'Work was finished, accepted or contested.', badgeClass: 'bg-success-bg text-success-text' },
  Priority: { label: 'Priority', description: 'Urgency was re-graded, which moves the deadline.', badgeClass: 'bg-warning-bg text-warning-text' },
};

export interface NotificationTemplate {
  readonly event: WorkflowEventType;
  readonly category: NotificationCategory;
  readonly priority: NotificationPriority;
  /**
   * The message, built from the ticket CODE and the actor's name only — never ticket content.
   * `code` is the reference a recipient needs; everything else is behind the permission check.
   */
  readonly compose: (ctx: { readonly code: string; readonly actorName: string }) => string;
  /** What the recipient is expected to do. B08: every notification answers "what next?". */
  readonly actionLabel: string;
  /** Documented recipient rule. The resolution itself lives in the notification service. */
  readonly recipients: string;
}

const TEMPLATES: readonly NotificationTemplate[] = [
  {
    event: 'TicketSubmitted',
    category: 'Workflow',
    priority: 'high',
    compose: ({ code, actorName }) => `${code} was submitted by ${actorName} and needs assigning`,
    actionLabel: 'Assign it',
    recipients: 'The destination department’s members.',
  },
  {
    event: 'TicketAssigned',
    category: 'Assignment',
    priority: 'high',
    compose: ({ code }) => `${code} was assigned`,
    actionLabel: 'Start work',
    recipients: 'The new assignee, plus the requester who is waiting to hear it was picked up.',
  },
  {
    event: 'InformationRequested',
    category: 'Information',
    priority: 'high',
    // The question itself is NOT here. It lands in the ticket conversation, behind the
    // permission check — a question can contain anything the asker typed.
    compose: ({ code }) => `${code} needs more information from you`,
    actionLabel: 'Answer the question',
    recipients: 'The requester only.',
  },
  {
    event: 'InformationProvided',
    category: 'Information',
    priority: 'normal',
    compose: ({ code }) => `${code} — the requester has answered, so work can resume`,
    actionLabel: 'Resume work',
    recipients: 'The destination department’s members.',
  },
  {
    event: 'TicketResolved',
    category: 'Resolution',
    priority: 'high',
    compose: ({ code }) => `${code} was resolved — accept it or reopen it`,
    actionLabel: 'Accept or reopen',
    recipients: 'The requester only. Two-step closure is theirs to complete.',
  },
  {
    event: 'TicketRejected',
    category: 'Resolution',
    priority: 'high',
    // The rejection REASON is mandatory and is on the ticket. It is not previewed here.
    compose: ({ code }) => `${code} was rejected — the reason is on the ticket`,
    actionLabel: 'Read the reason',
    recipients: 'The requester only.',
  },
  {
    event: 'TicketClosed',
    category: 'Resolution',
    priority: 'low',
    compose: ({ code, actorName }) => `${code} was closed by ${actorName}`,
    actionLabel: 'View the ticket',
    recipients: 'The destination department — it releases their work.',
  },
  {
    event: 'TicketReopened',
    category: 'Resolution',
    priority: 'high',
    compose: ({ code }) => `${code} was reopened and needs attention again`,
    actionLabel: 'Pick it back up',
    recipients: 'The destination department’s members.',
  },
  {
    event: 'TicketCancelled',
    category: 'Workflow',
    priority: 'low',
    compose: ({ code, actorName }) => `${code} was cancelled by ${actorName}`,
    actionLabel: 'View the ticket',
    recipients: 'The destination department.',
  },
  {
    event: 'PriorityChanged',
    category: 'Priority',
    priority: 'normal',
    // The new priority IS included: it is the fact, it moves the deadline, and it is not
    // confidential — BR-095 sends this to the requester and assignee precisely so they know.
    compose: ({ code }) => `${code} — the priority changed, so the deadline has moved`,
    actionLabel: 'Check the new target',
    recipients: 'Requester and assignee only, never watchers (BR-095).',
  },
  {
    event: 'CommentAdded',
    category: 'Comment',
    priority: 'low',
    // Never the comment body.
    compose: ({ code, actorName }) => `${actorName} commented on ${code}`,
    actionLabel: 'Read the comment',
    recipients: 'Both parties to the ticket, minus the author.',
  },
  {
    event: 'AutoCloseWarning',
    category: 'Resolution',
    // HIGH, and this is the one notification where that is unarguable: it is the last prompt
    // before the system takes the decision away. Ignoring it closes the ticket.
    priority: 'high',
    /**
     * The window is NOT interpolated. `compose` takes a code and an actor, and the number of days
     * is policy that lives in `CLOSURE_POLICY` on the server — putting it here would create a
     * second place where the closure window is stated, free to disagree with the one that
     * actually schedules the close. "Soon" is vague; a wrong number is worse.
     */
    compose: ({ code }) => `${code} closes automatically soon unless you reopen it`,
    actionLabel: 'Accept or reopen',
    recipients: 'The requester only — they are the one who can still act.',
  },
];

const BY_EVENT = new Map<WorkflowEventType, NotificationTemplate>(TEMPLATES.map((t) => [t.event, t]));

export function notificationTemplate(event: WorkflowEventType): NotificationTemplate | undefined {
  return BY_EVENT.get(event);
}

export { TEMPLATES as NOTIFICATION_TEMPLATES };

/**
 * THE single composition entry point — called by the SPA's notification service and, over the
 * repo boundary, by the API's notification subscriber. Both used to compose their own.
 *
 * Sharing the templates alone would not have been enough, because the two RULES around them had
 * also diverged. Only the API handled a ticket with no code, and only for cancellation:
 * `${e.ticket.code || 'A draft'} was cancelled`. A draft has no code until it is submitted, so
 * every other event composed from an empty string would have opened with a space. Cancel and
 * Discard are the only edges a draft can take today, which is why nothing else showed it — a
 * property of the current transition table, not of this function. Handling it here means a new
 * draft-stage event cannot reintroduce it.
 *
 * The missing-template fallback is deliberately a plain sentence rather than a throw. A
 * notification whose template is absent is still a real event that happened to a real person, and
 * losing it silently would be worse than telling them something changed. The API's contract test
 * asserts this branch is unreachable for every event the server can actually publish.
 */
export function composeNotificationMessage(
  event: WorkflowEventType,
  ctx: { readonly code: string; readonly actorName: string },
): string {
  const code = ctx.code || 'A draft';
  const template = BY_EVENT.get(event);
  return template ? template.compose({ code, actorName: ctx.actorName }) : `${code} was updated`;
}

/**
 * Priority presentation. A WORD, not only a colour — B08 §Notification Priorities is explicit,
 * and `normal` renders nothing at all because labelling the default is noise that trains people
 * to stop reading the labels that matter.
 */
export const PRIORITY_INFO: Readonly<Record<NotificationPriority, { label: string | null; badgeClass: string }>> = {
  high: { label: 'Needs attention', badgeClass: 'bg-warning-bg text-warning-text' },
  normal: { label: null, badgeClass: '' },
  low: { label: null, badgeClass: '' },
};

/**
 * B08 asks it is worth recording rather than silently dropping. Rendered on the notification
 * centre so the omission is a stated position.
 */
export const NOTIFICATION_GAPS: readonly { readonly asked: string; readonly why: string }[] = [
  {
    asked: 'SLA warning, at-risk and breach notifications',
    why: 'No scheduler runs, so no breach is ever detected and nobody is ever warned. The recipients are configured (BR-096) and the trigger does not exist — a notification for an event that never fires would be a category users learn to ignore.',
  },
  {
    asked: 'Approval requested / approved notifications',
    why: 'There is no approval sub-workflow. Reject is a destination decline with a mandatory reason, not the negative half of an approval.',
  },
  {
    asked: 'Ticket unassigned, ticket escalated, ticket returned to requester',
    why: 'None is a recorded event. Unassignment does not exist as an action; escalation is an SLA sweep that does not run; “returned to requester” is Awaiting Information, which is already covered.',
  },
  {
    asked: 'Critical priority band',
    why: 'B08 reserves it for SLA breaches, which are never emitted. A band with no event that can carry it is one users look for and never see.',
  },
  {
    asked: 'Email, SMS, push and external messaging',
    why: 'No delivery infrastructure exists. The feature flags for email and push are registered with implemented:false, and the configuration service refuses to enable a flag whose capability does not exist.',
  },
  {
    asked: 'Digest delivery',
    why: 'Digests need scheduling, and there is no scheduler. Aggregating eligible events is straightforward; delivering them on a cadence is the part that does not exist.',
  },
];
