import type { DepartmentCode } from '@domain/types/auth.types';
import { ROUTES, type CategoryConfig, type RouteConfig } from '@config/routes.config';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * Routing Engine (P13 §2). Pure resolution over the routing config — the New-Ticket
 * dropdowns and the submit-time guard both funnel through it, so the UI can never offer
 * a pair the routing matrix rejects.
 *
 * PURE: this layer must never import a service — that would break the dependency direction and
 * make the matrix untestable. The administrative enable/disable state therefore arrives as an
 * INJECTED predicate, the same pattern P15 §7 used to lift the SLA policy out of its engine.
 */

/**
 * Is this category currently offerable? Injected by the caller from configuration.
 * Default: every configured category is enabled — the pure, override-free reading.
 */
export type CategoryEnabled = (categoryId: string) => boolean;
const ALL_ENABLED: CategoryEnabled = () => true;

/**
 * Destinations this department may raise a ticket to.
 *
 * Takes the enable predicate, like `categoriesFor` — because it did not, and the create form fed
 * the UNFILTERED list into the department dropdown while filtering the category list beneath it.
 * An administrator disabling every category on a route left the destination still offered, and the
 * requester picked it and found an empty category list with no explanation. A route with nothing
 * left to raise is not a destination.
 */
export function destinationsFor(
  from: DepartmentCode,
  isEnabled: CategoryEnabled = ALL_ENABLED,
): readonly { code: DepartmentCode; name: string }[] {
  return ROUTES.filter((r) => r.from === from && r.categories.some((c) => isEnabled(c.id))).map((r) => ({
    code: r.to,
    name: DEPARTMENTS[r.to].name,
  }));
}

export function routeFor(from: DepartmentCode, to: DepartmentCode): RouteConfig | undefined {
  return ROUTES.find((r) => r.from === from && r.to === to);
}

/**
 * The categories a requester may CHOOSE on this route — honouring the administrative
 * enable/disable override (D04 #1: the admin toggle used to flip a badge and write an audit
 * entry claiming the Tickets module changed, while every requester carried on selecting the
 * "disabled" category).
 */
export function categoriesFor(
  from: DepartmentCode,
  to: DepartmentCode,
  isEnabled: CategoryEnabled = ALL_ENABLED,
): readonly CategoryConfig[] {
  return (routeFor(from, to)?.categories ?? []).filter((c) => isEnabled(c.id));
}

/**
 * Look up a category REGARDLESS of enabled state.
 *
 * Deliberately unfiltered: disabling a category must stop NEW tickets, never break the ones
 * already raised against it. Ticket detail, queues and reports render historical categories
 * through here and must keep working after an admin disables one.
 */
export function categoryById(
  from: DepartmentCode,
  to: DepartmentCode,
  categoryId: string,
): CategoryConfig | undefined {
  return (routeFor(from, to)?.categories ?? []).find((c) => c.id === categoryId);
}

/**
 * Submit-time guard: is this (from → to, category) legal, configured AND currently enabled?
 * The chokepoint passes the real predicate, so a disabled category is refused even if a stale
 * tab still offers it.
 */
export function isRouteValid(
  from: DepartmentCode,
  to: DepartmentCode,
  categoryId: string,
  isEnabled: CategoryEnabled = ALL_ENABLED,
): boolean {
  return categoriesFor(from, to, isEnabled).some((c) => c.id === categoryId);
}
