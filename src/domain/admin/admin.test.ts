import { describe, it, expect } from 'vitest';
import type { Session, User, DepartmentCode, Capability } from '@domain/types/auth.types';
import { DEPARTMENTS, DEPARTMENT_LIST } from '@config/departments.config';
import { DEFAULT_SLA_POLICY } from '@config/sla.config';
import { DEFAULT_ORG_CONFIG, FEATURE_FLAGS } from '@config/org.config';
import { PERMISSION_CATALOGUE } from '@config/permissionCatalogue';
import { STATIC_PERMISSIONS } from '@config/permissions.config';
import { ROUTES } from '@config/routes.config';
import { validateConfiguration, INAPPLICABLE_CHECKS } from './configValidation';
import { effectivePermissionsFor } from './effectivePermissions';

const session = (code: DepartmentCode, capabilities: Capability[] = []): Session => {
  const d = DEPARTMENTS[code];
  const user: User = {
    id: `u-${code}`, name: `User ${code}`, email: `${code}@t.test`,
    departmentId: d.id, departmentCode: d.code, avatarInitials: 'U',
    role: { departmentId: d.id, departmentCode: d.code, capabilities },
  };
  return { user, authenticatedAt: '2026-07-21T09:00:00.000Z' };
};

const baseInput = () => ({
  sla: DEFAULT_SLA_POLICY,
  org: DEFAULT_ORG_CONFIG,
  flags: Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, f.defaultState])),
  categoryEnabled: () => true,
});

describe('configuration validation', () => {
  it('finds the shipped configuration sound', () => {
    const r = validateConfiguration(baseInput());
    expect(r.errors, r.issues.map((i) => i.message).join(' | ')).toBe(0);
    // A clean report must be evidence, not silence: the checks that ran are listed.
    expect(r.passed.length).toBeGreaterThan(10);
  });

  it('gives every issue a consequence, not just a complaint', () => {
    // An administrator cannot act on "invalid configuration". Every issue says what breaks.
    const r = validateConfiguration({
      ...baseInput(),
      sla: { ...DEFAULT_SLA_POLICY, resolutionHours: { Urgent: 80, High: 40, Medium: 16, Low: 8 } },
    });
    expect(r.errors).toBeGreaterThan(0);
    for (const i of r.issues) expect(i.consequence.length, i.id).toBeGreaterThan(20);
  });

  it('catches an SLA policy where raising priority would give MORE time', () => {
    // The check most likely to fire in practice: SLA targets are editable at runtime and nothing
    // else in the system stops an administrator inverting them.
    const r = validateConfiguration({
      ...baseInput(),
      sla: { ...DEFAULT_SLA_POLICY, resolutionHours: { Urgent: 80, High: 16, Medium: 40, Low: 8 } },
    });
    expect(r.issues.some((i) => i.id === 'SLA-ORDER')).toBe(true);
  });

  it('catches a zero resolution target', () => {
    const r = validateConfiguration({
      ...baseInput(),
      sla: { ...DEFAULT_SLA_POLICY, resolutionHours: { ...DEFAULT_SLA_POLICY.resolutionHours, High: 0 } },
    });
    expect(r.issues.some((i) => i.id === 'SLA-NON-POSITIVE')).toBe(true);
  });

  it('catches a business day of zero length and a calendar with no working days', () => {
    expect(
      validateConfiguration({ ...baseInput(), org: { ...DEFAULT_ORG_CONFIG, workingHours: { start: 18, end: 9 } } })
        .issues.some((i) => i.id === 'ORG-HOURS'),
    ).toBe(true);
    expect(
      validateConfiguration({ ...baseInput(), org: { ...DEFAULT_ORG_CONFIG, workingDays: [] } })
        .issues.some((i) => i.id === 'ORG-NO-DAYS'),
    ).toBe(true);
  });

  it('catches a malformed holiday date, which the SLA calendar would silently ignore', () => {
    const r = validateConfiguration({ ...baseInput(), org: { ...DEFAULT_ORG_CONFIG, holidays: ['25-12-2026'] } });
    expect(r.issues.some((i) => i.id === 'ORG-BAD-HOLIDAY')).toBe(true);
  });

  it('catches a route left with every category disabled', () => {
    const r = validateConfiguration({ ...baseInput(), categoryEnabled: () => false });
    expect(r.issues.some((i) => i.id === 'ROUTE-ALL-DISABLED')).toBe(true);
  });

  it('catches a flag switched on for a capability that does not exist', () => {
    const unbuilt = FEATURE_FLAGS.find((f) => !f.implemented)!;
    const r = validateConfiguration({ ...baseInput(), flags: { [unbuilt.key]: true } });
    expect(r.issues.some((i) => i.id === 'FLAG-UNBUILT')).toBe(true);
  });

  it('raises an ERROR when no active administrator remains, and a warning when only one does', () => {
    const mk = (id: string, active: boolean, admin: boolean) => ({
      ...session('ADM', admin ? (['SUPER_ADMIN'] as Capability[]) : []).user,
      id,
      active,
    });
    const none = validateConfiguration({ ...baseInput(), users: [mk('a', false, true), mk('b', true, false)] });
    expect(none.issues.find((i) => i.id === 'PERM-NO-ADMIN')?.severity).toBe('error');

    const one = validateConfiguration({ ...baseInput(), users: [mk('a', true, true), mk('b', true, false)] });
    expect(one.issues.find((i) => i.id === 'PERM-ONE-ADMIN')?.severity).toBe('warning');

    const two = validateConfiguration({ ...baseInput(), users: [mk('a', true, true), mk('b', true, true)] });
    expect(two.issues.some((i) => i.id.startsWith('PERM-'))).toBe(false);
  });

  it('skips the administrator checks rather than guessing when the user list is absent', () => {
    // A confident "no administrators" from an unloaded roster would be an alarm, not a gap.
    const r = validateConfiguration(baseInput());
    expect(r.issues.some((i) => i.id === 'PERM-NO-ADMIN')).toBe(false);
  });

  it('names the checks it cannot meaningfully run instead of reporting them as passed', () => {
    expect(INAPPLICABLE_CHECKS.length).toBeGreaterThan(0);
    for (const c of INAPPLICABLE_CHECKS) expect(c.why.length).toBeGreaterThan(30);
    const passedText = validateConfiguration(baseInput()).passed.join(' ').toLowerCase();
    expect(passedText).not.toContain('orphan');
    expect(passedText).not.toContain('circular');
  });
});

