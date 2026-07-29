import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMediaQuery, MD_BREAKPOINT } from '@hooks/useMediaQuery';
import type { Ticket } from '@domain/types/ticket.types';
import { DEPARTMENTS } from '@config/departments.config';
import { StatusBadge, PriorityBadge, SlaBadge } from './TicketBadges';

/**
 * Rows per page. 25 keeps the DOM small enough that neither presentation has a performance
 * problem, while still showing a working queue at a glance. Reports already uses the same
 * number for its drill-down cap (`TICKET_ROW_CAP`).
 */
const PAGE_SIZE = 25;

/**
 * The ticket list — a TABLE on desktop, a CARD LIST on mobile (D03 §7 UI-001).
 *
 * Every table in this app was a raw `<table>` in `overflow-x-auto`, which is precisely what D03 §7
 * forbids: "never simply shrink layouts — adapt interactions". At 375px the seven columns needed
 * ~970px, so the user horizontally scrolled a nested container, and because Priority/Status/SLA
 * are the LAST three columns, the three that carry the decision were the first off-screen.
 *
 * It survived P17 because QA-001's re-verification only checked the shell (rail hidden, drawer
 * opens, Escape closes) — never the content inside it.
 *
 * D07 PERF-1/PERF-2 — measured, not guessed. At 2,013 tickets this component produced **52,504
 * DOM nodes**: it rendered the card list AND the table (4,026 rows to display 2,013, one set at
 * `display: none`), and it rendered every ticket with no upper bound. Both are fixed here — the
 * presentation is chosen in JS so only one is built, and the list is paginated. D07 §4 asks for
 * "the simplest scalable solution": pagination, not virtualisation, because a page of 25 has no
 * performance problem to solve and virtualisation would cost keyboard and screen-reader access
 * that D06 has already paid for.
 *
 * Two more defects die here (D03 UI-002): the old table made only the small ticket-code cell
 * clickable — a ~40x20px tap target, under the 44px guidance — while the dashboard's private
 * `WorkList` already had the whole row as a link. The app had solved this once, in the one place
 * it could not be reused. Now the entire row is the link in both presentations.
 */
