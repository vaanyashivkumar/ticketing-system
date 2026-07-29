import type { ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { ErrorBoundary } from '@providers/ErrorBoundary';
import { DATA_SCOPE_INFO, type DataScope } from '@domain/dashboard/dataScope';

/**
 * The shell every dashboard region renders inside (B05 §Loading and Error States,
 * §Empty State Engine, §Accessibility).
 *
 * It exists because of four separate defects in the dashboard it replaces, all of which were
 * possible only because there was no shared region shell:
 *
 * 1. **Nothing read the store's `loading` or `loadError`.** Those two fields had zero consumers
 *    anywhere in the application, so a failed fetch rendered a complete, confident dashboard
 *    reading "Open 0 · Overdue 0 · Nothing needs you right now" — indistinguishable from a quiet
 *    morning. On a decision-support surface that is not a missing feature, it is a wrong answer.
 * 2. **No retry.** After a failed initial load the only recovery was a full browser reload.
 * 3. **No per-region isolation.** One widget throwing blanked the entire routed content area.
 * 4. **The KPI and quick-action rows had no headings**, so heading navigation jumped from the
 *    page title straight past them. Every region here owns an `<h2>`, so every region is reachable.
 *
 * `aria-busy` and the polite live region are what make the loading state exist for a screen-reader
 * user at all; the skeleton alone is `aria-hidden` decoration.
 */

export type RegionState = 'ready' | 'loading' | 'error' | 'empty';

interface Props {
  readonly title: string;
  /** The business question this region answers (FR-D02). Rendered, not just documented. */
  readonly question: string;
  readonly dataScope: DataScope;
  readonly state: RegionState;
  /** Shown in the error state. The SERVER's message where there is one — never a generic retype. */
  readonly errorMessage?: string | null;
  readonly onRetry?: () => void;
  readonly emptyTitle?: string;
  readonly emptyDescription?: string;
  /** Right-aligned affordance — typically a "view all" link. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function DashboardRegion({
  title,
  question,
  dataScope,
  state,
  errorMessage,
  onRetry,
  emptyTitle,
  emptyDescription,
  action,
  children,
  className = '',
}: Props) {
  const headingId = `region-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const scope = DATA_SCOPE_INFO[dataScope];

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={state === 'loading'}
      className={`card-p ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-label uppercase text-text-muted">
            {title}
          </h2>
          {/* The question is the region's accessible description AND its visible subtitle. A
              widget that cannot state the decision it supports is decoration (FR-D02). */}
          <p className="text-caption text-text-secondary">{question}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Data scope, stated on every region. A number without its population is not a fact —
              "Unassigned 12" means something different across a department than across an inbox. */}
          <span
            className="rounded-full bg-surface-sunken px-2 py-0.5 text-label-sm text-text-secondary"
            title={scope.description}
          >
            {scope.label}
          </span>
          {state === 'ready' && action}
        </div>
      </div>

      <ErrorBoundary
        boundaryName={`dashboard:${title}`}
        fallback={(retry) => <RegionFailure message="This widget ran into an unexpected problem." onRetry={retry} />}
      >
        {state === 'loading' && <RegionSkeleton label={title} />}
        {state === 'error' && (
          <RegionFailure message={errorMessage ?? 'We could not load this data.'} onRetry={onRetry} />
        )}
        {state === 'empty' && (
          <div className="py-6 text-center">
            <p className="text-body-sm text-text">{emptyTitle ?? 'Nothing to show'}</p>
            {emptyDescription && <p className="mt-1 text-caption text-text-muted">{emptyDescription}</p>}
          </div>
        )}
        {state === 'ready' && children}
      </ErrorBoundary>
    </section>
  );
}

/**
 * The skeleton is decoration — `aria-hidden` — because a screen-reader user is served by
 * `aria-busy` on the region plus the polite status line, not by a description of grey boxes.
 */
function RegionSkeleton({ label }: { label: string }) {
  return (
    <>
      <div className="space-y-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-surface-sunken" />
        ))}
      </div>
      <p role="status" className="sr-only">
        Loading {label}
      </p>
    </>
  );
}

/**
 * A region-sized failure. It says the data is MISSING rather than showing a zero, which is the
 * whole point: "we could not reach the server" and "there is nothing here" are different claims
 * and the old dashboard made only the second one.
 */
function RegionFailure({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-3">
      <p className="flex items-start gap-2 text-body-sm text-error-text">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        {message}
      </p>
      {onRetry && (
        /* `btn-neutral` for the 40px target and press feedback; the error border and text stay as
           utilities so the control still reads as part of the failure box it sits in. */
        <button type="button" onClick={onRetry} className="btn-neutral border-error text-error-text">
          <RotateCw size={14} aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}
