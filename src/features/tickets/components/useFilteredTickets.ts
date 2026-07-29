import { useMemo } from 'react';
import type { Ticket, TicketStatus } from '@domain/types/ticket.types';

export interface ListControls {
  q: string;
  status: TicketStatus | '';
  sort: 'priority' | 'newest' | 'oldest';
}

export const DEFAULT_CONTROLS: ListControls = { q: '', status: '', sort: 'priority' };

/**
 * Apply find/filter/sort to a ticket list (D03 §2/§3, defect UI-003).
 *
 * Pure, and applied AFTER the scope clamp — filtering never widens visibility, it only narrows an
 * already-authorised set. Kept out of the component file so that file exports components only
 * (react-refresh), rather than suppressing the rule.
 */
export function useFilteredTickets(tickets: readonly Ticket[], c: ListControls): Ticket[] {
  return useMemo(() => {
    const q = c.q.trim().toLowerCase();
    const rows = tickets.filter(
      (t) =>
        (!c.status || t.status === c.status) &&
        (!q ||
          t.code.toLowerCase().includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          t.categoryLabel.toLowerCase().includes(q)),
    );
    if (c.sort === 'newest') return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (c.sort === 'oldest') return [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows; // already priority-sorted by the store
  }, [tickets, c]);
}
