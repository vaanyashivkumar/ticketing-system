/**
 * Runtime data-source configuration.
 *
 * THE SPA CAN RUN AGAINST EITHER the real API or its original `localStorage` prototype store,
 * chosen at build time by whether `VITE_API_URL` is set:
 *
 *   VITE_API_URL=http://localhost:4000   -> real backend: real auth, server-side authorisation
 *   (unset)                              -> the localStorage prototype, exactly as before
 *
 * WHY A FLAG RATHER THAN A CLEAN CUT. There is no version control on this project (recorded as
 * the top risk in D08 §9, G01 and D11), so a big-bang rewrite of every service would be
 * irreversible — there would be no way back to a working app if the wiring proved wrong. The flag
 * makes the change reversible by configuration instead of by `git revert`, which is the only
 * revert mechanism available here.
 *
 * It is also honest about a real behavioural difference: in API mode sign-in requires a PASSWORD,
 * because the backend does real credential verification. The mock identity-picker is not a
 * degraded version of that — it is a different thing, and the two cannot silently share a screen.
 */
const rawBase = import.meta.env.VITE_API_URL as string | undefined;

/** Trailing slashes would produce `//tickets` when joined with a path. */
export const API_BASE_URL = rawBase?.replace(/\/+$/, '') ?? '';

/** True when the app should talk to the backend instead of localStorage. */
export const USE_API = API_BASE_URL.length > 0;

/** Where the bearer token lives. Namespaced like every other `tps.` key. */
export const TOKEN_STORAGE_KEY = 'tps.apiToken';
