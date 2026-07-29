import type { Session } from '@domain/types/auth.types';
import type { ActivityEntry, Ticket, TicketStatus } from '@domain/types/ticket.types';
import { missedTarget } from '@domain/sla/slaEngine';
import { OPEN_STATUSES, statusShortLabel } from '@domain/workflow/statusEngine';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';

/**
 * Dashboard metrics engine (P14 §2/§10/§15). PURE reducers over a (scope-clamped) ticket
 * set — never a second source of truth. Every metric answers an operational question.
 */


function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export interface Kpis {
  open: number;
  assignedToMe: number;
  awaitingInfo: number;
  overdue: number;
  resolvedToday: number;
  slaCompliancePct: number | null;
}

export function computeKpis(session: Session, tickets: readonly Ticket[]): Kpis {
  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const active = tickets.filter((t) => t.status !== 'Draft' && t.status !== 'Cancelled');
  // NOT `flag !== 'Overdue'`: the live flag is blind to everything already resolved, so a ticket
  // resolved five days late counted as compliant — resolving it RAISED the score (D04 #37).
  const metTarget = active.filter((t) => !missedTarget(t));
  return {
    open: open.length,
    assignedToMe: tickets.filter((t) => t.assignedToId === session.user.id && OPEN_STATUSES.includes(t.status)).length,
    awaitingInfo: tickets.filter((t) => t.status === 'AwaitingInformation').length,
    // Live escalation count — deliberately the flag, and deliberately open-only (phase-0 §532).
    overdue: active.filter((t) => t.sla.flag === 'Overdue').length,
    resolvedToday: tickets.filter((t) => isToday(t.sla.resolvedAt)).length,
    slaCompliancePct: active.length ? Math.round((metTarget.length / active.length) * 100) : null,
  };
}

/** Count tickets by status (for the status-distribution chart). */
export function byStatus(tickets: readonly Ticket[]): { status: string; count: number }[] {
  // Short labels: a bar-chart axis has far less room than a badge (Status Engine).
  const counts = new Map<TicketStatus, number>();
  tickets.forEach((t) => counts.set(t.status, (counts.get(t.status) ?? 0) + 1));
  return [...counts.entries()].map(([status, count]) => ({ status: statusShortLabel(status), count }));
}

export function byCategory(tickets: readonly Ticket[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  tickets.forEach((t) => counts.set(t.categoryLabel, (counts.get(t.categoryLabel) ?? 0) + 1));
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);
}

export function byPriority(tickets: readonly Ticket[]): { name: string; count: number }[] {
  const order = ORDERED_PRIORITIES;
  const counts = new Map<string, number>();
  tickets.forEach((t) => counts.set(t.priority, (counts.get(t.priority) ?? 0) + 1));
  return order.filter((p) => counts.has(p)).map((name) => ({ name, count: counts.get(name)! }));
}

/** Incoming volume by source department (for a hub/global "who is sending" chart). */
export function bySourceDept(tickets: readonly Ticket[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  tickets.filter((t) => t.status !== 'Draft').forEach((t) => counts.set(t.fromDeptCode, (counts.get(t.fromDeptCode) ?? 0) + 1));
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

export interface ActivityItem extends ActivityEntry {
  ticketId: string;
  ticketCode: string;
}

/** Recent activity across the scoped tickets (P14 §12). */
export function recentActivity(tickets: readonly Ticket[], limit = 8): ActivityItem[] {
  const items: ActivityItem[] = tickets.flatMap((t) =>
    t.activity.map((a) => ({ ...a, ticketId: t.id, ticketCode: t.code || 'Draft' })),
  );
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
