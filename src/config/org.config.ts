/**
 * Organisation settings + feature flags as configuration (P15 §9/§13/§15).
 * Isolated from feature logic; the Administration module edits these and the change is
 * versioned + audited. Multi-organisation (§18) is NOT implemented — but nothing here is
 * global-singleton-shaped in a way that would prevent an orgId being added later.
 */
export interface OrgConfig {
  readonly name: string;
  readonly timezone: string;
  readonly workingDays: readonly number[]; // 1 = Mon … 5 = Fri
  readonly workingHours: { readonly start: number; readonly end: number };
  readonly currency: string;
  readonly defaultTheme: 'light' | 'dark';
  /**
   * ISO dates (YYYY-MM-DD) excluded from business time. Applied by the SLA engine via
   * `calendarOf()` (defect CFG-001 — previously reserved and unread, along with workingDays and
   * workingHours). `timezone` remains the one field the engine still does NOT honour: it uses
   * the host machine's local zone. See slaEngine's BusinessCalendar note.
   */
  readonly holidays: readonly string[];
}

export const DEFAULT_ORG_CONFIG: OrgConfig = {
  name: 'Example Education Group',
  timezone: 'Europe/London',
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: 9, end: 18 },
  currency: 'GBP',
  defaultTheme: 'light',
  holidays: [],
};

/**
 * Feature flags moved to their own module and are RE-EXPORTED here, so every existing import is
 * unchanged. They had to leave this file because `APP_VERSION` below is `__APP_VERSION__`, a Vite
 * build-time define — which meant the API could not import this module to enforce the
 * `implemented` rule server-side without the whole file failing to compile in Node.
 */
export type { FeatureFlag } from './featureFlags.config';
export { FEATURE_FLAGS, featureFlagByKey } from './featureFlags.config';

/**
 * The running build's version, injected from package.json at build time (vite `define`) —
 * package.json is the SINGLE SOURCE (P18 §8). Previously a second hand-maintained literal
 * that had already drifted from the manifest (0.4.0-prototype vs 0.1.0).
 *
 * Surfaced in the sidebar footer so support can ask "what version are you on?" and get an
 * answer. (The System Health panel referenced by the earlier comment here was never built.)
 */
export const APP_VERSION = __APP_VERSION__;
