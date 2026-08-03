import { describe, it, expect } from 'vitest';
import type { AppNotification, WorkflowEventType } from '@services/notificationService';
import { NOTIFICATION_TEMPLATES, notificationTemplate, NOTIFICATION_CATEGORIES, NOTIFICATION_GAPS } from '@config/notifications.config';
import {
  filterNotifications,
  groupNotifications,
  deduplicate,
  deduplicationKey,
  categoryOf,
  priorityOf,
  activeNotificationFilterCount,
  EMPTY_NOTIFICATION_FILTERS,
} from './notificationView';

let seq = 0;
const note = (over: Partial<AppNotification> = {}): AppNotification => {
  seq += 1;
  return {
    id: `n${seq}`,
    recipientId: 'u-me',
    ticketId: 't1',
    ticketCode: 'FIN-0001',
    type: 'TicketAssigned' as WorkflowEventType,
    message: 'FIN-0001 was assigned',
    at: new Date(2026, 6, 21, 10, 0, 0).toISOString(),
    read: false,
    ...over,
  };
};

/**
 * The compiler-exhaustive anchor over the event union. Omit a member and this fails to build, so
 * a new event cannot be added without deciding its template.
 */
const ALL_EVENTS: Record<WorkflowEventType, true> = {
  TicketSubmitted: true,
  TicketAssigned: true,
  InformationRequested: true,
  InformationProvided: true,
  TicketResolved: true,
  TicketRejected: true,
  TicketClosed: true,
  TicketReopened: true,
  TicketCancelled: true,
  PriorityChanged: true,
  CommentAdded: true,
  AutoCloseWarning: true,
  LeaveAwaitingApproval: true,
  LeaveApproved: true,
  LeaveRejected: true,
  LeaveCancelled: true,
};

describe('template catalogue', () => {
  it('has a template for every event the workflow can publish', () => {
    for (const event of Object.keys(ALL_EVENTS) as WorkflowEventType[]) {
      expect(notificationTemplate(event), `${event} has no template`).toBeDefined();
    }
    expect(NOTIFICATION_TEMPLATES).toHaveLength(Object.keys(ALL_EVENTS).length);
  });

  it('gives every template a category, an action and a documented recipient rule', () => {
    for (const t of NOTIFICATION_TEMPLATES) {
      expect(NOTIFICATION_CATEGORIES[t.category], t.event).toBeDefined();
      expect(t.actionLabel.length, t.event).toBeGreaterThan(3);
      expect(t.recipients.length, t.event).toBeGreaterThan(15);
    }
  });

  it('NEVER puts ticket content in a message — only the reference and the actor', () => {
    /**
     * B08 §Security: "Notification previews should reveal only the minimum necessary
     * information." A notification reaches a whole destination department; the ticket itself is
     * scope-clamped and permission-checked when opened. Putting the subject, the comment body,
     * the question or the rejection reason in the preview would route confidential text around
     * the control that protects it.
     */
    const secret = 'CONFIDENTIAL PAYROLL DETAIL';
    for (const t of NOTIFICATION_TEMPLATES) {
      const composed = t.compose({ code: 'FIN-0001', actorName: 'James Carrow' });
      expect(composed, t.event).not.toContain(secret);
      // The only interpolations available are code and actor — the signature makes anything else
      // impossible, and this asserts the message actually uses the reference.
      expect(composed, t.event).toContain('FIN-0001');
    }
  });

  it('reserves the high band for events that genuinely need someone to act', () => {
    // If everything is urgent, nothing is. A comment is not.
    expect(notificationTemplate('CommentAdded')!.priority).toBe('low');
    expect(notificationTemplate('TicketClosed')!.priority).toBe('low');
    expect(notificationTemplate('InformationRequested')!.priority).toBe('high');
    expect(notificationTemplate('TicketResolved')!.priority).toBe('high');
    // The last prompt before the system takes the decision away — ignoring it closes the ticket.
    expect(notificationTemplate('AutoCloseWarning')!.priority).toBe('high');
  });

  it('does not restate the closure window, which is server policy', () => {
    /**
     * `CLOSURE_POLICY` on the server decides when a ticket closes. Interpolating "in 2 days" here
     * would create a second statement of that window, free to disagree with the one that actually
     * schedules the close — and a notification confidently naming the wrong deadline is worse than
     * one that says "soon".
     */
    const composed = notificationTemplate('AutoCloseWarning')!.compose({ code: 'FIN-0001', actorName: 'System' });
    expect(composed).not.toMatch(/\d+\s*(day|hour)/i);
    expect(composed).toContain('FIN-0001');
  });

  it('records the notifications it does not send, rather than dropping them silently', () => {
    const asked = NOTIFICATION_GAPS.map((g) => g.asked.toLowerCase()).join(' ');
    expect(asked).toContain('sla');
    expect(asked).toContain('approval');
    expect(asked).toContain('critical');
    for (const g of NOTIFICATION_GAPS) expect(g.why.length, g.asked).toBeGreaterThan(40);
  });
});

