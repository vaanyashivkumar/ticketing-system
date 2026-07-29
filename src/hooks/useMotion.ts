import { useRef, type DependencyList, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { reveal, revealStagger } from '@lib/motion';

/**
 * React bindings for the motion layer (`lib/motion.ts`).
 *
 * BUILT ON `useGSAP` FROM `@gsap/react`, which is GSAP's own React integration, rather than on a
 * hand-rolled `useLayoutEffect` + `gsap.context()`. The hand-rolled version is what this started
 * as, and it shipped the sign-in headline permanently invisible under React StrictMode — see the
 * `entrance` note in `lib/motion.ts` for the mechanism and how it was proven.
 *
 * `useGSAP` exists because that interaction is a known, subtle one: it runs inside an isomorphic
 * layout effect, scopes every selector to the container, and reverts precisely what it created on
 * cleanup, in the order StrictMode's mount → cleanup → mount cycle requires. Reaching for the
 * library's own primitive is the difference between working with a known hazard and rediscovering
 * it in production.
 *
 * Layout-effect timing matters independently: the tween's first frame must land BEFORE paint, or
 * the element paints at its final position and then jumps back to the animation's start — a flash
 * on every mount, and the most common way GSAP-in-React looks broken.
 */

/**
 * Run GSAP inside a scoped, auto-reverting context.
 *
 * The callback receives the scope element, and any selector text used inside is resolved within it
 * — so `'.card'` means "cards in this component", never every card on the page.
 */
export function useMotionScope<T extends HTMLElement = HTMLDivElement>(
  setup: (scope: T) => void,
  deps: DependencyList = [],
): RefObject<T> {
  const ref = useRef<T>(null);

  useGSAP(
    () => { if (ref.current) setup(ref.current); },
    // `revertOnUpdate` so a dependency change (a route change, new data) cleans up the previous
    // tweens rather than layering a second set on the same elements.
    // Copied, not passed through: `useGSAP` takes a mutable array, and React's `DependencyList` is
    // readonly. The spread is the honest conversion — casting would silence a real type difference.
    { scope: ref, dependencies: [...deps], revertOnUpdate: true },
  );

  return ref;
}

/**
 * Reveal a single element when it mounts.
 *
 * Returns a ref to attach. The element is fully visible in the DOM at rest — see the `from()` note
 * in `lib/motion.ts` — so if this hook never runs, the content is simply there.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  opts: { delay?: number; y?: number; enabled?: boolean } = {},
  deps: DependencyList = [],
): RefObject<T> {
  const { enabled = true, ...rest } = opts;
  return useMotionScope<T>(
    (scope) => { if (enabled) reveal(scope, rest); },
    [enabled, ...deps],
  );
}

/**
 * Reveal a set of children in sequence.
 *
 * `selector` is resolved inside the scope. Pass the direct children you want to cascade — usually
 * cards or list items.
 *
 * GUARDED AGAINST THE EMPTY CASE: `gsap.from()` on an empty NodeList is a no-op, but on a list
 * that renders asynchronously it would tween the wrong (empty) set and never touch the real rows.
 * The dependency list is how a caller re-runs it once data has arrived; `count` is the usual thing
 * to pass.
 */
export function useRevealStagger<T extends HTMLElement = HTMLDivElement>(
  selector: string,
  opts: { delay?: number; y?: number; amount?: number; enabled?: boolean } = {},
  deps: DependencyList = [],
): RefObject<T> {
  const { enabled = true, ...rest } = opts;
  return useMotionScope<T>(
    (scope) => {
      if (!enabled) return;
      const items = scope.querySelectorAll(selector);
      if (items.length) revealStagger(items, rest);
    },
    [enabled, selector, ...deps],
  );
}
