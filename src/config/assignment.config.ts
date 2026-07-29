/**
 * ASSIGNMENT ENGINE configuration (B04 §Assignment Engine).
 *
 * Who picks up a ticket is a policy, not a hardcoded behaviour. Before this file the answer was
 * a literal in the details page — `Assign` passed `{ id: user.id, name: user.name }`, so the only
 * possible outcome was self-assignment. A destination triaging its queue could not hand a ticket
 * to the colleague who owns that subject; it had to assign to itself and then re-assign, leaving
 * a misleading pair of audit entries for what was one decision.
 *
 * The strategies below are all real code paths — `selectAssignee` dispatches on whichever is
 * configured. The line that matters is `autoPlace`:
 *
 *   - autoPlace: false  the strategy chooses a DEFAULT for the picker. A human still confirms.
 *   - autoPlace: true   the system places the ticket on a named person unasked.
 *
 * ⚠️ **C — assumption, flagged for ratification.** No business rule names an assignment strategy.
 * `workload` is an ENGINEERING default: it makes the picker open on the least-loaded colleague,
 * which is a better guess than "whoever clicked". It changes no accountability, because
 * `autoPlace` is false and nothing is assigned without someone confirming it.
 *
 * `autoPlace: true` is a different question entirely and is NOT set: automatic placement moves
 * accountability onto a person no human chose, and BR-096 puts escalation authority with a named
 * role. That switch needs a stakeholder decision, not a code change.
 */

export type AssignmentStrategy =
  /** A human chooses. The engine may still offer a suggestion, but never places the ticket. */
  | 'manual'
  /** Even distribution: the candidate who has waited longest since their last assignment. */
  | 'round-robin'
  /** Load levelling: the candidate holding the fewest open tickets. */
  | 'workload';

export interface AssignmentPolicy {
  readonly strategy: AssignmentStrategy;
  /**
   * Does the engine PLACE the ticket, or only suggest a name for a person to confirm?
   *
   * Separate from `strategy` on purpose. "Which candidate?" and "may the system act on the
   * answer without asking?" are different questions, and conflating them is how a system starts
   * assigning work to people nobody chose. `false` is the ratified setting: every assignment in
   * this build is a human decision, and the suggestion is a default in a picker.
   */
  readonly autoPlace: boolean;
  /**
   * Restrict candidates to members of the destination department. Always true here — the routing
   * matrix is the Constitution's, and a ticket routed to Finance cannot be worked by HR. It is
   * expressed as configuration rather than an inline `filter` so the rule is visible and testable
   * rather than buried in the engine.
   */
  readonly destinationOnly: boolean;
  /** Never offer a deactivated account. A suggestion nobody can act on is worse than none. */
  readonly activeOnly: boolean;
}

export const DEFAULT_ASSIGNMENT_POLICY: AssignmentPolicy = {
  strategy: 'workload',
  autoPlace: false,
  destinationOnly: true,
  activeOnly: true,
};

/**
 * Descriptions for the administration surface, so the choice can be explained rather than
 * presented as three opaque words.
 */
export const ASSIGNMENT_STRATEGY_INFO: Readonly<Record<AssignmentStrategy, { label: string; description: string }>> = {
  manual: {
    label: 'Manual',
    description: 'No suggestion. The person assigning chooses from the department, defaulting to themselves.',
  },
  'round-robin': {
    label: 'Round robin',
    description: 'Suggests whoever has gone longest without being assigned a ticket.',
  },
  workload: {
    label: 'Workload',
    description: 'Suggests whoever is holding the fewest open tickets right now.',
  },
};
