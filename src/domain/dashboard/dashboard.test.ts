import { describe, it, expect } from 'vitest';
import type { Session, User, DepartmentCode, Capability } from '@domain/types/auth.types';
import type { Ticket, TicketStatus, Priority, SlaFlag } from '@domain/types/ticket.types';
import { DEPARTMENTS, DEPARTMENT_LIST } from '@config/departments.config';
import { DEFAULT_SLA_POLICY } from '@config/sla.config';
import { DEFAULT_ORG_CONFIG } from '@config/org.config';
import { DASHBOARDS, GOVERNANCE_WIDGETS } from '@config/dashboard.config';
import { scopedTickets, isDestinationScope } from './scope';
import { inScope, isScopeAvailable, DATA_SCOPE_INFO, type DataScope } from './dataScope';
import { resolveDashboard, widgetsIn, isPermitted } from './dashboardResolver';
import { resolveKpi, kpiDef, KPI_DEFINITIONS, type KpiId } from './kpiRegistry';
import { workSelector, sortWork, WORK_SELECTORS } from './workSelectors';

// ---- fixtures ---------------------------------------------------------------

const session = (code: DepartmentCode, id = `u-${code}`, capabilities: Capability[] = []): Session => {
  const d = DEPARTMENTS[code];
  const user: User = {
    id,
    name: id,
    email: `${id}@t.test`,
    departmentId: d.id,
    departmentCode: d.code,
    avatarInitials: 'U',
    role: { departmentId: d.id, departmentCode: d.code, capabilities },
  };
  return { user, authenticatedAt: '2026-07-21T09:00:00.000Z' };
};

let seq = 0;
const ticket = (over: Partial<Ticket> = {}): Ticket => {
  seq += 1;
  return {
    id: `t${seq}`,
    code: `FIN-000${seq}`,
    subject: 's',
    description: 'd',
    status: 'Submitted' as TicketStatus,
    priority: 'Medium' as Priority,
    fromDeptCode: 'SAL',
    toDeptCode: 'FIN',
    categoryId: 'c',
    categoryLabel: 'Payment Link',
    categoryData: {},
    createdById: 'u-SAL',
    createdByName: 'S',
    assignedToId: null,
    assignedToName: null,
    createdAt: '2026-07-20T09:00:00.000Z',
    updatedAt: '2026-07-20T09:00:00.000Z',
    sla: {
      startedAt: '2026-07-20T09:00:00.000Z',
      dueAt: '2026-07-27T09:00:00.000Z',
      resolvedAt: null,
      closedAt: null,
      pausedMsAccrued: 0,
      pausedSince: null,
      flag: 'OnTrack' as SlaFlag,
    },
    resolutionNote: null,
    reopenCount: 0,
    rejectionReason: null,
    comments: [],
    attachments: [],
    activity: [],
    ...over,
  };
};

const ctx = (s: Session, visible: readonly Ticket[]) => ({
  session: s,
  visible,
  policy: DEFAULT_SLA_POLICY,
  org: DEFAULT_ORG_CONFIG,
});

// ---- the invariant that matters --------------------------------------------

