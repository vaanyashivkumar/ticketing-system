import type { AppNotification } from '@services/notificationService';
import {
  notificationTemplate,
  type NotificationCategory,
  type NotificationPriority,
} from '@config/notifications.config';

/**
 * NOTIFICATION CENTRE view logic (B08 §Notification Grouping, §Search and Filters).
 *
 * PURE, and kept out of the page so the same functions serve the full centre and the header
 * popover. B08 warns against duplicating filtering logic; more importantly, the unread count must
 * come from one place — it was being recomputed independently in the header, the page and the
 * dashboard quick actions, which is how three views end up disagreeing about the same number.
 */

export interface NotificationFilters {
  readonly q: string;
  readonly unreadOnly: boolean;
  readonly category: NotificationCategory | '';
  readonly priority: NotificationPriority | '';
}

export const EMPTY_NOTIFICATION_FILTERS: NotificationFilters = {
  q: '',
  unreadOnly: false,
  category: '',
  priority: '',
};

/** Category and priority come from the template, so a notification never stores them twice. */
export const categoryOf = (n: AppNotification): NotificationCategory | null =>
  notificationTemplate(n.type)?.category ?? null;

export const priorityOf = (n: AppNotification): NotificationPriority =>
  notificationTemplate(n.type)?.priority ?? 'normal';

export function filterNotifications(
  notifications: readonly AppNotification[],
  f: NotificationFilters,
): readonly AppNotification[] {
  const q = f.q.trim().toLowerCase();
  return notifications.filter((n) => {
    if (f.unreadOnly && n.read) return false;
    if (f.category && categoryOf(n) !== f.category) return false;
    if (f.priority && priorityOf(n) !== f.priority) return false;
    if (!q) return true;
    // Searchable text is the message and the ticket reference — the only two things a
    // notification carries. It deliberately does not search ticket content, because it does not
    // hold any.
    return `${n.message} ${n.ticketCode}`.toLowerCase().includes(q);
  });
}

export const activeNotificationFilterCount = (f: NotificationFilters): number =>
  (f.q.trim() ? 1 : 0) + (f.unreadOnly ? 1 : 0) + (f.category ? 1 : 0) + (f.priority ? 1 : 0);

// ---- Grouping ---------------------------------------------------------------

export type GroupKey = 'Today' | 'Yesterday' | 'Earlier';

export interface NotificationGroup {
  readonly key: GroupKey;
  readonly items: readonly AppNotification[];
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * Group by recency, newest first within each group.
 *
 * B08: "Do not hide critical individual events inside overly broad groups." These groups are
 * time buckets, not summaries — every notification remains individually present and clickable.
 * Empty groups are dropped rather than rendered as headings with nothing under them.
 */
export function groupNotifications(
  notifications: readonly AppNotification[],
  now: Date = new Date(),
): readonly NotificationGroup[] {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;

  const buckets: Record<GroupKey, AppNotification[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const n of notifications) {
    const at = startOfDay(new Date(n.at));
    const key: GroupKey = at >= today ? 'Today' : at >= yesterday ? 'Yesterday' : 'Earlier';
    buckets[key].push(n);
  }

  const order: GroupKey[] = ['Today', 'Yesterday', 'Earlier'];
  return order
    .map((key) => ({ key, items: [...buckets[key]].sort((a, b) => b.at.localeCompare(a.at)) }))
    .filter((g) => g.items.length > 0);
}

// ---- Deduplication ----------------------------------------------------------

/**
 * A deterministic key for one (event, ticket, recipient, instant) (B08 §Deduplication Engine).
 *
 * The instant is included on purpose. B08 warns against suppressing "legitimate repeated
 * reminders when escalation rules explicitly require them" — two genuine information requests on
 * the same ticket a day apart are two events a recipient must see, and a key without the instant
 * would silently swallow the second. What it does prevent is the same event being published twice
 * from a retry or a double render, which produces an identical timestamp.
 */
export const deduplicationKey = (n: Pick<AppNotification, 'type' | 'ticketId' | 'recipientId' | 'at'>): string =>
  `${n.type}:${n.ticketId}:${n.recipientId}:${n.at}`;

/** Drop exact duplicates, keeping the first occurrence and the original order. */
export function deduplicate(notifications: readonly AppNotification[]): readonly AppNotification[] {
  const seen = new Set<string>();
  return notifications.filter((n) => {
    const key = deduplicationKey(n);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
