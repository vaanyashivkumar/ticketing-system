import { ROUTES } from '@config/routes.config';
import { DEPARTMENTS, DEPARTMENT_LIST } from '@config/departments.config';
import { STATUS_TRANSITIONS } from '@config/statusTransitions.config';
import { STATUS_DEFINITIONS, QUEUE_DEFINITIONS } from '@config/statuses.config';
import { STATIC_PERMISSIONS, SYSADMIN_STATIC_PERMISSIONS } from '@config/permissions.config';
import type { SlaPolicy } from '@config/sla.config';
import type { OrgConfig } from '@config/org.config';
import { FEATURE_FLAGS } from '@config/org.config';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';
import { nextStatuses, previousStatuses, statusesInQueue } from '@domain/workflow/statusEngine';
import type { AdminUser } from '@services/userService';

/**
 * CONFIGURATION VALIDATION ENGINE (B06 §Routing Validation Engine).
 *
 * B06 lists ten checks. Four of them are meaningless against THIS configuration, and saying so is
 * part of the job — a validator that reports "0 orphan categories" over a model where a category
 * cannot be orphaned is a green tick that means nothing, and a green tick that means nothing is
 * how a real failure gets waved through.
 *
 *   - "Missing dynamic forms" — a category IS its field list (`CategoryConfig.fields`). There is no
 *     separate form record to be missing; an empty list is the checkable version, and it is checked.
 *   - "Orphan categories" — categories are declared INSIDE a route. One cannot exist without a
 *     route to belong to. The reachable version of the question is a route with no categories.
 *   - "Missing workflows" — there is ONE global transition table, not a workflow per category. The
 *     checkable version is that every status the table names has a definition.
 *   - "Circular routing" — routes are directed pairs and cycles are LEGITIMATE here: Academics
 *     raises to Finance and Finance raises to Academics. Flagging that would be flagging the
 *     ratified matrix.
 *
 * The checks that ARE meaningful are below, and several of them can catch a real administrator
 * mistake — most importantly the SLA ordering check, because SLA targets are editable at runtime
 * and nothing else stops someone giving Urgent a longer target than Low.
 *
 * PURE. Takes the runtime configuration as arguments rather than reading `ConfigService`, so the
 * same function validates a proposed change before it is saved as well as the state on disk.
 */

export type Severity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  readonly id: string;
  readonly severity: Severity;
  readonly area: 'Routing' | 'Departments' | 'Categories' | 'Workflow' | 'SLA' | 'Organisation' | 'Permissions' | 'Feature flags';
  readonly message: string;
  /** What breaks if this is left alone. An issue nobody can act on is noise. */
  readonly consequence: string;
}

export interface ValidationInput {
  readonly sla: SlaPolicy;
  readonly org: OrgConfig;
  readonly flags: Readonly<Record<string, boolean>>;
  /** Category enable-state overrides, by category id. */
  readonly categoryEnabled: (categoryId: string) => boolean;
  /** Present only where the caller can supply it; the user checks are skipped without it. */
  readonly users?: readonly AdminUser[];
}

export interface ValidationReport {
  readonly issues: readonly ValidationIssue[];
  readonly errors: number;
  readonly warnings: number;
  /** Checks that ran and passed — so a clean report is evidence, not an absence of output. */
  readonly passed: readonly string[];
}

