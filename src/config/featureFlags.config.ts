/**
 * Centralised feature flags (P15 §13) — never scattered through the app.
 *
 * THIS MODULE HAS NO IMPORTS, AND MUST KEEP NONE. It is read by the API server, which enforces
 * the `implemented` rule below server-side (`routes/config.ts`). It was extracted from
 * `org.config.ts` for exactly that reason: that module exports `APP_VERSION = __APP_VERSION__`, a
 * Vite build-time define, which does not exist in a Node process and made the whole file
 * unimportable across the repo boundary. `org.config.ts` re-exports everything here, so every
 * existing import keeps working. Same rule and same reason as `notifications.config.ts`.
 *
 * `implemented` is the honesty field (D04 #39). A flag whose feature does not exist is not a
 * flag — it is a roadmap item, and letting an administrator "enable" it would be pure theatre:
 * the toggle would flip, an audit entry and a version row would be written, and NOTHING would
 * change. Both `ConfigService` and now the API refuse to enable a flag with
 * `implemented: false`, so the registry can document intent without lying about capability.
 *
 * Every flag below is currently `implemented: false` — verified: there is no email delivery, no
 * push, no ERP client and no AI in this codebase, and no component reads any flag. (A scheduler
 * DOES now exist in the API for auto-close, but `scheduledReports` means scheduled report
 * DELIVERY, which needs an email channel that does not.)
 * When a capability lands, flip its `implemented` to true in the same change.
 */
export interface FeatureFlag {
  readonly key: string;
  readonly description: string;
  readonly defaultState: boolean;
  readonly modules: readonly string[];
  /** Does the gated capability actually exist in this build? */
  readonly implemented: boolean;
}

export const FEATURE_FLAGS: readonly FeatureFlag[] = [
  { key: 'emailNotifications', description: 'Deliver notifications by email', defaultState: false, modules: ['Notifications'], implemented: false },
  { key: 'pushNotifications', description: 'Mobile push notifications', defaultState: false, modules: ['Notifications'], implemented: false },
  { key: 'scheduledReports', description: 'Scheduled report delivery', defaultState: false, modules: ['Reports'], implemented: false },
  { key: 'erpIntegration', description: 'Finance ERP integration', defaultState: false, modules: ['Tickets', 'Reports'], implemented: false },
  { key: 'aiAssistant', description: 'AI triage assistant', defaultState: false, modules: ['Tickets'], implemented: false },
];

export const featureFlagByKey = (key: string): FeatureFlag | undefined => FEATURE_FLAGS.find((f) => f.key === key);
