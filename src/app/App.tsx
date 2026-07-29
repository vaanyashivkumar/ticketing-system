import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { AppProviders } from '@providers/AppProviders';
import { router } from '@routes/AppRouter';
import { useAuthStore } from '@stores/authStore';
import { useTicketStore } from '@stores/ticketStore';

export function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const status = useAuthStore((s) => s.status);
  const refreshTickets = useTicketStore((s) => s.refresh);

  // Restore any persisted session once, on boot (P12 §4 session restore).
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  /**
   * Load tickets once the session is known, and ONLY then.
   *
   * In API mode every ticket request is authorised server-side against the bearer token, so
   * fetching before the session is restored would fire a guaranteed 401 on every reload — and,
   * worse, the 401 handler clears the token, which would sign the user out on refresh. Keying
   * this on `status` is what makes a page reload survivable.
   *
   * The prototype path re-reads localStorage, which is cheap and has no such ordering concern.
   */
  useEffect(() => {
    if (status === 'authenticated') void refreshTickets();
  }, [status, refreshTickets]);

  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
