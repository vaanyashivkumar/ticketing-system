import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, X } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useMotionScope } from '@hooks/useMotion';
import { editorialIn, prefersReducedMotion, reveal, scrollReveal } from '@lib/motion';
import { CountUp } from '@components/common/CountUp';
import { LANDING, LANDING_FEATURES, type LandingFeature } from './landing.config';
import { FeatureArt } from './LandingArt';

/**
 * THE PUBLIC LANDING PAGE — the product's front door.
 *
 * It is built from the SAME design system as the app behind it (warm palette, the `.card`/`.btn-*`
 * vocabulary, Inter + Source Serif), so it reads as one product rather than a separate marketing
 * splash. Motion is deliberately RESTRAINED — a considered hero entrance and a fade-up as each
 * section scrolls into view — because an internal system's front door should feel composed and
 * corporate, not like a demo reel.
 *
 * Every animated element is visible in its resting DOM state (fromTo + immediateRender:false in
 * lib/motion.ts): with no JS, reduced motion, or the non-compositing preview pane, the page is
 * simply a readable, correctly-laid-out document.
 */

/** Mount-once-visible: defers CountUp so the numbers animate when SEEN, not at page load. */
function useInView<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const obs = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setSeen(true); },
      { rootMargin: '0px 0px -15% 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [seen]);
  return [ref, seen];
}

/**
 * A static, decorative snapshot of a ticket in the product's own visual language — the strongest
 * way to say "this is an enterprise workflow tool" is to show one. Purely presentational
 * (aria-hidden): it makes no claim about real data.
 */
function HeroPreview() {
  return (
    <div aria-hidden className="card p-5 shadow-e2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-caption text-text-muted">FIN-0142</span>
        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-label-sm text-warning-text">In Progress</span>
      </div>
      <h3 className="mt-2 text-h3 text-text">Payment link — May intake</h3>
      <p className="mt-1 text-body-sm text-text-secondary">Sales → Finance · High priority</p>

      <div className="mt-4">
        <div className="flex items-center justify-between text-caption">
          <span className="text-text-muted">SLA</span>
          <span className="text-success-text">On track · due in 6h</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div className="h-full w-[62%] rounded-full bg-success" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-tint text-label-sm text-accent-text">JC</span>
        <span className="text-body-sm text-text-secondary">Assigned to James Carrow · 3 comments</span>
      </div>
    </div>
  );
}

function FeatureDialog({ feature, onClose }: { feature: LandingFeature; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // A REAL modal dialog, same contract as the app shell's drawer: focus moves in, Tab cycles
  // within, Escape closes, and the opener gets focus back (the caller restores it).
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab') return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const scope = useMotionScope<HTMLDivElement>(
    (s) => { reveal(s.querySelector('[data-panel]'), { y: 14 }); },
    [feature.id],
  );

  return (
    <div ref={scope} className="fixed inset-0 z-backdrop flex items-center justify-center p-3 sm:p-6">
      <div onClick={onClose} aria-hidden className="absolute inset-0 bg-scrim" />
      <div
        ref={panelRef}
        data-panel
        role="dialog"
        aria-modal="true"
        aria-labelledby={`land-dlg-${feature.id}`}
        className="card relative flex max-h-full w-full max-w-2xl flex-col overflow-y-auto p-5 shadow-e3 sm:p-6"
      >
        <button type="button" onClick={onClose} aria-label="Close" className="btn-quiet absolute right-3 top-3 px-2">
          <X size={18} aria-hidden />
        </button>
        <div className="h-40 w-full max-w-sm text-text-muted sm:h-48">
          <FeatureArt id={feature.id} />
        </div>
        <h3 id={`land-dlg-${feature.id}`} className="mt-4 text-h2 text-text">{feature.title}</h3>
        {feature.detail.map((p) => (
          <p key={p.slice(0, 24)} className="mt-3 text-body text-text-secondary">{p}</p>
        ))}
      </div>
    </div>
  );
}

