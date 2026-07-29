import { describe, it, expect } from 'vitest';
import { scopeFor, scopedTickets, isDestinationScope } from './scope';
import type { Session, User } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';

const mkSession = (deptCode: keyof typeof DEPARTMENTS, sysadmin = false): Session => {
  const d = DEPARTMENTS[deptCode];
  const user: User = {
    id: `u-${deptCode}`, name: 'U', email: 'u@t.test', departmentId: d.id, departmentCode: d.code, avatarInitials: 'U',
    role: { departmentId: d.id, departmentCode: d.code, capabilities: sysadmin ? ['SUPER_ADMIN'] : [] },
  };
  return { user, authenticatedAt: new Date().toISOString() };
};

const t = (from: keyof typeof DEPARTMENTS, to: keyof typeof DEPARTMENTS, id: string): Ticket => ({
  id, code: id, subject: 's', description: 'd', status: 'Submitted', priority: 'Medium',
  fromDeptCode: from, toDeptCode: to, categoryId: 'c', categoryLabel: 'C', categoryData: {},
  createdById: `u-${from}`, createdByName: 'x', assignedToId: null, assignedToName: null,
  createdAt: '', updatedAt: '',
  sla: { startedAt: null, dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack' },
  resolutionNote: null,
  reopenCount: 0, rejectionReason: null, comments: [], attachments: [], activity: [],
});

const ALL = [t('SAL', 'FIN', 'a'), t('MKT', 'FIN', 'b'), t('HR', 'ACA', 'c'), t('FIN', 'ACA', 'd')];

/** Scope-clamping is the data-isolation rule: "never expose unauthorized data". */
describe('Dashboard/report scope-clamp', () => {
  it('resolves the right scope per session', () => {
    expect(scopeFor(mkSession('SAL'))).toBe('own');
    expect(scopeFor(mkSession('FIN'))).toBe('hub');
    expect(scopeFor(mkSession('ADM', true))).toBe('global');
  });

  it('a pure requester sees ONLY its own department’s tickets', () => {
    const seen = scopedTickets(mkSession('SAL'), ALL).map((x) => x.id);
    expect(seen).toEqual(['a']);
    expect(seen).not.toContain('b'); // Marketing's ticket — must never leak
  });

  it('Finance (hub) sees source-or-destination = Finance', () => {
    const seen = scopedTickets(mkSession('FIN'), ALL).map((x) => x.id).sort();
    expect(seen).toEqual(['a', 'b', 'd']); // not 'c' (HR→Academics — Finance is not a party)
  });

  it('the sysadmin sees everything (global)', () => {
    expect(scopedTickets(mkSession('ADM', true), ALL).length).toBe(4);
  });

  it('scope never exposes a ticket the department is not a party to', () => {
    for (const code of ['SAL', 'MKT', 'ACA', 'HR', 'FIN', 'ADM'] as const) {
      const s = mkSession(code);
      scopedTickets(s, ALL).forEach((x) => {
        expect(x.fromDeptCode === code || x.toDeptCode === code).toBe(true);
      });
    }
  });

  it('identifies destination departments correctly', () => {
    expect(isDestinationScope(mkSession('FIN'))).toBe(true);
    expect(isDestinationScope(mkSession('ACA'))).toBe(true);
    expect(isDestinationScope(mkSession('HR'))).toBe(true);
    expect(isDestinationScope(mkSession('SAL'))).toBe(false);
    expect(isDestinationScope(mkSession('MKT'))).toBe(false);
  });
});
