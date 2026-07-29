import type { Session } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * Dashboard scope-clamp (P14; phase-0 §10.2). A dashboard shows exactly the tickets the
 * session may SEE — source dept OR destination dept — with the sysadmin overlay = global.
 * A pure requester (never a destination) therefore sees only its own raised tickets, so
 * "Sales never sees Finance operational workload" falls out of the visibility rule itself.
 */
export type Scope = 'own' | 'hub' | 'global';

/**
 * `hub` and `own` deliberately produce the SAME clamp — `from === dept || to === dept`.
 *
 * That is not an oversight. FR-D03 defines hub scope as "source-or-destination = Finance, not
 * global", which is the ordinary department rule; Finance is named separately because it is the
 * department where getting it wrong would matter most (BR-067 / FR-D07: the Finance dashboard must
 * never resolve to global). The label survives because the charts and the subtitle read
 * differently for a hub, not because the visible set does.
 */
export function scopeFor(session: Session): Scope {
  if (session.user.role.capabilities.includes('SUPER_ADMIN')) return 'global';
  return session.user.departmentCode === 'FIN' ? 'hub' : 'own';
}

/** The tickets visible on this session's dashboard (scope-clamped). */
export function scopedTickets(session: Session, all: readonly Ticket[]): Ticket[] {
  if (scopeFor(session) === 'global') return [...all];
  const dept = session.user.departmentCode;
  return all.filter((t) => t.fromDeptCode === dept || t.toDeptCode === dept);
}

/**
 * Whether this session's department is a destination (has a queue / adjudicates work).
 *
 * Read from the department configuration, which already states it. The literal
 * `['ACA', 'HR', 'FIN']` this replaces was a second copy of `isDestination`, and it had already
 * drifted from its neighbour: `scopeFor` classes Academics and HR as `own` while this classed them
 * as destinations, so the two functions in this file disagreed about the same departments.
 */
export function isDestinationScope(session: Session): boolean {
  return DEPARTMENTS[session.user.departmentCode].isDestination;
}
