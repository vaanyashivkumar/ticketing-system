import { describe, it, expect } from 'vitest';
import type { Ticket, ActivityEntry, TicketStatus, Priority } from '@domain/types/ticket.types';
import { REPORTS, UNBUILDABLE_REPORTS, reportById } from '@config/reports.config';
import { summarise, slaBreakdown, byCategoryDetailed } from './reportMetrics';
import { ExportService } from '@services/exportService';
import {
  hasActivityTrail,
  statusDwellTimes,
  ageingBuckets,
  escalationSummary,
  oldestOpen,
} from './lifecycleMetrics';

let seq = 0;
const ticket = (over: Partial<Ticket> = {}): Ticket => {
  seq += 1;
  return {
    id: `t${seq}`, code: `FIN-000${seq}`, subject: 's', description: 'd',
    status: 'InProgress' as TicketStatus, priority: 'Medium' as Priority,
    fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'Payment Link', categoryData: {},
    createdById: 'u-sal', createdByName: 'S', assignedToId: null, assignedToName: null,
    // Thu 16 Jul 2026 09:00 local — a business morning, so business hours advance predictably.
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

let act = 0;
const move = (from: TicketStatus, to: TicketStatus, at: Date): ActivityEntry => {
  act += 1;
  return { id: `a${act}`, actorId: 'u', actorName: 'U', action: 'SUBMITTED', at: at.toISOString(), from, to };
};
const regrade = (from: Priority, to: Priority, at: Date): ActivityEntry => {
  act += 1;
  return { id: `a${act}`, actorId: 'u', actorName: 'U', action: 'PRIORITY_CHANGED', at: at.toISOString(), fromValue: from, toValue: to };
};
const at = (h: number, day = 16) => new Date(2026, 6, day, h, 0, 0);

describe('activity-trail availability', () => {
  it('distinguishes "nothing happened" from "we were not sent the history"', () => {
    // In API mode the ticket LIST endpoint omits activities, so these metrics would return a
    // confident zero. The caller needs to tell the two apart before rendering a number.
    expect(hasActivityTrail([ticket(), ticket()])).toBe(false);
    expect(hasActivityTrail([ticket({ activity: [move('Draft', 'Submitted', at(10))] })])).toBe(true);
  });
});

describe('status dwell time', () => {
  it('measures a completed visit in business hours', () => {
    // Created 09:00, submitted 12:00 -> three business hours in Draft.
    const t = ticket({ createdAt: at(9).toISOString(), activity: [move('Draft', 'Submitted', at(12))] });
    const draft = statusDwellTimes([t]).find((d) => d.status === 'Draft')!;
    expect(draft.averageHours).toBe(3);
    expect(draft.samples).toBe(1);
  });

  it('chains consecutive visits, attributing each span to the status it was spent in', () => {
    const t = ticket({
      status: 'InProgress',
      createdAt: at(9).toISOString(),
      activity: [move('Draft', 'Submitted', at(10)), move('Submitted', 'Assigned', at(12)), move('Assigned', 'InProgress', at(17))],
    });
    const d = statusDwellTimes([t]);
    expect(d.find((x) => x.status === 'Draft')!.averageHours).toBe(1);
    expect(d.find((x) => x.status === 'Submitted')!.averageHours).toBe(2);
    expect(d.find((x) => x.status === 'Assigned')!.averageHours).toBe(5);
  });

  it('EXCLUDES the current status, so running the report twice gives the same answer', () => {
    // Time in the current status grows while you look at it. Including it would make an unchanged
    // system report a different number every time, with no event having occurred.
    const t = ticket({ status: 'InProgress', activity: [move('Draft', 'InProgress', at(10))] });
    const inProgress = statusDwellTimes([t]).find((x) => x.status === 'InProgress')!;
    expect(inProgress.averageHours).toBeNull();
    expect(inProgress.samples).toBe(0);
    // It is still reported as occupied — the count and the duration answer different questions.
    expect(inProgress.currentlyHere).toBe(1);
  });

  it('ignores non-transition activity, so a re-grade cannot be read as a status change', () => {
    // This is why `from`/`to` and `fromValue`/`toValue` are separate fields. Reading either pair
    // for both would attribute a priority change to a status and corrupt every duration here.
    const t = ticket({
      createdAt: at(9).toISOString(),
      activity: [regrade('Medium', 'Urgent', at(10)), move('Draft', 'Submitted', at(12))],
    });
    expect(statusDwellTimes([t]).find((d) => d.status === 'Draft')!.averageHours).toBe(3);
  });

  it('averages across tickets rather than summing', () => {
    const a = ticket({ createdAt: at(9).toISOString(), activity: [move('Draft', 'Submitted', at(11))] });
    const b = ticket({ createdAt: at(9).toISOString(), activity: [move('Draft', 'Submitted', at(13))] });
    expect(statusDwellTimes([a, b]).find((d) => d.status === 'Draft')!.averageHours).toBe(3);
  });

  it('reports every status, so a stage with no traffic is visibly empty rather than absent', () => {
    expect(statusDwellTimes([ticket()])).toHaveLength(10);
  });
});

describe('ageing buckets', () => {
  it('uses the ratified edges and counts only open work', () => {
    const now = at(17); // 8 business hours after 09:00
    const fresh = ticket({ status: 'InProgress', sla: { ...ticket().sla, startedAt: at(15).toISOString() } });
    const old = ticket({ status: 'InProgress', sla: { ...ticket().sla, startedAt: at(9, 13).toISOString() } });
    const done = ticket({ status: 'Closed', sla: { ...ticket().sla, startedAt: at(9, 13).toISOString() } });
    const buckets = ageingBuckets([fresh, old, done], now);
    expect(buckets.map((b) => b.label)).toEqual(['Under 8h', '8–24h', '24–40h', 'Over 40h']);
    expect(buckets.reduce((n, b) => n + b.count, 0)).toBe(2); // the closed one is excluded
    expect(buckets[0]!.count).toBe(1);
  });
});

describe('escalation', () => {
  it('counts a raise as an escalation and a lowering separately', () => {
    // Conflating them would let a de-escalation inflate the very number that is supposed to show
    // work arriving mis-graded.
    const up = ticket({ activity: [regrade('Medium', 'Urgent', at(10))] });
    const down = ticket({ activity: [regrade('Urgent', 'Low', at(10))] });
    const s = escalationSummary([up, down]);
    expect(s.escalations).toBe(1);
    expect(s.deEscalations).toBe(1);
    expect(s.ticketsAffected).toBe(2);
  });

  it('counts re-grades, not tickets — one ticket re-graded twice is two events', () => {
    const t = ticket({ activity: [regrade('Low', 'Medium', at(10)), regrade('Medium', 'High', at(11))] });
    const s = escalationSummary([t]);
    expect(s.escalations).toBe(2);
    expect(s.ticketsAffected).toBe(1);
  });

  it('reports which priority work is escalated INTO', () => {
    const t = ticket({ activity: [regrade('Low', 'Urgent', at(10))] });
    expect(escalationSummary([t]).byPriority.find((p) => p.priority === 'Urgent')!.escalatedTo).toBe(1);
  });

  it('ignores a value that is not a priority — the field is a plain string on the wire', () => {
    const t = ticket({ activity: [{ id: 'x', actorId: 'u', actorName: 'U', action: 'PRIORITY_CHANGED', at: at(10).toISOString(), fromValue: 'Critical', toValue: 'Urgent' }] });
    expect(escalationSummary([t]).escalations).toBe(0);
  });

  it('returns zero when nothing was re-graded, which is now a real answer', () => {
    // Before BR-060 was implemented this would also have been zero, and the zero would have been
    // indistinguishable from "the feature does not exist".
    expect(escalationSummary([ticket()]).escalations).toBe(0);
  });
});

describe('oldest open backlog', () => {
  it('returns tickets, oldest first, excluding finished work', () => {
    const now = at(17, 20);
    const older = ticket({ status: 'Assigned', sla: { ...ticket().sla, startedAt: at(9, 13).toISOString() } });
    const newer = ticket({ status: 'Assigned', sla: { ...ticket().sla, startedAt: at(9, 16).toISOString() } });
    const closed = ticket({ status: 'Closed', sla: { ...ticket().sla, startedAt: at(9, 10).toISOString() } });
    const rows = oldestOpen([newer, closed, older], 10, now);
    expect(rows.map((r) => r.id)).toEqual([older.id, newer.id]);
    expect(rows[0]!.ageHours).toBeGreaterThan(rows[1]!.ageHours);
  });

  it('honours the limit, because the answer is a work list rather than a number', () => {
    const many = Array.from({ length: 20 }, () => ticket({ status: 'Assigned' }));
    expect(oldestOpen(many, 5)).toHaveLength(5);
  });
});

describe('report registry', () => {
  it('gives every report a business question, as B07 requires', () => {
    for (const r of REPORTS) {
      expect(r.question.length, r.id).toBeGreaterThan(25);
      expect(r.question.trim().endsWith('?'), `${r.id} question must be a question`).toBe(true);
      expect(r.emptyHint.length, r.id).toBeGreaterThan(20);
    }
  });

  it('declares which reports depend on history the list endpoint does not send', () => {
    // Without this the four activity-derived reports would silently render zeroes in API mode.
    const needs = REPORTS.filter((r) => r.needsActivityTrail).map((r) => r.id);
    expect(needs).toContain('status');
    expect(needs).toContain('priority');
    expect(reportById('executive').needsActivityTrail).toBe(false);
  });

  it('records what it refuses to build, rather than dropping it silently', () => {
    const asked = UNBUILDABLE_REPORTS.map((u) => u.asked.toLowerCase()).join(' ');
    expect(asked).toContain('under review');
    expect(asked).toContain('critical');
    expect(asked).toContain('approval');
    for (const u of UNBUILDABLE_REPORTS) expect(u.why.length, u.asked).toBeGreaterThan(40);
  });
});

/**
 * Defects the B07 discovery pass found AFTER the build, in code that predates it.
 * Locked here so neither can return quietly.
 */
describe('reporting defects found by the B07 audit', () => {
  it('counts Overdue over the SAME population as the SLA "Breached" slice', () => {
    /**
     * They disagreed. `summarise().overdue` counted everything except Draft and Cancelled — which
     * INCLUDES Rejected — while `slaBreakdown`'s "Breached" counted open work only. A rejected
     * ticket stops nothing (Reject carries no stampResolved/stampClosed effect), so it keeps
     * deriving Overdue forever. Two numbers on one page, both labelled overdue, over different
     * sets — and a category row that could read "Backlog 0, Overdue 3".
     */
    const overdueSla = { ...ticket().sla, dueAt: at(9).toISOString(), flag: 'Overdue' as const };
    const rejected = ticket({ status: 'Rejected', sla: overdueSla });
    const live = ticket({ status: 'InProgress', sla: overdueSla });

    const s = summarise([rejected, live]);
    const breached = slaBreakdown([rejected, live]).find((b) => b.name === 'Breached')!.count;
    expect(s.overdue).toBe(breached);
    expect(s.overdue).toBe(1);
    // The impossible arithmetic that fell out of it.
    const row = byCategoryDetailed([rejected, live])[0]!;
    expect(row.overdue).toBeLessThanOrEqual(row.backlog);
  });

  it('neutralises a spreadsheet formula in free user text before writing it to CSV', () => {
    // A ticket subject is free text. Beginning it `=` made it execute in Excel when whoever
    // downloaded the report opened the file.
    const session = { user: { id: 'u', name: 'A', departmentCode: 'FIN' }, authenticatedAt: '' } as never;
    const csv = ExportService.buildCsv(
      'T',
      [{ subject: '=HYPERLINK("http://evil","click")' }],
      [{ header: 'Subject', value: (r: { subject: string }) => r.subject }],
      'None',
      session,
      'Own department',
    );
    expect(csv).not.toMatch(/^=HYPERLINK/m);
    expect(csv).toContain("'=HYPERLINK");
  });

  it('records the scope clamp in the export header', () => {
    // Two exports of "everything, no filters" — one by Sales, one by a sysadmin — produced
    // identical headers over completely different populations.
    const session = { user: { id: 'u', name: 'A', departmentCode: 'SAL' }, authenticatedAt: '' } as never;
    const csv = ExportService.buildCsv('T', [], [], 'None', session, 'Own department (source or destination)');
    expect(csv).toContain('# Data scope,Own department (source or destination)');
  });
});
