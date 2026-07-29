import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { Sidebar } from '@components/shell/Sidebar';
import { Header } from '@components/shell/Header';
import { Breadcrumbs } from '@components/shell/Breadcrumbs';
import { ErrorBoundary } from '@providers/ErrorBoundary';
import { useMotionScope } from '@hooks/useMotion';
import { reveal } from '@lib/motion';
import { StorageAdapter } from '@services/storage/localStorageAdapter';

/** Matches --duration-slow (320ms) so the unmount waits for the exit transition. */
const DRAWER_MS = 320;

/**
 * The permanent authenticated application shell (P11 §4/§5).
 *
 * RESPONSIVE (phase-2 §7 / P09 §5): the sidebar is a fixed rail at ≥lg and collapses to an
 * overlay DRAWER below lg — without this the 256px rail consumed a mobile viewport and
 * pushed the header actions off-screen (defect QA-001, P17 §7).
 *
 * The drawer is a REAL modal dialog (defect D04 #22): it declared `aria-modal="true"` while
 * trapping nothing, so a keyboard or screen-reader user could Tab straight past it into the page
 * it claimed to block. It now moves focus in, cycles focus within itself, and restores focus to
 * the trigger on close. `aria-modal` is a promise; this is the code that keeps it.
 *
 * It also slides (D05 MOT-002): a full-height overlay appearing instantly gives no clue where it
 * came from. Motion here is orientation, not decoration — and `prefers-reduced-motion` collapses
 * it to ~0ms via the global guard in globals.css.
 */
export function AuthenticatedLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const [mounted, setMounted] = useState(false); // in the DOM (covers the exit transition)
  const [shown, setShown] = useState(false); // slid into view
  // Desktop rail collapse — a persisted UI preference, so it survives navigation and reloads.
  const [collapsed, setCollapsed] = useState<boolean>(() => StorageAdapter.read<boolean>('sidebarCollapsed') ?? false);
  const location = useLocation();

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      StorageAdapter.write('sidebarCollapsed', next);
      return next;
    });
  }, []);

  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setNavOpen(false), []);

  /**
   * ROUTE TRANSITION — the content area re-enters on every navigation.
   *
   * Keyed on `pathname`, so it replays per route. Deliberately ENTER-ONLY: an exit animation would
   * mean the old page lingering while the new one is already available, which is latency the user
   * pays for a flourish they did not ask for. React has also already unmounted the previous route
   * by the time this runs, so there is nothing left to animate out without holding it artificially.
   *
   * 6px and one `--duration-base`. On a screen someone opens forty times a day, the job is to say
   * "this is a different page" and then get out of the way.
   */
  const content = useMotionScope<HTMLDivElement>(
    (scope) => { reveal(scope, { y: 6 }); },
    [location.pathname],
  );

  // Close on navigation.
  useEffect(() => setNavOpen(false), [location.pathname]);

  // Mount → next frame → slide in. On close, slide out first, then unmount.
  useEffect(() => {
    if (navOpen) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(raf);
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DRAWER_MS);
    return () => clearTimeout(t);
  }, [navOpen]);

  // Remember what opened the drawer so focus can go home afterwards.
  useEffect(() => {
    if (navOpen) triggerRef.current = document.activeElement as HTMLElement | null;
  }, [navOpen]);

  // Move focus INTO the dialog once it is mounted.
  useEffect(() => {
    if (!mounted) return;
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [mounted]);

  // Restore focus to the trigger when the dialog goes away.
  useEffect(() => {
    if (mounted) return;
    triggerRef.current?.focus();
    triggerRef.current = null;
  }, [mounted]);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return close();
      if (e.key !== 'Tab') return;

      const focusables = drawerRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;

      // Wrap at both ends — this is what makes aria-modal true rather than aspirational.
      if (e.shiftKey && (active === first || !drawerRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen, close]);

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop rail — collapsible to an icon strip. */}
      <div className="hidden lg:flex">
        <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      </div>

      {/* Mobile / tablet drawer */}
      {mounted && (
        <div className="fixed inset-0 z-backdrop lg:hidden">
          <div
            onClick={close}
            aria-hidden
            className={`absolute inset-0 bg-scrim transition-opacity duration-slow ease-standard ${shown ? 'opacity-100' : 'opacity-0'}`}
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={`absolute inset-y-0 left-0 flex transition-transform duration-slow ease-standard ${shown ? 'translate-x-0' : '-translate-x-full'}`}
          >
            <Sidebar onNavigate={close} />
            <button
              type="button"
              onClick={close}
              aria-label="Close navigation"
              className="m-2 h-9 w-9 rounded-md bg-surface text-text-secondary shadow-e2 hover:bg-surface-sunken"
            >
              <X size={18} className="mx-auto" aria-hidden />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenuClick={() => setNavOpen(true)} />
        <main id="main-content" className="flex-1 overflow-y-auto" tabIndex={-1}>
          <div ref={content} className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6 sm:py-6">
            {/* IA §262: breadcrumbs sit top-left of the CONTENT area, not in the top bar.
                Rendered here once, so no feature page declares its own trail (IA §9). */}
            <Breadcrumbs />
            <ErrorBoundary boundaryName="content">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
