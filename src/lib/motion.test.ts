import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gsap, reveal, revealStagger, editorialIn, countTo, prefersReducedMotion } from './motion';

/**
 * The motion layer's two invariants, both of which failed in practice before being tested.
 *
 * These run in jsdom, where GSAP's rAF ticker does not advance. That is a FEATURE here: it is the
 * same condition as a background tab, a paused document, or a machine under load — and the whole
 * design of this module is that content must be correct when no frame ever renders. A test that
 * only passed while animations played would be testing the happy path of a safety net.
 */

const setReducedMotion = (reduce: boolean) => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  }));
};

let el: HTMLElement;

beforeEach(() => {
  setReducedMotion(false);
  el = document.createElement('div');
  el.textContent = 'content';
  document.body.appendChild(el);
});

afterEach(() => {
  gsap.killTweensOf(el);
  el.remove();
  vi.unstubAllGlobals();
});

describe('INVARIANT 1 — an entrance never leaves content hidden', () => {
  /**
   * THE REGRESSION GUARD for the defect this module shipped with.
   *
   * The reveals were `gsap.from()`, which writes its start values (opacity 0) the moment the tween
   * is constructed, before a single frame renders. Under React StrictMode — mount, clean up, mount
   * again — the cleanup's `context.revert()` restored each element to what GSAP had recorded as its
   * original value, which for a not-yet-ticked tween was the opacity 0 it had just written. The
   * sign-in headline was permanently invisible, in a build where typecheck, lint and 325 tests all
   * passed. It was found by measuring the running page.
   *
   * `immediateRender: false` is the fix: nothing is written to the DOM until the tween actually
   * ticks, so a tween created and immediately discarded cannot leave anything hidden.
   */
  it('does not touch the DOM until the animation actually ticks', () => {
    reveal(el);
    // No frame has rendered. The element must be exactly as the stylesheet left it.
    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
  });

  it('applies to staggered and editorial entrances too — every entrance path', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);

    revealStagger([a, b]);
    editorialIn([a, b]);

    expect(a.style.opacity).toBe('');
    expect(b.style.opacity).toBe('');
    a.remove();
    b.remove();
  });

  it('declares immediateRender:false on the tween itself', () => {
    // Asserting the mechanism, not only the symptom: a future refactor that reinstated
    // `gsap.from()` would restore the exact defect, and the DOM check above would still pass on
    // the first render while failing under a revert.
    const t = reveal(el);
    expect(t.vars.immediateRender).toBe(false);
    expect(t.vars.onInterrupt).toBeTypeOf('function');
  });

  it('clears its inline styles when interrupted, rather than freezing mid-fade', () => {
    const t = reveal(el);
    el.style.opacity = '0.3';
    el.style.transform = 'translateY(8px)';
    t.kill(); // fires onInterrupt
    expect(el.style.opacity).toBe('');
    expect(el.style.transform).toBe('');
  });
});

describe('INVARIANT 2 — reduced motion is honoured in JS, where CSS cannot reach', () => {
  /**
   * `globals.css` forces animation and transition durations to ~0 under
   * `prefers-reduced-motion`. That rule is irrelevant to GSAP, which writes inline styles on a
   * rAF loop and creates neither a CSS animation nor a transition. Without this check the
   * stylesheet would appear to make a promise the motion layer quietly broke.
   */
  it('reports the OS preference live', () => {
    setReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    setReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('collapses an entrance to zero duration rather than merely speeding it up', () => {
    setReducedMotion(true);
    const t = reveal(el, { delay: 0.5 });
    expect(t.vars.duration).toBe(0);
    expect(t.vars.delay).toBe(0);
  });

  it('writes a counted number immediately and exactly, never an intermediate value', () => {
    setReducedMotion(true);
    countTo(el, 47);
    // Not "on its way to 47" — a KPI briefly reading a number that was never true is a number
    // somebody can act on.
    expect(el.textContent).toBe('47');
  });
});

describe('a counted number is correct before any frame renders', () => {
  it('leaves the element untouched so its rendered value stands', () => {
    setReducedMotion(false);
    el.textContent = '47';
    countTo(el, 47);
    // The tween animates a detached object and only writes via onUpdate, so with no ticker the
    // true value React rendered is what remains on screen.
    expect(el.textContent).toBe('47');
  });
});
