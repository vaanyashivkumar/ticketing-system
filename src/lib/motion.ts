import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * ScrollTrigger is registered here — the module that owns every animation also owns its one
 * scroll-driven plugin. It costs nothing until a trigger is created, and the only screen that
 * creates any is the public landing page.
 *
 * GUARDED, because registration itself touches browser scroll/media APIs: in jsdom it THROWS
 * from `ScrollTrigger.enable` (no `matchMedia` at import time — the test stub arrives later),
 * which killed the whole motion test file at collection. The guard is the module's own
 * philosophy applied to the plugin: an environment that cannot animate gets a page that simply
 * does not scroll-animate, never one that fails to import. An unregistered `scrollTrigger` var
 * on a tween is ignored, so the scroll primitives degrade to plain (invisible-to-nobody) tweens.
 */
try {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    gsap.registerPlugin(ScrollTrigger);
  }
} catch {
  /* no scroll motion in this environment — resting DOM state is the visible one */
}

/**
 * THE MOTION LAYER (phase-2 §8).
 *
 * One module owns every animation in the application, for the same reason one module owns every
 * colour: motion that is invented per-component drifts into a dozen different durations and
 * easings, and the result reads as unfinished no matter how good each piece is on its own.
 *
 * ---------------------------------------------------------------------------
 * THE DECISION THAT MATTERS MOST: ANIMATE *FROM*, NEVER *TO*.
 *
 * Every reveal here uses `gsap.from()`. That means the element's RESTING STATE IN THE DOM IS THE
 * VISIBLE ONE — GSAP moves it to a hidden position, then releases it back to where CSS already
 * had it.
 *
 * The tempting alternative is to set `opacity: 0` in the markup and animate *to* opacity 1. It
 * looks identical when it works, and it is a trap: if GSAP fails to load, if a JS error happens
 * earlier in the tree, if the bundle is blocked, or if an effect simply never fires, the content
 * is INVISIBLE AND UNRECOVERABLE. A ticket queue that renders blank because an animation library
 * did not initialise is worse than one with no animation at all.
 *
 * `from()` degrades to "no animation, content present". `to()` degrades to a white screen.
 *
 * ---------------------------------------------------------------------------
 * REDUCED MOTION IS ENFORCED HERE, IN JS — CSS CANNOT DO IT.
 *
 * `globals.css` already forces `animation-duration` and `transition-duration` to ~0 under
 * `prefers-reduced-motion`. That guard does NOT cover GSAP: GSAP writes inline styles on a
 * requestAnimationFrame loop and never creates a CSS transition or keyframe animation, so every
 * rule in that media query is irrelevant to it. Shipping GSAP without this check would have
 * silently broken a promise the stylesheet appears to make.
 *
 * `gsap.ticker.lagSmoothing` and `globalTimeline.timeScale` are not used to fake it either —
 * speeding motion up is not the same as not moving. When reduced motion is requested, the tweens
 * are given a duration of 0, so elements are placed at their final values on the first frame.
 */

/** Live check — a user can change the OS setting without reloading the page. */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Durations and easings are READ FROM THE DESIGN TOKENS, not restated here.
 *
 * `--duration-base` and `--ease-standard` already exist in `tokens.css` and already govern every
 * CSS transition in the app. Hardcoding 0.2 and a bezier in this file would create a second motion
 * scale that looks right today and drifts the first time the tokens are tuned — the same failure
 * the colour tokens exist to prevent. The fallbacks are the token values, used only when this runs
 * without a document (tests).
 */