describe('data scope narrows, never widens', () => {
  const sal = session('SAL');
  const all = [
    ticket({ fromDeptCode: 'SAL', toDeptCode: 'FIN', createdById: 'u-SAL' }),
    ticket({ fromDeptCode: 'MKT', toDeptCode: 'FIN', createdById: 'u-MKT' }),
    ticket({ fromDeptCode: 'HR', toDeptCode: 'ACA', createdById: 'u-HR' }),
  ];

  it('clamps a requester to its own department before any scope is applied', () => {
    const visible = scopedTickets(sal, all);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.fromDeptCode).toBe('SAL');
  });

  it('cannot be widened by asking for organisation-wide', () => {
    // The decisive test, and it is a NEGATIVE: a Sales session that somehow reached the
    // organisation scope still sees only what the clamp returned. `inScope` is a filter in every
    // branch; there is no path back to the full list.
    const visible = scopedTickets(sal, all);
    expect(inScope(sal, 'organisation-wide', visible)).toHaveLength(1);
    expect(inScope(sal, 'organisation-wide', visible)).not.toHaveLength(all.length);
  });

  it('refuses the organisation scope to anyone without the capability', () => {
    expect(isScopeAvailable(sal, 'organisation-wide')).toBe(false);
    expect(isScopeAvailable(session('ADM'), 'organisation-wide')).toBe(false);
    expect(isScopeAvailable(session('ADM', 'u-susrita', ['SUPER_ADMIN']), 'organisation-wide')).toBe(true);
    // Capability, not department: a sysadmin anywhere holds it (OQ-02 leaves the grant open).
    expect(isScopeAvailable(session('FIN', 'u-f', ['SUPER_ADMIN']), 'organisation-wide')).toBe(true);
  });

  it('refuses an incoming scope to a department nothing routes to', () => {
    for (const d of DEPARTMENT_LIST) {
      expect(isScopeAvailable(session(d.code), 'dept-incoming'), d.code).toBe(d.isDestination);
    }
  });

  it('keeps drafts out of an incoming queue scope', () => {
    const fin = session('FIN');
    const set = [ticket({ toDeptCode: 'FIN', status: 'Draft' }), ticket({ toDeptCode: 'FIN', status: 'Submitted' })];
    expect(inScope(fin, 'dept-incoming', set)).toHaveLength(1);
  });

  it('describes every scope, so a widget can always state what it counted', () => {
    const scopes: DataScope[] = ['created-by-me', 'assigned-to-me', 'dept-incoming', 'dept-outgoing', 'department-wide', 'organisation-wide'];
    for (const s of scopes) expect(DATA_SCOPE_INFO[s].label.length).toBeGreaterThan(0);
  });
});

// ---- resolver ---------------------------------------------------------------

