import { describe, it, expect } from 'vitest';
import { canStatic, canOnTicket, resolveStaticPermissions } from './can';
import type { Session, TicketAuthView, User } from '@domain/types/auth.types';
import { DEPARTMENTS } from '@config/departments.config';
import { MOCK_USERS } from '@config/mockUsers.config';
import { scopeFor } from '@domain/dashboard/scope';

/**
 * Binding-rule tests for the Permission Engine. These encode the Business Constitution:
 * if one of these fails, the software is violating a ratified rule.
 */
const mkSession = (deptCode: keyof typeof DEPARTMENTS, id = 'u1', sysadmin = false): Session => {
  const dept = DEPARTMENTS[deptCode];
  const user: User = {
    id, name: 'Test User', email: 't@t.test',
    departmentId: dept.id, departmentCode: dept.code, avatarInitials: 'TU',
    role: { departmentId: dept.id, departmentCode: dept.code, capabilities: sysadmin ? ['SUPER_ADMIN'] : [] },
  };
  return { user, authenticatedAt: new Date().toISOString() };
};

/** A Sales→Finance ticket raised by u-sales, assigned to u-fin. */
const ticket = (over: Partial<TicketAuthView> = {}): TicketAuthView => ({
  createdById: 'u-sales',
  assignedToId: 'u-raza',
  route: { fromDeptId: DEPARTMENTS.SAL.id, toDeptId: DEPARTMENTS.FIN.id },
  status: 'InProgress',
  ...over,
});

describe('Permission Engine — static (identity-level)', () => {
  it('grants base permissions to every authenticated user', () => {
    expect(canStatic(mkSession('SAL'), 'VIEW_DASHBOARD')).toBe(true);
    expect(canStatic(mkSession('SAL'), 'CREATE_TICKET')).toBe(true);
  });

  it('grants the Department Queue ONLY to destination departments', () => {
    expect(canStatic(mkSession('FIN'), 'VIEW_DEPARTMENT_QUEUE')).toBe(true);
    expect(canStatic(mkSession('ACA'), 'VIEW_DEPARTMENT_QUEUE')).toBe(true);
    expect(canStatic(mkSession('HR'), 'VIEW_DEPARTMENT_QUEUE')).toBe(true);
    // Pure requesters must NOT hold a queue
    expect(canStatic(mkSession('SAL'), 'VIEW_DEPARTMENT_QUEUE')).toBe(false);
    expect(canStatic(mkSession('MKT'), 'VIEW_DEPARTMENT_QUEUE')).toBe(false);
    expect(canStatic(mkSession('ADM'), 'VIEW_DEPARTMENT_QUEUE')).toBe(false);
  });

  it('grants admin permissions ONLY with the SUPER_ADMIN capability', () => {
    expect(canStatic(mkSession('FIN'), 'MANAGE_USERS')).toBe(false);
    expect(canStatic(mkSession('ADM'), 'MANAGE_USERS')).toBe(false); // dept alone is not enough
    expect(canStatic(mkSession('ADM', 'u1', true), 'MANAGE_USERS')).toBe(true);
    expect(canStatic(mkSession('ADM', 'u1', true), 'VIEW_AUDIT_LOGS')).toBe(true);
  });

  it('derives the permission set rather than hardcoding per role', () => {
    const fin = resolveStaticPermissions(mkSession('FIN'));
    const sal = resolveStaticPermissions(mkSession('SAL'));
    expect(fin.has('VIEW_DEPARTMENT_QUEUE')).toBe(true);
    expect(sal.has('VIEW_DEPARTMENT_QUEUE')).toBe(false);
  });
});

