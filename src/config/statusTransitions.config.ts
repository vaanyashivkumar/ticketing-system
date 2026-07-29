import type { TicketStatus, ActivityAction } from '@domain/types/ticket.types';

/**
 * The legal status-transition set (phase-0 §5 / FRONTEND_ARCHITECTURE §9). This is the
 * ONLY definition of what transitions are legal. `actors` is NORMATIVE and CONJUNCTIVE
 * with the Permission Engine (corrected A3): a transition requires BOTH the permission
 * AND an actor-relationship match. Overdue is NEVER a transition target (derived flag).
 */
export type TransitionActor = 'requester' | 'destination' | 'assignee' | 'system';

/**
 * The closed set of transition actions. Typed as a union (not `string`) so that
 * PERMISSION_FOR_ACTION is exhaustive BY THE COMPILER: adding an edge with a new action
 * fails the build until that action is mapped to a permission (WORKFLOW_ENGINE §A3).
 */
export type TransitionAction =
  | 'Submit'
  | 'Discard'
  | 'Assign'
  | 'Reject'
  | 'Cancel'
  | 'Start'
  | 'RequestInformation'
  | 'ProvideInformation'
  | 'Resolve'
  | 'Close'
  | 'Reopen'
  | 'Resume';

/**
 * Guards that must hold before an edge may commit (WORKFLOW_ENGINE §C.2 step 5).
 *
 * Mandatory text: BR-038 + BR-050 (every Reject), BR-041 (Resolve), BR-045 + BR-047 + R7
 * (Reopen), `questionRequired` on both RequestInformation edges (BDM §4.1 edges 7/10) and on
 * ProvideInformation (R8).
 *
 * `assigneeSet` is NOT a text guard — it is a precondition: BDM §9 rows 6 and 22 require an
 * assignee before work may Start or Resume. It became load-bearing when Start/Resume were widened
 * to their canonical A/D actors (D04 #7): while the code narrowed them to `['assignee']`, an
 * assignee was STRUCTURALLY guaranteed — you cannot be the assignee of an unassigned ticket. A/D
 * removes that guarantee, which is precisely why the spec pairs the wider actor set with this
 * guard.
 */
export type TransitionGuard =
  | 'reasonRequired'
  | 'resolutionNoteRequired'
  | 'questionRequired'
  | 'assigneeSet';

export interface TransitionDef {
  readonly from: TicketStatus;
  readonly to: TicketStatus;
  readonly action: TransitionAction;
  readonly actors: readonly TransitionActor[];
  readonly activity: ActivityAction;
  /** SLA side-effects to run when this edge commits. */
  readonly effects?: readonly ('anchorClock' | 'pauseClock' | 'resumeClock' | 'stampResolved' | 'stampClosed' | 'freshClock')[];
  /** Preconditions enforced at the chokepoint before the edge commits. */
  readonly guards?: readonly TransitionGuard[];
}