export function TicketList({
  tickets,
  direction,
  emptyLabel = 'No tickets.',
  from,
}: {
  tickets: readonly Ticket[];
  /** 'to' = an inbound queue (show who it came FROM); 'from' = my requests (show who it went TO). */
  direction: 'to' | 'from';
  emptyLabel?: string;
  /** The list's own route, so Ticket Details can offer a Back link that goes back. */
  from?: string;
}) {
  const isDesktop = useMediaQuery(MD_BREAKPOINT);
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(tickets.length / PAGE_SIZE));

  // A filter change can leave the user on a page that no longer exists. Clamp rather than show
  // an empty list under a "page 7 of 3" label.
  useEffect(() => { if (page > pageCount - 1) setPage(0); }, [page, pageCount]);

  const visible = useMemo(
    () => tickets.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [tickets, page],
  );

  if (tickets.length === 0) {
    return <p className="card px-4 py-6 text-center text-body-sm text-text-muted">{emptyLabel}</p>;
  }
  const otherOf = (t: Ticket) => DEPARTMENTS[direction === 'to' ? t.fromDeptCode : t.toDeptCode].name;

  return (
    <>
      {/* Mobile: cards. The decision-carrying badges stay visible without horizontal scrolling. */}
      {!isDesktop && (
      <ul className="space-y-2">
        {visible.map((t) => (
          <li key={t.id}>
            {/* `card`, deliberately NOT `card-interactive`: this is a paginated queue of 25 rows,
                and a per-row lift turns scanning a list into a field of moving surfaces. The hover
                tint is the affordance; the row is already a full-width target. */}
            <Link
              to={`/app/tickets/${t.id}`}
              state={from ? { from } : undefined}
              className="card block p-3 hover:bg-row-hover"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-mono text-body-sm text-primary-text">{t.code || 'Draft'}</span>
                <span className="flex items-center gap-1">
                  <StatusBadge status={t.status} />
                  {t.status !== 'Draft' && <SlaBadge flag={t.sla.flag} />}
                </span>
              </span>
              <span className="mt-1 block truncate text-body text-text">{t.subject}</span>
              <span className="mt-1 flex items-center gap-2 text-caption text-text-muted">
                <PriorityBadge priority={t.priority} />
                <span className="truncate">
                  {otherOf(t)} · {t.categoryLabel}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      )}

      {/* Desktop: the full table.
          `overflow-x-auto` overrides only the x axis of `table-shell`'s `overflow-hidden`; y stays
          clipped, so the shell keeps its corner radius while wide tables still scroll. */}
      {isDesktop && (
      /**
       * `role="region"` + label + `tabIndex={0}`, matching the eight other scrollable tables in
       * the app (audit log, permissions, roles, lifecycle reports). A container that scrolls
       * horizontally must be focusable, or a keyboard user cannot reach the columns past the
       * viewport edge at all — WCAG 2.1.1. This, the product's most-read table, was the one
       * without it.
       */
      <div
        role="region"
        aria-label="Tickets"
        tabIndex={0}
        className="table-shell overflow-x-auto"
      >
        <table className="w-full text-table">
          <thead>
            {/**
             * `.th` carries the column-header treatment. The colour is pinned back to
             * `text-secondary` — which is what this header already used — because the class
             * default (`text-muted`) measures 4.34:1 on `surface-sunken` in the light theme,
             * below AA. Same override, same reason, as the admin tables (A11Y-008).
             */}
            <tr className="border-b border-border">
              <th className="th text-text-secondary">Code</th>
              <th className="th text-text-secondary">Subject</th>
              <th className="th text-text-secondary">{direction === 'to' ? 'From' : 'To'}</th>
              <th className="th text-text-secondary">Category</th>
              <th className="th text-text-secondary">Priority</th>
              <th className="th text-text-secondary">Status</th>
              <th className="th text-text-secondary">SLA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className="row-hover border-b border-border last:border-0">
                {/* The row is one link: a single tab stop and a full-width target, rather than a
                    20px code to hit. One <td> holds the anchor; the rest are plain cells. */}
                {/* The code is a figure read DOWN the column, but it leads the row, so it stays
                    left-aligned rather than taking `td-num`: the mono face already gives it fixed
                    advance widths, which is the alignment that matters here. */}
                <td className="td">
                  <Link to={`/app/tickets/${t.id}`} state={from ? { from } : undefined} className="font-mono text-body-sm text-primary-text hover:underline">
                    {t.code || '—'}
                    <span className="sr-only">: {t.subject}</span>
                  </Link>
                </td>
                <td className="td max-w-[220px] truncate">{t.subject}</td>
                <td className="td text-text-secondary">{otherOf(t)}</td>
                <td className="td text-text-secondary">{t.categoryLabel}</td>
                <td className="td"><PriorityBadge priority={t.priority} /></td>
                <td className="td"><StatusBadge status={t.status} /></td>
                <td className="td">
                  {t.status === 'Draft' ? <span className="text-caption text-text-muted">—</span> : <SlaBadge flag={t.sla.flag} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {pageCount > 1 && (
        <nav
          aria-label="Ticket list pages"
          className="mt-3 flex items-center justify-between gap-2"
        >
          {/**
           * `aria-live="polite"` on the count, so a screen-reader user hears the page change.
           * Without it the button press is silent and the list appears to do nothing — the same
           * class of defect as D06 #24, where every success was announced to sighted users only.
           */}
          <p className="text-body-sm text-text-secondary" aria-live="polite">
            Showing <strong className="text-text">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tickets.length)}</strong>
            {' '}of <strong className="text-text">{tickets.length}</strong>
          </p>
          <span className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-neutral"
            >
              <ChevronLeft size={15} aria-hidden /> Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="btn-neutral"
            >
              Next <ChevronRight size={15} aria-hidden />
            </button>
          </span>
        </nav>
      )}
    </>
  );
}
