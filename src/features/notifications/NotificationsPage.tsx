import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Search, FilterX, AlertTriangle, RotateCw } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useNotificationStore } from '@stores/notificationStore';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LiveRegion } from '@components/common/LiveRegion';
import {
  NOTIFICATION_CATEGORIES,
  PRIORITY_INFO,
  NOTIFICATION_GAPS,
  notificationTemplate,
  type NotificationCategory,
  type NotificationPriority,
} from '@config/notifications.config';
import {
  filterNotifications,
  groupNotifications,
  activeNotificationFilterCount,
  categoryOf,
  priorityOf,
  EMPTY_NOTIFICATION_FILTERS,
  type NotificationFilters,
} from '@domain/notifications/notificationView';
import { NOTIFICATION_ICON } from './notificationIcons';

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Notification centre (B08 §Notification Center).
 *
 * The defect it replaces was one line: with no loading or error state, a FAILED fetch rendered
 * "No notifications — updates on your tickets will appear here". A reassuring sentence, and the
 * exact opposite of the truth, on the screen whose entire job is to tell someone that something
 * needs them. That is worse than an error, because an error is a thing you act on.
 *
 * Everything else here is composition: category, priority, action label and message all come from
 * the template catalogue, so no notification text is written in this file.
 */
export function NotificationsPage() {
  const { user } = useAuth();
  const notifications = useNotificationStore((s) => s.notifications);
  const loading = useNotificationStore((s) => s.loading);
  const loadError = useNotificationStore((s) => s.loadError);
  const load = useNotificationStore((s) => s.load);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  // The single unread count, from the store — not a fourth independent filter over the array.
  const unread = useNotificationStore((s) => s.unreadCount)();

  const [f, setF] = useState<NotificationFilters>(EMPTY_NOTIFICATION_FILTERS);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    if (user) void load(user.id);
  }, [user, load]);

  const filtered = useMemo(() => filterNotifications(notifications, f), [notifications, f]);
  const groups = useMemo(() => groupNotifications(filtered), [filtered]);

  if (!user) return null;
  const set = <K extends keyof NotificationFilters>(k: K, v: NotificationFilters[K]) =>
    setF((p) => ({ ...p, [k]: v }));
  const activeFilters = activeNotificationFilterCount(f);

  // Left-anchored, not centered: every page shares one content left edge with the breadcrumbs
  // and header. max-w constrains line length only.
  return (
    <section aria-labelledby="ntf-title" className="max-w-3xl">
      <PageHeader
        icon={Bell}
        titleId="ntf-title"
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'All caught up'}
        action={
          unread > 0 ? (
            <button
              type="button"
              onClick={() => {
                void markAllRead(user.id);
                setAnnouncement(`${unread} notifications marked as read.`);
              }}
              className="btn-neutral"
            >
              <CheckCheck size={16} aria-hidden /> Mark all read
            </button>
          ) : undefined
        }
      />

      <LiveRegion message={announcement} />

      {loadError && (
        <div role="alert" className="mb-4 flex flex-col items-start gap-2 rounded-md border border-error bg-error-bg p-3 text-body-sm text-error-text">
          <span className="flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>Your notifications could not be loaded.</strong> {loadError} This is not an empty
              inbox — anything waiting for you is simply not shown.
            </span>
          </span>
          {/* `.btn` for the 40px target and press feedback, but NOT `.btn-neutral`: this control
              sits ON the error tint, and a neutral surface button floats on it as though it
              belonged to the page rather than to the error it resolves. The refactor swapped the
              semantic colour for the shared variant and lost that relationship. */}
          <button
            type="button"
            onClick={() => void load(user.id)}
            className="btn border border-error text-error-text hover:bg-surface"
          >
            <RotateCw size={14} aria-hidden /> Try again
          </button>
        </div>
      )}

      <div className="card mb-4 flex flex-wrap items-end gap-2 p-3">
        <label className="relative flex min-w-[180px] flex-1 items-center">
          <Search size={15} className="pointer-events-none absolute left-3 top-[1.9rem] text-text-muted" aria-hidden />
          <span className="w-full">
            <span className="mb-1 block text-caption text-text-muted">Search</span>
            <input
              className="input pl-9"
              placeholder="Ticket reference or message…"
              value={f.q}
              onChange={(e) => set('q', e.target.value)}
              aria-label="Search notifications"
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-caption text-text-muted">Category</span>
          <select className="input" value={f.category} onChange={(e) => set('category', e.target.value as NotificationCategory | '')} aria-label="Filter by category">
            <option value="">Any category</option>
            {Object.entries(NOTIFICATION_CATEGORIES).map(([key, info]) => (
              <option key={key} value={key}>{info.label}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-caption text-text-muted">Priority</span>
          <select className="input" value={f.priority} onChange={(e) => set('priority', e.target.value as NotificationPriority | '')} aria-label="Filter by priority">
            <option value="">Any priority</option>
            <option value="high">Needs attention</option>
            <option value="normal">Normal</option>
            <option value="low">Low</option>
          </select>
        </label>

        <label className="flex items-center gap-2 pb-2">
          <input type="checkbox" checked={f.unreadOnly} onChange={(e) => set('unreadOnly', e.target.checked)} className="h-4 w-4" />
          <span className="text-body-sm text-text">Unread only</span>
        </label>

        {activeFilters > 0 && (
          <button
            type="button"
            onClick={() => setF(EMPTY_NOTIFICATION_FILTERS)}
            className="btn-neutral"
          >
            <FilterX size={14} aria-hidden /> Clear {activeFilters}
          </button>
        )}
        <span className="pb-2 text-caption text-text-muted">
          {filtered.length} of {notifications.length}
        </span>
      </div>

      {loading && !loadError && (
        <p role="status" className="card px-3 py-2 text-body-sm text-text-muted">
          Loading your notifications…
        </p>
      )}

      {!loading && !loadError && notifications.length === 0 && (
        <EmptyState title="No notifications" description="Updates on your tickets will appear here." />
      )}

      {/* Filters that exclude everything are a DIFFERENT empty state from having nothing —
          telling someone they have no notifications when they have thirty and a filter on is
          how a filter gets left on. */}
      {!loading && !loadError && notifications.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="No notifications match those filters"
          description={`You have ${notifications.length}, but none matches what you have selected.`}
          action={
            <button type="button" onClick={() => setF(EMPTY_NOTIFICATION_FILTERS)} className="btn-neutral">
              Clear filters
            </button>
          }
        />
      )}

      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`grp-${group.key}`} className="mb-4">
          <h2 id={`grp-${group.key}`} className="mb-1 text-label uppercase text-text-muted">
            {group.key} <span className="text-caption normal-case text-text-secondary">({group.items.length})</span>
          </h2>
          <ul className="card overflow-hidden">
            {group.items.map((n) => {
              const template = notificationTemplate(n.type);
              const category = categoryOf(n);
              const priority = PRIORITY_INFO[priorityOf(n)];
              const Icon = NOTIFICATION_ICON[n.type] ?? Bell;
              return (
                <li key={n.id} className={!n.read ? 'bg-info-bg/40' : ''}>
                  <Link
                    to={n.leaveId ? '/app/leave' : `/app/tickets/${n.ticketId}`}
                    className="row-hover flex items-start gap-3 border-b border-border px-4 py-3 last:border-0"
                  >
                    <Icon size={16} className="mt-0.5 shrink-0 text-text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-body-sm text-text">{n.message}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        {/* Unread is a WORD, not only a dot and a tint. */}
                        {!n.read && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-label-sm text-primary-on">Unread</span>
                        )}
                        {priority.label && (
                          <span className={`rounded-full px-2 py-0.5 text-label-sm ${priority.badgeClass}`}>{priority.label}</span>
                        )}
                        {category && (
                          <span className={`rounded-full px-2 py-0.5 text-label-sm ${NOTIFICATION_CATEGORIES[category].badgeClass}`}>
                            {NOTIFICATION_CATEGORIES[category].label}
                          </span>
                        )}
                        {/* What to do next — B08: every notification answers "what should I do?" */}
                        {template && <span className="text-caption text-text-secondary">{template.actionLabel}</span>}
                      </span>
                      <span className="mt-1 block text-caption text-text-muted">{fmt(n.at)}</span>
                    </span>
                    {n.ticketCode && <span className="shrink-0 font-mono text-body-sm text-primary-text">{n.ticketCode}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <details className="card-p mt-6">
        <summary className="cursor-pointer text-label uppercase text-text-muted">
          Notifications you will not receive, and why ({NOTIFICATION_GAPS.length})
        </summary>
        <dl className="mt-3 space-y-3">
          {NOTIFICATION_GAPS.map((g) => (
            <div key={g.asked}>
              <dt className="text-body-sm text-text">{g.asked}</dt>
              <dd className="text-caption text-text-muted">{g.why}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