export const STATUS_TRANSITIONS: readonly TransitionDef[] = [
  { from: 'Draft', to: 'Submitted', action: 'Submit', actors: ['requester'], activity: 'SUBMITTED', effects: ['anchorClock'] },
  { from: 'Draft', to: 'Cancelled', action: 'Discard', actors: ['requester'], activity: 'CANCELLED' },

  { from: 'Submitted', to: 'Assigned', action: 'Assign', actors: ['destination'], activity: 'ASSIGNED' },
  { from: 'Submitted', to: 'Rejected', action: 'Reject', actors: ['destination'], activity: 'REJECTED', guards: ['reasonRequired'] },
  { from: 'Submitted', to: 'Cancelled', action: 'Cancel', actors: ['requester'], activity: 'CANCELLED' },

  // (A) CANONICAL — BDM §4.1 edge 6 (`A/D`) + §9 row 6 (`assigneeSet`). The code had narrowed
  // this to `['assignee']`, which no amendment ratified: A3 names only AutoClose (system) and
  // Resolve (assignee) as the narrow cases, never Start. The narrowing blocked a destination
  // colleague from picking up a stalled ticket — e.g. when the assignee is on leave (D04 #7).
  { from: 'Assigned', to: 'InProgress', action: 'Start', actors: ['assignee', 'destination'], activity: 'STARTED', guards: ['assigneeSet'] },
  { from: 'Assigned', to: 'AwaitingInformation', action: 'RequestInformation', actors: ['destination'], activity: 'INFORMATION_REQUESTED', effects: ['pauseClock'], guards: ['questionRequired'] },
  { from: 'Assigned', to: 'Rejected', action: 'Reject', actors: ['destination'], activity: 'REJECTED', guards: ['reasonRequired'] },
  { from: 'Assigned', to: 'Cancelled', action: 'Cancel', actors: ['requester'], activity: 'CANCELLED' },

  { from: 'InProgress', to: 'AwaitingInformation', action: 'RequestInformation', actors: ['destination'], activity: 'INFORMATION_REQUESTED', effects: ['pauseClock'], guards: ['questionRequired'] },
  { from: 'InProgress', to: 'Resolved', action: 'Resolve', actors: ['assignee'], activity: 'RESOLVED', effects: ['stampResolved'], guards: ['resolutionNoteRequired'] },
  { from: 'InProgress', to: 'Rejected', action: 'Reject', actors: ['destination'], activity: 'REJECTED', guards: ['reasonRequired'] },
  { from: 'InProgress', to: 'Cancelled', action: 'Cancel', actors: ['requester'], activity: 'CANCELLED' },

  // Awaiting Information → In Progress is the REQUESTER's action (un-pauses the SLA clock).
  // (A) RATIFIED — PROJECT_CONSTITUTION §9 R7/R8 register, entry **R8** (2026-07-16).
  // BDM §4.1 names `questionRequired` on both RequestInformation edges (7/10) but named no guard
  // on the ANSWER. Ratified because "provide information" that provides none is a bare status flip
  // that silently RESTARTS the SLA clock — exactly what the pause exists to prevent. The text is
  // stored as a Comment of kind 'info-response', so the answer lands in the conversation.
  { from: 'AwaitingInformation', to: 'InProgress', action: 'ProvideInformation', actors: ['requester'], activity: 'INFORMATION_PROVIDED', effects: ['resumeClock'], guards: ['questionRequired'] },
  { from: 'AwaitingInformation', to: 'Rejected', action: 'Reject', actors: ['destination'], activity: 'REJECTED', guards: ['reasonRequired'] },
  { from: 'AwaitingInformation', to: 'Cancelled', action: 'Cancel', actors: ['requester'], activity: 'CANCELLED' },

  // Two-step closure: destination resolves; REQUESTER closes (or auto-close). Destination never closes.
  { from: 'Resolved', to: 'Closed', action: 'Close', actors: ['requester', 'system'], activity: 'CLOSED', effects: ['stampClosed'] },
  { from: 'Resolved', to: 'Reopened', action: 'Reopen', actors: ['requester'], activity: 'REOPENED', effects: ['freshClock'], guards: ['reasonRequired'] },

  // (A) RATIFIED — PROJECT_CONSTITUTION §9, entry **R7** (2026-07-16).
  // BR-045 mandates a reason for Resolved→Reopened and BR-047 for Rejected→Reopened (Contest);
  // no BR named this third reopen path. Ratified so all three behave alike — reopening a CLOSED
  // ticket with no stated reason is the accountability gap two-step closure exists to close.
  { from: 'Closed', to: 'Reopened', action: 'Reopen', actors: ['requester'], activity: 'REOPENED', effects: ['freshClock'], guards: ['reasonRequired'] },
  { from: 'Rejected', to: 'Reopened', action: 'Reopen', actors: ['requester'], activity: 'REOPENED', effects: ['freshClock'], guards: ['reasonRequired'] },

  { from: 'Reopened', to: 'Assigned', action: 'Assign', actors: ['destination'], activity: 'ASSIGNED' },
  // (A) CANONICAL — BDM §4.1 edge 22 (`A/D`) + §9 row 22 (`assigneeSet`, "previous assignee
  // still valid"): a reopened ticket keeps its assignee, so Resume has one to check.
  { from: 'Reopened', to: 'InProgress', action: 'Resume', actors: ['assignee', 'destination'], activity: 'STARTED', guards: ['assigneeSet'] },
  // Canonical edge 23 (phase-0 §5 / BUSINESS_DOMAIN_MODEL §4.1). Without it a reopened
  // ticket has no rejection path — the only active state that could not be rejected.
  { from: 'Reopened', to: 'Rejected', action: 'Reject', actors: ['destination'], activity: 'REJECTED', guards: ['reasonRequired'] },
];

/*
 * `PRIORITY_ORDER` moved to the Priority Engine (`config/priority.config.ts` -> `rank`), which
 * is where the rest of a priority's behaviour now lives.
 *
 * `TERMINAL_STATUSES` was DELETED rather than moved. It listed `['Closed', 'Cancelled',
 * 'Rejected']` and was wrong on two of the three — `Closed -> Reopened` (R7) and
 * `Rejected -> Reopened` (BR-047, Contest) are both ratified edges in the table above, so only
 * `Cancelled` is genuinely terminal. Nothing imported it, so the error was invisible. The Status
 * Engine derives `isTerminal` from this table instead, where it cannot drift.
 */
