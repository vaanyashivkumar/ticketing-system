import { describe, it, expect } from 'vitest';
import type { TicketStatus } from '@domain/types/ticket.types';
import { STATUS_TRANSITIONS } from '@config/statusTransitions.config';
import { STATUS_DEFINITIONS, QUEUE_DEFINITIONS } from '@config/statuses.config';
import {
  statusDef,
  statusLabel,
  statusShortLabel,
  ORDERED_STATUSES,
  OPEN_STATUSES,
  ASSIGNABLE_STATUSES,
  nextStatuses,
  previousStatuses,
  isTerminal,
  statusesInQueue,
  queueOf,
} from './statusEngine';

/**
 * The exhaustiveness anchor. This object is checked BY THE COMPILER against the `TicketStatus`
 * union: omit a member and it fails to build, add one that is not in the union and it fails to
 * build. Everything below compares the configuration to this, so a status added to the type
 * without a definition is caught here rather than by an undefined label on screen.
 */
const ALL_STATUSES: Record<TicketStatus, true> = {
  Draft: true,
  Submitted: true,
  Assigned: true,
  InProgress: true,
  AwaitingInformation: true,
  Resolved: true,
  Closed: true,
  Rejected: true,
  Cancelled: true,
  Reopened: true,
};
const EVERY_STATUS = Object.keys(ALL_STATUSES) as TicketStatus[];

describe('status configuration', () => {
  it('defines every status in the union, exactly once', () => {
    expect(STATUS_DEFINITIONS).toHaveLength(EVERY_STATUS.length);
    expect([...STATUS_DEFINITIONS.map((s) => s.id)].sort()).toEqual([...EVERY_STATUS].sort());
  });

  it('gives every status referenced by the transition matrix a definition', () => {
    const referenced = new Set(STATUS_TRANSITIONS.flatMap((t) => [t.from, t.to]));
    for (const status of referenced) expect(() => statusDef(status)).not.toThrow();
  });

  it('orders statuses uniquely', () => {
    const orders = STATUS_DEFINITIONS.map((s) => s.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(ORDERED_STATUSES).toHaveLength(EVERY_STATUS.length);
  });

  it('puts every status in at most one queue, and every queue is defined', () => {
    const buckets = new Set(QUEUE_DEFINITIONS.map((q) => q.id));
    for (const s of STATUS_DEFINITIONS) {
      if (s.queue !== null) expect(buckets.has(s.queue)).toBe(true);
    }
    // Every bucket must actually hold something, or it is a tab that can never have contents.
    for (const q of QUEUE_DEFINITIONS) expect(statusesInQueue(q.id).length).toBeGreaterThan(0);
  });

  it('keeps drafts out of every queue', () => {
    // A draft is private to its author until Submit (P13 §7 / D09-1).
    expect(queueOf('Draft')).toBeNull();
  });
});

describe('derived sets', () => {
  it('reproduces the open set the five hand-copied arrays used', () => {
    // Regression lock: this is the exact list that was duplicated across metrics.ts,
    // reportMetrics.ts, DashboardPage.tsx and the API's reports.ts.
    expect([...OPEN_STATUSES].sort()).toEqual(
      ['Submitted', 'Assigned', 'InProgress', 'AwaitingInformation', 'Reopened'].sort(),
    );
  });

  it('reproduces the assignable set the three hand-copied arrays used', () => {
    expect([...ASSIGNABLE_STATUSES].sort()).toEqual(
      ['Assigned', 'InProgress', 'AwaitingInformation', 'Reopened'].sort(),
    );
  });

  it('resolves the label divergence without flattening the two legitimate uses', () => {
    // The badge said "Awaiting Information"; the chart and filter said "Awaiting Info".
    expect(statusLabel('AwaitingInformation')).toBe('Awaiting Information');
    expect(statusShortLabel('AwaitingInformation')).toBe('Awaiting Info');
    // A status with no short form falls back rather than rendering undefined.
    expect(statusShortLabel('Submitted')).toBe('Submitted');
  });
});

describe('transition-derived facts', () => {
  it('derives next/previous from the matrix', () => {
    expect([...nextStatuses('Draft')].sort()).toEqual(['Cancelled', 'Submitted']);
    expect([...previousStatuses('Reopened')].sort()).toEqual(['Closed', 'Rejected', 'Resolved']);
  });

  it('finds Cancelled to be the only truly terminal status', () => {
    // The deleted TERMINAL_STATUSES constant claimed Closed and Rejected were terminal too.
    // Both have a ratified Reopen edge (R7 / BR-047), so both were wrong.
    const terminal = EVERY_STATUS.filter(isTerminal);
    expect(terminal).toEqual(['Cancelled']);
    expect(nextStatuses('Closed')).toContain('Reopened');
    expect(nextStatuses('Rejected')).toContain('Reopened');
  });

  it('leaves no status unreachable', () => {
    // Draft is the entry point and has no inbound edge; everything else must be reachable, or
    // it is a state the application can render but never enter.
    for (const s of EVERY_STATUS) {
      if (s === 'Draft') continue;
      expect(previousStatuses(s).length, `${s} is unreachable`).toBeGreaterThan(0);
    }
  });
});
