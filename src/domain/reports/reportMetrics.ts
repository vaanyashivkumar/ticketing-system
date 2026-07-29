import type { Ticket } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';
import { businessHoursBetween, missedTarget } from '@domain/sla/slaEngine';
import { OPEN_STATUSES } from '@domain/workflow/statusEngine';

/**
 * Reporting metrics (P16). PURE reducers derived from the single source of truth —
 * tickets and their activity/SLA state (§13: analytics never store separate business data).
 * Durations are BUSINESS hours, so they are directly comparable to the SLA targets.
 */
const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (n: number | null): number | null => (n === null ? null : Math.round(n * 10) / 10);

/** Resolution time = anchored (Submitted) → Resolved, in business hours. */
export function resolutionHours(t: Ticket): number | null {
  if (!t.sla.startedAt || !t.sla.resolvedAt) return null;
  return businessHoursBetween(new Date(t.sla.startedAt), new Date(t.sla.resolvedAt));
}

/** Response time = Submitted → first ASSIGNED activity, in business hours (assignment delay). */
export function responseHours(t: Ticket): number | null {
  if (!t.sla.startedAt) return null;
  const assigned = t.activity.find((a) => a.action === 'ASSIGNED');
  if (!assigned) return null;
  return businessHoursBetween(new Date(t.sla.startedAt), new Date(assigned.at));
}

export interface Summary {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  overdue: number;
  backlog: number;
  avgResolutionHours: number | null;
  avgResponseHours: number | null;
  slaCompliancePct: number | null;
}

export function summarise(tickets: readonly Ticket[]): Summary {
  const active = tickets.filter((t) => t.status !== 'Draft' && t.status !== 'Cancelled');
  const resolutions = tickets.map(resolutionHours).filter((n): n is number => n !== null);
  const responses = tickets.map(responseHours).filter((n): n is number => n !== null);
  // NOT `flag !== 'Overdue'`: the live flag is blind to everything already resolved, so a ticket
  // resolved five days late counted as compliant and resolving it RAISED the score (D04 #37).
  const compliant = active.filter((t) => !missedTarget(t));
  return {
    total: tickets.length,
    open: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    resolved: tickets.filter((t) => t.status === 'Resolved').length,
    closed: tickets.filter((t) => t.status === 'Closed').length,
    /**
     * OPEN work only — the same population `slaBreakdown` uses for its "Breached" slice.
     *
     * It previously counted `active`, which excludes only Draft and Cancelled and therefore
     * INCLUDES Rejected. A rejected ticket stops nothing: `Reject` carries no `stampResolved` or
     * `stampClosed` effect, so `deriveFlag` keeps computing against a due date that has passed and
     * the ticket stays Overdue forever. The result was two numbers on one page, both labelled
     * overdue, computed over different sets — and a category row that could read
     * "Backlog 0, Overdue 3", which is impossible on its face.
     *
     * phase-0 §532 defines Overdue as a LIVE escalation flag over active statuses. Rejected work
     * is not live, so it is not escalating.
     */
    overdue: tickets.filter((t) => OPEN_STATUSES.includes(t.status) && t.sla.flag === 'Overdue').length,
    backlog: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    avgResolutionHours: r1(avg(resolutions)),
    avgResponseHours: r1(avg(responses)),
    slaCompliancePct: active.length ? Math.round((compliant.length / active.length) * 100) : null,
  };
}

/** SLA breakdown — Within / Approaching / Breached (the ratified derived flags). */
export function slaBreakdown(tickets: readonly Ticket[]): { name: string; count: number }[] {
  const active = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  return [
    { name: 'Within SLA', count: active.filter((t) => t.sla.flag === 'OnTrack').length },
    { name: 'Approaching', count: active.filter((t) => t.sla.flag === 'DueSoon').length },
    { name: 'Breached', count: active.filter((t) => t.sla.flag === 'Overdue').length },
  ];
}

export interface DeptRow {
  code: DepartmentCode;
  raised: number;
  received: number;
  resolved: number;
  overdue: number;
  avgResolutionHours: number | null;
  slaCompliancePct: number | null;
}

/** Department comparison — the "which department" question (§3/§4/§6). */
export function byDepartment(tickets: readonly Ticket[], codes: readonly DepartmentCode[]): DeptRow[] {
  return codes.map((code) => {
    const received = tickets.filter((t) => t.toDeptCode === code && t.status !== 'Draft');
    const s = summarise(received);
    return {
      code,
      raised: tickets.filter((t) => t.fromDeptCode === code && t.status !== 'Draft').length,
      received: received.length,
      resolved: received.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length,
      overdue: s.overdue,
      avgResolutionHours: s.avgResolutionHours,
      slaCompliancePct: s.slaCompliancePct,
    };
  }).filter((r) => r.raised > 0 || r.received > 0);
}

export interface CategoryRow {
  label: string;
  volume: number;
  backlog: number;
  overdue: number;
  avgResolutionHours: number | null;
}

/** Category analytics (§9) — most frequent, slowest, highest backlog / SLA risk. */
export function byCategoryDetailed(tickets: readonly Ticket[]): CategoryRow[] {
  const groups = new Map<string, Ticket[]>();
  tickets.filter((t) => t.status !== 'Draft').forEach((t) => {
    groups.set(t.categoryLabel, [...(groups.get(t.categoryLabel) ?? []), t]);
  });
  return [...groups.entries()]
    .map(([label, ts]) => {
      const s = summarise(ts);
      return { label, volume: ts.length, backlog: s.backlog, overdue: s.overdue, avgResolutionHours: s.avgResolutionHours };
    })
    .sort((a, b) => b.volume - a.volume);
}

export interface AssigneeRow {
  name: string;
  assignedOpen: number;
  completed: number;
}

/**
 * Workload by assignee (§6/§8). Framed for WORKLOAD BALANCING, not surveillance —
 * counts only, no rankings or per-person timing. Scope is clamped by the caller
 * (own-department assignees; cross-department is sysadmin-only per phase-0 §10.1).
 */
export function byAssignee(tickets: readonly Ticket[]): AssigneeRow[] {
  const groups = new Map<string, { open: number; done: number }>();
  tickets.forEach((t) => {
    if (!t.assignedToName) return;
    const g = groups.get(t.assignedToName) ?? { open: 0, done: 0 };
    if (OPEN_STATUSES.includes(t.status)) g.open += 1;
    if (t.status === 'Resolved' || t.status === 'Closed') g.done += 1;
    groups.set(t.assignedToName, g);
  });
  return [...groups.entries()].map(([name, g]) => ({ name, assignedOpen: g.open, completed: g.done }));
}

/** Daily volume trend (§7) — created vs resolved over the last N days. */
export function dailyTrend(tickets: readonly Ticket[], days = 14): { day: string; created: number; resolved: number }[] {
  const out: { day: string; created: number; resolved: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const inDay = (iso?: string | null) => !!iso && new Date(iso) >= d && new Date(iso) < next;
    out.push({
      day: d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      created: tickets.filter((t) => inDay(t.createdAt)).length,
      resolved: tickets.filter((t) => inDay(t.sla.resolvedAt)).length,
    });
  }
  return out;
}
