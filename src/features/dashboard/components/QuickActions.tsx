import { Link } from 'react-router-dom';
import type { Session } from '@domain/types/auth.types';
import { permittedQuickActions } from './quickActionRegistry';

/**
 * The quick-action bar. The registry and the permission filter are pure and live in
 * `quickActions.ts`, so this file exports components only (the fast-refresh rule the lint gate
 * enforces at zero warnings).
 */
export function QuickActions({ session, unread }: { readonly session: Session; readonly unread: number }) {
  const actions = permittedQuickActions(session);
  if (actions.length === 0) return null;

  return (
    <nav aria-label="Quick actions" className="flex flex-wrap gap-2">
      {actions.map((a) => {
        const Icon = a.icon;
        return (
          <Link
            key={a.id}
            to={a.to}
            className={a.primary ? 'btn-primary' : 'btn-neutral'}
          >
            <Icon size={16} aria-hidden /> {a.label}
            {a.id === 'notifications' && unread > 0 && (
              // A11Y: this badge was white-on-error-fill, which fails AA contrast in the dark
              // theme — the same single-theme blind spot earlier accessibility passes had. The
              // error-bg / error-text pairing is the reviewed one and is what every other badge
              // in the application uses.
              <span className="rounded-full bg-error-bg px-1.5 text-label-sm text-error-text">
                {unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
