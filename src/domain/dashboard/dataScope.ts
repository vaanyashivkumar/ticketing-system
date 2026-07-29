import type { Session } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * DATA SCOPE (B05 §Data Scope Engine) — "Every dashboard widget must declare its data scope.
 * Never infer organization-wide visibility without permission evidence."
 *
 * THE INVARIANT, and the only thing in this file that really matters:
 *
 *   A data scope NARROWS an already-authorised set. It can never widen one.
 *
 * `scopedTickets()` performs the visibility clamp — source department OR destination department,
 * with the sysadmin overlay for global. Everything here runs AFTER that, over its output, and
 * every function below is a `filter`. There is deliberately no code path that reaches back to the
 * full ticket list, because that is the only way a widget could leak: not by computing the wrong
 * number, but by counting tickets its owner may not see.
 *
 * `organisation-wide` is the one that would break the rule if it were a lie. It is not a widening
 * — it is a LABEL for "the clamp already returned everything, because this session is a sysadmin".
 * `assertScopeAvailable` refuses it for anyone else, and the test proves a Sales session asking
 * for it gets its own department's tickets rather than the organisation's.
 */

export type DataScope =
  | 'created-by-me'
  | 'assigned-to-me'
  | 'dept-incoming'
  | 'dept-outgoing'
  | 'department-wide'
  | 'organisation-wide';

export interface DataScopeInfo {
  readonly label: string;
  /** Shown to the user, so a number is never presented without saying what it counted. */
  readonly description: string;
}

export const DATA_SCOPE_INFO: Readonly<Record<DataScope, DataScopeInfo>> = {
  'created-by-me': { label: 'My requests', description: 'Tickets you raised.' },
  'assigned-to-me': { label: 'Assigned to me', description: 'Tickets assigned to you.' },
  'dept-incoming': { label: 'Incoming', description: 'Tickets routed to your department.' },
  'dept-outgoing': { label: 'Outgoing', description: 'Tickets your department raised.' },
  'department-wide': { label: 'My department', description: 'Everything in or out of your department.' },
  'organisation-wide': { label: 'Organisation', description: 'Every department.' },
};

/**
 * Is this scope meaningful for this session?
 *
 * Two separate reasons a scope can be unavailable, and conflating them would hide a bug:
 *   - `organisation-wide` requires the sysadmin capability. A permission question.
 *   - `dept-incoming` requires a department that RECEIVES tickets. A routing question — Sales and
 *     Marketing have no queue, so an incoming widget would render a permanent, meaningless zero.
 */
export function isScopeAvailable(session: Session, scope: DataScope): boolean {
  const dept = DEPARTMENTS[session.user.departmentCode];
  const sysadmin = session.user.role.capabilities.includes('SUPER_ADMIN');
  switch (scope) {
    case 'organisation-wide':
      return sysadmin;
    case 'dept-incoming':
      return dept.isDestination;
    default:
      return true;
  }
}

/**
 * Narrow an already-clamped ticket set to a declared scope.
 *
 * `visible` MUST be the output of `scopedTickets()`. Passing the raw store would not make this
 * function leak — every branch still filters — but `organisation-wide` would then return more
 * than the session may see, which is exactly the mistake this module exists to make impossible.
 * The parameter is named `visible` so a caller passing something else reads as wrong.
 */
export function inScope(session: Session, scope: DataScope, visible: readonly Ticket[]): readonly Ticket[] {
  const me = session.user.id;
  const dept = session.user.departmentCode;
  switch (scope) {
    case 'created-by-me':
      return visible.filter((t) => t.createdById === me);
    case 'assigned-to-me':
      return visible.filter((t) => t.assignedToId === me);
    case 'dept-incoming':
      // Drafts are excluded: an unsubmitted request has not reached anyone's queue, and D09-1
      // established that it is private to its author until Submit.
      return visible.filter((t) => t.toDeptCode === dept && t.status !== 'Draft');
    case 'dept-outgoing':
      return visible.filter((t) => t.fromDeptCode === dept);
    case 'department-wide':
      return visible.filter((t) => t.fromDeptCode === dept || t.toDeptCode === dept);
    case 'organisation-wide':
      // Already everything this session may see. For a sysadmin that IS the organisation; for
      // anyone else `isScopeAvailable` refuses the scope before it reaches here, and if it were
      // called anyway the clamp above still applies. It cannot widen.
      return visible;
  }
}
