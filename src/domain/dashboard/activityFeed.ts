import type { Ticket, ActivityAction } from '@domain/types/ticket.types';
import { statusLabel } from '@domain/workflow/statusEngine';

/**
 * ACTIVITY FEED (B05 §Recent Activity Engine) — one shape, two sources.
 *
 * In prototype mode the feed is flattened out of `ticket.activity`; against the API it comes from
 * `GET /tickets/activity`. The API path exists because the flatten CANNOT work there: the ticket
 * list endpoint omits `activities` to keep its payload small, so the widget that reduced over it
 * rendered "No activity yet" permanently, whatever had actually happened.
 *
 * `describeActivity` is the reason this is a module and not a component. The SPA's `from`/`to`
 * fields are OVERLOADED — a status transition puts statuses in them, a re-assignment puts names,
 * a re-grade puts priorities — so rendering `from → to` generically prints "Medium → High" under
 * a heading that says "Status changed". The action code has to be consulted first, in one place.
 */

export interface FeedItem {
  readonly id: string;
  readonly ticketId: string;
  readonly ticketCode: string;
  readonly actorName: string;
  readonly action: ActivityAction;
  /** Status transition pair. */
  readonly from?: string;
  readonly to?: string;
  /** Non-status audited write pair — re-assignment and re-prioritisation. */
  readonly fromValue?: string;
  readonly toValue?: string;
  readonly note?: string;
  readonly at: string;
}

/** Prototype mode: flatten across the scope-clamped tickets the dashboard already holds. */
export function feedFromTickets(tickets: readonly Ticket[], limit = 10): FeedItem[] {
  return tickets
    .flatMap((t) =>
      t.activity.map<FeedItem>((a) => ({
        id: a.id,
        ticketId: t.id,
        ticketCode: t.code || 'Draft',
        actorName: a.actorName,
        action: a.action,
        ...(a.from ? { from: a.from } : {}),
        ...(a.to ? { to: a.to } : {}),
        ...(a.fromValue ? { fromValue: a.fromValue } : {}),
        ...(a.toValue ? { toValue: a.toValue } : {}),
        ...(a.note ? { note: a.note } : {}),
        at: a.at,
      })),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/**
 * A sentence for one entry.
 *
 * `ASSIGNED` covers both first assignment and re-assignment — there is no separate REASSIGNED
 * code, and inventing one in the renderer would be a second vocabulary. The presence of a
 * previous holder is what distinguishes them, which is exactly why B04 started recording it.
 */
export function describeActivity(item: FeedItem): string {
  switch (item.action) {
    case 'ASSIGNED':
      // A re-assignment is the one that carries NAMES. A Submitted->Assigned transition writes the
      // same action code with statuses in the other pair, and reading either pair for both is
      // exactly the bug this split fixed.
      if (item.toValue) {
        return item.fromValue ? `re-assigned it from ${item.fromValue} to ${item.toValue}` : `assigned it to ${item.toValue}`;
      }
      return 'assigned it';
    case 'PRIORITY_CHANGED':
      return `changed priority${item.fromValue && item.toValue ? ` from ${item.fromValue} to ${item.toValue}` : ''}`;
    case 'COMMENTED':
      return 'added a comment';
    case 'ATTACHMENT_ADDED':
      return 'added an attachment';
    case 'CREATED':
      return 'created it';
    case 'INFORMATION_REQUESTED':
      return 'asked the requester a question';
    case 'INFORMATION_PROVIDED':
      return 'answered the question';
    default: {
      // Every remaining code is a status transition, so `to` is a status and safe to name.
      const to = item.to as Parameters<typeof statusLabel>[0] | undefined;
      return to ? `moved it to ${statusLabel(to)}` : item.action.replaceAll('_', ' ').toLowerCase();
    }
  }
}
