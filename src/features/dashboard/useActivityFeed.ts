import { useCallback, useEffect, useState } from 'react';
import type { Ticket } from '@domain/types/ticket.types';
import { feedFromTickets, type FeedItem } from '@domain/dashboard/activityFeed';
import { TicketApi } from '@services/api/ticketApi';
import { USE_API } from '@config/runtime.config';

export type FeedStatus = 'ready' | 'loading' | 'error';

/**
 * The activity feed, in whichever mode the app is running.
 *
 * PROTOTYPE — flatten the scope-clamped tickets the dashboard already holds. Synchronous; there
 * is nothing to await and no state to be wrong about.
 *
 * API — its own request. The list endpoint omits `activities`, so the flatten CANNOT work there:
 * the widget that used it reported "No activity yet" permanently, no matter what had happened.
 * This is the one dashboard region with a genuinely independent data source, which is also why it
 * is the one region that can be loading or failed while the rest of the page is fine — exactly the
 * partial-failure case B05 asks for ("do not block the entire dashboard when only one widget
 * fails").
 */
export function useActivityFeed(scoped: readonly Ticket[], limit = 10): {
  items: readonly FeedItem[];
  status: FeedStatus;
  error: string | null;
  retry: () => void;
} {
  const [items, setItems] = useState<readonly FeedItem[]>([]);
  const [status, setStatus] = useState<FeedStatus>(USE_API ? 'loading' : 'ready');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!USE_API) {
      setItems(feedFromTickets(scoped, limit));
      setStatus('ready');
      return;
    }
    let live = true;
    setStatus('loading');
    void TicketApi.activity(limit).then((r) => {
      // Guards against a slow first response overwriting a newer one after a retry, and against
      // setting state on an unmounted page.
      if (!live) return;
      if (r.ok) {
        setItems(r.value);
        setError(null);
        setStatus('ready');
      } else {
        // Keep whatever was already shown. Blanking the list would state "nothing has happened",
        // which is a different and wrong claim from "we could not reach the server".
        setError(r.error);
        setStatus('error');
      }
    });
    return () => {
      live = false;
    };
  }, [scoped, limit, attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { items, status, error, retry };
}
