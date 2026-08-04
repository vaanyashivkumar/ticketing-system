import { describe, it, expect } from 'vitest';
import type { Ticket, TicketStatus, Priority } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { teamOf, summariseTeam, teamTotals, workFlows } from './teamMetrics';
import { TEAM_COLUMNS } from '@config/team.config';

let seq = 0;
const ticket = (over: Partial<Ticket> = {}): Ticket => {
  seq += 1;
  return {
    id: `t${seq}`, code: `FIN-000${seq}`, subject: 's', description: 'd',
    status: 'InProgress' as TicketStatus, priority: 'Medium' as Priority,
    fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'Payment Link', categoryData: {},
    createdById: 'u-sal', createdByName: 'Priya Raman', assignedToId: null, assignedToName: null,
    createdAt: new Date(2026, 6, 16, 9, 0, 0).toISOString(),
    updatedAt: new Date(2026, 6, 16, 9, 0, 0).toISOString(),
    sla: {
      startedAt: new Date(2026, 6, 16, 9, 0, 0).toISOString(),
      dueAt: null, resolvedAt: null, closedAt: null, pausedMsAccrued: 0, pausedSince: null, flag: 'OnTrack',
    },
    resolutionNote: null, reopenCount: 0, rejectionReason: null,
    comments: [], attachments: [], activity: [], ...over,
  };
};

const USERS: { id: string; name: string; departmentCode: DepartmentCode }[] = [
  { id: 'u-fin', name: 'James Carrow', departmentCode: 'FIN' },
  { id: 'u-fin-2', name: 'Sofia Nowak', departmentCode: 'FIN' },
  { id: 'u-sal', name: 'Priya Raman', departmentCode: 'SAL' },
];
const FIN_TEAM = teamOf('u-fin', USERS, 'u-fin');

describe('who is on the team', () => {
  it('is the department, and only for the person who actually manages it', () => {
    expect(FIN_TEAM.map((m) => m.id)).toEqual(['u-fin', 'u-fin-2']);
    expect(FIN_TEAM.find((m) => m.id === 'u-fin')!.isManager).toBe(true);
  });

  it('is EMPTY for someone who is not the department manager', () => {
    // The guard that stops the view becoming a way to read colleagues' work sideways: Sofia is in
    // Finance, but Finance's manager is James, so she gets no team at all.
    expect(teamOf('u-fin-2', USERS, 'u-fin')).toEqual([]);
    // …and for a manager id that manages nothing.
    expect(teamOf('u-sal', USERS, null)).toEqual([]);
  });
});

describe('per-person counts', () => {
  const tickets = [
    ticket({ assignedToId: 'u-fin-2', status: 'InProgress' }),
    ticket({ assignedToId: 'u-fin-2', status: 'Assigned' }),
    ticket({ assignedToId: 'u-fin-2', status: 'Closed' }),
    ticket({ assignedToId: 'u-fin', status: 'Resolved' }),
    // Open and breached — the only row that should reach `overdue`.
    ticket({ assignedToId: 'u-fin', status: 'Assigned', sla: { ...ticket().sla, flag: 'Overdue' } }),
  ];
  const rows = summariseTeam(tickets, FIN_TEAM);
  const sofia = rows.find((r) => r.id === 'u-fin-2')!;
  const james = rows.find((r) => r.id === 'u-fin')!;

  it('counts what each person is holding, started and has finished', () => {
    expect(sofia.holding).toBe(2); // InProgress + Assigned; Closed is not open
    expect(sofia.inProgress).toBe(1);
    expect(sofia.completed).toBe(1);
    expect(james.completed).toBe(1);
  });

  it('counts overdue the SAME way the reports do — open and breached, never Rejected', () => {
    // reportMetrics.summarise had exactly this bug: counting Rejected as overdue produced two
    // numbers on one page with one label. A second definition here would reopen it.
    expect(james.overdue).toBe(1);
    expect(sofia.overdue).toBe(0);
    const rejected = summariseTeam(
      [ticket({ assignedToId: 'u-fin', status: 'Rejected', sla: { ...ticket().sla, flag: 'Overdue' } })],
      FIN_TEAM,
    );
    expect(rejected.find((r) => r.id === 'u-fin')!.overdue).toBe(0);
  });

  it('separates work they RAISED from work assigned to them', () => {
    const raised = summariseTeam(
      [ticket({ createdById: 'u-fin-2', status: 'AwaitingInformation', assignedToId: null })],
      FIN_TEAM,
    );
    const r = raised.find((m) => m.id === 'u-fin-2')!;
    expect(r.raisedOpen).toBe(1);
    expect(r.needsThem).toBe(1); // it is back with them for an answer
    expect(r.holding).toBe(0); // raising is not holding
  });

  it('totals are the sum of the rows, so the headline cannot contradict the table', () => {
    const t = teamTotals(rows);
    expect(t.people).toBe(2);
    expect(t.inPipeline).toBe(sofia.holding + james.holding);
    expect(t.completed).toBe(sofia.completed + james.completed);
    expect(t.overdue).toBe(sofia.overdue + james.overdue);
    expect(t.raised).toBe(sofia.raisedOpen + james.raisedOpen);
  });

  it('gives a REQUESTER department a non-zero headline', () => {
    // Sales, Marketing and Administration receive nothing, so holding/completed are structurally
    // zero for them. Found live: Priya's team had thirty open requests and every headline figure
    // read 0, which looks like a broken page rather than an outbound department.
    const outbound = summariseTeam(
      [
        ticket({ createdById: 'u-fin-2', assignedToId: null, status: 'Submitted' }),
        ticket({ createdById: 'u-fin-2', assignedToId: null, status: 'Assigned' }),
      ],
      FIN_TEAM,
    );
    const t = teamTotals(outbound);
    expect(t.inPipeline).toBe(0); // nothing assigned to them
    expect(t.raised).toBe(2); // …but the team is plainly busy, and the headline says so
  });
});

