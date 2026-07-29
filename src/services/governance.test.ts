import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from './AuthService';
import { UserService } from './userService';
import { ConfigService } from './configService';
import { TicketService } from './ticketService';
import { TicketRepository } from './ticketRepository';
import { MOCK_USERS } from '@config/mockUsers.config';
import { FEATURE_FLAGS } from '@config/org.config';
import type { Session } from '@domain/types/auth.types';

/**
 * THE GOVERNANCE-THEATRE SUITE (D04 #36 / #39).
 *
 * Every admin control in this app persisted an audited, versioned record — and several enforced
 * nothing. "Deactivate user" flipped a badge and wrote an audit entry while the account carried
 * on signing in with full rights; the feature-flag subsystem could be toggled and audited while
 * no code read a flag and no gated capability existed.
 *
 * These tests assert the controls GOVERN, not that they merely record.
 */
const sysadmin: Session = {
  user: MOCK_USERS.find((u) => u.role.capabilities.includes('SUPER_ADMIN'))!,
  authenticatedAt: new Date().toISOString(),
};
const victim = MOCK_USERS.find((u) => !u.role.capabilities.includes('SUPER_ADMIN'))!;

beforeEach(() => localStorage.clear());

describe('Deactivating a user actually prevents access (D04 #36)', () => {
  it('an active user can sign in', () => {
    expect(AuthService.authenticate(victim.id)).not.toBeNull();
  });

  it('THE REGRESSION: a deactivated user cannot sign in', () => {
    expect(UserService.setActive(victim.id, false, sysadmin)).toEqual({ ok: true });
    expect(UserService.isActive(victim.id)).toBe(false);
    // Before the fix AuthService read mockUserById() straight from static config, so the
    // override was invisible and this returned a full session.
    expect(AuthService.authenticate(victim.id)).toBeNull();
  });

  it('an ALREADY-OPEN session is ended on restore — deactivation is not deferred to next login', () => {
    expect(AuthService.authenticate(victim.id)).not.toBeNull();
    expect(AuthService.restore()).not.toBeNull(); // still fine while active

    UserService.setActive(victim.id, false, sysadmin);
    expect(AuthService.restore()).toBeNull();
    // ...and the stale session is cleared, not merely refused.
    expect(AuthService.restore()).toBeNull();
  });

  it('reactivating restores access — deactivation is recoverable, never a delete', () => {
    UserService.setActive(victim.id, false, sysadmin);
    expect(AuthService.authenticate(victim.id)).toBeNull();
    UserService.setActive(victim.id, true, sysadmin);
    expect(AuthService.authenticate(victim.id)).not.toBeNull();
  });

  it('an unknown identity is never active', () => {
    expect(UserService.isActive('u-does-not-exist')).toBe(false);
  });

  it('the last active sysadmin cannot be deactivated — the lockout guard still holds', () => {
    const admins = MOCK_USERS.filter((u) => u.role.capabilities.includes('SUPER_ADMIN'));
    // Deactivate every sysadmin but the session holder; the final one must be refused.
    admins.filter((a) => a.id !== sysadmin.user.id).forEach((a) => UserService.setActive(a.id, false, sysadmin));
    const other = admins.find((a) => a.id !== sysadmin.user.id)!;
    const r = UserService.setActive(sysadmin.user.id, false, { ...sysadmin, user: other });
    expect(r.ok).toBe(false);
  });
});

/**
 * Re-assignment (D04 #2/#8). The Roles page advertised this capability, REASSIGN_TICKET was a
 * granted verb, and it existed NOWHERE — every "Assign" hardcoded self-assignment, so a ticket
 * held by someone on leave could only be Rejected (discarding the request) or left to rot.
 *
 * It is deliberately NOT a transition: BDM §1118 defines it as a non-status audited write that
 * "changes assigned_to_id only, no clock touch" — which is why no Assigned→Assigned edge exists
 * in the canonical 23, and why inventing one would have been wrong.
 */
