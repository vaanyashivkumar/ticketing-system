import { describe, it, expect } from 'vitest';
import type { Ticket, TicketStatus, Priority } from '@domain/types/ticket.types';
import type { TeamMember } from './teamMetrics';
import { buildFlowGraph, layoutFlowGraph, flattenForReading, NODE_H, ROW_GAP } from './flowGraph';

let seq = 0;
const ticket = (over: Partial<Ticket> = {}): Ticket => {
  seq += 1;
  return {
    id: `t${seq}`, code: `FIN-000${seq}`, subject: 's', description: 'd',
    status: 'InProgress' as TicketStatus, priority: 'Medium' as Priority,
    fromDeptCode: 'SAL', toDeptCode: 'FIN', categoryId: 'c', categoryLabel: 'Payment Link', categoryData: {},
    createdById: 'u-iqra', createdByName: 'Iqra', assignedToId: null, assignedToName: null,
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

const m = (id: string, name: string, departmentCode: TeamMember['departmentCode']): TeamMember =>
  ({ id, name, departmentCode, isManager: false });

const SALES: TeamMember[] = [m('u-hafeez', 'Hafeez', 'SAL'), m('u-iqra', 'Iqra', 'SAL')];
const COMPANY: TeamMember[] = [...SALES, m('u-raza', 'Raza', 'FIN'), m('u-hasna', 'Hasna', 'FIN')];

describe('building the map', () => {
  it('is root → person → where their work landed', () => {
    const g = buildFlowGraph([ticket(), ticket()], SALES, 'department', 'Sales');
    expect(g.kind).toBe('root');
    expect(g.count).toBe(2);
    const iqra = g.children.find((c) => c.label === 'Iqra')!;
    expect(iqra.kind).toBe('person');
    expect(iqra.children.map((c) => [c.label, c.count])).toEqual([['Finance', 2]]);
  });

  it('names a teammate but collapses an outsider to their department', () => {
    const g = buildFlowGraph(
      [ticket({ assignedToId: 'u-hafeez' }), ticket({ assignedToId: 'u-raza' })],
      SALES, 'department', 'Sales',
    );
    const dests = g.children.find((c) => c.label === 'Iqra')!.children.map((c) => c.label).sort();
    // Hafeez is on the team so he is named; Raza is not, so his ticket shows as Finance.
    expect(dests).toEqual(['Finance', 'Hafeez']);
  });

  it('adds a department level in the company view — 27 people on one root is a list, not a map', () => {
    const g = buildFlowGraph(
      [ticket(), ticket({ createdById: 'u-raza', fromDeptCode: 'FIN', toDeptCode: 'ACA' })],
      COMPANY, 'company', 'All departments',
    );
    expect(g.children.map((c) => c.kind)).toEqual(['department', 'department']);
    const sales = g.children.find((c) => c.label === 'Sales')!;
    expect(sales.children.map((c) => c.label)).toEqual(['Iqra']);
    expect(sales.children[0]!.children[0]!.label).toBe('Finance');
  });

  it('ignores drafts and self-held work — neither has been handed over', () => {
    expect(buildFlowGraph([ticket({ status: 'Draft' })], SALES, 'department', 'Sales').count).toBe(0);
    expect(
      buildFlowGraph([ticket({ assignedToId: 'u-iqra' })], SALES, 'department', 'Sales').count,
    ).toBe(0);
  });

  it('orders branches by volume — routes by traffic, never people against each other', () => {
    const g = buildFlowGraph(
      [ticket(), ticket(), ticket({ createdById: 'u-hafeez' })],
      SALES, 'department', 'Sales',
    );
    expect(g.children.map((c) => c.label)).toEqual(['Iqra', 'Hafeez']);
  });
});

describe('laying it out', () => {
  const graph = buildFlowGraph(
    [ticket(), ticket({ toDeptCode: 'HR' }), ticket({ createdById: 'u-hafeez' })],
    SALES, 'department', 'Sales',
  );

  it('shows only the root when nothing is expanded', () => {
    const l = layoutFlowGraph(graph, new Set());
    expect(l.nodes).toHaveLength(1);
    expect(l.edges).toHaveLength(0);
    expect(l.height).toBe(NODE_H); // one row, no trailing gap
  });

  it('RECLAIMS the space of a collapsed branch rather than leaving a hole', () => {
    // The property a reader would assume without checking, and the one that makes collapsing
    // worth having: a folded branch must cost no vertical space at all.
    const open = layoutFlowGraph(graph, new Set(['root', 'p:u-iqra']));
    const folded = layoutFlowGraph(graph, new Set(['root']));
    expect(folded.height).toBeLessThan(open.height);
    expect(folded.nodes).toHaveLength(3); // root + two people, no destinations
    expect(folded.height).toBe(2 * (NODE_H + ROW_GAP) - ROW_GAP);
  });

  it('centres a parent on the span of its children', () => {
    const l = layoutFlowGraph(graph, new Set(['root', 'p:u-iqra']));
    const iqra = l.nodes.find((n) => n.node.label === 'Iqra')!;
    const kids = l.nodes.filter((n) => n.depth === 2);
    expect(kids.length).toBeGreaterThan(1);
    const mid = (kids[0]!.y + kids[kids.length - 1]!.y) / 2;
    expect(iqra.y).toBe(mid);
  });

  it('returns nodes in READING order, parents before their children', () => {
    // The nodes are absolutely positioned, so DOM order is what a screen reader follows. Positions
    // must be computed children-first, so without a re-order every leaf would be announced before
    // the branch it belongs to.
    const l = layoutFlowGraph(graph, new Set(['root', 'p:u-iqra']));
    const ids = l.nodes.map((n) => n.node.id);
    expect(ids[0]).toBe('root');
    expect(ids.indexOf('p:u-iqra')).toBeLessThan(ids.indexOf('p:u-iqra>Finance'));
  });

  it('draws exactly one connector per visible parent-child pair', () => {
    const l = layoutFlowGraph(graph, new Set(['root', 'p:u-iqra']));
    const expectedEdges = l.nodes.filter((n) => n.depth > 0).length;
    expect(l.edges).toHaveLength(expectedEdges);
    for (const e of l.edges) expect(e.path.startsWith('M ')).toBe(true);
  });

  it('flattens to the same tree for the reading alternative', () => {
    expect(flattenForReading(graph).map((n) => n.depth)[0]).toBe(0);
    expect(flattenForReading(graph)).toHaveLength(1 + 2 + 3); // root + 2 people + 3 destinations
  });
});
