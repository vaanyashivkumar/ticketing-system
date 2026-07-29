import type { Priority } from '@domain/types/ticket.types';

/**
 * SLA policy as CONFIGURATION (P15 §7 — "never hardcode SLA values throughout the
 * application"). These are the DEFAULTS; the Administration module may override them and
 * the override is persisted + audited. The SLA engine receives the policy — it no longer
 * owns the numbers (this replaces the hardcoded RESOLUTION_HOURS introduced in P13).
 */
/**
 * Who an SLA event reaches. BR-096 names all four and makes the set "a configurable SLA-policy
 * field" — so it is a field, not a switch statement.
 */
export type EscalationRecipient = 'assignee' | 'destination-queue' | 'sysadmin' | 'requester';

export interface EscalationPolicy {
  /** BR-096: assignee, destination queue, sysadmin, requester (FYI). */
  readonly onBreach: readonly EscalationRecipient[];
  /**
   * The DueSoon warning is deliberately narrower than the breach. A warning that reaches the
   * sysadmin and the requester before anything has actually gone wrong trains everyone to ignore
   * the breach notice that matters — the recipients of an escalation and the recipients of a
   * heads-up are not the same people.
   */
  readonly onDueSoon: readonly EscalationRecipient[];
}

export interface SlaPolicy {
  /** Resolution target in BUSINESS hours, by priority (phase-0 §9 baseline). */
  readonly resolutionHours: Readonly<Record<Priority, number>>;
  /** Remaining-time fraction at which a ticket is flagged Due Soon (0.2 = last 20%). */
  readonly dueSoonThreshold: number;
  /**
   * Escalation targets (BR-096).
   *
   * ⚠️ **STATED PLAINLY: nothing fires these yet.** The recipients resolve correctly and are
   * tested, and `escalationRecipients()` is the single place the answer comes from — but the
   * TRIGGER is a scheduled SLA sweep, and this build has no scheduler (the same gap that leaves
   * BR-044's 7-day auto-close unfired). `Overdue` is derived on read, so a breach that nobody
   * looks at is a breach nobody is told about. The configuration is here so the sweeper, when it
   * exists, has nothing left to decide; it is not here to imply the escalation works.
   */
  readonly escalation: EscalationPolicy;
}

export const DEFAULT_SLA_POLICY: SlaPolicy = {
  resolutionHours: { Urgent: 8, High: 16, Medium: 40, Low: 80 },
  dueSoonThreshold: 0.2,
  escalation: {
    // BR-096 verbatim: assignee, destination queue, sysadmin, requester (FYI).
    onBreach: ['assignee', 'destination-queue', 'sysadmin', 'requester'],
    // The people who can still act in time. No sysadmin, no requester — nothing has failed yet.
    onDueSoon: ['assignee'],
  },
};
