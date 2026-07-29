import { useCallback, useSyncExternalStore } from 'react';

/**
 * Subscribe to a CSS media query from JS (D07 PERF-1).
 *
 * Why this exists rather than a CSS `hidden md:block` pair: the responsive ticket list was
 * rendering BOTH presentations and letting CSS discard one. Measured at 2,013 tickets that was
 * 4,026 rows built to display 2,013 — the mobile card list sat in the DOM at `display: none` on
 * a 1280px screen, fully constructed, reconciled by React on every update, and never seen.
 *
 * CSS-only responsive switching is right for LAYOUT and wrong for LISTS: hiding a box costs
 * nothing, hiding N rows costs N. The rule of thumb is whether the hidden branch's cost scales
 * with the data.
 *
 * `useSyncExternalStore` rather than useState+useEffect so the first paint already has the
 * correct answer — an effect-based version renders the wrong variant once, then swaps, which is
 * a layout shift on every load (and D07 §9 asks for stable layouts).
 *
 * ---
 * TWO DEFECTS FOUND BY TESTING THIS AT 375px, both fixed here.
 *
 * 1. `subscribe` must be STABLE. Defined inline it is a new function identity every render, so
 *    React tears down and re-creates the subscription on each one — churn at best, and a missed
 *    event at worst. `useCallback` keyed on the query fixes it.
 *
 * 2. Listening only to the MediaQueryList `change` event is not enough. The first version did
 *    exactly that and the component stayed on the desktop table at 375px: `matches` read `false`
 *    when queried directly, but no `change` event had fired, so React never re-read the snapshot
 *    and the UI silently disagreed with the viewport. Subscribing to `resize` as well closes it.
 *    A media query that is right only when the browser chooses to tell you is not a media query
 *    you can render from.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      window.addEventListener('resize', onChange);
      return () => {
        mql.removeEventListener('change', onChange);
        window.removeEventListener('resize', onChange);
      };
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // Server snapshot: no SSR here, but React requires it. Desktop is the safer default —
    // it matches the Tailwind `md:` breakpoint's own assumption.
    () => true,
  );
}

/** Tailwind's `md` breakpoint (768px), named once so it cannot drift from the CSS. */
export const MD_BREAKPOINT = '(min-width: 768px)';
