import type { Ticket, TicketStatus, Priority } from '@domain/types/ticket.types';
import { businessHoursBetween } from '@domain/sla/slaEngine';
import { isOpen, statusLabel, ORDERED_STATUSES } from '@domain/workflow/statusEngine';
import { priorityDef, ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';

/**
 * LIFECYCLE METRICS (B07) — the aggregations that need the ACTIVITY TRAIL rather than the
 * ticket's current state.
 *
 * They live apart from `reportMetrics.ts` for one reason worth stating: everything there is
 * computable from a ticket row, and everything here is not. The activity trail is omitted from the
 * ticket LIST endpoint, so in API mode these functions receive tickets whose `activity` is empty —
 * and would return a confident zero. `hasActivityTrail` exists so a caller can tell "nothing
 * happened" apart from "we were not sent the history", which is the same distinction the dashboard
 * feed got wrong before B05.
 *
 * Durations are BUSINESS hours throughout, so they are directly comparable with the SLA targets.
 * A wall-clock average that counts nights and weekends is not comparable with anything the
 * business agreed to.
 */

/**
 * Can these metrics be computed over this set at all?
 *
 * False when no ticket carries any activity — which in API mode means the payload omitted it, not
 * that nothing ever happened. Callers render "not available here" instead of a zero.
 */
export const hasActivityTrail = (tickets: readonly Ticket[]): boolean =>
  tickets.some((t) => t.activity.length > 0);

// ---- Status dwell time ------------------------------------------------------

export interface StatusDwell {
  readonly status: TicketStatus;
  readonly label: string;
  /** Mean business hours spent in this status across COMPLETED visits. Null when never left. */
  readonly averageHours: number | null;
  /** How many completed visits produced the average. A mean of one is not a trend. */
  readonly samples: number;
  /** Tickets sitting in this status right now. */
  readonly currentlyHere: number;
}

/**
 * How long tickets actually sit in each status.
 *
 * Reconstructed from the transition entries: each carries `from` and `to` statuses plus a
 * timestamp, so consecutive entries bound one visit. Non-transition entries — comments,
 * attachments, re-assignment, re-prioritisation — are skipped, which is exactly why `from`/`to`
 * and `fromValue`/`toValue` were split into separate fields: reading either pair for both would
 * make a priority change look like a status change and corrupt every duration here.
 *
 * ONLY COMPLETED VISITS are averaged. The time a ticket has spent in its CURRENT status is
 * deliberately excluded: it grows while you look at it, so including it would make the same report
 * return a different answer each time it was run, with no event having occurred.
 */
export function statusDwellTimes(tickets: readonly Ticket[]): readonly StatusDwell[] {
  const totals = new Map<TicketStatus, { hours: number; samples: number }>();
  const current = new Map<TicketStatus, number>();

  for (const t of tickets) {
    current.set(t.status, (current.get(t.status) ?? 0) + 1);

    // Transitions only, oldest first. `from` and `to` are statuses by construction.
    const moves = t.activity
      .filter((a) => a.from && a.to)
      .sort((a, b) => a.at.localeCompare(b.at));

    // The first transition tells us the status the ticket occupied before it, and when it was
    // entered — creation.
    let enteredAt = t.createdAt;
    for (const move of moves) {
      const status = move.from as TicketStatus;
      const hours = businessHoursBetween(new Date(enteredAt), new Date(move.at));
      const acc = totals.get(status) ?? { hours: 0, samples: 0 };
      totals.set(status, { hours: acc.hours + hours, samples: acc.samples + 1 });
      enteredAt = move.at;
    }
  }

  return ORDERED_STATUSES.map((status) => {
    const acc = totals.get(status);
    return {
      status,
      label: statusLabel(status),
      averageHours: acc && acc.samples > 0 ? Math.round((acc.hours / acc.samples) * 10) / 10 : null,
      samples: acc?.samples ?? 0,
      currentlyHere: current.get(status) ?? 0,
    };
  });
}

// ---- Ageing buckets (R10) ---------------------------------------------------

/**
 * Ratified bucket edges (PRD §10.4: "0-8 / 8-24 / 24-40 / 40h+ business hours"). Not invented
 * here, and not tuned — they are the same buckets the Finance dashboard row specifies.
 */
const AGE_EDGES = [8, 24, 40] as const;

export interface AgeBucket {
  readonly label: string;
  readonly count: number;
}

/**
 * How long OPEN work has been alive, in business hours since the SLA clock was anchored.
 *
 * Open tickets only: an ageing chart including resolved work measures history, not backlog, and
 * the question this answers is "what is going stale right now".
 */
export function ageingBuckets(tickets: readonly Ticket[], now: Date = new Date()): readonly AgeBucket[] {
  const counts = [0, 0, 0, 0];
  for (const t of tickets) {
    if (!isOpen(t.status) || !t.sla.startedAt) continue;
    const hours = businessHoursBetween(new Date(t.sla.startedAt), now);
    const idx = hours < AGE_EDGES[0] ? 0 : hours < AGE_EDGES[1] ? 1 : hours < AGE_EDGES[2] ? 2 : 3;
    counts[idx] += 1;
  }
  return [
    { label: 'Under 8h', count: counts[0]! },
    { label: '8–24h', count: counts[1]! },
    { label: '24–40h', count: counts[2]! },
    { label: 'Over 40h', count: counts[3]! },
  ];
}

// ---- Escalation ------------------------------------------------------------

export interface EscalationSummary {
  /** Priority raised — the ticket was re-graded as more urgent. */
  readonly escalations: number;
  /** Priority lowered. Counted separately: it is not an escalation and must not inflate one. */
  readonly deEscalations: number;
  /** Distinct tickets that were re-graded at least once. */
  readonly ticketsAffected: number;
  readonly byPriority: readonly { readonly priority: Priority; readonly escalatedTo: number }[];
}

/**
 * How often work is re-graded after submission.
 *
 * Only computable since re-prioritisation started being recorded — BR-060 was specified from the
 * first requirements document and implemented by nothing until B04, so before that this report
 * would have returned zero and the zero would have been indistinguishable from "it never happens".
 *
 * Direction comes from `fromValue`/`toValue` compared through the priority engine's rank, not from
 * the note text. A rising escalation count is the signal the report exists for: it means work is
 * arriving mis-graded, and the fix is upstream in triage rather than in the queue.
 */
export function escalationSummary(tickets: readonly Ticket[]): EscalationSummary {
  let escalations = 0;
  let deEscalations = 0;
  const affected = new Set<string>();
  const escalatedTo = new Map<Priority, number>();

  for (const t of tickets) {
    for (const a of t.activity) {
      if (a.action !== 'PRIORITY_CHANGED' || !a.fromValue || !a.toValue) continue;
      const from = a.fromValue as Priority;
      const to = a.toValue as Priority;
      // Guard against a value that is not a priority — the field is a plain string on the wire.
      if (!ORDERED_PRIORITIES.includes(from) || !ORDERED_PRIORITIES.includes(to)) continue;
      affected.add(t.id);
      if (priorityDef(to).rank < priorityDef(from).rank) {
        escalations += 1;
        escalatedTo.set(to, (escalatedTo.get(to) ?? 0) + 1);
      } else {
        deEscalations += 1;
      }
    }
  }

  return {
    escalations,
    deEscalations,
    ticketsAffected: affected.size,
    byPriority: ORDERED_PRIORITIES.map((priority) => ({ priority, escalatedTo: escalatedTo.get(priority) ?? 0 })),
  };
}

// ---- Backlog ---------------------------------------------------------------

export interface OldestOpen {
  readonly id: string;
  readonly code: string;
  readonly subject: string;
  readonly status: TicketStatus;
  readonly priority: Priority;
  readonly assignedToName: string | null;
  readonly ageHours: number;
}

/**
 * The oldest open work, by business hours since the clock was anchored.
 *
 * A list rather than a number, because the answer to "what is going stale" is a set of tickets
 * somebody has to pick up — an average age tells nobody what to do next.
 */
export function oldestOpen(tickets: readonly Ticket[], limit = 10, now: Date = new Date()): readonly OldestOpen[] {
  return tickets
    .filter((t) => isOpen(t.status) && t.sla.startedAt)
    .map((t) => ({
      id: t.id,
      code: t.code,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      assignedToName: t.assignedToName,
      ageHours: Math.round(businessHoursBetween(new Date(t.sla.startedAt!), now) * 10) / 10,
    }))
    .sort((a, b) => b.ageHours - a.ageHours)
    .slice(0, limit);
}
