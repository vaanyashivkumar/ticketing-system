import type { ReactNode } from 'react';

/**
 * The canonical "nothing to show" state.
 *
 * The dashed-border card was duplicated verbatim three times plus a near-variant (D04 #21), and
 * elsewhere the identical condition rendered as a terse one-line caption instead (D04 #33) — the
 * same situation told two different ways in one product.
 *
 * `title` says what is absent; `description` says what to do about it; `action` offers the way.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    /* `card` + `border-dashed`: the surface comes from the system, the dashed edge is the part
       that carries meaning — this is a container with nothing in it yet. */
    <div className="card flex flex-col items-center justify-center gap-2 border-dashed px-6 py-16 text-center">
      <p className="text-body-medium text-text">{title}</p>
      <p className="max-w-sm text-body text-text-muted">{description}</p>
      {action}
    </div>
  );
}
