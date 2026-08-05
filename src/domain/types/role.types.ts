import type { StaticPermission, TicketPermission } from './auth.types';

/**
 * CUSTOM ROLES — a stakeholder-ratified reversal, 2026-08-04.
 *
 * ── WHAT WAS REVERSED, AND WHY IT IS RECORDED HERE ────────────────────────────────────────────
 * `BUSINESS_DOMAIN_MODEL §2.3` states that "no role-keyed permission table is ever introduced",
 * and the Roles & Permissions page said so on screen: permissions are DERIVED — ticket rights from
 * the actor's relationship to a ticket's route, static rights from department plus capability. The
 * page also said the decision could only be changed by stakeholder ratification, not by a code
 * change. That ratification happened; this file is it.
 *
 * ── THE HALF THAT SAVED THE LIFECYCLE ─────────────────────────────────────────────────────────
 * Grants are ADDITIVE, also ratified. A user holding no role resolves EXACTLY as before, so every
 * Constitution invariant — two-step closure, requester-only reopen, assignee-only resolve — still
 * holds as the default for everyone, and the ~20 binding-rule tests encoding them keep passing
 * unchanged rather than being deleted. What changed is that those rules are no longer ABSOLUTE:
 * they can be overridden per user, deliberately and visibly.
 *
 * That distinction is the whole safety argument, so it is worth stating baldly: a role granting
 * `CLOSE_TICKET` lets its holder close a ticket the two-step rule would refuse them. It is not a
 * bug when that happens. It is what was asked for, and the UI names the risk where it is granted.
 *
 * ── WHY A ROLE IS DATA, NOT CONFIG ────────────────────────────────────────────────────────────
 * Departments, routes and statuses are config: ratified facts the software is built around. Roles
 * are now created and deleted by administrators at runtime, which makes them user data — they
 * belong in a store and a table, never in a `config/` module that ships with the build.
 */

/** A right a role may confer. Static rights open pages; ticket rights override the derived model. */
export interface RolePermissions {
  readonly staticPermissions: readonly StaticPermission[];
  /**
   * OVERRIDES to the route-derived model. Each one lets the holder perform that verb on any ticket
   * they can already see, regardless of whether they are its requester, assignee or destination.
   * Empty is the safe and ordinary case.
   */
  readonly ticketPermissions: readonly TicketPermission[];
}

export interface Role extends RolePermissions {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /**
   * A built-in role, offered as a starting point and NOT deletable. They are descriptions of
   * arrangements the system already had — "what a line manager can reach", "what an administrator
   * can reach" — written down so a promotion is one assignment rather than a permission audit.
   */
  readonly isSystem: boolean;
  /** ISO timestamp; system roles carry the date they were introduced. */
  readonly createdAt: string;
}

/** What an administrator fills in to create one. */
export type RoleDraft = Omit<Role, 'id' | 'isSystem' | 'createdAt'>;

/** What an administrator fills in to add a person. */
export interface UserDraft {
  readonly name: string;
  readonly email: string;
  readonly departmentCode: string;
  readonly title: string;
  readonly roleIds: readonly string[];
}
