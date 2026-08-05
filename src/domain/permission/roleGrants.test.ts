import { describe, it, expect } from 'vitest';
import { canStatic, canOnTicket, resolveStaticPermissions } from './can';
import type { Session, TicketAuthView, User } from '@domain/types/auth.types';
import { DEPARTMENTS } from '@config/departments.config';
import { SYSTEM_ROLES } from '@config/roles.config';
import { resolveGrants } from '@stores/roleStore';

/**
 * CUSTOM-ROLE GRANTS — the ratified reversal of BUSINESS_DOMAIN_MODEL §2.3 (2026-08-04).
 *
 * The single most important assertion in this file is the FIRST one: a user with no role resolves
 * exactly as before. That is what lets every other Constitution test in the suite keep passing
 * unchanged rather than being deleted — the derived model is still the default, and an override is
 * an exception someone deliberately granted.
 */
const mk = (deptCode: keyof typeof DEPARTMENTS, over: Partial<User['role']> = {}): Session => {
  const dept = DEPARTMENTS[deptCode];
  return {
    user: {
      id: 'u-test', name: 'Test', email: 't@t.test',
      departmentId: dept.id, departmentCode: dept.code, avatarInitials: 'TT',
      role: { departmentId: dept.id, departmentCode: dept.code, capabilities: [], ...over },
    },
    authenticatedAt: new Date().toISOString(),
  };
};

/** A Sales→Finance ticket raised by someone else and assigned to someone else. */
const ticket = (over: Partial<TicketAuthView> = {}): TicketAuthView => ({
  createdById: 'u-other',
  assignedToId: 'u-assignee',
  route: { fromDeptId: DEPARTMENTS.SAL.id, toDeptId: DEPARTMENTS.FIN.id },
  status: 'Resolved',
  ...over,
});

describe('the derived model is untouched for anyone holding no role', () => {
  it('grants exactly what it did before custom roles existed', () => {
    const plain = mk('FIN');
    // Finance is a destination, so: base rights plus the queue. No governance, no team view.
    expect(canStatic(plain, 'VIEW_DEPARTMENT_QUEUE')).toBe(true);
    expect(canStatic(plain, 'MANAGE_USERS')).toBe(false);
    expect(canStatic(plain, 'VIEW_TEAM')).toBe(false);
    // And two-step closure still refuses the destination department.
    expect(canOnTicket(plain, 'CLOSE_TICKET', ticket())).toBe(false);
  });
});

describe('static grants are additive', () => {
  it('adds the role’s rights without removing the department’s', () => {
    const s = mk('SAL', { grantedStatic: ['MANAGE_USERS', 'VIEW_AUDIT_LOGS'] });
    expect(canStatic(s, 'MANAGE_USERS')).toBe(true);
    expect(canStatic(s, 'VIEW_AUDIT_LOGS')).toBe(true);
    // Base rights survive — a role can never lock someone out of their own work.
    expect(canStatic(s, 'CREATE_TICKET')).toBe(true);
    expect(canStatic(s, 'VIEW_MY_TICKETS')).toBe(true);
  });

  it('never grants something the role did not name', () => {
    const s = mk('SAL', { grantedStatic: ['MANAGE_USERS'] });
    expect(canStatic(s, 'SYSTEM_CONFIGURATION')).toBe(false);
    expect(resolveStaticPermissions(s).has('MANAGE_SLA')).toBe(false);
  });
});

describe('ticket overrides suspend a rule — for the holder, on tickets they can see', () => {
  it('lets a granted user close work the two-step rule would refuse them', () => {
    // Finance is the DESTINATION here, which normally may never close.
    const withoutRole = mk('FIN');
    const withRole = mk('FIN', { grantedTicket: ['CLOSE_TICKET'] });
    expect(canOnTicket(withoutRole, 'CLOSE_TICKET', ticket())).toBe(false);
    expect(canOnTicket(withRole, 'CLOSE_TICKET', ticket())).toBe(true);
  });

  it('does NOT widen visibility as a side effect', () => {
    /**
     * The ordering that matters. A third department — neither source nor destination — holding
     * CLOSE_TICKET must still be refused, because it cannot see the ticket at all. Granting one
     * verb must never quietly hand someone another department's work; seeing is its own right.
     */
    const outsider = mk('MKT', { grantedTicket: ['CLOSE_TICKET'] });
    expect(canOnTicket(outsider, 'VIEW_TICKET', ticket())).toBe(false);
    expect(canOnTicket(outsider, 'CLOSE_TICKET', ticket())).toBe(false);

    // With VIEW_TICKET granted too, both become true — deliberately, having been asked for twice.
    const deliberate = mk('MKT', { grantedTicket: ['CLOSE_TICKET', 'VIEW_TICKET'] });
    expect(canOnTicket(deliberate, 'VIEW_TICKET', ticket())).toBe(true);
    expect(canOnTicket(deliberate, 'CLOSE_TICKET', ticket())).toBe(true);
  });

  it('never exposes another person’s DRAFT, whatever is granted', () => {
    // A draft is private to its creator (D09-1). No override reaches it, including VIEW_TICKET.
    const s = mk('FIN', { grantedTicket: ['VIEW_TICKET', 'CLOSE_TICKET', 'ADD_COMMENT'] });
    const draft = ticket({ status: 'Draft' });
    expect(canOnTicket(s, 'VIEW_TICKET', draft)).toBe(false);
    expect(canOnTicket(s, 'ADD_COMMENT', draft)).toBe(false);
  });

  it('grants nothing for a verb the role did not name', () => {
    const s = mk('FIN', { grantedTicket: ['CLOSE_TICKET'] });
    // Resolution is still the named assignee's alone.
    expect(canOnTicket(s, 'RESOLVE_TICKET', ticket({ status: 'InProgress' }))).toBe(false);
  });
});

describe('the built-in roles', () => {
  it('carry NO ticket overrides — the lifecycle is untouched by any of them', () => {
    for (const r of SYSTEM_ROLES) {
      expect(r.ticketPermissions, r.name).toEqual([]);
    }
  });

  it('flatten to the union of the roles a person holds', () => {
    const grants = resolveGrants(SYSTEM_ROLES, { 'u-1': ['role-line-manager', 'role-administrator'] }, 'u-1');
    expect(grants.grantedStatic).toContain('VIEW_TEAM');
    expect(grants.grantedStatic).toContain('MANAGE_USERS');
    expect(grants.grantedTicket).toEqual([]);
    // Someone with no assignment gets nothing at all — the default path.
    expect(resolveGrants(SYSTEM_ROLES, {}, 'u-2')).toEqual({ grantedStatic: [], grantedTicket: [] });
  });
});
