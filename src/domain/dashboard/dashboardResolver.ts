import type { Session } from '@domain/types/auth.types';
import { DASHBOARDS, GOVERNANCE_WIDGETS, type DashboardConfig, type DashboardWidget } from '@config/dashboard.config';
import { canStatic } from '@domain/permission/can';
import { isScopeAvailable } from './dataScope';

/**
 * DASHBOARD RESOLVER (B05 §Role-Aware Dashboard Resolver) — the one place that decides which
 * regions this session sees.
 *
 * It asks the Permission Engine and the department configuration. It never asks what the
 * department is CALLED. FR-D01: "resolved by the Permission Engine, never by role name."
 *
 * Three independent gates, and a widget must pass all of them:
 *
 *   1. CAPABILITY  — `requiredCapability`, held or not. This is what makes the governance overlay
 *      an overlay: a sysadmin in any department gets it, and Administration without the
 *      capability does not. OQ-02 leaves open whether every Administration user holds it, and
 *      because the gate is the capability rather than the department, either answer works
 *      without a code change.
 *   2. PERMISSION  — `requiredPermission`, via `canStatic`. Never a stored role→permission table.
 *   3. DATA SCOPE  — `isScopeAvailable`. This is the gate the previous dashboard lacked entirely,
 *      and it is the one that keeps a widget from rendering a number that cannot mean anything:
 *      an inbound-queue region for Sales, which nothing routes to, would show a permanent zero
 *      and imply work might arrive.
 *
 * Dropping a widget is silent by design. A user is not told about a region they cannot have —
 * announcing "you may not see the governance panel" tells them the panel exists, which is a
 * disclosure in itself and is not information they can act on.
 */

export interface ResolvedDashboard {
  readonly config: DashboardConfig;
  /** Everything this session may see, ordered. Grouped by column at render time. */
  readonly widgets: readonly DashboardWidget[];
  /** True when the governance overlay was appended — the page renders a divider and its own heading. */
  readonly hasGovernance: boolean;
  /** Does this department receive tickets? Drives the two-pane split for the dual actors. */
  readonly isDestination: boolean;
}

/**
 * Exported so it can be tested against a SYNTHETIC widget.
 *
 * It has to be, because none of the shipped configurations currently exercises the data-scope
 * gate: no dashboard places a `dept-incoming` widget on a requester department, so a mutation that
 * deleted the scope check entirely left every test passing. The gate is defence in depth against a
 * future configuration, and defence in depth that nothing tests is just unexecuted code.
 */
export function isPermitted(session: Session, w: DashboardWidget): boolean {
  if (w.requiredCapability && !session.user.role.capabilities.includes(w.requiredCapability)) return false;
  if (w.requiredPermission && !canStatic(session, w.requiredPermission)) return false;
  return isScopeAvailable(session, w.dataScope);
}

export function resolveDashboard(session: Session): ResolvedDashboard {
  const config = DASHBOARDS[session.user.departmentCode];
  const base = config.widgets.filter((w) => isPermitted(session, w));
  const governance = GOVERNANCE_WIDGETS.filter((w) => isPermitted(session, w));

  return {
    config,
    // Sorted once, here. A stable `id` tiebreak keeps the order fixed when two widgets share a
    // priority, so the layout cannot shuffle between renders.
    widgets: [...base, ...governance].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    hasGovernance: governance.length > 0,
    isDestination: base.some((w) => w.dataScope === 'dept-incoming'),
  };
}

/** The widgets for one layout column, order preserved. */
export const widgetsIn = (resolved: ResolvedDashboard, column: 'main' | 'aside'): readonly DashboardWidget[] =>
  resolved.widgets.filter((w) => w.column === column);