describe('permission catalogue', () => {
  it('covers every static permission the engine can grant', () => {
    const catalogued = new Set(PERMISSION_CATALOGUE.filter((p) => p.kind === 'static').map((p) => p.id));
    for (const p of STATIC_PERMISSIONS) expect(catalogued.has(p), `${p} is not catalogued`).toBe(true);
  });

  it('names an enforcement point for every permission — a right nobody checks is dead config', () => {
    const dead = PERMISSION_CATALOGUE.filter((p) => p.enforcedBy === null);
    expect(dead.map((p) => p.id)).toEqual([]);
  });

  it('describes every permission well enough to review it', () => {
    for (const p of PERMISSION_CATALOGUE) {
      expect(p.description.length, p.id).toBeGreaterThan(20);
      expect(['low', 'medium', 'high']).toContain(p.risk);
    }
  });

  it('classifies the permissions that move money-adjacent deadlines as high risk', () => {
    // Not arbitrary: these three change what the system will do to other people's work.
    for (const id of ['MANAGE_SLA', 'CHANGE_PRIORITY', 'MANAGE_USERS'] as const) {
      expect(PERMISSION_CATALOGUE.find((p) => p.id === id)?.risk, id).toBe('high');
    }
  });
});

describe('effective permissions', () => {
  it('explains a refusal, not just reports it', () => {
    const r = effectivePermissionsFor(session('SAL'));
    const queue = r.staticPermissions.find((p) => p.entry.id === 'VIEW_DEPARTMENT_QUEUE')!;
    expect(queue.granted).toBe(false);
    expect(queue.reason).toContain('nothing routes to Sales');
  });

  it('agrees with the permission engine for every department', () => {
    // Computed through `resolveStaticPermissions` — the same function the route guards call — so
    // the viewer cannot describe a system different from the one enforcing.
    for (const d of DEPARTMENT_LIST) {
      const r = effectivePermissionsFor(session(d.code));
      const queue = r.staticPermissions.find((p) => p.entry.id === 'VIEW_DEPARTMENT_QUEUE')!;
      expect(queue.granted, d.code).toBe(d.isDestination);
      const admin = r.staticPermissions.find((p) => p.entry.id === 'MANAGE_USERS')!;
      expect(admin.granted, d.code).toBe(false);
    }
  });

  it('grants administration by CAPABILITY, never by department', () => {
    expect(effectivePermissionsFor(session('ADM')).staticPermissions.find((p) => p.entry.id === 'MANAGE_USERS')!.granted).toBe(false);
    expect(effectivePermissionsFor(session('ADM', ['SUPER_ADMIN'])).staticPermissions.find((p) => p.entry.id === 'MANAGE_USERS')!.granted).toBe(true);
    // A sysadmin in any department, because OQ-02 leaves the grant open.
    expect(effectivePermissionsFor(session('FIN', ['SUPER_ADMIN'])).staticPermissions.find((p) => p.entry.id === 'MANAGE_USERS')!.granted).toBe(true);
  });

  it('refuses to answer ticket verbs as standing rights', () => {
    // The same person may close one ticket and not the one beside it, so a yes/no would be false
    // either way. They are listed with their rule, never with a verdict.
    const r = effectivePermissionsFor(session('FIN'));
    expect(r.ticketPermissions.length).toBeGreaterThan(0);
    expect(r.staticPermissions.some((p) => p.entry.kind === 'ticket')).toBe(false);
  });
});

describe('the routing matrix B06 declares protected', () => {
  it('is NOT the matrix B06 lists — B06 omits two ratified categories', () => {
    /**
     * B06 reproduces the routing matrix and calls it "a protected business artifact". It is
     * missing two categories that the ratified configuration has, so conforming the code to B06
     * would DELETE ratified business scope. Locked here so the divergence cannot be closed in the
     * wrong direction by someone reading B06 as authoritative.
     */
    const sales = ROUTES.find((r) => r.from === 'SAL' && r.to === 'FIN')!;
    expect(sales.categories.map((c) => c.label)).toContain('Incentive Issue'); // B06 omits this

    const academicsInbound = ROUTES.find((r) => r.from === 'SAL' && r.to === 'ACA')!;
    const labels = academicsInbound.categories.map((c) => c.label);
    // B06 writes these as one line, "Student Module – Status and Final Documentation".
    expect(labels).toContain('Student Module');
    expect(labels).toContain('Status and Final Documentation');
    expect(academicsInbound.categories).toHaveLength(6);
  });
});
