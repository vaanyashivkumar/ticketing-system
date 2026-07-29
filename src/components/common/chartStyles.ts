/**
 * Shared Recharts style constants (axis/grid colors, tooltip chrome) used by both the
 * dashboard and reports charts. Split from ChartCard.tsx (D04 #18) so that file stays a
 * component-only module for React Fast Refresh.
 */
export const AXIS = 'var(--color-text-muted)';
export const GRID = 'var(--color-border)';

export const tooltipStyle = {
  backgroundColor: 'var(--color-surface-elevated)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--color-text)',
};