describe('Re-assignment is a non-status audited write (D04 #2 / #8)', () => {
  const fin: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'FIN')!, authenticatedAt: '' };
  const sales2: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'SAL')!, authenticatedAt: '' };
  const other = { id: 'u-fin-colleague', name: 'Fin Colleague' };

  const assigned = () => {
    const c = TicketService.create(
      { toDeptCode: 'FIN', categoryId: 'sal-fin-others', subject: 'S', description: 'D', priority: 'Medium', categoryData: { nature: 'x' } },
      sales2, true,
    );
    if (!c.ok) throw new Error('setup');
    const a = TicketService.commitAction(c.value.id, 'Assign', fin, { id: fin.user.id, name: fin.user.name });
    if (!a.ok) throw new Error('setup');
    return a.value;
  };

  it('the destination can move a ticket to a colleague', () => {
    const t = assigned();
    const r = TicketService.reassign(t.id, other, fin);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assignedToId).toBe(other.id);
  });

  it('does NOT touch the SLA clock — the clock belongs to the ticket, not the holder', () => {
    const t = assigned();
    const r = TicketService.reassign(t.id, other, fin);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.sla).toEqual(t.sla);
  });

  it('does NOT change the status — it is not a transition', () => {
    const t = assigned();
    const r = TicketService.reassign(t.id, other, fin);
    if (r.ok) expect(r.value.status).toBe(t.status);
  });

  it('is audited in the immutable trail', () => {
    const t = assigned();
    const r = TicketService.reassign(t.id, other, fin);
    if (r.ok) {
      const last = r.value.activity.at(-1)!;
      expect(last.action).toBe('ASSIGNED');
      expect(last.note).toContain('Re-assigned to Fin Colleague');
    }
  });

  it('the REQUESTER cannot re-assign — it is the destination department’s right', () => {
    const t = assigned();
    expect(TicketService.reassign(t.id, other, sales2).ok).toBe(false);
  });

  it('a resolved ticket cannot be re-assigned', () => {
    const t = assigned();
    const started = TicketService.commitAction(t.id, 'Start', fin);
    expect(started.ok).toBe(true);
    const resolved = TicketService.commitAction(t.id, 'Resolve', fin, undefined, 'Done.');
    expect(resolved.ok).toBe(true);
    expect(TicketService.reassign(t.id, other, fin).ok).toBe(false);
  });
});

/**
 * D04 #7 at the chokepoint. Widening Start/Resume to their canonical A/D actors removed the
 * structural guarantee that an assignee exists — so `assigneeSet` (BDM §9 rows 6/22) has to be
 * ENFORCED, not merely declared. A guard the code ignores is the governance theatre this campaign
 * spent itself removing.
 */
/**
 * The Finance hub is a TEAM, not a person.
 *
 * The seven canonical personas are exactly one per department, so the seeded data could not
 * express the situations these fixes exist for: re-assigning to a colleague (D04 #2/#8) had nobody
 * to re-assign to, and D04 #7's whole point — a colleague picking up a ticket whose assignee is
 * unavailable — could only be demonstrated by inventing an id that AuthService then (correctly)
 * refused, because unknown identities are never active. Sofia Nowak is a (C) demo fixture added
 * for exactly this; these tests assert she earns her place rather than merely existing.
 */
describe('Finance has two members — the flows that need a colleague are now reachable', () => {
  const james = MOCK_USERS.find((u) => u.id === 'u-fin')!;
  const sofia = MOCK_USERS.find((u) => u.id === 'u-fin-2')!;

  it('both are real, sign-in-able Finance identities', () => {
    expect(sofia).toBeDefined();
    expect(sofia.departmentCode).toBe('FIN');
    // The failure that exposed the gap: an id not in MOCK_USERS cannot hold a session.
    expect(UserService.isActive(sofia.id)).toBe(true);
    expect(AuthService.authenticate(sofia.id)).not.toBeNull();
    expect(UserService.isActive('u-fin-colleague')).toBe(false); // the invented id, still refused
  });

  it('neither holds SUPER_ADMIN — a second hub member is not a second administrator', () => {
    expect(sofia.role.capabilities).toEqual([]);
    expect(james.role.capabilities).toEqual([]);
  });

  it('a ticket can be re-assigned between two REAL Finance identities', () => {
    const mkt2: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'MKT')!, authenticatedAt: '' };
    const jamesS: Session = { user: james, authenticatedAt: '' };
    const c = TicketService.create(
      { toDeptCode: 'FIN', categoryId: 'mkt-fin-general', subject: 'S', description: 'D', priority: 'Medium',
        categoryData: { queryType: 'Payment', details: 'x' } },
      mkt2, true,
    );
    if (!c.ok) throw new Error('setup');
    TicketService.commitAction(c.value.id, 'Assign', jamesS, { id: james.id, name: james.name });
    const r = TicketService.reassign(c.value.id, { id: sofia.id, name: sofia.name }, jamesS);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.assignedToName).toBe('Sofia Nowak');
  });
});

