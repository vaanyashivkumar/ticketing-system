import { Link } from 'react-router-dom';
import type { Ticket, SlaFlag } from '@domain/types/ticket.types';
import { isOpen } from '@domain/workflow/statusEngine';

/**
 * SLA position (B05 §SLA Dashboard Engine).
 *
 * A table, not a chart. The three flags are a ranked scale over one population, and the number
 * that matters is "how many are breaching" — a reader gets that from a figure faster than from a
 * wedge, and a table needs no accessible alternative because it already is one.
 *
 * TWO HONESTY POINTS, both stated on screen rather than in a comment:
 *
 * 1. **Paused is not a fourth bucket.** `SlaFlag` has three members. A paused ticket keeps the
 *    flag it held when the clock stopped, so it is ALREADY counted in one of the three; adding
 *    "Paused" as a peer would push the total past 100%. It is shown as a subset, and labelled as
 *    one.
 * 2. **The population is OPEN work only.** `deriveFlag` returns On Track once a ticket resolves,
 *    which is correct — Overdue is a live escalation flag, not a historical fact — but it means
 *    these three numbers do not sum to the ticket total, and anyone comparing them to it should
 *    know why.
 */

const ROWS: readonly { flag: SlaFlag; label: string; meaning: string; style: string }[] = [
  { flag: 'Overdue', label: 'Breached', meaning: 'Past target now', style: 'text-error-text' },
  { flag: 'DueSoon', label: 'Approaching', meaning: 'Little time left', style: 'text-warning-text' },
  { flag: 'OnTrack', label: 'On track', meaning: 'Comfortably inside target', style: 'text-success-text' },
];

export function SlaPanel({ tickets, viewAll }: { readonly tickets: readonly Ticket[]; readonly viewAll: string }) {
  const open = tickets.filter((t) => isOpen(t.status));
  const count = (flag: SlaFlag) => open.filter((t) => t.sla.flag === flag).length;
  // Equivalent to `status === 'AwaitingInformation'`, but read from the clock itself so the panel
  // reports what the SLA engine actually did rather than inferring it from the status.
  const paused = open.filter((t) => t.sla.pausedSince !== null).length;

  return (
    <>
      {/* `td`/`td-num` carry the cell type and the tabular figures; `px-0` because this table sits
          inside a region card that already supplies the horizontal padding, and a second inset
          would push the first column out of line with the region heading above it. */}
      <table className="w-full">
        <caption className="sr-only">Open tickets by SLA state</caption>
        <tbody>
          {ROWS.map((r) => {
            const n = count(r.flag);
            return (
              <tr key={r.flag} className="border-b border-border last:border-0">
                <td className="td px-0 py-2">
                  <span className={r.style}>{r.label}</span>
                  <span className="block text-caption text-text-muted">{r.meaning}</span>
                </td>
                <td className={`td-num px-0 py-2 text-h3 ${n > 0 ? r.style : 'text-text-muted'}`}>{n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-caption text-text-muted">
        Open tickets only — resolved work is not counted here.
        {paused > 0 && (
          <>
            {' '}
            <strong className="font-medium text-text-secondary">{paused}</strong> of these are paused awaiting a
            requester and keep the state they had when the clock stopped.
          </>
        )}
      </p>
      <Link to={viewAll} className="mt-2 inline-block text-body-sm text-primary-text hover:underline">
        See SLA detail in Reports
      </Link>
    </>
  );
}
