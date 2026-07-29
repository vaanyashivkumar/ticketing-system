/**
 * Date-range presets for the dashboard filter (created-date window).
 *
 * Pure: every preset maps to a concrete {from, to} pair of YYYY-MM-DD strings relative to a passed
 * `now`, so the same strings feed straight into `applyFilters` (which already filters on
 * `createdAt` between from/to). No Date math lives in the component.
 */

export type DatePresetKey = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth';

export const DATE_PRESETS: readonly { key: DatePresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
];

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * {from, to} for a preset, relative to `now`. Day-relative windows (today/yesterday/last7) end
 * today; month presets cover the WHOLE calendar month (1st → last day), which is what "this month"
 * and "last month" mean to a reader — a ticket dated the 30th is in this month even before the
 * month ends. `new Date(y, m+1, 0)` is the last day of month m.
 */
export function presetRange(key: DatePresetKey, now: Date): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (key) {
    case 'today': return { from: iso(new Date(y, m, d)), to: iso(new Date(y, m, d)) };
    case 'yesterday': { const t = new Date(y, m, d - 1); return { from: iso(t), to: iso(t) }; }
    case 'last7': return { from: iso(new Date(y, m, d - 6)), to: iso(new Date(y, m, d)) };
    case 'thisMonth': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case 'lastMonth': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  }
}

/** The preset whose range equals {from, to} at `now`, or null (→ a custom range, or none set). */
export function matchPreset(from: string, to: string, now: Date): DatePresetKey | null {
  if (!from || !to) return null;
  for (const { key } of DATE_PRESETS) {
    const r = presetRange(key, now);
    if (r.from === from && r.to === to) return key;
  }
  return null;
}
