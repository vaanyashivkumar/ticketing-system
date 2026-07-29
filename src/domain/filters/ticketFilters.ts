import type { Ticket, TicketStatus, Priority, SlaFlag } from '@domain/types/ticket.types';
import type { DepartmentCode } from '@domain/types/auth.types';

/**
 * THE ticket filter model. Pure — applied client-side, no reload.
 *
 * Moved out of `domain/reports/` and renamed from `ReportFilters` when the dashboard needed the
 * same filtering (B05 §Filter Engine: "Use shared filtering logic... Avoid duplicating filtering
 * implementations inside each widget"). It was never report-specific — every field is a property
 * of a ticket — and leaving it named for its first consumer would have made the reuse read like a
 * borrowing, which is how a second copy eventually gets written instead.
 *
 * ONE INVARIANT: filtering runs AFTER the scope clamp and only ever narrows. Selecting a
 * department you cannot see returns nothing; it never widens what you may see.
 */
export interface TicketFilters {
  department: DepartmentCode | '';
  category: string;
  priority: Priority | '';
  status: TicketStatus | '';
  assignee: string;
  sla: SlaFlag | '';
  from: string;
  to: string;
}

export const EMPTY_FILTERS: TicketFilters = {
  department: '', category: '', priority: '', status: '', assignee: '', sla: '', from: '', to: '',
};

export function applyFilters(tickets: readonly Ticket[], f: TicketFilters): Ticket[] {
  return tickets.filter((t) => {
    if (f.department && t.fromDeptCode !== f.department && t.toDeptCode !== f.department) return false;
    if (f.category && t.categoryLabel !== f.category) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.assignee && t.assignedToName !== f.assignee) return false;
    if (f.sla && t.sla.flag !== f.sla) return false;
    if (f.from && new Date(t.createdAt) < new Date(f.from)) return false;
    if (f.to) {
      const end = new Date(f.to);
      end.setHours(23, 59, 59, 999);
      if (new Date(t.createdAt) > end) return false;
    }
    return true;
  });
}

/** Human-readable summary of the active filters — carried into exports (§12). */
export function describeFilters(f: TicketFilters): string {
  const parts: string[] = [];
  if (f.department) parts.push(`Department=${f.department}`);
  if (f.category) parts.push(`Category=${f.category}`);
  if (f.priority) parts.push(`Priority=${f.priority}`);
  if (f.status) parts.push(`Status=${f.status}`);
  if (f.assignee) parts.push(`Assignee=${f.assignee}`);
  if (f.sla) parts.push(`SLA=${f.sla}`);
  if (f.from) parts.push(`From=${f.from}`);
  if (f.to) parts.push(`To=${f.to}`);
  return parts.length ? parts.join('; ') : 'None';
}

export const activeFilterCount = (f: TicketFilters): number => Object.values(f).filter(Boolean).length;
