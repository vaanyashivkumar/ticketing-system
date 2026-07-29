import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { NAV_GROUPS } from '@config/navigation.config';
import { useMediaQuery, MD_BREAKPOINT } from '@hooks/useMediaQuery';

/**
 * Breadcrumb trail — INFORMATION_ARCHITECTURE §9, adopted verbatim from Phase-1 §4.
 *
 * This was a RATIFIED requirement that had never been built: IA §9 specifies the full strategy
 * and ENTERPRISE_DESIGN_SYSTEM §6.16 specifies the component, but no breadcrumb existed anywhere
 * in the application. Same class of gap as the `contact` field type and `Programme / course` —
 * specified, marked as passing in a design-system table, and absent from the code.
 *
 * DERIVED, NEVER DECLARED. The trail is computed from the route plus `navigation.config.ts`, so
 * a page cannot render the wrong crumb and a new page cannot forget to add one. IA §9's own rule
 * is that breadcrumbs are "never manually duplicated on individual pages".
 *
 * PLACEMENT: top-left of the CONTENT area, per IA §262 — not in the top bar. B02 asks for the
 * top bar; the Information Architecture outranks a build engine on approved layout, so IA wins.
 */

/** IA §9: `Administration` is a VIRTUAL parent — the crumb appears but is not a link. */
const ADMIN_GROUP_ID = 'administration';

/**
 * Depth-2 pages whose breadcrumb parent differs from their SIDEBAR position (IA §9, row
 * "2 (child of a list)").
 *
 * Create Ticket is a top-level sidebar item for reachability — raising a ticket is a primary
 * action and should be one click — but IA §9 places it under My Tickets in the trail, because
 * that is where the thing you just created will appear. Navigation position and information
 * hierarchy are allowed to differ; this map is where that difference is declared rather than
 * hidden in a component.
 */
const BREADCRUMB_PARENT: Readonly<Record<string, { label: string; to: string; leafLabel: string }>> = {
  '/app/tickets/new': { label: 'My Tickets', to: '/app/tickets', leafLabel: 'New Ticket' },
};

interface Crumb {
  readonly label: string;
  /** Absent = not a link. Used by the Administration virtual parent and the current page. */
  readonly to?: string;
}

/** Every nav item flattened, so a path can be resolved to its label and owning group. */
const NAV_INDEX = NAV_GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, groupId: g.id, groupLabel: g.label })));

function buildTrail(pathname: string, ticketFrom: string | undefined, hasId: boolean): Crumb[] {
  const home: Crumb = { label: 'Dashboard', to: '/app/dashboard' };

  // Depth 1, shell root: a single crumb, not "Dashboard › Dashboard".
  if (pathname === '/app/dashboard') return [{ label: 'Dashboard' }];

  // Declared depth-2 exceptions first — their sidebar position would give the wrong trail.
  const override = BREADCRUMB_PARENT[pathname];
  if (override) {
    return [home, { label: override.label, to: override.to }, { label: override.leafLabel }];
  }

  const exact = NAV_INDEX.find((i) => i.path === pathname);
  if (exact) {
    // IA §9: administration pages sit under a virtual parent that is NOT a link — it is a
    // sidebar group header with no route, so linking it would 404.
    if (exact.groupId === ADMIN_GROUP_ID) {
      return [home, { label: 'Administration' }, { label: exact.label }];
    }
    return [home, { label: exact.label }];
  }

  /**
   * Ticket Details — the context-sensitive parent (IA §9 rule 1).
   *
   * The SAME route `/app/tickets/:id` sits under `My Tickets` when opened from the requester's
   * list and under `Department Queue` when opened from the queue. The parent is therefore a
   * property of HOW the page was reached, not of the URL, which is why the lists already pass
   * `state={{ from }}` — this consumes that rather than guessing from the ticket's data.
   */
  if (hasId && pathname.startsWith('/app/tickets/')) {
    const parent = NAV_INDEX.find((i) => i.path === ticketFrom)
      ?? NAV_INDEX.find((i) => i.id === 'my-tickets')!;
    return [home, { label: parent.label, to: parent.path }, { label: 'Ticket Details' }];
  }

  // Unknown route (404 and anything not in config): the home crumb alone beats a wrong trail.
  return [home];
}

export function Breadcrumbs() {
  const location = useLocation();
  const params = useParams();
  const isDesktop = useMediaQuery(MD_BREAKPOINT);

  const from = (location.state as { from?: string } | null)?.from;
  const trail = buildTrail(location.pathname, from, Boolean(params.id));

  // Login and other pre-session routes render no shell, so this never mounts there (IA §9,
  // depth 0). Dashboard's single crumb is not a trail worth drawing either.
  if (trail.length <= 1) return null;

  const current = trail[trail.length - 1]!;
  const parent = trail.length >= 2 ? trail[trail.length - 2] : undefined;

  /**
   * IA §9 rule 4 — narrow breakpoints COLLAPSE the trail to `‹ Back` + the current page title.
   * A four-level trail wrapped across three lines on a phone is worse than no trail: it costs
   * vertical space above the content the user actually came for.
   */
  if (!isDesktop) {
    return (
      <nav aria-label="Breadcrumb" className="mb-3">
        {parent?.to ? (
          <Link
            to={parent.to}
            className="inline-flex min-h-6 items-center gap-1 text-body-sm text-primary-text hover:underline"
          >
            <ChevronLeft size={14} aria-hidden /> {parent.label}
          </Link>
        ) : (
          <span className="text-body-sm text-text-secondary">{current.label}</span>
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      {/* An ordered list, because a trail is a sequence — screen readers announce position. */}
      <ol className="flex flex-wrap items-center gap-1 text-body-sm">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="text-text-muted" aria-hidden />}
              {c.to && !last ? (
                <Link to={c.to} className="text-primary-text hover:underline">
                  {c.label}
                </Link>
              ) : (
                /**
                 * `aria-current="page"` on the last crumb only. The Administration crumb is also
                 * unlinked but is NOT the current page, so it must not carry it — otherwise a
                 * screen reader announces two "current" locations.
                 */
                <span className="text-text-secondary" {...(last ? { 'aria-current': 'page' as const } : {})}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