describe('Permission Engine — ticket-scoped (route-derived)', () => {
  it('VIEW: source, destination and sysadmin only — never a third department', () => {
    expect(canOnTicket(mkSession('SAL', 'u-sales'), 'VIEW_TICKET', ticket())).toBe(true); // source
    expect(canOnTicket(mkSession('FIN', 'u-raza'), 'VIEW_TICKET', ticket())).toBe(true); // destination
    expect(canOnTicket(mkSession('ADM', 'u-raja', true), 'VIEW_TICKET', ticket())).toBe(true); // sysadmin
    // Third party — MUST be denied
    expect(canOnTicket(mkSession('MKT', 'u-balu'), 'VIEW_TICKET', ticket())).toBe(false);
    expect(canOnTicket(mkSession('HR', 'u-sneha'), 'VIEW_TICKET', ticket())).toBe(false);
  });

  it('THE binding rule: the DESTINATION can never close or reopen', () => {
    const dest = mkSession('FIN', 'u-raza');
    expect(canOnTicket(dest, 'CLOSE_TICKET', ticket({ status: 'Resolved' }))).toBe(false);
    expect(canOnTicket(dest, 'REOPEN_TICKET', ticket({ status: 'Resolved' }))).toBe(false);
  });

  it('CLOSE / REOPEN belong to the requester (creator) only', () => {
    const requester = mkSession('SAL', 'u-sales');
    expect(canOnTicket(requester, 'CLOSE_TICKET', ticket({ status: 'Resolved' }))).toBe(true);
    expect(canOnTicket(requester, 'REOPEN_TICKET', ticket({ status: 'Closed' }))).toBe(true);
    // A different Sales colleague is source-dept but NOT the creator
    expect(canOnTicket(mkSession('SAL', 'u-sales-other'), 'CLOSE_TICKET', ticket({ status: 'Resolved' }))).toBe(false);
  });

  it('ProvideInformation is the REQUESTER’s act — the destination cannot resume', () => {
    const t = ticket({ status: 'AwaitingInformation' });
    expect(canOnTicket(mkSession('SAL', 'u-sales'), 'RESPOND_INFORMATION', t)).toBe(true);
    expect(canOnTicket(mkSession('FIN', 'u-raza'), 'RESPOND_INFORMATION', t)).toBe(false);
  });

  it('Assign / RequestInformation / Reject are destination-only; requester denied', () => {
    const dest = mkSession('FIN', 'u-raza');
    const requester = mkSession('SAL', 'u-sales');
    for (const verb of ['ASSIGN_TICKET', 'REQUEST_INFORMATION', 'REJECT_TICKET'] as const) {
      expect(canOnTicket(dest, verb, ticket())).toBe(true);
      expect(canOnTicket(requester, verb, ticket())).toBe(false);
    }
  });

  it('RESOLVE requires the assignee — not merely any destination member', () => {
    expect(canOnTicket(mkSession('FIN', 'u-raza'), 'RESOLVE_TICKET', ticket())).toBe(true);
    // Another Finance member who does not hold the ticket
    expect(canOnTicket(mkSession('FIN', 'u-fin-other'), 'RESOLVE_TICKET', ticket())).toBe(false);
  });

  it('priority: requester at Draft only; destination thereafter', () => {
    const requester = mkSession('SAL', 'u-sales');
    const dest = mkSession('FIN', 'u-raza');
    expect(canOnTicket(requester, 'CHANGE_PRIORITY', ticket({ status: 'Draft' }))).toBe(true);
    expect(canOnTicket(requester, 'CHANGE_PRIORITY', ticket({ status: 'InProgress' }))).toBe(false);
    expect(canOnTicket(dest, 'CHANGE_PRIORITY', ticket({ status: 'InProgress' }))).toBe(true);
  });
});

/**
 * D09-1 — A DRAFT IS PRIVATE TO ITS CREATOR.
 *
 * Found by adversarial testing, not by reading the code: the Finance destination could open an
 * unsubmitted Sales draft and read it. The SPA's queue happened not to LIST drafts, which hid
 * the defect for the whole build — but the details route was directly reachable, and the API
 * (which has no equivalent incidental filter) leaked it in both the list and the detail.
 *
 * This is a defect against documented intent, not a rule change. phase-0 §158 suppresses the
 * Discard notification precisely because "the destination never saw it", and §206 assigns every
 * Draft action to "R (creator only)".
 *
 * The masking is the lesson worth keeping: a permission rule that is wrong but never exercised
 * by the UI is still wrong, and it becomes exploitable the moment a second client — here, a REST
 * API — asks the same question honestly.
 */
