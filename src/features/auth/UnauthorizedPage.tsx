import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, ArrowLeft, LayoutDashboard } from 'lucide-react';

/**
 * Graceful authorization failure (P12 §14). No crash, no leak of protected content.
 * Explains what happened and offers recovery (back / dashboard).
 */
export function UnauthorizedPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    // `main`, not `div` (A11Y-005) — pages outside AppShell inherit no landmark from the shell,
    // so their entire content sat outside any landmark region.
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div role="alert" className="card w-full max-w-md p-8 text-center shadow-e2">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-bg text-warning">
          <Lock size={22} aria-hidden />
        </span>
        <h1 className="text-h3 text-text">Access restricted</h1>
        <p className="mt-1 text-body text-text-secondary">
          You don&rsquo;t have permission to view{' '}
          {from ? <code className="font-mono text-body-sm text-text">{from}</code> : 'this page'}. If you
          believe this is a mistake, contact your administrator.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="btn-neutral"
          >
            <ArrowLeft size={16} aria-hidden /> Go back
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/dashboard', { replace: true })}
            className="btn-primary"
          >
            <LayoutDashboard size={16} aria-hidden /> Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
