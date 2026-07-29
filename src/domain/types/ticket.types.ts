/**
 * Ticket domain types (FRONTEND_ARCHITECTURE §5 canonical set). Defined once.
 * The lifecycle is the 10-status set (phase-0 §5); Overdue is NOT a status — it is a
 * derived slaStatus flag. Status transitions go ONLY through the Workflow Engine.
 */
import type { DepartmentCode } from './auth.types';

export type TicketStatus =
  | 'Draft'
  | 'Submitted'
  | 'Assigned'
  | 'InProgress'
  | 'AwaitingInformation'
  | 'Resolved'
  | 'Closed'
  | 'Rejected'
  | 'Cancelled'
  | 'Reopened';

export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent';

/** Derived SLA flag (never stored as status). */
export type SlaFlag = 'OnTrack' | 'DueSoon' | 'Overdue';

/**
 * `email` and `tel` give the rendered control the right input type (email keyboard, numeric
 * keypad, autofill). `contact` is phase-0 §7's single field accepting EITHER an email or a phone
 * — it has no narrower input type, so it renders as text.
 *
 * `email`, `tel`, `contact` and `url` also carry a FORMAT rule, enforced in
 * `domain/validation/fieldFormat.ts` and applied by `TicketService.create` (the authority).
 * The remaining types have no format rule by design — see the RULES map there.
 */
export type FieldType = 'text' | 'longtext' | 'number' | 'money' | 'date' | 'select' | 'url' | 'email' | 'tel' | 'contact';

export interface FieldDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly help?: string;
  /** ⚠️ C = provisional/unratified field set (OQ-25/OQ-26). */
  readonly provisional?: boolean;
  /**
   * Offers an explicit "Not applicable" tickbox beside the control (C36). Ticking it stores the
   * `NOT_APPLICABLE` sentinel rather than leaving the field empty, so a deliberate "no value
   * applies" is distinguishable from an omission — on a REQUIRED field, blank still means the
   * requester has not answered, and N/A means they have.
   */
  readonly notApplicable?: boolean;
}

export type CategoryData = Readonly<Record<string, string | number>>;

export type ActivityAction =
  | 'CREATED'
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'STARTED'
  | 'INFORMATION_REQUESTED'
  | 'INFORMATION_PROVIDED'
  | 'PRIORITY_CHANGED'
  | 'RESOLVED'
  | 'REJECTED'
  | 'CLOSED'
  | 'CANCELLED'
  | 'REOPENED'
  | 'COMMENTED'
  | 'ATTACHMENT_ADDED';

export interface ActivityEntry {
  readonly id: string;
  readonly actorId: string;
  readonly actorName: string;
  readonly action: ActivityAction;
  readonly at: string;
  /** Status transitions only. A status is what these mean, and nothing else may use them. */
  readonly from?: string;
  readonly to?: string;
  /**
   * The two NON-STATUS audited writes (BDM §11.8): re-assignment and re-prioritisation.
   *
   * A separate pair, mirroring `ActivityLog.fromValue`/`toValue` in the database. They used to
   * share `from`/`to` with the transitions, and the ambiguity was not theoretical: the dashboard
   * activity feed rendered "James re-assigned it from Submitted to Assigned" — a genuine
   * Submitted->Assigned TRANSITION, described as a re-assignment, because the only way to tell
   * them apart had been thrown away.
   */
  readonly fromValue?: string;
  readonly toValue?: string;
  readonly note?: string;
}

export interface Comment {
  readonly id: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly departmentCode: DepartmentCode;
  readonly body: string;
  readonly kind: 'comment' | 'info-request' | 'info-response';
  readonly at: string;
}

export interface Attachment {
  readonly id: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
  readonly uploadedById: string;
  readonly uploadedByName: string;
  readonly at: string;
  /** Prototype: a data: URL held locally. A future backend swaps this for a download URL. */
  readonly dataUrl: string;
}

export interface SlaState {
  readonly startedAt: string | null;
  readonly dueAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  /** Accumulated paused business-ms while in Awaiting Information. */
  readonly pausedMsAccrued: number;
  readonly pausedSince: string | null;
  readonly flag: SlaFlag;
}

export interface Ticket {
  readonly id: string;
  readonly code: string;
  readonly subject: string;
  readonly description: string;
  readonly status: TicketStatus;
  readonly priority: Priority;

  readonly fromDeptCode: DepartmentCode;
  readonly toDeptCode: DepartmentCode;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly subcategory?: string;
  readonly categoryData: CategoryData;

  readonly createdById: string;
  readonly createdByName: string;
  readonly assignedToId: string | null;
  readonly assignedToName: string | null;

  readonly createdAt: string;
  readonly updatedAt: string;

  /**
   * Closure evidence (BUSINESS_DOMAIN_MODEL §594-595; BR-038/041/050).
   *
   * Mandatory at the moment of the transition — enforced by the `resolutionNoteRequired` /
   * `reasonRequired` guards on the edge, not by the type (they are legitimately null until that
   * transition happens). Without them the destination resolved SILENTLY and the requester was
   * asked to accept-or-reopen a resolution they could not read, which removes the entire point
   * of two-step closure. Owner: assignee (note) / destination (reason); visible to source+dest.
   */
  readonly resolutionNote: string | null;
  readonly rejectionReason: string | null;

  /**
   * How many times this ticket has been reopened (BUSINESS_DOMAIN_MODEL §6.6, BR-052).
   *
   * RATIFIED and previously unimplemented — §6.6 lists it in the canonical Ticket aggregate as
   * `Req`, System-owned, with the stated purpose "separate reporting of reopen cycles". It was
   * absent from the type entirely, so a reopened ticket was indistinguishable from a
   * first-pass one and BR-052's reporting could not be computed at all.
   *
   * System-set: incremented by the workflow engine on the three `→ Reopened` edges. No UI
   * writes it, which is why it is not editable anywhere.
   */
  readonly reopenCount: number;

  readonly sla: SlaState;
  readonly comments: readonly Comment[];
  readonly attachments: readonly Attachment[];
  readonly activity: readonly ActivityEntry[];
}