export function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [selected, setSelected] = useState<LandingFeature | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [statsRef, statsSeen] = useInView<HTMLDivElement>();

  // The nav grows a hairline once the page is genuinely scrolled — orientation, not decoration.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // All motion in ONE scoped context, so StrictMode's mount → cleanup → mount reverts cleanly.
  const scope = useMotionScope<HTMLDivElement>((s) => {
    const hero = s.querySelectorAll('[data-hero] > *');
    if (hero.length) editorialIn([...hero]);
    const cards = s.querySelectorAll('[data-card]');
    const grid = s.querySelector('[data-grid]');
    if (grid && cards.length) scrollReveal(cards, { trigger: grid, y: 20, amount: 0.4 });
    s.querySelectorAll('[data-rise]').forEach((el) => scrollReveal(el));
  }, []);

  const openDialog = useCallback((f: LandingFeature, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelected(f);
  }, []);

  const closeDialog = useCallback(() => {
    setSelected(null);
    openerRef.current?.focus();
    openerRef.current = null;
  }, []);

  // Smooth-scroll to an in-page section. This is an ACTION, so the control that triggers it is a
  // <button>, not an <a> — which also sidesteps anchor pseudo-state (:visited/:target) that made a
  // `.btn-neutral` anchor render an incorrect background in dark mode.
  const scrollToId = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  /**
   * There is exactly ONE sign-in control on this page, and it lives in the fixed header.
   *
   * The hero and the closing band each carried their own copy of it, so a visitor met the same
   * button three times on one screen — and the header's is pinned, so it is on screen the whole
   * way down regardless. Repeating a call to action that never leaves the viewport adds no reach,
   * it just splits the eye between three identical primaries. Do not reintroduce one here; the
   * page's only in-page action is "See what it does", which is a jump, not a destination.
   */

  return (
    <div ref={scope} className="min-h-screen overflow-x-clip bg-bg text-text">
      <header
        // NOT `bg-bg/95`: /opacity modifiers on bare-var() theme colours compile to nothing here.
        className={`fixed inset-x-0 top-0 z-sticky bg-bg transition-[border-color] duration-base ease-standard ${scrolled ? 'border-b border-border' : 'border-b border-transparent'}`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          {/* The organisation's full brand lockup (globe + wordmark) — the logo carries the name,
              so it is the accessible label. Explicit box at the lockup's 3.48:1 aspect so width is
              deterministic; a light chip in dark theme keeps the black wordmark legible. */}
          <img
            src={`${import.meta.env.BASE_URL}brand/bia-logo.png`}
            alt={LANDING.org}
            width="1400"
            height="402"
            className="h-[40px] w-[139px] object-contain object-left dark:rounded-md dark:bg-white dark:p-1.5"
          />
          <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Page sections">
            <a href="#features" className="btn-quiet px-3 text-body-sm">Capabilities</a>
            <a href="#how" className="btn-quiet px-3 text-body-sm">How it works</a>
          </nav>
          <span className="md:hidden ml-auto" />
          {user ? (
            <Link to="/app/dashboard" className="btn-primary">Open dashboard</Link>
          ) : (
            <Link to="/login" className="btn-primary">Sign in</Link>
          )}
        </div>
      </header>

      <main id="main-content">
        {/* HERO — copy on the left, a product snapshot on the right. Structured, not a splash. */}
        <section className="mx-auto w-full max-w-[1440px] px-4 pt-28 sm:px-6 sm:pt-32">
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div data-hero>
              <p className="text-label uppercase tracking-wide text-text-muted">{LANDING.product}</p>
              <h1 className="editorial mt-3 text-editorial-lg text-text">{LANDING.headline}</h1>
              <p className="mt-5 max-w-xl text-lede text-text-secondary">{LANDING.standfirst}</p>
              <div className="mt-7 flex flex-wrap items-center gap-2.5">
                <button type="button" onClick={() => scrollToId('features')} className="btn-neutral">
                  See what it does
                </button>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2">
                {LANDING.heroFacts.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-body-sm text-text-secondary">
                    <Check size={15} className="shrink-0 text-success-text" aria-hidden /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="mx-auto w-full max-w-md lg:mx-0">
              <HeroPreview />
            </div>
          </div>
        </section>

        {/* METRICS — authoritative Constitution counts, counting up once the band is seen. */}
        <section aria-label="System at a glance" className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14">
          <div ref={statsRef} data-rise className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-4 sm:p-8">
            {LANDING.stats.map((s, i) => (
              <div key={s.label}>
                <div className="text-display text-text">
                  {statsSeen ? <CountUp value={s.value} delay={i * 0.08} /> : s.value}
                </div>
                <div className="mt-1 text-body-sm text-text-secondary">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS — the happy-path journey as a numbered strip. */}
        <section id="how" aria-labelledby="how-h" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
          <div data-rise>
            <p className="text-label uppercase tracking-wide text-text-muted">The journey</p>
            <h2 id="how-h" className="editorial mt-2 text-editorial-md text-text">How a request moves</h2>
          </div>
          <ol data-rise className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {LANDING.lifecycle.map((s, i) => (
              <li key={s.step} className="relative">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-label text-primary-on">
                  {i + 1}
                </span>
                {/*
                  Connector between consecutive steps. Purely decorative — the <ol> already says
                  these are ordered, and each step is numbered, so this is aria-hidden and adds no
                  reading noise.

                  `lg:block` ONLY, and that is the whole trick: it is the sole breakpoint where the
                  five steps sit in one row, so "points at the next step" is true. At sm the grid is
                  two columns, where items 2 and 4 end a row and their arrow would point off the
                  edge at nothing; stacked on mobile a rightward arrow means nothing at all.

                  Anchored to `top-4` = 32px under the 8-point remap, which is exactly half of the
                  circle's `h-8` = 64px, so it floats on the circles' centre line rather than the
                  text below.

                  Horizontally it lands on the true midpoint BETWEEN two circle centres, and the
                  `+56px` is derived, not tuned: each circle sits at its column's LEFT edge, so
                  anchoring to the column's right edge leans every arrow toward the next number
                  (measured 42px off, and worse at wider viewports because the error scales with
                  column width). Midpoint-from-column-left is `32 + (colWidth + gap)/2`, which
                  rearranges to `colWidth/2 + (32 + gap/2)` — so `50%` carries the column-width
                  half and the remainder is the CONSTANT 56px: half the 64px circle plus half the
                  48px gutter. Layout-independent, so it holds at every width the row survives.
                */}
                {i < LANDING.lifecycle.length - 1 && (
                  <ArrowRight
                    size={22}
                    aria-hidden
                    className="pointer-events-none absolute left-[calc(50%_+_56px)] top-4 hidden -translate-x-1/2 -translate-y-1/2 text-text-muted lg:block"
                  />
                )}
                <h3 className="mt-3 text-body-medium text-text">{s.step}</h3>
                <p className="mt-1 text-body-sm text-text-secondary">{s.note}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CAPABILITIES — a titled section, then cards that enlarge into detail on click. */}
        <section id="features" aria-labelledby="features-h" className="mx-auto w-full max-w-[1440px] px-4 py-10 sm:px-6 sm:py-14">
          <div data-rise className="max-w-2xl">
            <p className="text-label uppercase tracking-wide text-text-muted">{LANDING.featuresKicker}</p>
            <h2 id="features-h" className="editorial mt-2 text-editorial-md text-text">{LANDING.featuresHeading}</h2>
            <p className="mt-3 text-body text-text-secondary">{LANDING.featuresSubhead}</p>
          </div>
          <div data-grid className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LANDING_FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                data-card
                onClick={(e) => openDialog(f, e.currentTarget)}
                className="card card-interactive p-5 text-left"
              >
                <div className="h-32 w-full text-text-muted">
                  <FeatureArt id={f.id} />
                </div>
                <h3 className="mt-4 text-h3 text-text">{f.title}</h3>
                <p className="mt-1.5 text-body-sm text-text-secondary">{f.blurb}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-body-sm text-primary-text">
                  Read more <ArrowRight size={14} aria-hidden />
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* CLOSING CTA — a branded band; the globe lives here, contained, not dominating. */}
        <section className="mx-auto w-full max-w-[1440px] px-4 pb-16 sm:px-6">
          <div data-rise className="card relative overflow-hidden bg-surface-sunken p-8 sm:p-10">
            <div className="relative z-base max-w-xl">
              {/* No button here by design — the header's sign-in is pinned and still on screen.
                  The copy points at it rather than duplicating it. */}
              <h2 className="editorial text-editorial-md text-text">{LANDING.ctaHeading}</h2>
              <p className="mt-3 text-body text-text-secondary">{LANDING.ctaBody}</p>
            </div>
            <img
              src={`${import.meta.env.BASE_URL}brand/bia-globe.png`}
              alt=""
              aria-hidden
              width="1200"
              height="1148"
              className="pointer-events-none absolute -right-10 -top-8 hidden w-72 opacity-90 sm:block"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-3 px-4 py-8 sm:px-6">
          <img
            src={`${import.meta.env.BASE_URL}brand/bia-logo.png`}
            alt={LANDING.org}
            width="1400"
            height="402"
            className="h-[30px] w-[104px] object-contain object-left dark:rounded-md dark:bg-white dark:p-1"
          />
          <span className="ml-auto text-caption text-text-muted">Internal system · authorised users only</span>
        </div>
      </footer>

      {selected && <FeatureDialog feature={selected} onClose={closeDialog} />}
    </div>
  );
}
