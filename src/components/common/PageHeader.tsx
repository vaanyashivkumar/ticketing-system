import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The canonical page header: icon badge + H1 + one-line subtitle.
 *
 * This exact block was hand-copied in six places (D04 #17) while `AdminHeader` — the same shape
 * with the same prop signature — already existed next door. The dashboard, the app's own landing
 * page, was the one screen that dropped the icon badge entirely (D04 #32), so the product's front
 * door looked like a different product.
 *
 * One header, one product. `action` carries the optional right-aligned control that ReportsPage
 * and MyTickets each grew independently.
 */
export function PageHeader({
  icon: Icon,
  title,
  description,
  titleId,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  titleId?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-secondary">
          <Icon size={20} aria-hidden />
        </span>
        <div>
          <h1 id={titleId} className="text-h2 text-text">
            {title}
          </h1>
          <p className="text-body text-text-secondary">{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}
