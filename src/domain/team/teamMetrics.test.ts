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
    createdById: 'u-hafeez', createdByName: 'Hafeez', assignedToId: null, assignedToName: null,
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
  { id: 'u-raza', name: 'Raza', departmentCode: 'FIN' },
  { id: 'u-hasna', name: 'Hasna', departmentCode: 'FIN' },
  { id: 'u-hafeez', name: 'Hafeez', departmentCode: 'SAL' },
];
const FIN_TEAM = teamOf('u-raza', USERS, 'u-raza');

describe('who is on the team', () => {
  it('is the department, and only for the person who actually manages it', () => {
    expect(FIN_TEAM.map((m) => m.id)).toEqual(['u-raza', 'u-hasna']);
    expect(FIN_TEAM.find((m) => m.id === 'u-raza')!.isManager).toBe(true);
  });

  it('is EMPTY for someone who is not the department manager', () => {
    // The guard that stops the view becoming a way to read colleagues' work sideways: Sofia is in
    // Finance, but Finance's manager is James, so she gets no team at all.
    expect(teamOf('u-hasna', USERS, 'u-raza')).toEqual([]);
    // …and for a manager id that manages nothing.
    expect(teamOf('u-hafeez', USERS, null)).toEqual([]);
  });
});

describe('per-person counts', () => {
  const tickets = [
    ticket({ assignedToId: 'u-hasna', status: 'InProgress' }),
    ticket({ assignedToId: 'u-hasna', status: 'Assigned' }),
    ticket({ assignedToId: 'u-hasna', status: 'Closed' }),
    ticket({ assignedToId: 'u-raza', status: 'Resolved' }),
    // Open and breached — the only row that should reach `overdue`.
    ticket({ assignedToId: 'u-raza', status: 'Assigned', sla: { ...ticket().sla, flag: 'Overdue' } }),
  ];
  const rows = summariseTeam(tickets, FIN_TEAM);
  const hasna = rows.find((r) => r.id === 'u-hasna')!;
  const raza = rows.find((r) => r.id === 'u-raza')!;

  it('counts what each person is holding, started and has finished', () => {
    expect(hasna.holding).toBe(2); // InProgress + Assigned; Closed is not open
    expect(hasna.inProgress).toBe(1);
    expect(hasna.completed).toBe(1);
    expect(raza.completed).toBe(1);
  });

  it('counts overdue the SAME way the reports do — open and breached, never Rejected', () => {
    // reportMetrics.summarise had exactly this bug: counting Rejected as overdue produced two
    // numbers on one page with one label. A second definition here would reopen it.
    expect(raza.overdue).toBe(1);
    expect(hasna.overdue).toBe(0);
    const rejected = summariseTeam(
      [ticket({ assignedToId: 'u-raza', status: 'Rejected', sla: { ...ticket().sla, flag: 'Overdue' } })],
      FIN_TEAM,
    );
    expect(rejected.find((r) => r.id === 'u-raza')!.overdue).toBe(0);
  });

  it('separates work they RAISED from work assigned to them', () => {
    const raised = summariseTeam(
      [ticket({ createdById: 'u-hasna', status: 'AwaitingInformation', assignedToId: null })],
      FIN_TEAM,
    );
    const r = raised.find((m) => m.id === 'u-hasna')!;
    expect(r.raisedOpen).toBe(1);
    expect(r.needsThem).toBe(1); // it is back with them for an answer
    expect(r.holding).toBe(0); // raising is not holding
  });

  it('totals are the sum of the rows, so the headline cannot contradict the table', () => {
    const t = teamTotals(rows);
    expect(t.people).toBe(2);
    expect(t.inPipeline).toBe(hasna.holding + raza.holding);
    expect(t.completed).toBe(hasna.completed + raza.completed);
    expect(t.overdue).toBe(hasna.overdue + raza.overdue);
    expect(t.raised).toBe(hasna.raisedOpen + raza.raisedOpen);
  });

  it('gives a REQUESTER department a non-zero headline', () => {
    // Sales, Marketing and Administration receive nothing, so holding/completed are structurally
    // zero for them. Found live: Sales' team had thirty open requests and every headline figure
    // read 0, which looks like a broken page rather than an outbound department.
    const outbound = summariseTeam(
      [
        ticket({ createdById: 'u-hasna', assignedToId: null, status: 'Submitted' }),
        ticket({ createdById: 'u-hasna', assignedToId: null, status: 'Assigned' }),
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
      ticket({ assignedToId: 'u-hasna' }), ticket({ assignedToId: 'u-hasna' }),
      ticket({ assignedToId: 'u-hasna' }), ticket({ assignedToId: 'u-raza' }),
    ];
    const rows = summariseTeam(busyFirst, FIN_TEAM);
    // Hasna holds strictly more, and still comes second — the order is the team's, not the count's.
    expect(rows.map((r) => r.id)).toEqual(['u-raza', 'u-hasna']);
    expect(rows[1]!.holding).toBeGreaterThan(rows[0]!.holding);
  });

  it('exposes no timing or score field on a person', () => {
    // A structural guard: if someone adds an average-time column, this fails and sends them to
    // the ratification route rather than letting it land as a config line.
    const row = summariseTeam([ticket({ assignedToId: 'u-raza' })], FIN_TEAM)[0]!;
    const forbidden = Object.keys(row).filter((k) => /hour|time|avg|rank|score|speed/i.test(k));
    expect(forbidden).toEqual([]);
    for (const c of TEAM_COLUMNS) expect(typeof row[c.id]).toBe('number');
  });
});

describe('how work flows', () => {
  it('names teammates but collapses everyone else to their department', () => {
    const flows = workFlows([ticket({ createdById: 'u-hafeez', assignedToId: 'u-hasna' })], FIN_TEAM);
    expect(flows).toEqual([{ from: 'Sales', to: 'Hasna', count: 1, internal: false }]);
  });

  it('marks a hand-off between two teammates as internal', () => {
    const flows = workFlows([ticket({ createdById: 'u-raza', assignedToId: 'u-hasna' })], FIN_TEAM);
    expect(flows[0]!.internal).toBe(true);
    expect(flows[0]).toMatchObject({ from: 'Raza', to: 'Hasna' });
  });

  it('sends unassigned work to the destination DEPARTMENT — it has still moved', () => {
    const flows = workFlows([ticket({ createdById: 'u-hafeez', assignedToId: null })], FIN_TEAM);
    expect(flows[0]).toMatchObject({ from: 'Sales', to: 'Finance' });
  });

  it('ignores drafts, which have never left their author', () => {
    expect(workFlows([ticket({ status: 'Draft' })], FIN_TEAM)).toEqual([]);
  });

  it('groups repeats and orders ROUTES by volume, not people', () => {
    const flows = workFlows(
      [
        ticket({ createdById: 'u-hafeez', assignedToId: 'u-hasna' }),
        ticket({ createdById: 'u-hafeez', assignedToId: 'u-hasna' }),
        ticket({ createdById: 'u-raza', assignedToId: 'u-hasna' }),
      ],
      FIN_TEAM,
    );
    expect(flows[0]).toMatchObject({ from: 'Sales', to: 'Hasna', count: 2 });
    expect(flows[1]!.count).toBe(1);
  });
});