const cssMs = (name: string, fallback: number): number => {
  if (typeof window === 'undefined' || !document.documentElement) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const n = Number.parseFloat(raw);
  if (Number.isNaN(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
};

const cssEase = (name: string, fallback: string): string => {
  if (typeof window === 'undefined' || !document.documentElement) return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
};

/** The motion scale, in the seconds GSAP expects. */
export const duration = {
  get fast() { return cssMs('--duration-fast', 120) / 1000; },
  get base() { return cssMs('--duration-base', 200) / 1000; },
  get slow() { return cssMs('--duration-slow', 320) / 1000; },
};

/**
 * GSAP accepts a CSS cubic-bezier string directly via `CustomEase` only. Without that plugin the
 * strings in `tokens.css` cannot be handed over, so the four named curves are expressed as GSAP's
 * own equivalents — chosen to match, and named identically so the two systems stay legible
 * together.
 */
export const ease = {
  /** Matches --ease-standard: decelerate into place. The default for anything entering. */
  standard: 'power2.out',
  /** Matches --ease-out: a longer, softer settle. For larger or slower moves. */
  out: 'expo.out',
  /** Matches --ease-in: accelerate away. For anything leaving. */
  in: 'power2.in',
  inOut: 'power2.inOut',
};

/** Read the raw token, for the rare case a CSS transition and a tween must match exactly. */
export const cssEaseStandard = () => cssEase('--ease-standard', 'cubic-bezier(0.2, 0, 0, 1)');

/**
 * Every tween in the app goes through here.
 *
 * Centralising the reduced-motion decision means a new animation cannot forget it — the only way
 * to animate is to call something in this module, and everything in this module respects it.
 */
const tween = (vars: gsap.TweenVars): gsap.TweenVars =>
  prefersReducedMotion() ? { ...vars, duration: 0, delay: 0, stagger: 0 } : vars;

type Target = gsap.TweenTarget;

/**
 * THE SAFETY NET — content is never left hidden, under any interruption.
 *
 * `onInterrupt` strips whatever the tween wrote, so a killed tween drops the element back to its
 * stylesheet state, which is visible. This makes the invariant something the code enforces rather
 * than something a comment claims.
 */
const withSafetyNet = (target: Target, vars: gsap.TweenVars): gsap.TweenVars => ({
  ...vars,
  onInterrupt: () => { gsap.set(target, { clearProps: 'opacity,transform' }); },
});

/**
 * THE ENTRANCE PRIMITIVE — and the reason it is `fromTo` with `immediateRender: false`.
 *
 * This shipped as `gsap.from()`, and the sign-in headline was PERMANENTLY INVISIBLE. Proven by
 * measurement, not inference: opacity stayed 0 for the full second after mount, and disabling
 * React StrictMode fixed it outright.
 *
 * The mechanism. `from()` applies its start values (opacity 0) the moment the tween is created,
 * before it has ticked. StrictMode mounts, cleans up, and mounts again — and the cleanup's
 * `context.revert()` restores each element to the value GSAP recorded as "original", which for a
 * not-yet-ticked tween was the opacity 0 it had just written. The revert therefore restored the
 * element to hidden, and the second mount animated it from 0 to 0. Only the first element of a
 * stagger was affected, which is what made it look like a layout bug rather than a lifecycle one.
 *
 * `immediateRender: false` is the fix: start values are not written until the tween actually
 * ticks. A tween created and immediately reverted never touched the DOM, so there is nothing to
 * restore incorrectly.
 *
 * It also STRENGTHENS the "visible at rest" property this module is built on. With `from()`,
 * content was hidden from the instant a tween was constructed; now it is hidden only once the
 * animation is genuinely about to play, which is a strictly smaller window in which anything can
 * go wrong.
 */
function entrance(target: Target, from: gsap.TweenVars, to: gsap.TweenVars) {
  return gsap.fromTo(
    target,
    from,
    withSafetyNet(target, tween({
      ...to,
      immediateRender: false,
      clearProps: 'opacity,transform',
    })),
  );
}

/**
 * Content arriving: a short rise and fade.
 *
 * 8px, not 24. A large translation on a data screen reads as the layout being unstable — the eye
 * tracks the movement instead of the content, and on a list of forty rows it is seasickness. The
 * distance is enough to signal "this is new" and not enough to be watched.
 */
export function reveal(target: Target, opts: { delay?: number; y?: number; duration?: number } = {}) {
  return entrance(
    target,
    { opacity: 0, y: opts.y ?? 8 },
    {
      opacity: 1,
      y: 0,
      duration: opts.duration ?? duration.base,
      delay: opts.delay ?? 0,
      ease: ease.standard,
    },
  );
}

/**
 * A group arriving together, each item a beat behind the last.
 *
 * `stagger` is capped by total elapsed time rather than set per item: with a fixed 60ms step, a
 * 40-row queue would take 2.4 seconds to finish appearing, and the last row would arrive long
 * after the user started reading the first. `amount` spreads the whole group over a fixed budget
 * however many there are, so a long list gets a quicker cascade rather than a longer wait.
 */
export function revealStagger(
  target: Target,
  opts: { delay?: number; y?: number; amount?: number } = {},
) {
  return entrance(
    target,
    { opacity: 0, y: opts.y ?? 6 },
    {
      opacity: 1,
      y: 0,
      duration: duration.base,
      delay: opts.delay ?? 0,
      ease: ease.standard,
      stagger: { amount: opts.amount ?? 0.18, from: 'start' },
    },
  );
}

/**
 * A number counting to its value.
 *
 * Deliberately NOT applied to every number in the app — only to the dashboard KPI tiles, where the
 * figure is the point of the tile. A count-up on a table cell or a filter count would mean a value
 * that is briefly WRONG, and a queue depth that reads 3 on its way to 47 is a number someone could
 * act on. Even here it is short, and the element carries its true value as text for assistive
 * technology (see `CountUp`).
 *
 * Integers are rounded on every frame; a KPI is a count, and 12.7 tickets does not exist.
 */
export function countTo(
  el: HTMLElement,
  value: number,
  opts: { decimals?: number; suffix?: string; duration?: number } = {},
) {
  const decimals = opts.decimals ?? 0;
  const suffix = opts.suffix ?? '';
  const format = (n: number) =>
    `${decimals > 0 ? n.toFixed(decimals) : Math.round(n).toLocaleString('en-GB')}${suffix}`;

  if (prefersReducedMotion()) {
    el.textContent = format(value);
    return gsap.to({}, { duration: 0 });
  }

  const state = { n: 0 };
  return gsap.to(
    state,
    {
      n: value,
      duration: opts.duration ?? duration.slow,
      ease: ease.out,
      onUpdate: () => { el.textContent = format(state.n); },
      onComplete: () => { el.textContent = format(value); },
    },
  );
}

/**
 * The editorial entrance used on the sign-in page — a headline and its supporting elements
 * arriving as a considered sequence rather than all at once.
 *
 * This is the ONE place in the application with marketing-grade motion, and that is a deliberate
 * boundary: sign-in is the only screen a person looks at with nothing to do but look at it.
 * Everywhere else, someone is trying to get to a ticket.
 */
export function editorialIn(targets: (Element | null)[], opts: { delay?: number } = {}) {
  const els = targets.filter((t): t is Element => t !== null);
  if (!els.length) return gsap.to({}, { duration: 0 });

  /**
   * A plain tween, not a timeline. One stagger across three elements does not need a timeline, and
   * a timeline sitting inside its own `delay` was an extra not-yet-ticked state to reason about
   * while chasing the invisible-headline bug described on `entrance`.
   */
  return entrance(
    els,
    { opacity: 0, y: 14 },
    {
      opacity: 1,
      y: 0,
      duration: duration.slow,
      delay: opts.delay ?? 0.05,
      ease: ease.out,
      stagger: { amount: 0.28, from: 'start' },
    },
  );
}

/**
 * SCROLL-DRIVEN MOTION — used ONLY by the public landing page.
 *
 * The same boundary as `editorialIn`: marketing-grade motion is allowed exactly where a person
 * has nothing to do but look. Inside the app, scroll position is how someone reads a queue, and
 * animating against it would fight the reading.
 *
 * Both primitives share the module's invariants: the DOM's resting state is the visible one, so
 * if no trigger ever fires (reduced motion, JS failure, the pane never scrolling) the content is
 * simply there — at scale 1, fully opaque.
 */

/**
 * An element that grows as its runway section is scrolled through (the landing hero mark).
 * `scrub` ties progress to the scrollbar rather than a clock, so the growth is something the
 * reader drives, not something they wait for. No `clearProps`: the scale must persist while the
 * element is pinned on screen.
 */
export function scrollScale(
  el: Element,
  opts: { trigger: Element; from?: number; to?: number },
) {
  if (prefersReducedMotion()) return gsap.to({}, { duration: 0 });
  return gsap.fromTo(
    el,
    { scale: opts.from ?? 0.82 },
    {
      scale: opts.to ?? 1.45,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: { trigger: opts.trigger, start: 'top top', end: 'bottom bottom', scrub: 0.4 },
    },
  );
}

/**
 * Content arriving when scrolled into view, once. The scroll-position sibling of `revealStagger`;
 * `amount` spreads a group over a fixed budget exactly as there. Under reduced motion no trigger
 * is created at all — the resting DOM is already the final state, so there is nothing to place.
 */
export function scrollReveal(
  target: Target,
  opts: { trigger?: Element; y?: number; amount?: number } = {},
) {
  if (prefersReducedMotion()) return gsap.to({}, { duration: 0 });
  return gsap.fromTo(
    target,
    { opacity: 0, y: opts.y ?? 18 },
    withSafetyNet(target, {
      opacity: 1,
      y: 0,
      duration: duration.slow,
      ease: ease.out,
      stagger: { amount: opts.amount ?? 0, from: 'start' },
      immediateRender: false,
      clearProps: 'opacity,transform',
      scrollTrigger: {
        trigger: (opts.trigger ?? target) as Element,
        start: 'top 82%',
        once: true,
      },
    }),
  );
}

/* ── The mind-map primitives (Team → "How work flows") ──────────────────────────────────────────
 *
 * Three moves, and between them the whole NotebookLM idiom: children FAN OUT of their parent,
 * survivors GLIDE to their re-laid-out positions, and connectors DRAW themselves in. They live
 * here, not in the component, because this module is where the two invariants are enforced —
 * reduced motion collapses every tween to zero duration, and `fromTo` + `immediateRender: false`
 * means a document that never ticks (the hidden preview pane; a background tab) simply shows the
 * final layout. The map must be CORRECT with animation absent, and animated only as a bonus.
 *
 * Per-element geometry rides on data attributes (`data-spawn-dx` etc.) read lazily by
 * function-valued `from` vars. The alternative — one tween per node — creates N timelines for a
 * branch of N children and loses the single stagger that makes a fan look like a fan.
 */

/**
 * A branch fanning out of its parent. Each target starts AT its parent (offset in
 * `data-spawn-dx`/`data-spawn-dy`), slightly small and transparent, and settles into its own
 * position. Stagger is budgeted (`amount`), so "Expand all" cascades quickly rather than making
 * the last of thirty nodes wait its full turn.
 */
export function fanOut(targets: Target, opts: { delay?: number } = {}) {
  return gsap.fromTo(
    targets,
    {
      x: (_i: number, el: Element) => Number((el as HTMLElement).dataset.spawnDx ?? 0),
      y: (_i: number, el: Element) => Number((el as HTMLElement).dataset.spawnDy ?? 0),
      opacity: 0,
      scale: 0.92,
      transformOrigin: 'left center',
    },
    withSafetyNet(targets, tween({
      x: 0, y: 0, opacity: 1, scale: 1,
      duration: duration.slow,
      delay: opts.delay ?? 0,
      ease: ease.out,
      stagger: { amount: 0.18, from: 'start' },
      immediateRender: false,
      overwrite: 'auto',
      clearProps: 'opacity,transform',
    })),
  );
}

/**
 * A surviving node gliding from where it WAS to where the new layout puts it. React has already
 * committed the destination (left/top), so the tween plays the journey backwards-to-forwards:
 * start offset by `data-glide-dx`/`data-glide-dy` — old position minus new — and settle at zero.
 * An unticked document therefore rests at the correct new position, untouched.
 */
export function glide(targets: Target) {
  return gsap.fromTo(
    targets,
    {
      x: (_i: number, el: Element) => Number((el as HTMLElement).dataset.glideDx ?? 0),
      y: (_i: number, el: Element) => Number((el as HTMLElement).dataset.glideDy ?? 0),
    },
    withSafetyNet(targets, tween({
      x: 0, y: 0,
      duration: duration.base,
      ease: ease.standard,
      immediateRender: false,
      overwrite: 'auto',
      clearProps: 'transform',
    })),
  );
}

/**
 * A connector drawing itself from parent to child. Dash-gap the path at its own length and reel
 * the offset in; the safety net and `clearProps` return the stroke to the stylesheet's solid line,
 * so an interrupted or never-ticked draw leaves a complete connector, not a missing one.
 * `getTotalLength` is geometry, not rendering — it works even where no frame ever composites.
 */
export function drawIn(targets: Target, opts: { delay?: number } = {}) {
  const len = (el: Element): number => (el as SVGPathElement).getTotalLength();
  return gsap.fromTo(
    targets,
    {
      strokeDasharray: (_i: number, el: Element) => `${len(el)} ${len(el)}`,
      strokeDashoffset: (_i: number, el: Element) => len(el),
      opacity: 0.4,
    },
    tween({
      strokeDashoffset: 0,
      opacity: 1,
      duration: duration.slow,
      delay: opts.delay ?? 0,
      ease: ease.out,
      stagger: { amount: 0.18, from: 'start' },
      immediateRender: false,
      overwrite: 'auto',
      clearProps: 'strokeDasharray,strokeDashoffset,opacity',
      // Not `withSafetyNet`: that clears opacity/transform, and a half-drawn stroke needs its
      // DASH props stripped too or an interrupted draw leaves a permanently partial line.
      onInterrupt: () => {
        gsap.set(targets, { clearProps: 'strokeDasharray,strokeDashoffset,opacity' });
      },
    }),
  );
}

/**
 * A connector re-shaping as its ends move. Every path here is `M … C …` with the same command
 * count, so GSAP interpolates the numbers directly — the curve bends through the intermediate
 * shapes instead of snapping.
 *
 * BOTH endpoints ride on data attributes (`data-prev-d`, `data-next-d`), never on the live `d`.
 * Reading the destination from the attribute would be order-dependent: once the `from` shape has
 * been applied, the attribute IS the old shape, and a lazily-evaluated destination would read it
 * back and morph nowhere. React has already committed the new `d`, which is what an unticked
 * document keeps showing.
 */
export function morphPath(targets: Target) {
  return gsap.fromTo(
    targets,
    { attr: { d: (_i: number, el: Element) => (el as SVGPathElement).dataset.prevD ?? '' } },
    tween({
      attr: { d: (_i: number, el: Element) => (el as SVGPathElement).dataset.nextD ?? '' },
      duration: duration.base,
      ease: ease.standard,
      immediateRender: false,
      overwrite: 'auto',
    }),
  );
}

/** Kill every tween on a target — for unmount, so a running tween never writes to a dead node. */
export function killMotion(target: Target) {
  gsap.killTweensOf(target);
}

export { gsap };
