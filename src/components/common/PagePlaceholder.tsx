import type { LucideIcon } from 'lucide-react';

/**
 * FOUNDATION-ONLY placeholder for a route that has a shell home but no feature yet.
 * Explicitly marks a page as not-yet-built so nothing masquerades as implemented
 * (Reliability Constitution: never present Planned work as Done).
 */
export function PagePlaceholder({
  title,
  icon: Icon,
  description,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <section aria-labelledby="page-title">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-sunken text-text-secondary">
          <Icon size={20} aria-hidden />
        </span>
        <div>
          <h1 id="page-title" className="text-h2 text-text">
            {title}
          </h1>
          <p className="text-body text-text-secondary">{description}</p>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-16 text-center">
        <span className="rounded-full bg-info-bg px-2.5 py-1 text-label-sm uppercase text-info-text">
          Foundation placeholder
        </span>
        <p className="max-w-md text-body text-text-muted">
          The engineering foundation is in place. This module will be built in a later
          implementation phase, following the ratified specifications.
        </p>
      </div>
    </section>
  );
}
