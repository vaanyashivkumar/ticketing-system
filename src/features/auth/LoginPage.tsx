import { useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { MOCK_USERS } from '@config/mockUsers.config';
import { UserService } from '@services/userService';
import { DEPARTMENTS } from '@config/departments.config';
import { useAuth } from '@hooks/useAuth';
import { useAuthStore } from '@stores/authStore';
import { USE_API } from '@config/runtime.config';
import { InlineError } from '@components/common/InlineError';
import { useMotionScope } from '@hooks/useMotion';
import { editorialIn, reveal } from '@lib/motion';

/**
 * Sign-in (P12 §2/§3).
 *
 * TWO GENUINELY DIFFERENT SIGN-INS, chosen by whether a backend is configured:
 *
 *   API mode       — real credential verification. Email + password, checked with bcrypt against
 *                    the server, which returns a revocable bearer token.
 *   Prototype mode — selecting a seeded identity IS the sign-in. No password exists.
 *
 * These are not two skins on one flow. The mock is identity SELECTION and the API is credential
 * VERIFICATION, so they get separate UI rather than a password box that is sometimes ignored — an
 * input that does nothing is worse than no input, because it implies a check that is not happening.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCREEN IS THE ONLY EDITORIAL ONE.
 *
 * It is the single surface in the product where the reader has nothing to do but read. Everywhere
 * else somebody is trying to reach a ticket, and a serif headline or a staged animation is
 * something standing between them and their work. So the display face, the composed entrance and
 * the wide measure all live here and stop here — a boundary, not an oversight.
 *
 * The left panel is `aria-hidden`: it is atmosphere and a restatement of what the sign-in form
 * already says. Announcing six department names and a strapline before reaching the email field
 * would make this screen materially slower for a screen-reader user in exchange for nothing.
 */
export function LoginPage() {
  const { login } = useAuth();
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? '/app/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const headline = useRef<HTMLHeadingElement>(null);
  const lede = useRef<HTMLParagraphElement>(null);
  const marks = useRef<HTMLDListElement>(null);

  /** The composed entrance: headline, then standfirst, then the department list. */
  const panel = useMotionScope<HTMLDivElement>(() => {
    editorialIn([headline.current, lede.current, marks.current]);
  }, []);

  /** The form arrives with it, a beat later — it is the thing being introduced. */
  const formSide = useMotionScope<HTMLDivElement>((scope) => {
    reveal(scope, { delay: 0.12, y: 12 });
  }, []);

  const handleLogin = async (userId: string) => {
    if (await login(userId)) navigate(returnTo, { replace: true });
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await loginWithPassword(email.trim(), password);
    setBusy(false);
    if (r.ok) navigate(returnTo, { replace: true });
    // One message for every failure — the server does not distinguish unknown-email from
    // wrong-password, and neither should this, or it becomes an account-enumeration oracle.
    else setError(r.error ?? 'Email or password is incorrect.');
  };

  const departments = Object.values(DEPARTMENTS);

  return (
    // `main`, not `div` (A11Y-005): outside AppShell there is no landmark, so the heading and the
    // form would sit outside any region — a screen-reader user navigating by landmark would find
    // nothing on the one page everyone has to pass through.
    <main className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-[1.05fr_1fr]">
      {/* ---- Editorial panel ------------------------------------------------ */}
      <div
        ref={panel}
        aria-hidden
        /*
          NOT `justify-between`. With three children — logo, editorial block, build note — that
          spread them across the whole panel height, so on a tall viewport the headline floated far
          below the logo with a large dead band between them (stakeholder, 2026-08-04). The logo and
          the words it introduces belong together; only the build note wants the bottom, and it asks
          for that itself with `mt-auto`.
        */
        className="relative hidden overflow-hidden bg-surface-sunken px-10 py-12 lg:flex lg:flex-col xl:px-16"
      >
        {/*
          Atmosphere, in two layers and no more. A fine grid at 3% opacity reads as paper texture
          rather than as a pattern, and a single soft radial lifts the top-left so the panel is not
          a flat field. Both are CSS gradients: no image request, no canvas, nothing to animate on
          a loop behind a form somebody is trying to fill in.
        */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'linear-gradient(var(--color-text) 1px, transparent 1px), linear-gradient(90deg, var(--color-text) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[28rem] w-[28rem] rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, var(--color-accent-tint), transparent 70%)' }}
        />

        <div className="relative">
          {/* The organisation's FULL brand lockup (globe + wordmark). Transparent PNG, so it sits
              cleanly on the light panel; in dark theme the black wordmark needs a light chip. */}
          <img
            src={`${import.meta.env.BASE_URL}brand/bia-logo.png`}
            alt="Bradford International Alliance"
            width="1400"
            height="402"
            /* Explicit box at the lockup's 3.48:1 aspect (195×56) so width is deterministic. */
            className="h-[56px] w-[195px] object-contain object-left dark:rounded-lg dark:bg-white dark:p-2"
          />
        </div>

        {/* `mt-8` is 64px under the 8-point remap — a deliberate editorial gap under the lockup,
            not the accident that `justify-between` was producing. */}
        <div className="relative mt-8 max-w-xl">
          {/* The product name is the hero of this panel now — moved out of the small brand line
              and up to display size (stakeholder request, 2026-07-28). */}
          <h2 ref={headline} className="editorial text-editorial-xl text-text">
            Inter-Departmental Ticketing
          </h2>
          <p ref={lede} className="mt-5 max-w-md text-lede text-text-secondary">
            Every request, on the record — one route from the department that asks to the
            department that answers, with the deadline, the decision and the person accountable
            for it kept together.
          </p>

          <dl ref={marks} className="mt-10 grid max-w-md grid-cols-2 gap-x-8 gap-y-4">
            {departments.map((d) => (
              <div key={d.code} className="border-t border-border pt-3">
                <dt className="text-body-medium text-text">{d.name}</dt>
                <dd className="mt-0.5 text-caption text-text-muted">
                  {d.isDestination ? 'Receives requests' : 'Raises requests'}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* `mt-auto` keeps this on the floor of the panel now that the group above no longer
            stretches — the one element that genuinely wants to be last. */}
        <p className="relative mt-auto pt-6 text-caption text-text-muted">
          {USE_API
            ? 'Connected to the API · credentials verified server-side'
            : 'Prototype build · authentication is mocked'}
        </p>
      </div>

      {/* ---- Sign-in ---------------------------------------------------------- */}
      <div ref={formSide} className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/* The identity mark repeats here because on narrow screens the panel is not rendered
              at all, and the page would otherwise open with a bare input. */}
          <div className="mb-8 lg:hidden">
            <img
              src={`${import.meta.env.BASE_URL}brand/bia-logo.png`}
              alt="Bradford International Alliance"
              width="1400"
              height="402"
              className="h-10 w-[139px] object-contain object-left dark:rounded-lg dark:bg-white dark:p-1.5"
            />
          </div>

          <h1 className="text-h1 text-text">Sign in</h1>
          <p className="mt-1.5 text-body text-text-secondary">
            {USE_API
              ? 'Use your organisation email and password.'
              : 'Choose an identity to continue. This prototype has no passwords.'}
          </p>

          {USE_API && (
            <form onSubmit={handlePasswordLogin} className="mt-7">
              <InlineError message={error} className="mb-4" />

              <label htmlFor="login-email" className="mb-1.5 block text-label text-text">
                Email<span className="text-error" aria-hidden> *</span><span className="sr-only"> (required)</span>
              </label>
              <input
                id="login-email" type="email" autoComplete="username" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                aria-required aria-invalid={error ? true : undefined}
                className="input mb-4" placeholder="name@example.com"
              />

              <label htmlFor="login-password" className="mb-1.5 block text-label text-text">
                Password<span className="text-error" aria-hidden> *</span><span className="sr-only"> (required)</span>
              </label>
              <input
                id="login-password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                aria-required aria-invalid={error ? true : undefined}
                className="input mb-6"
              />

              <button
                type="submit" disabled={busy}
                className="group inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-body-medium text-primary-on transition-[background-color,transform] duration-fast ease-standard hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              >
                {busy ? (
                  <>
                    {/* The only looping animation in the application, and it stops on its own. */}
                    <Loader2 size={16} className="motion-safe:animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight
                      size={16}
                      className="transition-transform duration-base ease-standard group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </>
                )}
              </button>
            </form>
          )}

          {!USE_API && (
            <div className="mt-7 overflow-hidden rounded-lg border border-border bg-surface shadow-e1">
              <ul className="divide-y divide-border">
                {MOCK_USERS.map((u) => {
                  const dept = DEPARTMENTS[u.departmentCode];
                  const isSysadmin = u.role.capabilities.includes('SUPER_ADMIN');
                  // A deactivated account cannot sign in (D04 #36). Shown, but disabled — so the
                  // administrative action is visibly in force rather than silently ignored.
                  const active = UserService.isActive(u.id);
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        disabled={!active}
                        onClick={() => { void handleLogin(u.id); }}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-fast ease-standard hover:bg-row-hover focus-visible:bg-row-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-label text-accent-text">
                          {u.avatarInitials}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-body-medium text-text">
                            {u.name}
                            {isSysadmin && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-1.5 py-0.5 text-label-sm text-info-text">
                                <ShieldCheck size={11} aria-hidden /> Sysadmin
                              </span>
                            )}
                            {!active && (
                              <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-label-sm text-text-secondary">
                                Deactivated
                              </span>
                            )}
                          </span>
                          <span className="block text-caption text-text-muted">
                            {dept.name}
                            {dept.isDestination ? ' · receives tickets' : ' · raises tickets'}
                          </span>
                        </span>
                        {active && (
                          <ArrowRight
                            size={16}
                            className="shrink-0 text-text-muted transition-transform duration-base ease-standard group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <hr className="rule-fade my-7" />

          {/* The honest disclosure, kept verbatim in substance — what is real and what is mocked. */}
          <p className="text-caption text-text-muted">
            {USE_API
              ? 'Connected to the API · real credential verification · sessions are revocable server-side.'
              : 'Frontend-only prototype · sessions persist in localStorage · authentication is mocked.'}
          </p>
        </div>
      </div>
    </main>
  );
}