describe('filtering and search', () => {
  const set = [
    note({ type: 'CommentAdded', message: 'Ana commented on FIN-0001', read: true }),
    note({ type: 'InformationRequested', message: 'FIN-0002 needs more information from you', ticketCode: 'FIN-0002' }),
    note({ type: 'TicketAssigned', message: 'FIN-0003 was assigned', ticketCode: 'FIN-0003' }),
  ];

  it('filters by unread, category and priority', () => {
    expect(filterNotifications(set, { ...EMPTY_NOTIFICATION_FILTERS, unreadOnly: true })).toHaveLength(2);
    expect(filterNotifications(set, { ...EMPTY_NOTIFICATION_FILTERS, category: 'Comment' })).toHaveLength(1);
    expect(filterNotifications(set, { ...EMPTY_NOTIFICATION_FILTERS, priority: 'high' })).toHaveLength(2);
  });

  it('searches the message and the ticket reference, case-insensitively', () => {
    expect(filterNotifications(set, { ...EMPTY_NOTIFICATION_FILTERS, q: 'fin-0002' })).toHaveLength(1);
    expect(filterNotifications(set, { ...EMPTY_NOTIFICATION_FILTERS, q: 'COMMENTED' })).toHaveLength(1);
  });

  it('counts active filters so the UI can offer to clear them', () => {
    expect(activeNotificationFilterCount(EMPTY_NOTIFICATION_FILTERS)).toBe(0);
    expect(activeNotificationFilterCount({ q: 'x', unreadOnly: true, category: 'Comment', priority: 'low' })).toBe(4);
  });

  it('reads category and priority from the template, never from stored fields', () => {
    // A notification stores neither, so the two can never drift from the catalogue.
    expect(categoryOf(note({ type: 'PriorityChanged' }))).toBe('Priority');
    expect(priorityOf(note({ type: 'CommentAdded' }))).toBe('low');
  });
});

describe('grouping', () => {
  const now = new Date(2026, 6, 21, 12, 0, 0);

  it('buckets by day and drops empty groups', () => {
    const today = note({ at: new Date(2026, 6, 21, 9).toISOString() });
    const yday = note({ at: new Date(2026, 6, 20, 9).toISOString() });
    const old = note({ at: new Date(2026, 6, 1, 9).toISOString() });
    expect(groupNotifications([old, today, yday], now).map((g) => g.key)).toEqual(['Today', 'Yesterday', 'Earlier']);
    expect(groupNotifications([today], now).map((g) => g.key)).toEqual(['Today']);
  });

  it('orders newest first within a group', () => {
    const early = note({ at: new Date(2026, 6, 21, 8).toISOString() });
    const late = note({ at: new Date(2026, 6, 21, 11).toISOString() });
    expect(groupNotifications([early, late], now)[0]!.items.map((n) => n.id)).toEqual([late.id, early.id]);
  });

  it('keeps every item individually present — groups are buckets, not summaries', () => {
    // B08: "Do not hide critical individual events inside overly broad groups."
    const items = Array.from({ length: 7 }, () => note());
    const total = groupNotifications(items, now).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(items.length);
  });
});

describe('deduplication', () => {
  it('drops an exact repeat of the same event for the same recipient at the same instant', () => {
    const a = note({ id: 'x1' });
    const b = note({ id: 'x2', at: a.at });
    expect(deduplicate([a, b])).toHaveLength(1);
  });

  it('KEEPS a legitimate repeat — a second request on the same ticket later', () => {
    /**
     * B08 is explicit that deduplication must not "suppress legitimate repeated reminders". Two
     * information requests on one ticket a day apart are two things the recipient must answer;
     * a key without the instant would swallow the second and the ticket would stall silently.
     */
    const first = note({ type: 'InformationRequested', at: new Date(2026, 6, 20, 9).toISOString() });
    const second = note({ type: 'InformationRequested', at: new Date(2026, 6, 21, 9).toISOString() });
    expect(deduplicate([first, second])).toHaveLength(2);
  });

  it('keys on event, ticket, recipient and instant together', () => {
    const base = note();
    // The id is deliberately NOT part of the key: two rows for one event have different ids.
    expect(deduplicationKey(base)).toBe(deduplicationKey({ ...base }));
    expect(deduplicationKey(base)).not.toBe(deduplicationKey({ ...base, recipientId: 'someone-else' }));
    expect(deduplicationKey(base)).not.toBe(deduplicationKey({ ...base, ticketId: 't2' }));
  });

  it('preserves order and keeps the first occurrence', () => {
    const a = note({ id: 'a' });
    const b = note({ id: 'b', ticketId: 't2' });
    const dup = note({ id: 'c', at: a.at });
    expect(deduplicate([a, b, dup]).map((n) => n.id)).toEqual(['a', 'b']);
  });
});