describe('Permission Engine — draft privacy (D09-1)', () => {
  const draft = ticket({ status: 'Draft', createdById: 'u-sales' });
  const creator = mkSession('SAL', 'u-sales');
  const sameDeptColleague = mkSession('SAL', 'u-sales-2');
  const destination = mkSession('FIN', 'u-raza');
  const sysadmin = mkSession('ADM', 'u-raja', true);

  it('the creator can view their own draft', () => {
    expect(canOnTicket(creator, 'VIEW_TICKET', draft)).toBe(true);
  });

  it('the DESTINATION department cannot view an unsubmitted draft', () => {
    expect(canOnTicket(destination, 'VIEW_TICKET', draft)).toBe(false);
  });

  it('a colleague in the SOURCE department cannot view it either — it is a private working copy', () => {
    expect(canOnTicket(sameDeptColleague, 'VIEW_TICKET', draft)).toBe(false);
  });

  it('the sysadmin capability does not grant draft access — governance has no draft screen', () => {
    expect(canOnTicket(sysadmin, 'VIEW_TICKET', draft)).toBe(false);
  });

  it('nobody outside the creator may comment on or attach to a draft', () => {
    expect(canOnTicket(destination, 'ADD_COMMENT', draft)).toBe(false);
    expect(canOnTicket(destination, 'UPLOAD_ATTACHMENT', draft)).toBe(false);
  });

  it('the destination CAN view the same ticket once it is submitted — the fix is scoped to Draft', () => {
    expect(canOnTicket(destination, 'VIEW_TICKET', ticket({ status: 'Submitted' }))).toBe(true);
    expect(canOnTicket(destination, 'VIEW_TICKET', ticket({ status: 'InProgress' }))).toBe(true);
  });
});

/**
 * WHO GOVERNS THE SYSTEM — asserted against the REAL identities, not a synthetic session.
 *
 * This exists because the capability was briefly given to the wrong person by reading a job TITLE
 * as if it were authority: "Administrative Executive" sounded like governance, and Administration
 * is the governing department (ratified R4), so it looked right. It was not — a title grants
 * nothing here, and it left the highest access with someone junior to the people it governs.
 *
 * Asserting the actual holders is the only version of this test that could have caught that.
 * `canStatic(mkSession(...))` cannot: it is handed the answer.
 */
describe('who holds SUPER_ADMIN in the real organisation', () => {
  const sessionFor = (id: string): Session => ({
    user: MOCK_USERS.find((u) => u.id === id)!,
    authenticatedAt: new Date().toISOString(),
  });

  it('is the two Managing Directors, and nobody else', () => {
    const holders = MOCK_USERS
      .filter((u) => u.role.capabilities.includes('SUPER_ADMIN'))
      .map((u) => u.id)
      .sort();
    expect(holders).toEqual(['u-maha', 'u-raja']);
  });

  it('leaves the Administrative Executive on base rights — she raises tickets, she does not govern', () => {
    const susrita = sessionFor('u-susrita');
    expect(susrita.user.role.capabilities).toEqual([]);
    // She can do her job…
    expect(canStatic(susrita, 'CREATE_TICKET')).toBe(true);
    expect(canStatic(susrita, 'VIEW_MY_TICKETS')).toBe(true);
    // …and governs nothing.
    for (const admin of ['MANAGE_USERS', 'MANAGE_SLA', 'VIEW_AUDIT_LOGS', 'SYSTEM_CONFIGURATION'] as const) {
      expect(canStatic(susrita, admin), admin).toBe(false);
    }
    // The one that answers "can she see other people's reports": scope, not the page itself.
    // VIEW_REPORTS is a base right for everyone; SUPER_ADMIN is what widens the DATA to the whole
    // organisation. Without it she is clamped to her own department.
    expect(scopeFor(susrita)).toBe('own');
  });

  it('gives the Managing Directors the organisation-wide view instead', () => {
    for (const md of ['u-raja', 'u-maha']) {
      expect(scopeFor(sessionFor(md)), md).toBe('global');
      expect(canStatic(sessionFor(md), 'VIEW_AUDIT_LOGS'), md).toBe(true);
    }
  });
});
