import type { Priority } from '@domain/types/ticket.types';

/**
 * PRIORITY ENGINE configuration (B04 §Priority Engine).
 *
 * Priority is the enum that sets the baseline SLA (BRS §502). Before this file the four values
 * were listed SIX times, and two of those lists disagreed on order:
 *
 *   - `PRIORITY_ORDER` (statusTransitions.config)      Urgent -> Low  (sort key)
 *   - `metrics.ts`, `SlaManagementPage`, `ReportsPage` Urgent -> Low
 *   - `CreateTicketPage`                               Low -> Urgent  (the opposite)
 *   - `TicketBadges` style map + inline glyph ternary
 *   - `DashboardCharts` colour map
 *
 * Both orders are defensible — a sort wants most-urgent-first, a create form wants the safe
 * default first and escalation to be a deliberate move down the list. So `rank` states the
 * severity order once and `ORDERED_PRIORITIES` / `SELECTABLE_PRIORITIES` expose both readings,
 * rather than one list silently winning.
 *
 * The RESOLUTION TARGETS are deliberately not here: they live in `sla.config.ts`, are keyed by
 * `Priority`, and are administrator-editable. Copying them alongside would give the same number
 * two homes — which is the defect this file removes, not one to reintroduce.
 */
export interface PriorityDefinition {
  readonly id: Priority;
  readonly label: string;
  /** What choosing this level actually means, shown when a user changes it. */
  readonly description: string;
  /** Severity order, 0 = most urgent. The single sort key. */
  readonly rank: number;
  readonly badgeClass: string;
  /**
   * Shape signal so priority never reads by colour alone (phase-2 §9). Decorative — the badge
   * always renders the label beside it.
   */
  readonly glyph: string;
  /** CSS custom property for chart series. A token, never a raw hex, so themes still apply. */
  readonly chartColorVar: string;
}

export const PRIORITY_DEFINITIONS: readonly PriorityDefinition[] = [
  {
    id: 'Urgent',
    label: 'Urgent',
    description: 'Blocking work or a deadline today. The tightest SLA target.',
    rank: 0,
    badgeClass: 'bg-error-bg text-error-text',
    glyph: '⬆',
    chartColorVar: 'var(--color-error)',
  },
  {
    id: 'High',
    label: 'High',
    description: 'Time-sensitive and should be picked up ahead of routine work.',
    rank: 1,
    badgeClass: 'bg-warning-bg text-warning-text',
    glyph: '▲',
    chartColorVar: 'var(--color-warning)',
  },
  {
    id: 'Medium',
    label: 'Medium',
    description: 'Normal turnaround. The default for most requests.',
    rank: 2,
    badgeClass: 'bg-info-bg text-info-text',
    glyph: '◆',
    chartColorVar: 'var(--color-info)',
  },
  {
    id: 'Low',
    label: 'Low',
    description: 'No deadline pressure. Handled after everything above it.',
    rank: 3,
    badgeClass: 'bg-surface-sunken text-text-secondary border border-border',
    glyph: '▽',
    chartColorVar: 'var(--color-secondary)',
  },
];

/**
 * The default a requester starts from. Named rather than repeated as a `'Medium'` literal in the
 * create form, and deliberately NOT the highest: "Urgent is never a system default" (BRS §502).
 * A category may override it with its own `defaultPriority`.
 */
export const DEFAULT_PRIORITY: Priority = 'Medium';
