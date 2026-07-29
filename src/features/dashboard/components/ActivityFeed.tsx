import { Link } from 'react-router-dom';
import { describeActivity, type FeedItem } from '@domain/dashboard/activityFeed';

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Recent activity (B05 §Recent Activity Engine). Actor, action, ticket reference, timestamp, link.
 *
 * The sentence comes from `describeActivity` rather than being assembled here, because the SPA's
 * `from`/`to` fields are overloaded across three different kinds of write. Rendering them
 * generically prints "Medium → High" beside a status-change verb — plausible, wrong, and the sort
 * of thing nobody notices until someone acts on it.
 */
export function ActivityFeed({ items }: { readonly items: readonly FeedItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="border-l-2 border-border pl-3 text-body-sm">
          <Link
            to={`/app/tickets/${a.ticketId}`}
            state={{ from: '/app/dashboard' }}
            className="text-text hover:underline"
          >
            <span className="font-medium">{a.actorName}</span> {describeActivity(a)}{' '}
            <span className="font-mono text-text-muted">{a.ticketCode}</span>
          </Link>
          <span className="block text-caption text-text-muted">{fmt(a.at)}</span>
        </li>
      ))}
    </ol>
  );
}
