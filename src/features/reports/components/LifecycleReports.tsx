import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import type { Ticket } from '@domain/types/ticket.types';
import {
  hasActivityTrail,
  statusDwellTimes,
  ageingBuckets,
  escalationSummary,
  oldestOpen,
} from '@domain/reports/lifecycleMetrics';
import { StatusBadge, PriorityBadge } from '@features/tickets/components/TicketBadges';

/**
 * The reports computed from the ACTIVITY TRAIL rather than from a ticket's current state
 * (B07 §Status Reports, §Priority Reports, §Workload Reports).
 *
 * `NoHistory` is the part that matters. Against the API the ticket list omits activities, so these
 * three panels would render 0h dwell, 0 escalations and look like a healthy system. A zero that
 * means "we were not sent the history" and a zero that means "it never happens" are different
 * claims, and only one of them is defensible on a page people use to make staffing decisions.
 */

const hrs = (n: number | null) => (n === null ? '—' : `${n} h`);

export function StatusDwellReport({ tickets }: { readonly tickets: readonly Ticket[] }) {
  if (!hasActivityTrail(tickets)) return <NoHistory what="Dwell time" />;
  const rows = statusDwellTimes(tickets).filter((r) => r.samples > 0 || r.currentlyHere > 0);

  return (
    <div className="table-shell overflow-x-auto" role="region" aria-label="Status dwell time" tabIndex={0}>
      <table className="w-full text-table">
        <caption className="px-4 py-2 text-left text-caption text-text-muted">
          Average business hours spent in each status, across visits that have <strong>completed</strong>. Time in a
          ticket’s current status is excluded, so running this report twice without anything happening gives the
          same answer.
        </caption>
        <thead>
          <tr className="border-b border-border">
            <th className="th">Status</th>
            <th className="th text-right">Average dwell</th>
            <th className="th text-right">Completed visits</th>
            <th className="th text-right">Here now</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.status} className="row-hover border-b border-border last:border-0">
              <td className="td"><StatusBadge status={r.status} /></td>
              <td className="td-num">{hrs(r.averageHours)}</td>
              {/* A mean of one visit is not a trend. The sample count is shown so a reader can see
                  which rows are worth acting on. */}
              <td className="td-num">{r.samples}</td>
              <td className="td-num">{r.currentlyHere}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EscalationReport({ tickets }: { readonly tickets: readonly Ticket[] }) {
  if (!hasActivityTrail(tickets)) return <NoHistory what="Escalation frequency" />;
  const s = escalationSummary(tickets);

  return (
    <div className="card-p">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Escalated" value={s.escalations} hint="Re-graded to a higher priority" />
        <Figure label="De-escalated" value={s.deEscalations} hint="Re-graded lower" />
        <Figure label="Tickets affected" value={s.ticketsAffected} hint="Re-graded at least once" />
        <Figure
          label="Rate"
          value={tickets.length ? `${Math.round((s.ticketsAffected / tickets.length) * 100)}%` : '—'}
          hint="Share of tickets re-graded"
        />
      </dl>
      {s.escalations > 0 && (
        <>
          <p className="mt-4 mb-1 text-label uppercase text-text-muted">Escalated into</p>
          <ul className="flex flex-wrap gap-2">
            {s.byPriority.filter((p) => p.escalatedTo > 0).map((p) => (
              <li key={p.priority} className="flex items-center gap-1.5">
                <PriorityBadge priority={p.priority} />
                <span className="text-body-sm text-text-secondary">{p.escalatedTo}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-caption text-text-muted">
        A rising escalation rate means work is arriving mis-graded — the fix is upstream in triage, not in the
        queue. Counted per re-grade, so one ticket re-graded twice appears twice.
      </p>
    </div>
  );
}

export function BacklogReport({ tickets }: { readonly tickets: readonly Ticket[] }) {
  const buckets = ageingBuckets(tickets);
  const oldest = oldestOpen(tickets, 10);
  const total = buckets.reduce((n, b) => n + b.count, 0);

  return (
    <>
      <div className="card-p mb-4">
        <p className="mb-2 text-label uppercase text-text-muted">Age of open work</p>
        {total === 0 ? (
          <p className="py-2 text-body-sm text-text-muted">No open tickets in scope.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {buckets.map((b, i) => (
              <Figure
                key={b.label}
                label={b.label}
                value={b.count}
                hint={`${Math.round((b.count / total) * 100)}% of open work`}
                // The oldest bucket is the one that needs a word rather than only a colour.
                tone={i === 3 && b.count > 0 ? 'critical' : undefined}
              />
            ))}
          </dl>
        )}
        <p className="mt-3 text-caption text-text-muted">
          Business hours since the SLA clock was anchored, using the ratified bands (0–8 / 8–24 / 24–40 / 40+).
          Open tickets only — including finished work would measure history rather than backlog.
        </p>
      </div>

      <div className="table-shell overflow-x-auto" role="region" aria-label="Oldest open tickets" tabIndex={0}>
        <table className="w-full text-table">
          <caption className="px-4 py-2 text-left text-caption text-text-muted">
            The oldest open work, as a list rather than an average — an average age tells nobody what to pick up.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th className="th">Ticket</th>
              <th className="th">Status</th>
              <th className="th">Priority</th>
              <th className="th">Assignee</th>
              <th className="th text-right">Age</th>
            </tr>
          </thead>
          <tbody>
            {oldest.map((t) => (
              <tr key={t.id} className="row-hover border-b border-border last:border-0">
                <td className="td">
                  <Link to={`/app/tickets/${t.id}`} className="font-mono text-body-sm text-primary-text hover:underline">
                    {t.code || 'Draft'}
                  </Link>
                  <span className="block max-w-xs truncate text-caption text-text-secondary">{t.subject}</span>
                </td>
                <td className="td"><StatusBadge status={t.status} /></td>
                <td className="td"><PriorityBadge priority={t.priority} /></td>
                <td className="td text-text-secondary">
                  {t.assignedToName ?? <span className="text-warning-text">Unassigned</span>}
                </td>
                {/* Age is the column this table is sorted by and read down — right-aligned so the
                    hour figures stack, not ragged against a variable-width name column. */}
                <td className="td-num">{t.ageHours} h</td>
              </tr>
            ))}
          </tbody>
        </table>
        {oldest.length === 0 && <p className="px-4 py-6 text-center text-body-sm text-text-muted">No open tickets in scope.</p>}
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone?: 'critical';
}) {
  return (
    <div>
      <dt className="text-label text-text-muted">{label}</dt>
      {/* Explicitly tabular: these figures sit in a grid and are compared against each other. */}
      <dd className={`text-h2 tabular-nums ${tone === 'critical' ? 'text-error-text' : 'text-text'}`}>{value}</dd>
      <dd className="text-caption text-text-muted">{hint}</dd>
    </div>
  );
}

/**
 * The honest empty state for the activity-derived reports.
 *
 * Not "0 hours". The ticket list endpoint omits the activity trail to keep its payload small, so
 * against the API these metrics have nothing to compute over — and a zero here would read as a
 * fast, healthy pipeline.
 */
function NoHistory({ what }: { what: string }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-lg border border-warning bg-warning-bg px-3 py-3 text-body-sm text-warning-text">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <strong>{what} is not available here.</strong> It is reconstructed from each ticket’s history, and the
        ticket list this page is built from does not carry it. This is not a report of zero — it is no report at
        all. Open an individual ticket to see its own timeline.
      </span>
    </div>
  );
}
