/**
 * ORIGINAL decorative artwork for the landing page — six abstract compositions, one per feature.
 *
 * The hues are sampled from the organisation's own globe mark (orange/red/magenta/blue/teal) so
 * the cards read as one family with the hero. They are BRAND ARTWORK colours, not theme colours:
 * they appear only inside these aria-hidden SVGs, never as text or surface colours, so the
 * "no hardcoded hexes outside tokens.css" rule for the THEME is preserved — tokens govern
 * everything that must pass contrast; artwork is decoration and is announced to nobody.
 *
 * Strokes and grounds use `currentColor` at low opacity so each piece sits correctly on both
 * themes without a dark-mode variant.
 */

/** Sampled from bia-globe.png. Decorative fills only. */
const HUE = {
  orange: '#f08131',
  red: '#e23a46',
  magenta: '#a4286a',
  blue: '#4f6db3',
  teal: '#3fc1c9',
} as const;

const frame = 'h-full w-full';

/** Arcs converging on a destination node — the routing matrix. */
function RoutingArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <path d="M20 100 Q70 20 150 38" fill="none" stroke={HUE.orange} strokeWidth="5" strokeLinecap="round" />
      <path d="M14 66 Q80 52 148 46" fill="none" stroke={HUE.blue} strokeWidth="5" strokeLinecap="round" />
      <path d="M30 22 Q90 84 146 54" fill="none" stroke={HUE.teal} strokeWidth="5" strokeLinecap="round" />
      <circle cx="158" cy="46" r="13" fill={HUE.red} />
      <circle cx="20" cy="100" r="6" fill="currentColor" opacity="0.25" />
      <circle cx="14" cy="66" r="6" fill="currentColor" opacity="0.25" />
      <circle cx="30" cy="22" r="6" fill="currentColor" opacity="0.25" />
    </svg>
  );
}

/** A clock arc sweeping toward its target — the SLA engine. */
function SlaArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <circle cx="100" cy="62" r="44" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.15" />
      <path d="M100 18 A44 44 0 0 1 138 84" fill="none" stroke={HUE.orange} strokeWidth="7" strokeLinecap="round" />
      <path d="M138 84 A44 44 0 0 1 113 103" fill="none" stroke={HUE.red} strokeWidth="7" strokeLinecap="round" />
      <line x1="100" y1="62" x2="100" y2="34" stroke={HUE.blue} strokeWidth="5" strokeLinecap="round" />
      <line x1="100" y1="62" x2="121" y2="74" stroke={HUE.blue} strokeWidth="5" strokeLinecap="round" />
      <circle cx="100" cy="62" r="5" fill={HUE.blue} />
    </svg>
  );
}

/** Prioritised bars stacked into buckets — the department queue. */
function QueueArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <rect x="24" y="18" width="152" height="16" rx="8" fill={HUE.red} />
      <rect x="24" y="44" width="120" height="16" rx="8" fill={HUE.orange} />
      <rect x="24" y="70" width="132" height="16" rx="8" fill={HUE.blue} opacity="0.85" />
      <rect x="24" y="96" width="88" height="16" rx="8" fill={HUE.teal} opacity="0.85" />
    </svg>
  );
}

/** Tiles with one figure rising — the dashboard. */
function DashboardArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <rect x="18" y="16" width="76" height="40" rx="8" fill="currentColor" opacity="0.08" />
      <rect x="106" y="16" width="76" height="40" rx="8" fill="currentColor" opacity="0.08" />
      <rect x="18" y="64" width="76" height="40" rx="8" fill="currentColor" opacity="0.08" />
      <rect x="106" y="64" width="76" height="40" rx="8" fill={HUE.magenta} opacity="0.9" />
      <path d="M28 46 L48 32 L66 40 L86 24" fill="none" stroke={HUE.teal} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="132" cy="36" r="8" fill={HUE.orange} />
      <rect x="30" y="78" width="40" height="7" rx="3.5" fill={HUE.blue} />
      <rect x="30" y="90" width="26" height="7" rx="3.5" fill={HUE.blue} opacity="0.5" />
    </svg>
  );
}

/** A trend line over its baseline — reporting. */
function ReportsArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <line x1="20" y1="100" x2="180" y2="100" stroke="currentColor" strokeWidth="3" opacity="0.15" />
      <path d="M24 88 L60 70 L92 78 L128 46 L172 30" fill="none" stroke={HUE.blue} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="128" cy="46" r="7" fill={HUE.orange} />
      <circle cx="172" cy="30" r="7" fill={HUE.red} />
      <path d="M24 96 L60 86 L92 90 L128 72 L172 64" fill="none" stroke={HUE.teal} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
    </svg>
  );
}

/** Ledger lines under a seal — governance and audit. */
function GovernanceArt() {
  return (
    <svg viewBox="0 0 200 120" className={frame} aria-hidden focusable="false">
      <rect x="22" y="20" width="112" height="9" rx="4.5" fill="currentColor" opacity="0.2" />
      <rect x="22" y="40" width="132" height="9" rx="4.5" fill="currentColor" opacity="0.2" />
      <rect x="22" y="60" width="96" height="9" rx="4.5" fill="currentColor" opacity="0.2" />
      <rect x="22" y="80" width="120" height="9" rx="4.5" fill="currentColor" opacity="0.2" />
      <circle cx="158" cy="76" r="24" fill={HUE.magenta} />
      <path d="M147 76 L155 84 L170 66" fill="none" stroke="#faf9f5" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ART: Readonly<Record<string, () => React.JSX.Element>> = {
  routing: RoutingArt,
  sla: SlaArt,
  queues: QueueArt,
  dashboards: DashboardArt,
  reports: ReportsArt,
  governance: GovernanceArt,
};

/**
 * The single export is a COMPONENT (react-refresh/only-export-components: a file that mixes
 * component definitions with a plain record export cannot fast-refresh). Unknown ids render
 * nothing rather than throwing — artwork is decoration, and decoration must never take the
 * page down.
 */
export function FeatureArt({ id }: { readonly id: string }) {
  const Art = ART[id];
  return Art ? <Art /> : null;
}
