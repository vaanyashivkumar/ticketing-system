import { useEffect, useState } from 'react';

/**
 * Does this user want reduced motion?
 *
 * globals.css already collapses every CSS transition/animation to ~0ms under
 * `prefers-reduced-motion` — which covers 100% of the motion this app authors itself.
 *
 * It does NOT cover Recharts (defect D05 MOT-001). Recharts animates through react-smooth, which
 * drives SVG geometry frame-by-frame in JavaScript rather than via CSS transitions, so a CSS
 * media query cannot stop it. The single largest animation in the product was therefore the one
 * piece the guard could not reach: a user who asked their OS for reduced motion still got the
 * full ~1500ms chart entrance — roughly 2x D05 §4's 500-800ms band.
 *
 * Charts read this and pass `isAnimationActive={!reduced}`. Accessibility overrides aesthetics.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Chart entrance duration (ms). Inside D05 §4's 500-800ms band; Recharts defaults to ~1500. */
export const CHART_ANIMATION_MS = 600;
