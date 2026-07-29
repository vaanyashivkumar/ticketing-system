import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { Ticket } from '@domain/types/ticket.types';
import { StatusBadge, PriorityBadge, SlaBadge } from '@features/tickets/components/TicketBadges';
import { DEPARTMENTS } from '@config/departments.config';

/**
 * A queue widget's rows (B05 §Queue Widget Engine).
 *
 * Reuses the ticket badges rather than restating status, priority and SLA presentation — B05:
 * "Do not duplicate ticket list logic." The badges are the same components the list and the detail
 * page render, so a status cannot look like one thing here and another there.
 *
 * The list is ALREADY SORTED by its work selector before it arrives. That ordering is the point:
 * the widget this replaces truncated to six rows without sorting at all, so with twenty qualifying
 * tickets the user saw an arbitrary six in store-insertion order and an Overdue Urgent ticket at
 * index seven was invisible on the screen whose whole job is to surface it.
 */
export function WorkQueueList({
  tickets,
  previewRows,
  showSource = false,
}: {
  readonly tickets: readonly Ticket[];
  readonly previewRows: number;
  /** Show the source department — the hub needs to know who sent it (PRD §10.4). */
  readonly showSource?: boolean;
}) {
  const rows = tickets.slice(0, previewRows);
  const hidden = tickets.length - rows.length;

  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((t) => (
          <li key={t.id}>
            <Link
              to={`/app/tickets/${t.id}`}
              state={{ from: '/app/dashboard' }}
              className="row-hover flex flex-wrap items-center gap-2 py-2"
            >
              <span className="w-16 shrink-0 font-mono text-body-sm text-primary-text">{t.code || 'Draft'}</span>
              <span className="min-w-0 flex-1 truncate text-body-sm text-text">{t.subject}</span>
              {showSource && (
                <span className="shrink-0 text-caption text-text-secondary">{DEPARTMENTS[t.fromDeptCode].name}</span>
              )}
              <PriorityBadge priority={t.priority} />
              <StatusBadge status={t.status} />
              {t.status !== 'Draft' && <SlaBadge flag={t.sla.flag} />}
              <ArrowRight size={14} className="shrink-0 text-text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        // The truncation is stated, never silent. A count of 23 beside six rows and no explanation
        // reads as a bug; saying "17 more" and offering the route makes it a preview.
        <p className="pt-2 text-caption text-text-muted">
          {hidden} more not shown here.
        </p>
      )}
    </>
  );
}
