import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { useMotionScope } from '@hooks/useMotion';
import { editorialIn, prefersReducedMotion, reveal, scrollReveal, scrollScale } from '@lib/motion';
import { CountUp } from '@components/common/CountUp';
import { LANDING, LANDING_FEATURES, type LandingFeature } from './landing.config';
import { FeatureArt } from './LandingArt';

/**
 * THE PUBLIC LANDING PAGE — the one screen in the product with marketing-grade, scroll-driven
 * motion, and the deliberate boundary stays exactly there (see `editorialIn` in lib/motion.ts).
 *
 * The motion language is Anthropic-INSPIRED, which per the project's binding rule means craft
 * only — scroll-scrubbed hero growth, staggered word reveals, cards enlarging into detail —
 * with the organisation's OWN mark, original copy and original artwork. Nothing here reproduces
 * another site's content or brand.
 *
 * Every animated element is visible in its resting DOM state: if GSAP never runs (reduced
 * motion, blocked bundle), the page is simply a readable document. The globe runway degrades to
 * a static centred image; `overflow-x-clip` (clip, not hidden — hidden would break the sticky
 * positioning) guarantees the scaled globe can never mint a horizontal scrollbar, which would
 * undo the shared-left-edge alignment work.
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

function FeatureDialog({ feature, onClose }: { feature: LandingFeature; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  // The enlarged view is a REAL modal dialog, same contract as the app shell's drawer: focus
  // moves in, Tab cycles within, Escape closes, and the opener gets focus back (the caller
  // restores it — see `closeDialog`).
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="btn-quiet absolute right-3 top-3 px-2"
        >
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
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const [statsRef, statsSeen] = useInView<HTMLDivElement>();

  // The nav grows a border once the page is genuinely scrolled — orientation, not decoration.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /**
   * All scroll-driven motion lives in ONE scoped context, so StrictMode's mount → cleanup →
   * mount cycle reverts every trigger it created and nothing leaks between mounts.
   */
  const scope = useMotionScope<HTMLDivElement>((s) => {
    const hero = s.querySelectorAll('[data-hero] > *');
    if (hero.length) editorialIn([...hero]);

    const runway = s.querySelector('[data-runway]');
    const globe = s.querySelector('[data-globe]');
    if (runway && globe) scrollScale(globe, { trigger: runway });

    const words = s.querySelectorAll('[data-word]');
    if (words.length && taglineRef.current) {
      scrollReveal(words, { trigger: taglineRef.current, y: 26, amount: 0.5 });
    }

    const grid = s.querySelector('[data-grid]');
    const cards = s.querySelectorAll('[data-card]');
    if (grid && cards.length) scrollReveal(cards, { trigger: grid, y: 22, amount: 0.4 });

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

  const learnMore = useCallback(() => {
    taglineRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  }, []);

  return (
    <div ref={scope} className="min-h-screen overflow-x-clip bg-bg text-text">
      <header
        // NOT `bg-bg/95`: /opacity modifiers on bare-var() theme colours compile to nothing here.
        className={`fixed inset-x-0 top-0 z-sticky bg-bg transition-[border-color] duration-base ease-standard ${scrolled ? 'border-b border-border' : 'border-b border-transparent'}`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-2.5 px-4 sm:px-6">
          {/* REMAPPED SCALE: h-5 is 40px here (8-point tokens), not 20px. */}
          <img src={`${import.meta.env.BASE_URL}brand/bia-globe.png`} alt="" width="1200" height="1148" className="h-5 w-5 object-contain" />
          <span className="text-body-medium text-text">{LANDING.org}</span>
          <span className="ml-auto" />
          {user ? (
            <Link to="/app/dashboard" className="btn-primary">Open dashboard</Link>
          ) : (
            <Link to="/login" className="btn-primary">Sign in</Link>
          )}
        </div>
      </header>

      <main id="main-content">
        {/* HERO — the editorial entrance, then the globe runway it hands over to. */}
        <section className="mx-auto w-full max-w-[1440px] px-4 pt-28 sm:px-6 sm:pt-32">
          <div data-hero className="max-w-3xl">
            <p className="text-label uppercase tracking-wide text-text-muted">{LANDING.product}</p>
            <h1 className="editorial mt-3 text-editorial-xl text-text">{LANDING.headline}</h1>
            <p className="mt-5 max-w-2xl text-lede text-text-secondary">{LANDING.standfirst}</p>
            <div className="mt-7 flex flex-wrap items-center gap-2.5">
              {user ? (
                <Link to="/app/dashboard" className="btn-primary">Open dashboard</Link>
              ) : (
                <Link to="/login" className="btn-primary">
                  Sign in <ArrowRight size={16} aria-hidden />
                </Link>
              )}
              <button type="button" onClick={learnMore} className="btn-neutral">Learn more</button>
            </div>
          </div>
        </section>

        {/*
          THE GLOBE RUNWAY. A two-screen scroll distance with the mark stuck at the centre of
          the viewport, growing as the reader scrolls through — the growth is driven by the
          scrollbar (scrub), so it is something the reader does, not something they wait for.
          At rest (reduced motion, no JS) it is simply a centred image.
        */}
        <div data-runway className="relative h-[200vh]">
          <div className="sticky top-0 flex h-screen items-center justify-center">
            <img
              data-globe
              src={`${import.meta.env.BASE_URL}brand/bia-globe.png`}
              alt={`${LANDING.org} globe mark`}
              width="1200"
              height="1148"
              className="w-[min(56vw,540px)]"
            />
          </div>
        </div>

        {/* THE TAGLINE — arrives word by word as it scrolls into view. Assistive technology
            reads the sr-only sentence; the per-word spans are presentation only. NOT aria-label
            on the <p>: that attribute is prohibited on paragraph roles (axe aria-prohibited-attr,
            found live on this very element). */}
        <section className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6">
          <p ref={taglineRef} className="editorial max-w-4xl text-editorial-lg text-text">
            <span className="sr-only">{LANDING.tagline}</span>
            {LANDING.tagline.split(' ').map((w, i) => (
              // Keyed by position: a static sentence's word order IS its identity.
              <span key={`${i}-${w}`} aria-hidden className="inline-block whitespace-pre" data-word>
                {w}{' '}
              </span>
            ))}
          </p>
          <div data-rise className="rule-fade mt-8" />
        </section>

        {/* FEATURES — pictures that arrive on scroll and enlarge into detail on click. */}
        <section aria-labelledby="land-features" className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6">
          <h2 id="land-features" className="sr-only">What the system does</h2>
          <div data-grid className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* THE NUMBERS — authoritative counts from the Business Constitution, counting up only
            once actually seen (CountUp mounts when the band enters the viewport). */}
        <section aria-label="System facts" className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6">
          <div ref={statsRef} data-rise className="card grid grid-cols-2 gap-6 p-6 sm:grid-cols-4">
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

        <section className="mx-auto w-full max-w-[1440px] px-4 py-8 sm:px-6">
          <div data-rise className="max-w-2xl">
            <h2 className="editorial text-editorial-md text-text">Ready when you are.</h2>
            <p className="mt-3 text-body text-text-secondary">
              Sign in with your departmental account to raise a request or work your queue.
            </p>
            <div className="mt-5">
              {user ? (
                <Link to="/app/dashboard" className="btn-primary">Open dashboard</Link>
              ) : (
                <Link to="/login" className="btn-primary">
                  Sign in <ArrowRight size={16} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-2.5 px-4 py-6 text-caption text-text-muted sm:px-6">
          <img src={`${import.meta.env.BASE_URL}brand/bia-globe.png`} alt="" width="1200" height="1148" className="h-3 w-3 object-contain" />
          <span>{LANDING.org} — internal system. Authorised users only.</span>
        </div>
      </footer>

      {selected && <FeatureDialog feature={selected} onClose={closeDialog} />}
    </div>
  );
}
