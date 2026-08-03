/**
 * LANDING PAGE CONTENT (config-first — the page renders this, it does not restate it).
 *
 * Every number here is an AUTHORITATIVE COUNT from the Business Constitution §2.3/§2.4 — not
 * marketing rounding. If the routing matrix is ever extended (the one change §2.3 permits),
 * these figures change here and nowhere else.
 *
 * All copy is ORIGINAL. The page's visual language is the product's own — the warm palette,
 * component vocabulary and typography of the app itself — so the front door reads as part of the
 * system, not a separate marketing splash. The only brand present is the user's own organisation,
 * Bradford International Alliance.
 */

export interface LandingFeature {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  /** Shown only in the enlarged detail view. */
  readonly detail: readonly string[];
}

export interface LifecycleStep {
  readonly step: string;
  readonly note: string;
}

export const LANDING = {
  org: 'Bradford International Alliance',
  product: 'Inter-Departmental Ticketing',
  headline: 'Every request. One clear path.',
  standfirst:
    'The internal ticketing system for Bradford International Alliance routes work between ' +
    'departments with an owner, a deadline and a full history on every request — so nothing is ' +
    'lost, duplicated or quietly forgotten.',
  /** Short proof points shown inline under the hero CTAs. */
  heroFacts: ['6 departments', '14 routes', 'Governed SLAs', 'Full audit trail'],
  stats: [
    { value: 6, label: 'departments' },
    { value: 14, label: 'routes between them' },
    { value: 28, label: 'request categories' },
    { value: 10, label: 'lifecycle statuses' },
  ],
  /** The happy-path journey, for the "How it works" strip. Rejections, holds and reopens exist too. */
  lifecycle: [
    { step: 'Submit', note: 'A requester raises it against the correct route.' },
    { step: 'Assign', note: 'The destination department takes ownership.' },
    { step: 'In progress', note: 'Worked against a live, priority-based SLA clock.' },
    { step: 'Resolve', note: 'Marked done by the people who did the work.' },
    { step: 'Close', note: 'The original requester confirms it — a two-step close.' },
  ] as readonly LifecycleStep[],
  featuresKicker: 'Capabilities',
  featuresHeading: 'Built so nothing falls through',
  featuresSubhead:
    'Every request carries an owner, a deadline and a full history — enforced by the system, not ' +
    'left to good intentions.',
  ctaHeading: 'Ready when you are.',
  // No button sits under this: the header's sign-in is pinned and still on screen. The copy points
  // at that one control rather than the page carrying a third identical primary.
  ctaBody: 'Use the sign-in at the top of the page to raise a request or work your queue.',
} as const;

export const LANDING_FEATURES: readonly LandingFeature[] = [
  {
    id: 'routing',
    title: 'Routed, not emailed',
    blurb: 'A fixed routing matrix decides where every category of request goes — no guessing, no forwarding chains.',
    detail: [
      'Fourteen routes connect the six departments, each carrying its own set of request categories — from payment links and payroll to leave requests and academic status updates. Raise a request and the matrix already knows whose queue it lands in.',
      'The matrix is governed: it can be extended by ratified decision, but never quietly redesigned. What was true of a request last month is true of it today.',
    ],
  },
  {
    id: 'sla',
    title: 'Deadlines that watch themselves',
    blurb: 'Every submitted request starts a service-level clock tuned to its priority.',
    detail: [
      'The moment a request is submitted, its priority sets a resolution target. On track, due soon and overdue are derived live from the clock — never typed in, never forgotten.',
      'A request can be in progress and overdue at once, and the system says so. Overdue is a flag over the truth, not a status someone has to remember to set.',
    ],
  },
  {
    id: 'queues',
    title: 'A queue per destination',
    blurb: 'Receiving departments work from one prioritised inbox, bucketed by what needs action.',
    detail: [
      'Finance, HR and Academics each hold a live queue of inbound work, sorted by priority and bucketed by stage — new arrivals, in progress, waiting on the requester.',
      'An empty bucket still shows its zero. "Nothing is waiting on a requester" is information, not an absence.',
    ],
  },
  {
    id: 'dashboards',
    title: 'Your day at a glance',
    blurb: 'Role-aware dashboards show what is in flight, what is late, and what is blocked on you.',
    detail: [
      'A requester sees their outbound work and who owes them an answer. A destination sees its inbound load. Governance sees the whole system breathing.',
      'Every figure drills down to the exact tickets it counts — a number you can click is a number you can trust.',
    ],
  },
  {
    id: 'reports',
    title: 'Evidence, not anecdotes',
    blurb: 'Compliance, workload and trend reporting over the full history of every request.',
    detail: [
      'Service-level compliance is measured historically: a request resolved five days late counts as missed, even though it is finished. The score cannot be gamed by closing things.',
      'Every report exports to CSV with its scope and filters recorded in the file — the evidence carries its own context.',
    ],
  },
  {
    id: 'governance',
    title: 'Everything on the record',
    blurb: 'Full audit trail, versioned configuration, and rollback for every governed change.',
    detail: [
      'Nothing exists without ownership, history and traceability — the constitution the system is built on. Every transition, assignment and configuration change is written to an audit log as it happens.',
      'Configuration is versioned with real snapshots: a bad policy change is one rollback away, and the rollback itself is on the record.',
    ],
  },
] as const;