export function validateConfiguration(input: ValidationInput): ValidationReport {
  const issues: ValidationIssue[] = [];
  const passed: string[] = [];
  const add = (i: ValidationIssue) => issues.push(i);
  const pass = (name: string) => passed.push(name);

  // ---- Routing -------------------------------------------------------------

  const pairs = ROUTES.map((r) => `${r.from}>${r.to}`);
  const duplicatePairs = [...new Set(pairs.filter((p, i) => pairs.indexOf(p) !== i))];
  if (duplicatePairs.length) {
    add({
      id: 'ROUTE-DUP',
      severity: 'error',
      area: 'Routing',
      message: `Duplicate route definitions: ${duplicatePairs.join(', ')}.`,
      // Real risk: the matrix builds four routes by wildcard expansion, and a specific route that
      // the wildcard fails to exclude produces two entries for one pair. `routeFor` returns the
      // first, so the second's categories silently disappear.
      consequence: 'Only the first definition is used, so the other route’s categories become unreachable without any error.',
    });
  } else pass('No duplicate routes');

  const selfRoutes = ROUTES.filter((r) => r.from === r.to);
  if (selfRoutes.length) {
    add({
      id: 'ROUTE-SELF',
      severity: 'error',
      area: 'Routing',
      message: `A department routes to itself: ${selfRoutes.map((r) => r.from).join(', ')}.`,
      consequence: 'The source and destination checks both match the same department, so every permission rule collapses.',
    });
  } else pass('No department routes to itself');

  const toNonDestination = ROUTES.filter((r) => !DEPARTMENTS[r.to].isDestination);
  if (toNonDestination.length) {
    add({
      id: 'ROUTE-NON-DEST',
      severity: 'error',
      area: 'Routing',
      message: `Routes point at departments that receive no tickets: ${toNonDestination.map((r) => `${r.from}→${r.to}`).join(', ')}.`,
      consequence: 'Tickets would be routed to a department with no queue, and nobody would ever see them.',
    });
  } else pass('Every route destination is a receiving department');

  const emptyRoutes = ROUTES.filter((r) => r.categories.length === 0);
  if (emptyRoutes.length) {
    add({
      id: 'ROUTE-EMPTY',
      severity: 'error',
      area: 'Routing',
      message: `Routes with no categories: ${emptyRoutes.map((r) => `${r.from}→${r.to}`).join(', ')}.`,
      consequence: 'The route appears in the destination picker and then offers nothing to raise.',
    });
  } else pass('Every route offers at least one category');

  // A route where an administrator has disabled EVERY category is reachable and dead — the user
  // picks the department and finds an empty list. Disabling is a runtime override, so this is the
  // check most likely to fire in practice.
  const allDisabled = ROUTES.filter(
    (r) => r.categories.length > 0 && r.categories.every((c) => !input.categoryEnabled(c.id)),
  );
  if (allDisabled.length) {
    add({
      id: 'ROUTE-ALL-DISABLED',
      severity: 'warning',
      area: 'Categories',
      message: `Every category is disabled on: ${allDisabled.map((r) => `${DEPARTMENTS[r.from].name}→${DEPARTMENTS[r.to].name}`).join(', ')}.`,
      consequence: 'The route is still offered and then presents an empty category list — a dead end rather than a clear "not available".',
    });
  } else pass('No route has all of its categories disabled');

  // ---- Departments ---------------------------------------------------------

  const noInbound = DEPARTMENT_LIST.filter((d) => d.isDestination && !ROUTES.some((r) => r.to === d.code));
  if (noInbound.length) {
    add({
      id: 'DEPT-NO-INBOUND',
      severity: 'error',
      area: 'Departments',
      message: `Marked as receiving departments but nothing routes to them: ${noInbound.map((d) => d.name).join(', ')}.`,
      consequence: 'They are granted queue permissions and shown a Department Queue that can never contain anything.',
    });
  } else pass('Every receiving department has inbound routes');

  const noOutbound = DEPARTMENT_LIST.filter((d) => !ROUTES.some((r) => r.from === d.code));
  if (noOutbound.length) {
    add({
      id: 'DEPT-NO-OUTBOUND',
      severity: 'warning',
      area: 'Departments',
      message: `Departments that cannot raise a ticket anywhere: ${noOutbound.map((d) => d.name).join(', ')}.`,
      consequence: 'Their members get a Create Ticket action that leads to an empty destination list.',
    });
  } else pass('Every department can raise a ticket somewhere');

  // ---- Categories ----------------------------------------------------------

  const fieldless: string[] = [];
  const badSelects: string[] = [];
  const dupKeys: string[] = [];
  const provisional: string[] = [];
  for (const route of ROUTES) {
    const ids = route.categories.map((c) => c.id);
    const dupCat = [...new Set(ids.filter((x, i) => ids.indexOf(x) !== i))];
    if (dupCat.length) {
      add({
        id: `CAT-DUP-${route.from}-${route.to}`,
        severity: 'error',
        area: 'Categories',
        message: `Duplicate category ids on ${route.from}→${route.to}: ${dupCat.join(', ')}.`,
        // Category ids are route-scoped, NOT globally unique — the shared inbound sets deliberately
        // repeat the same ids across the wildcard-expanded routes. Only a repeat WITHIN one route
        // is a fault, because that is where the lookup becomes ambiguous.
        consequence: 'Category lookup is per route, so a repeat within one route makes one of them unreachable.',
      });
    }
    for (const c of route.categories) {
      if (c.fields.length === 0) fieldless.push(c.id);
      if (c.fields.some((f) => f.provisional)) provisional.push(`${c.label} (${route.from}→${route.to})`);
      const keys = c.fields.map((f) => f.key);
      keys.filter((k, i) => keys.indexOf(k) !== i).forEach((k) => dupKeys.push(`${c.id}.${k}`));
      c.fields
        .filter((f) => f.type === 'select' && (f.options?.length ?? 0) < 2)
        .forEach((f) => badSelects.push(`${c.id}.${f.key}`));
    }
  }
  if (fieldless.length) {
    add({
      id: 'CAT-NO-FIELDS',
      severity: 'warning',
      area: 'Categories',
      message: `Categories with no dynamic fields: ${fieldless.join(', ')}.`,
      consequence: 'The request form collects only a subject and description, so the destination has to ask for everything else.',
    });
  } else pass('Every category collects at least one field');

  if (dupKeys.length) {
    add({
      id: 'FIELD-DUP-KEY',
      severity: 'error',
      area: 'Categories',
      message: `Duplicate field keys: ${dupKeys.join(', ')}.`,
      consequence: 'Two fields write to the same key, so one silently overwrites the other on submit.',
    });
  } else pass('Field keys are unique within each category');

  if (badSelects.length) {
    add({
      id: 'FIELD-THIN-SELECT',
      severity: 'warning',
      area: 'Categories',
      message: `Dropdowns with fewer than two options: ${badSelects.join(', ')}.`,
      consequence: 'A choice with one option is not a choice — it should be a fixed value or a different field type.',
    });
  } else pass('Every dropdown offers a real choice');

  if (provisional.length) {
    add({
      id: 'CAT-PROVISIONAL',
      severity: 'info',
      area: 'Categories',
      message: `Field sets awaiting stakeholder ratification (OQ-25/OQ-26): ${[...new Set(provisional)].join(', ')}.`,
      consequence: 'These fields may change on ratification. Data already collected against them may not map cleanly.',
    });
  }

  // ---- Workflow ------------------------------------------------------------

  const defined = new Set(STATUS_DEFINITIONS.map((s) => s.id));
  const referenced = new Set(STATUS_TRANSITIONS.flatMap((t) => [t.from, t.to]));
  const undefinedStatuses = [...referenced].filter((s) => !defined.has(s));
  if (undefinedStatuses.length) {
    add({
      id: 'WF-UNDEFINED-STATUS',
      severity: 'error',
      area: 'Workflow',
      message: `Transitions reference statuses with no definition: ${undefinedStatuses.join(', ')}.`,
      consequence: 'A ticket can reach a state the interface has no label, colour or queue for.',
    });
  } else pass('Every status in the transition table is defined');

  const unreachable = STATUS_DEFINITIONS.filter((s) => s.id !== 'Draft' && previousStatuses(s.id).length === 0);
  if (unreachable.length) {
    add({
      id: 'WF-UNREACHABLE',
      severity: 'error',
      area: 'Workflow',
      message: `Statuses no transition can reach: ${unreachable.map((s) => s.label).join(', ')}.`,
      consequence: 'The state exists in the model and no ticket can ever enter it.',
    });
  } else pass('Every status is reachable');

  const deadEnds = STATUS_DEFINITIONS.filter((s) => s.open && nextStatuses(s.id).length === 0);
  if (deadEnds.length) {
    add({
      id: 'WF-OPEN-DEAD-END',
      severity: 'error',
      area: 'Workflow',
      message: `Statuses counted as open work with no way out: ${deadEnds.map((s) => s.label).join(', ')}.`,
      consequence: 'A ticket would sit in an open queue permanently with no action able to move it.',
    });
  } else pass('No open status is a dead end');

  const emptyBuckets = QUEUE_DEFINITIONS.filter((q) => statusesInQueue(q.id).length === 0);
  if (emptyBuckets.length) {
    add({
      id: 'WF-EMPTY-QUEUE',
      severity: 'warning',
      area: 'Workflow',
      message: `Queue buckets no status maps to: ${emptyBuckets.map((q) => q.label).join(', ')}.`,
      consequence: 'The queue shows a tab that can never have contents.',
    });
  } else pass('Every queue bucket has statuses');

  // ---- SLA -----------------------------------------------------------------

  const nonPositive = ORDERED_PRIORITIES.filter((p) => !(input.sla.resolutionHours[p] > 0));
  if (nonPositive.length) {
    add({
      id: 'SLA-NON-POSITIVE',
      severity: 'error',
      area: 'SLA',
      message: `Resolution targets that are zero or negative: ${nonPositive.join(', ')}.`,
      consequence: 'Every ticket at that priority is overdue the moment it is submitted.',
    });
  } else pass('Every priority has a positive resolution target');

  /**
   * THE check most likely to catch a real mistake.
   *
   * SLA targets are administrator-editable at runtime and nothing else in the system stops
   * someone giving Urgent a longer window than Low. The result is not an error anywhere — it is a
   * queue that sorts by urgency and a clock that disagrees with it, which reads as the SLA engine
   * being broken.
   */
  const outOfOrder: string[] = [];
  for (let i = 1; i < ORDERED_PRIORITIES.length; i += 1) {
    const higher = ORDERED_PRIORITIES[i - 1]!;
    const lower = ORDERED_PRIORITIES[i]!;
    if (input.sla.resolutionHours[higher] >= input.sla.resolutionHours[lower]) {
      outOfOrder.push(`${higher} (${input.sla.resolutionHours[higher]}h) is not tighter than ${lower} (${input.sla.resolutionHours[lower]}h)`);
    }
  }
  if (outOfOrder.length) {
    add({
      id: 'SLA-ORDER',
      severity: 'error',
      area: 'SLA',
      message: `Resolution targets do not tighten as priority rises: ${outOfOrder.join('; ')}.`,
      consequence: 'Raising a ticket’s priority would give it MORE time, so re-grading makes the deadline later instead of sooner.',
    });
  } else pass('Resolution targets tighten as priority rises');

  if (!(input.sla.dueSoonThreshold > 0 && input.sla.dueSoonThreshold < 1)) {
    add({
      id: 'SLA-THRESHOLD',
      severity: 'error',
      area: 'SLA',
      message: `The Due Soon threshold must be between 0 and 1 (currently ${input.sla.dueSoonThreshold}).`,
      consequence: 'At 0 nothing is ever flagged Due Soon; at 1 everything is flagged from the moment it is raised.',
    });
  } else pass('Due Soon threshold is a sensible fraction');

  if (input.sla.escalation.onBreach.length === 0) {
    add({
      id: 'SLA-NO-ESCALATION',
      severity: 'warning',
      area: 'SLA',
      message: 'No recipients are configured for an SLA breach.',
      consequence: 'A breach would be recorded and nobody told — BR-096 names four recipients.',
    });
  } else pass('Breach escalation has recipients');

  // ---- Organisation --------------------------------------------------------

  if (input.org.workingHours.start >= input.org.workingHours.end) {
    add({
      id: 'ORG-HOURS',
      severity: 'error',
      area: 'Organisation',
      message: `The working day starts at ${input.org.workingHours.start}:00 and ends at ${input.org.workingHours.end}:00.`,
      consequence: 'A business day of zero or negative length makes every SLA calculation run forever or return nonsense.',
    });
  } else pass('The working day has positive length');

  if (input.org.workingDays.length === 0) {
    add({
      id: 'ORG-NO-DAYS',
      severity: 'error',
      area: 'Organisation',
      message: 'No working days are configured.',
      consequence: 'Business time never advances, so no ticket can ever reach its target.',
    });
  } else pass('At least one working day is configured');

  const badHolidays = input.org.holidays.filter((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h) || Number.isNaN(Date.parse(h)));
  if (badHolidays.length) {
    add({
      id: 'ORG-BAD-HOLIDAY',
      severity: 'error',
      area: 'Organisation',
      message: `Holiday dates that are not valid YYYY-MM-DD: ${badHolidays.join(', ')}.`,
      consequence: 'The SLA calendar silently ignores them, so those days count as working days.',
    });
  } else pass('Holiday dates are well formed');

  // ---- Permissions ---------------------------------------------------------

  const orphanSysadminPerms = SYSADMIN_STATIC_PERMISSIONS.filter((p) => !STATIC_PERMISSIONS.includes(p));
  if (orphanSysadminPerms.length) {
    add({
      id: 'PERM-ORPHAN',
      severity: 'error',
      area: 'Permissions',
      message: `Granted to administrators but not in the permission catalogue: ${orphanSysadminPerms.join(', ')}.`,
      consequence: 'A permission nothing declares cannot be reasoned about or reviewed.',
    });
  } else pass('Every administrator permission is catalogued');

  if (input.users) {
    const activeSysadmins = input.users.filter(
      (u) => u.active && u.role.capabilities.includes('SUPER_ADMIN'),
    );
    if (activeSysadmins.length === 0) {
      add({
        id: 'PERM-NO-ADMIN',
        severity: 'error',
        area: 'Permissions',
        message: 'No active user holds the system-administration capability.',
        consequence: 'Nobody can reach Administration at all. Recovering needs a change outside the application.',
      });
    } else if (activeSysadmins.length === 1) {
      add({
        id: 'PERM-ONE-ADMIN',
        severity: 'warning',
        area: 'Permissions',
        message: `Only one active administrator: ${activeSysadmins[0]!.name}.`,
        consequence: 'If that account is lost, nobody can administer the system. The last-administrator guard is protecting a single point of failure.',
      });
    } else pass('More than one active administrator');
  }

  // ---- Feature flags -------------------------------------------------------

  const enabledButUnbuilt = FEATURE_FLAGS.filter((f) => !f.implemented && input.flags[f.key]);
  if (enabledButUnbuilt.length) {
    add({
      id: 'FLAG-UNBUILT',
      severity: 'error',
      area: 'Feature flags',
      message: `Flags switched on for capabilities that do not exist: ${enabledButUnbuilt.map((f) => f.key).join(', ')}.`,
      consequence: 'The toggle reads as enabled and nothing happens — the configuration is claiming a capability the build does not have.',
    });
  } else pass('No flag is enabled for an unbuilt capability');

  return {
    issues,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    passed,
  };
}

/**
 * Checks B06 asked for that cannot mean anything against this configuration.
 *
 * Rendered on the Administration overview beside the results, because a validator that quietly
 * drops four of the ten checks it was asked for looks complete and is not. Naming them is the
 * difference between "we checked and it is fine" and "that check does not apply here".
 */
export const INAPPLICABLE_CHECKS: readonly { readonly asked: string; readonly why: string }[] = [
  {
    asked: 'Orphan categories',
    why: 'A category is declared inside a route and cannot exist without one. The reachable version — a route with no categories — is checked instead.',
  },
  {
    asked: 'Missing dynamic forms',
    why: 'A category IS its field list; there is no separate form record to be missing. Categories with no fields are checked instead.',
  },
  {
    asked: 'Missing workflows',
    why: 'There is one global transition table, not a workflow per category. That every status it names is defined and reachable is checked instead.',
  },
  {
    asked: 'Circular routing',
    why: 'Cycles are legitimate here — Academics raises to Finance and Finance raises to Academics. Flagging that would flag the ratified matrix.',
  },
];
