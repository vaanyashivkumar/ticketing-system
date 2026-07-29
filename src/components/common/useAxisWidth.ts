import { useEffect, useState } from 'react';

/** Below this, a 130px label gutter eats most of a chart's plot area. */
const NARROW_BREAKPOINT = 768;
const NARROW_WIDTH = 78;
const WIDE_WIDTH = 130;

/**
 * The Y-axis label gutter for a horizontal bar chart (D04 #27).
 *
 * The category chart hardcoded `width={130}`. That is fine on a wide dashboard, but the chart
 * panel splits into two columns at `sm` — so each chart is NARROWER there than it is
 * single-column, and 130px of label gutter consumed the majority of the plot. The bars, which are
 * the actual information, were squeezed into what was left.
 *
 * Narrow viewports get a smaller gutter and truncate the label instead; Recharts still shows the
 * full name in the tooltip, so nothing is lost — only deferred to hover.
 */
export function useAxisWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < NARROW_BREAKPOINT ? NARROW_WIDTH : WIDE_WIDTH,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth < NARROW_BREAKPOINT ? NARROW_WIDTH : WIDE_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}