describe('THE ETHICS RULE — counts only, never a ranking', () => {
  it('returns people in team order, never sorted by any count', () => {
    // ENTERPRISE_REPORTING_SYSTEM §3 (§8 taken literally): no rankings, no leaderboards. Sorting
    // by output is how a workload table quietly becomes one, so order is asserted, not assumed.
    const busyFirst = [
      ticket({ assignedToId: 'u-fin-2' }), ticket({ assignedToId: 'u-fin-2' }),
      ticket({ assignedToId: 'u-fin-2' }), ticket({ assignedToId: 'u-fin' }),
    ];
    const rows = summariseTeam(busyFirst, FIN_TEAM);
    // Sofia holds strictly more, and still comes second — the order is the team's, not the count's.
    expect(rows.map((r) => r.id)).toEqual(['u-fin', 'u-fin-2']);
    expect(rows[1]!.holding).toBeGreaterThan(rows[0]!.holding);
  });

  it('exposes no timing or score field on a person', () => {
    // A structural guard: if someone adds an average-time column, this fails and sends them to
    // the ratification route rather than letting it land as a config line.
    const row = summariseTeam([ticket({ assignedToId: 'u-fin' })], FIN_TEAM)[0]!;
    const forbidden = Object.keys(row).filter((k) => /hour|time|avg|rank|score|speed/i.test(k));
    expect(forbidden).toEqual([]);
    for (const c of TEAM_COLUMNS) expect(typeof row[c.id]).toBe('number');
  });
});

describe('how work flows', () => {
  it('names teammates but collapses everyone else to their department', () => {
    const flows = workFlows([ticket({ createdById: 'u-sal', assignedToId: 'u-fin-2' })], FIN_TEAM);
    expect(flows).toEqual([{ from: 'Sales', to: 'Sofia Nowak', count: 1, internal: false }]);
  });

  it('marks a hand-off between two teammates as internal', () => {
    const flows = workFlows([ticket({ createdById: 'u-fin', assignedToId: 'u-fin-2' })], FIN_TEAM);
    expect(flows[0]!.internal).toBe(true);
    expect(flows[0]).toMatchObject({ from: 'James Carrow', to: 'Sofia Nowak' });
  });

  it('sends unassigned work to the destination DEPARTMENT — it has still moved', () => {
    const flows = workFlows([ticket({ createdById: 'u-sal', assignedToId: null })], FIN_TEAM);
    expect(flows[0]).toMatchObject({ from: 'Sales', to: 'Finance' });
  });

  it('ignores drafts, which have never left their author', () => {
    expect(workFlows([ticket({ status: 'Draft' })], FIN_TEAM)).toEqual([]);
  });

  it('groups repeats and orders ROUTES by volume, not people', () => {
    const flows = workFlows(
      [
        ticket({ createdById: 'u-sal', assignedToId: 'u-fin-2' }),
        ticket({ createdById: 'u-sal', assignedToId: 'u-fin-2' }),
        ticket({ createdById: 'u-fin', assignedToId: 'u-fin-2' }),
      ],
      FIN_TEAM,
    );
    expect(flows[0]).toMatchObject({ from: 'Sales', to: 'Sofia Nowak', count: 2 });
    expect(flows[1]!.count).toBe(1);
  });
});