describe('the resolver decides visibility, never the JSX', () => {
  it('gives every department a dashboard', () => {
    for (const d of DEPARTMENT_LIST) expect(DASHBOARDS[d.code]).toBeDefined();
  });

  it('gives a pure requester no inbound-queue region', () => {
    // PRD §10.1: "no inbound queue widget (no route terminates at Sales)". A region that can
    // only ever show zero promises work that cannot arrive.
    for (const code of ['SAL', 'MKT', 'ADM'] as const) {
      const r = resolveDashboard(session(code));
      expect(r.widgets.filter((w) => w.dataScope === 'dept-incoming'), code).toHaveLength(0);
      expect(r.isDestination, code).toBe(false);
    }
  });

  it('gives every destination department its inbound regions', () => {
    for (const code of ['ACA', 'HR', 'FIN'] as const) {
      const r = resolveDashboard(session(code));
      expect(r.widgets.some((w) => w.dataScope === 'dept-incoming'), code).toBe(true);
      expect(r.isDestination, code).toBe(true);
    }
  });

  it('gates governance on the CAPABILITY, never on the department name', () => {
    // BR-064/BR-069, and OQ-02 leaves open whether every Administration user holds it.
    expect(resolveDashboard(session('ADM')).hasGovernance).toBe(false);
    expect(resolveDashboard(session('ADM', 'u-susrita', ['SUPER_ADMIN'])).hasGovernance).toBe(true);
    expect(resolveDashboard(session('FIN', 'u-f', ['SUPER_ADMIN'])).hasGovernance).toBe(true);
  });

  it('never gives Finance an organisation-wide region without the capability', () => {
    // BR-067 / FR-D07 — "the single most easily broken scoping rule".
    const fin = resolveDashboard(session('FIN'));
    expect(fin.widgets.some((w) => w.dataScope === 'organisation-wide')).toBe(false);
  });

  it('orders widgets deterministically and splits them across the two columns', () => {
    const r = resolveDashboard(session('FIN'));
    const priorities = r.widgets.map((w) => w.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
    expect(widgetsIn(r, 'main').length + widgetsIn(r, 'aside').length).toBe(r.widgets.length);
  });

  it('refuses a widget whose data scope this session cannot hold', () => {
    /**
     * Tested against a SYNTHETIC widget on purpose. A mutation that deleted the scope gate
     * entirely left every other test in this file green, because no shipped configuration places
     * a `dept-incoming` widget on a requester department — the config excludes it, so the gate
     * was never the thing doing the work. It is defence in depth against a future configuration,
     * and this is what makes it real rather than decorative.
     */
    const incoming = { id: 'x', type: 'work-queue', title: 't', question: 'q'.repeat(12), dataScope: 'dept-incoming', selector: 'incoming-open', previewRows: 3, viewAll: '/app/queue', priority: 1, column: 'main' } as const;
    expect(isPermitted(session('SAL'), incoming)).toBe(false);
    expect(isPermitted(session('FIN'), incoming)).toBe(true);

    const global = { ...incoming, id: 'y', dataScope: 'organisation-wide' } as const;
    expect(isPermitted(session('FIN'), global)).toBe(false);
    expect(isPermitted(session('FIN', 'u-s', ['SUPER_ADMIN']), global)).toBe(true);
  });

  it('refuses a widget whose permission this session lacks', () => {
    const audit = { id: 'a', type: 'governance', title: 't', question: 'q'.repeat(12), dataScope: 'department-wide', requiredPermission: 'VIEW_AUDIT_LOGS', priority: 1, column: 'aside' } as const;
    expect(isPermitted(session('FIN'), audit)).toBe(false);
    expect(isPermitted(session('ADM', 'u-s', ['SUPER_ADMIN']), audit)).toBe(true);
  });

  it('resolves the same dashboard twice to the same thing', () => {
    const a = resolveDashboard(session('HR')).widgets.map((w) => w.id);
    const b = resolveDashboard(session('HR')).widgets.map((w) => w.id);
    expect(a).toEqual(b);
  });
});

describe('dashboard configuration is internally consistent', () => {
  const everyWidget = [...DEPARTMENT_LIST.flatMap((d) => DASHBOARDS[d.code].widgets), ...GOVERNANCE_WIDGETS];

  it('references only KPIs that exist', () => {
    for (const w of everyWidget) {
      if (w.type !== 'kpi-row') continue;
      for (const id of w.kpis) expect(() => kpiDef(id), `${w.id}/${id}`).not.toThrow();
    }
  });

  it('references only work selectors that exist', () => {
    for (const w of everyWidget) {
      if (w.type !== 'work-queue') continue;
      expect(() => workSelector(w.selector), w.id).not.toThrow();
    }
  });

  it('gives every queue preview a way out', () => {
    // A count of 23 beside six rows and no drill-down is a dead end — the defect this replaces.
    for (const w of everyWidget) {
      if (w.type !== 'work-queue') continue;
      expect(w.viewAll, w.id).toMatch(/^\//);
      expect(w.previewRows, w.id).toBeGreaterThan(0);
    }
  });

  it('gives every widget a question to answer', () => {
    // FR-D02: widgets are decision support, not decoration.
    for (const w of everyWidget) expect(w.question.length, w.id).toBeGreaterThan(10);
  });
});

// ---- KPIs -------------------------------------------------------------------

describe('KPI definitions', () => {
  const fin = session('FIN');

  it('states a denominator and a question for every KPI', () => {
    for (const def of KPI_DEFINITIONS) {
      expect(def.denominator(ctx(fin, [])).length, def.id).toBeGreaterThan(20);
      expect(def.question.length, def.id).toBeGreaterThan(10);
      expect(def.nullHint.length, def.id).toBeGreaterThan(0);
    }
  });

  it('counts Open over the five open statuses, and never counts Resolved', () => {
    const set = [
      ticket({ status: 'Submitted' }),
      ticket({ status: 'InProgress' }),
      ticket({ status: 'Resolved' }),
      ticket({ status: 'Closed' }),
      ticket({ status: 'Draft' }),
    ];
    expect(resolveKpi('open', ctx(fin, set)).result.value).toBe(2);
  });

  it('counts Needs-me INCLUDING Resolved — the case the old guard made unreachable', () => {
    // The page this replaces wrapped the same predicate in `isOpen`, and Resolved is not open, so
    // "resolved, waiting on you to accept" could never be counted. The number looked right and was
    // structurally incapable of counting the case two-step closure exists to create.
    const me = session('SAL', 'u-me');
    const set = [
      ticket({ createdById: 'u-me', status: 'AwaitingInformation' }),
      ticket({ createdById: 'u-me', status: 'Resolved' }),
      ticket({ createdById: 'u-me', status: 'InProgress' }),
      ticket({ createdById: 'u-other', status: 'Resolved' }),
    ];
    expect(resolveKpi('needsMe', ctx(me, inScope(me, 'created-by-me', set))).result.value).toBe(2);
  });

  it('counts Unassigned by assignee, not by status — Reopened is unassigned too', () => {
    const set = [
      ticket({ status: 'Submitted', assignedToId: null }),
      ticket({ status: 'Reopened', assignedToId: null }),
      ticket({ status: 'Assigned', assignedToId: 'u-x' }),
      ticket({ status: 'Closed', assignedToId: null }),
    ];
    expect(resolveKpi('unassigned', ctx(fin, set)).result.value).toBe(2);
  });

  it('measures SLA compliance historically, so resolving late cannot raise the score', () => {
    // D04 #37: reading compliance off the LIVE flag meant a ticket resolved five days late
    // counted as compliant, so resolving a breached ticket improved the number.
    const late = ticket({
      status: 'Resolved',
      sla: {
        startedAt: '2026-07-01T09:00:00.000Z',
        dueAt: '2026-07-02T09:00:00.000Z',
        resolvedAt: '2026-07-09T09:00:00.000Z',
        closedAt: null,
        pausedMsAccrued: 0,
        pausedSince: null,
        flag: 'OnTrack',
      },
    });
    const onTime = ticket({
      status: 'Resolved',
      sla: { ...late.sla, resolvedAt: '2026-07-01T17:00:00.000Z' },
    });
    expect(late.sla.flag).toBe('OnTrack'); // the live flag says nothing is wrong
    expect(resolveKpi('slaCompliance', ctx(fin, [late, onTime])).result.value).toBe(50);
  });

  it('reports an unknown state rather than a false zero when there is nothing to measure', () => {
    const r = resolveKpi('slaCompliance', ctx(fin, []));
    expect(r.result.value).toBeNull();
    expect(r.result.state).toBe('unknown');
  });

  it('flags a breach as needing action rather than leaving it to colour alone', () => {
    const overdue = ticket({ status: 'InProgress', sla: { ...ticket().sla, flag: 'Overdue' } });
    expect(resolveKpi('overdue', ctx(fin, [overdue])).result.state).toBe('critical');
    expect(resolveKpi('overdue', ctx(fin, [])).result.state).toBe('ok');
  });

  it('sends a destination to its queue and a requester to their own list', () => {
    expect(resolveKpi('open', ctx(session('FIN'), [])).to).toContain('/app/queue');
    expect(resolveKpi('open', ctx(session('SAL'), [])).to).toContain('/app/tickets');
  });

  it('measures the reopen rate from the stored tally, not from the current status', () => {
    // `reopenCount > 0` is BR-052's "has ever been reopened"; `status === 'Reopened'` is a queue
    // count. They are different questions and will differ substantially.
    const set = [
      ticket({ status: 'Closed', reopenCount: 2 }),
      ticket({ status: 'Closed', reopenCount: 0 }),
      ticket({ status: 'Reopened', reopenCount: 1 }),
      ticket({ status: 'Closed', reopenCount: 0 }),
    ];
    expect(resolveKpi('reopenRate', ctx(fin, set)).result.value).toBe(50);
  });
});

// ---- work selectors ---------------------------------------------------------

describe('work selectors sort before the preview truncates', () => {
  const fin = session('FIN');

  it('puts a breaching urgent ticket first even when it was added last', () => {
    // The defect: the previous widget truncated to six rows WITHOUT sorting, so with twenty
    // qualifying tickets an Overdue Urgent ticket at index seven was structurally invisible on
    // the screen whose entire job is to surface it.
    const filler = Array.from({ length: 10 }, () =>
      ticket({ status: 'InProgress', priority: 'Low', toDeptCode: 'FIN' }),
    );
    const buried = ticket({
      status: 'InProgress',
      priority: 'Urgent',
      toDeptCode: 'FIN',
      sla: { ...ticket().sla, flag: 'Overdue' },
    });
    const sel = workSelector('incoming-open');
    const rows = sortWork(sel.select([...filler, buried], fin), sel.sort);
    expect(rows[0]!.id).toBe(buried.id);
    // And it survives the preview cut, which is the whole point.
    expect(rows.slice(0, 5).map((t) => t.id)).toContain(buried.id);
  });

  it('orders an intake queue by age, not by SLA', () => {
    const old = ticket({ status: 'Submitted', assignedToId: null, createdAt: '2026-07-01T09:00:00.000Z' });
    const recent = ticket({ status: 'Submitted', assignedToId: null, createdAt: '2026-07-19T09:00:00.000Z' });
    const sel = workSelector('unassigned-incoming');
    expect(sortWork(sel.select([recent, old], fin), sel.sort)[0]!.id).toBe(old.id);
  });

  it('shows a destination user their OWN blocked requests', () => {
    // The previous rule gated this list on NOT being a destination department, so a Finance user
    // whose own request to Academics was blocked awaiting their answer saw it on no screen at all.
    const me = session('FIN', 'u-raza');
    const mine = ticket({ fromDeptCode: 'FIN', toDeptCode: 'ACA', createdById: 'u-raza', status: 'AwaitingInformation' });
    const sel = workSelector('needs-me');
    expect(sel.select([mine], me)).toHaveLength(1);
  });

  it('puts a RESOLVED ticket in needs-me — the selector, not just the KPI', () => {
    /**
     * The KPI and the selector implement the same rule twice, and a mutation proved they were
     * only tested once: replacing the selector's `status !== 'Draft'` with `isOpen(status)` — the
     * exact defect this build fixed — left every test green, because the Resolved case was only
     * ever asserted against the KPI.
     */
    const me = session('SAL', 'u-me');
    const set = [
      ticket({ createdById: 'u-me', status: 'Resolved' }),
      ticket({ createdById: 'u-me', status: 'AwaitingInformation' }),
      ticket({ createdById: 'u-me', status: 'Draft' }),
      ticket({ createdById: 'u-me', status: 'InProgress' }),
    ];
    const rows = workSelector('needs-me').select(set, me);
    expect(rows.map((t) => t.status).sort()).toEqual(['AwaitingInformation', 'Resolved']);
  });

  it('gives every selector an explicit sort and a stated reason for it', () => {
    for (const s of WORK_SELECTORS) {
      expect(s.sortLabel.length, s.id).toBeGreaterThan(0);
      expect(s.emptyTitle.length, s.id).toBeGreaterThan(0);
      expect(s.emptyDescription.length, s.id).toBeGreaterThan(10);
    }
  });

  it('breaks ties on age, so the order does not depend on how the list arrived', () => {
    /**
     * My first version of this test asserted that reversing the input gave the same output with
     * every field identical — including `createdAt`. That failed, and the CODE was right: with a
     * comparator returning 0 for every pair, a stable sort preserves input order, so reversing the
     * input correctly reverses the output. The test was asking for a total order and calling it
     * stability.
     *
     * What is actually guaranteed, and what matters on a real list, is that the third key resolves
     * the tie. `createdAt` carries milliseconds, so two tickets identical in SLA flag, priority
     * AND creation instant do not occur.
     */
    const set = Array.from({ length: 8 }, (_, i) =>
      ticket({ status: 'InProgress', priority: 'Medium', createdAt: `2026-07-0${i + 1}T09:00:00.000Z` }),
    );
    const sel = workSelector('incoming-open');
    const a = sortWork(sel.select(set, fin), sel.sort).map((t) => t.id);
    const b = sortWork(sel.select([...set].reverse(), fin), sel.sort).map((t) => t.id);
    expect(a).toEqual(b);
    // Oldest first once the tie is real.
    expect(a[0]).toBe(set[0]!.id);
  });
});

describe('scope helpers agree with the department configuration', () => {
  it('derives isDestinationScope from config rather than a second list', () => {
    // These two functions previously disagreed: `isDestinationScope` hardcoded ACA/HR/FIN while
    // `scopeFor` classed ACA and HR as `own`.
    for (const d of DEPARTMENT_LIST) {
      expect(isDestinationScope(session(d.code)), d.code).toBe(d.isDestination);
    }
  });
});

describe('every KPI the configuration uses actually computes', () => {
  it('runs without throwing for every department, on an empty and a populated set', () => {
    const set = [ticket({ status: 'InProgress' }), ticket({ status: 'Resolved' })];
    for (const d of DEPARTMENT_LIST) {
      const s = session(d.code);
      const ids = DASHBOARDS[d.code].widgets.flatMap((w) => (w.type === 'kpi-row' ? [...w.kpis] : [])) as KpiId[];
      for (const id of ids) {
        expect(() => resolveKpi(id, ctx(s, [])), `${d.code}/${id}`).not.toThrow();
        expect(() => resolveKpi(id, ctx(s, set)), `${d.code}/${id}`).not.toThrow();
      }
    }
  });
});
