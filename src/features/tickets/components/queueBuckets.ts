import type { Ticket } from '@domain/types/ticket.types';
import { QUEUE_DEFINITIONS, queueOf, type QueueBucket } from '@domain/workflow/statusEngine';

/**
 * Queue bucketing (B04 §Queue Engine) — the pure half, kept out of `QueueTabs.tsx` because that
 * file must export components only (the fast-refresh rule the lint gate enforces at zero
 * warnings).
 *
 * Buckets are DERIVED from status, never stored. A ticket is in exactly one queue because it has
 * exactly one status, so "update the queues after a transition" is not a step that can be
 * forgotten or done wrongly — it has already happened by the time the status changed. That is why
 * there is no queue-maintenance code anywhere in this codebase, and why there should not be.
 */
export type QueueSelection = QueueBucket | 'all';

export function bucketCounts(tickets: readonly Ticket[]): Record<QueueSelection, number> {
  const counts = Object.fromEntries(QUEUE_DEFINITIONS.map((q) => [q.id, 0])) as Record<QueueSelection, number>;
  counts.all = tickets.length;
  for (const t of tickets) {
    const bucket = queueOf(t.status);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}

export function inBucket(tickets: readonly Ticket[], selection: QueueSelection): readonly Ticket[] {
  if (selection === 'all') return tickets;
  return tickets.filter((t) => queueOf(t.status) === selection);
}
