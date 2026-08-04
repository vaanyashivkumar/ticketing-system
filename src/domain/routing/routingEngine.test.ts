import { describe, it, expect } from 'vitest';
import { destinationsFor, categoriesFor, categoryById, isRouteValid, routeFor } from './routingEngine';
import { ROUTES } from '@config/routes.config';

/**
 * The administrative Disable toggle must actually govern intake (D04 #1). Before this, the admin
 * console flipped a badge, wrote an audit entry, and versioned the change as affecting the
 * "Tickets" module — while `categoriesFor`/`isRouteValid` read straight from static config, so
 * every requester carried on selecting the "disabled" category. `isCategoryEnabled` had exactly
 * ONE caller in the entire codebase: the admin page's own render.
 *
 * The predicate is INJECTED because this engine must stay pure (no service imports) — the same
 * pattern P15 §7 used to lift the SLA policy out of its engine.
 */
describe('Routing Engine — the administrative disable actually governs intake (D04 #1)', () => {
  const disable = (...ids: string[]) => (id: string) => !ids.includes(id);

  it('a disabled category is withdrawn from the choosable set', () => {
    const all = categoriesFor('SAL', 'FIN');
    const target = all[0]!.id;
    const left = categoriesFor('SAL', 'FIN', disable(target));
    expect(all.map((c) => c.id)).toContain(target);
    expect(left.map((c) => c.id)).not.toContain(target);
    expect(left.length).toBe(all.length - 1);
  });

  it('THE REGRESSION: submitting a disabled category is refused', () => {
    const target = categoriesFor('SAL', 'FIN')[0]!.id;
    expect(isRouteValid('SAL', 'FIN', target)).toBe(true); // legal on the matrix...
    expect(isRouteValid('SAL', 'FIN', target, disable(target))).toBe(false); // ...withdrawn by an admin
  });

  it('disabling one category does not disturb the others on the route', () => {
    const all = categoriesFor('SAL', 'FIN');
    expect(isRouteValid('SAL', 'FIN', all[1]!.id, disable(all[0]!.id))).toBe(true);
  });

  it('EXISTING tickets on a disabled category still resolve — disable stops intake, not history', () => {
    const target = categoriesFor('SAL', 'FIN')[0]!.id;
    // categoryById is deliberately unfiltered so detail/queues/reports keep rendering.
    expect(categoryById('SAL', 'FIN', target)).toBeDefined();
  });

  it('with nothing injected the matrix is unchanged — the pure default', () => {
    expect(categoriesFor('SAL', 'FIN').length).toBe(categoriesFor('SAL', 'FIN', () => true).length);
  });
});

/** The routing matrix is immutable (PROJECT_CONSTITUTION §2.3). These tests defend it. */
describe('Routing Engine — the ratified matrix', () => {
  it('has exactly 16 concrete routes', () => {
    /**
     * SIXTEEN since the 2026-08-04 ratification, not the long-standing 14. Operations was added as
     * a seventh department, and the two wildcard rows say "other departments" — so it inherited
     * OPS→HR and OPS→ACA automatically rather than needing an invented matrix.
     *
     * The count is still asserted, and still deliberately hostile to change: the Constitution
     * calls this matrix immutable, so it may only move by a ratification like that one. If this
     * number changes again without a stakeholder decision behind it, something is wrong.
     */
    expect(ROUTES.length).toBe(16);
  });

  it('THE rule most easily broken: Finance is EXCLUDED from the Other→Academics wildcard', () => {
    const finToAca = routeFor('FIN', 'ACA');
    expect(finToAca).toBeDefined();
    // Finance's Academics route is its OWN 2-category set, not the 6-category wildcard set
    expect(finToAca!.categories.map((c) => c.label).sort()).toEqual(['General Queries', 'Student Payment Receipt']);
    expect(finToAca!.categories.length).toBe(2);
  });

  it('Other→Academics carries the SIX ratified flat categories (R1)', () => {
    const six = ['Academic Status Updates', 'General Academic Queries', 'Sales', 'Status Module', 'Status and Final Documentation', 'Student Module'];
    for (const from of ['SAL', 'MKT', 'HR', 'ADM'] as const) {
      const r = routeFor(from, 'ACA');
      expect(r, `${from}→ACA must exist`).toBeDefined();
      expect(r!.categories.map((c) => c.label).sort()).toEqual(six);
    }
  });

  it('no self-routing: a department never raises to itself', () => {
    ROUTES.forEach((r) => expect(r.from).not.toBe(r.to));
  });

  it('Sales can raise only to Finance, HR and Academics', () => {
    expect(destinationsFor('SAL').map((d) => d.code).sort()).toEqual(['ACA', 'FIN', 'HR']);
  });

  it('nothing routes TO Sales or Marketing (pure requesters)', () => {
    expect(ROUTES.some((r) => r.to === 'SAL')).toBe(false);
    expect(ROUTES.some((r) => r.to === 'MKT')).toBe(false);
  });

  /**
   * Sales→Finance: the 6 ratified categories + **Incentive Issue**, a stakeholder-approved
   * EXTENSION (C35).
   *
   * This test failing is the system working. PROJECT_CONSTITUTION §2.3 makes the routing matrix
   * immutable — "never redesign, remove, merge or simplify; extend only with stakeholder
   * approval" — and this assertion is what stops the matrix growing by accident. It was updated
   * deliberately, on an explicit instruction to add the category, NOT by nudging a list until the
   * suite went green. If it fails again, the same question applies: who approved it?
   *
   * "Others" stays last: it is the catch-all, and a catch-all listed above real options invites
   * people to pick it.
   */
  it('Sales→Finance exposes the 6 ratified categories plus the C35 extension', () => {
    expect(categoriesFor('SAL', 'FIN').map((c) => c.label)).toEqual([
      'Payment Link', 'Payment Receipt', 'Student Status', 'Payroll Issue', 'Referral Discount',
      'Incentive Issue', 'Others',
    ]);
  });

  it('the C35 extension reached Sales only — Marketing→Finance did NOT gain it', () => {
    expect(categoriesFor('MKT', 'FIN').map((c) => c.label)).not.toContain('Incentive Issue');
  });

  it('rejects an unconfigured route or a category from the wrong route', () => {
    expect(isRouteValid('SAL', 'MKT', 'anything')).toBe(false); // no such route
    expect(isRouteValid('SAL', 'FIN', 'mkt-fin-vendor')).toBe(false); // Marketing's category on Sales' route
    expect(isRouteValid('SAL', 'FIN', 'sal-fin-payment-link')).toBe(true);
  });

  it('every route has at least one category, and category ids are globally unique per route', () => {
    ROUTES.forEach((r) => {
      expect(r.categories.length).toBeGreaterThan(0);
      const ids = r.categories.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