describe('assigneeSet is enforced, not just declared (D04 #7)', () => {
  const fin2: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'FIN')!, authenticatedAt: '' };
  const mkt: Session = { user: MOCK_USERS.find((u) => u.departmentCode === 'MKT')!, authenticatedAt: '' };

  const submitted = () => {
    const c = TicketService.create(
      { toDeptCode: 'FIN', categoryId: 'mkt-fin-general', subject: 'S', description: 'D', priority: 'Medium',
        categoryData: { queryType: 'Payment', details: 'x' } },
      mkt, true,
    );
    if (!c.ok) throw new Error('setup: ' + c.error);
    return c.value;
  };

  it('a destination colleague can now Start a ticket assigned to someone else', () => {
    const t = submitted();
    // James assigns it to himself...
    expect(TicketService.commitAction(t.id, 'Assign', fin2, { id: fin2.user.id, name: fin2.user.name }).ok).toBe(true);
    // ...and a Finance COLLEAGUE starts it. Previously blocked — the ticket was stuck if James
    // went on leave, with Reject (discarding the request) the only way out.
    const colleague: Session = { user: { ...fin2.user, id: 'u-fin-colleague', name: 'Fin Colleague' }, authenticatedAt: '' };
    expect(TicketService.commitAction(t.id, 'Start', colleague).ok).toBe(true);
  });

  it('THE PAIRED GUARD: Start is refused when the ticket has no assignee', () => {
    const t = submitted();
    // Force the state the A/D widening makes reachable but the old narrowing could not: an
    // Assigned ticket with no assignee. The guard, not the actor set, must catch it.
    TicketRepository.save({ ...TicketRepository.byId(t.id)!, status: 'Assigned', assignedToId: null, assignedToName: null });
    const r = TicketService.commitAction(t.id, 'Start', fin2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Assign this ticket to someone');
  });

  it('the requester still cannot Start their own ticket — widening did not widen to everyone', () => {
    const t = submitted();
    TicketService.commitAction(t.id, 'Assign', fin2, { id: fin2.user.id, name: fin2.user.name });
    expect(TicketService.commitAction(t.id, 'Start', mkt).ok).toBe(false);
  });
});

describe('Feature flags cannot claim capabilities that do not exist (D04 #39)', () => {
  it('every flag in this build is honestly marked unimplemented', () => {
    // Verified against the tree: no email delivery, no push, no scheduler, no ERP, no AI.
    expect(FEATURE_FLAGS.every((f) => !f.implemented)).toBe(true);
  });

  it('THE REGRESSION: enabling a flag whose feature does not exist is REFUSED', () => {
    const r = ConfigService.setFlag('emailNotifications', true, sysadmin);
    expect(r.ok).toBe(false);
    // ...and nothing was written, audited, or versioned — no fictional governance record.
    expect(ConfigService.isFeatureEnabled('emailNotifications')).toBe(false);
    expect(ConfigService.versions().length).toBe(0);
  });

  it('an unimplemented flag reads as OFF even if storage says otherwise', () => {
    // Simulate a stale override written by an older build.
    localStorage.setItem('tps.config.flags', JSON.stringify({ aiAssistant: true }));
    expect(ConfigService.flags().aiAssistant).toBe(true); // raw stored value
    expect(ConfigService.isFeatureEnabled('aiAssistant')).toBe(false); // what a feature must read
  });

  it('disabling is always permitted — the guard blocks fiction, not governance', () => {
    expect(ConfigService.setFlag('emailNotifications', false, sysadmin)).toEqual({ ok: true });
  });

  it('an unknown flag is rejected rather than silently created', () => {
    expect(ConfigService.setFlag('notARealFlag', true, sysadmin).ok).toBe(false);
  });
});
