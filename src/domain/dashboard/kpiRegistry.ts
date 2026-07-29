import type { LucideIcon } from 'lucide-react';
import {
  Inbox, UserCheck, UserX, Clock, AlertTriangle, Timer, ShieldCheck, RotateCcw, CheckCircle2, Gauge,
} from 'lucide-react';
import type { Session } from '@domain/types/auth.types';
import type { Ticket } from '@domain/types/ticket.types';
import type { SlaPolicy } from '@config/sla.config';
import { isOpen, statusLabel, requesterActionRequired } from '@domain/workflow/statusEngine';
import { missedTarget } from '@domain/sla/slaEngine';
import { resolutionHours } from '@domain/reports/reportMetrics';
import type { OrgConfig } from '@config/org.config';
import { DEPARTMENTS } from '@config/departments.config';
import type { DataScope } from './dataScope';

/**
 * KPI REGISTRY (B05 §KPI Design Rules) — every dashboard number defined ONCE, with the question
 * it answers, the set it counted, and where it drills to.
 *
 * Three rules this registry exists to enforce, each of them a defect found in the dashboard it
 * replaces:
 *
 * 1. **A KPI must declare what it counted.** The audit found the status KPIs and the SLA buckets
 *    silently disagreeing about whether Draft and Cancelled were in the denominator, so two
 *    numbers on the same screen were computed over different populations with nothing saying so.
 *    Every definition below carries a `denominator` string, and the card renders it.
 *
 * 2. **A KPI must declare its data scope.** B05: "Never infer organization-wide visibility without
 *    permission evidence." The scope is not decoration — the resolver refuses to place a KPI whose
 *    scope this session cannot hold, and `inScope` narrows the already-clamped set before compute.
 *
 * 3. **A KPI must not be invented.** Every metric here is computed from a stored field or a
 *    ratified derivation. What was asked for and is NOT here, with the reason, is recorded in
 *    `UNBUILDABLE_KPIS` at the bottom of this file rather than silently dropped.
 *
 * `compute` is pure and takes an ALREADY scope-clamped, already-filtered ticket set. It must never
 * reach for a wider list: a count is a disclosure, and "Unassigned: 47" across departments tells a
 * user something the ticket list itself would refuse to show them.
 */

export type KpiId =
  | 'open'
  | 'needsMe'
  | 'assignedToMe'
  | 'unassigned'
  | 'inProgress'
  | 'awaitingInfo'
  | 'overdue'
  | 'dueSoon'
  | 'slaCompliance'
  | 'reopenRate'
  | 'resolvedToday'
  | 'avgResolution';

export interface KpiContext {
  readonly session: Session;
  /** Scope-clamped and dashboard-filtered. Never the raw store. */
  readonly visible: readonly Ticket[];
  readonly policy: SlaPolicy;
  readonly org: OrgConfig;
}

/**
 * `state` is the non-colour status indicator (B05 §Accessibility: "Non-colour-only status
 * indicators"). The card renders it as TEXT, because the previous card carried its status purely
 * in a Tailwind colour token — so a user who cannot perceive the red could not tell that
 * "Overdue 12" was a breach rather than neutral information.
 */
export type KpiState = 'ok' | 'attention' | 'critical' | 'unknown';

export interface KpiResult {
  readonly value: number | null;
  readonly suffix?: string;
  readonly state: KpiState;
}

export interface KpiDefinition {
  readonly id: KpiId;
  readonly label: string;
  /** The operational question this number answers. Becomes the card's accessible description. */
  readonly question: string;
  /** Trace to the ratified report metric (PRODUCT_REQUIREMENTS FR-086), where one applies. */
  readonly metric?: string;
  readonly dataScope: DataScope;
  readonly icon: LucideIcon;
  /**
   * What population produced the number. Rendered — never left implicit.
   *
   * A FUNCTION of the context, not a fixed string, because two of these sentences quote live
   * configuration (the Due Soon threshold, the working-hours window). Both are administrator-
   * editable, and a card that states a stale default while computing against the real policy
   * would be a quieter version of exactly the defect this registry exists to remove.
   */
  readonly denominator: (ctx: KpiContext) => string;
  readonly compute: (ctx: KpiContext) => KpiResult;
  /** Where the card leads. B05: KPI cards must lead to useful FILTERED ticket views. */
  readonly drillTo: (ctx: KpiContext) => string;
  /** Announced instead of a bare dash when the value is null, so the card never says nothing. */
  readonly nullHint: string;
}

// ---- shared predicates ------------------------------------------------------

/**
 * The population for lifecycle counts: everything that is not a private draft and not withdrawn.
 * Stated once, so the KPI row cannot end up computed over three different denominators — the
 * exact inconsistency the audit found in the page this replaces.
 */
const live = (ts: readonly Ticket[]) => ts.filter((t) => t.status !== 'Draft' && t.status !== 'Cancelled');

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 100));

const isToday = (iso: string | null): boolean => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

/** Zero is the good answer for these, so any non-zero is worth a word. */
const worseWhenAbove = (n: number, attention: number): KpiState =>
  n === 0 ? 'ok' : n > attention ? 'critical' : 'attention';

/**
 * A destination lands on its queue; a requester lands on its own list. `isDestination` from the
 * department configuration, never a literal list of codes — the same three codes were already
 * hardcoded in `scope.ts` beside a config field that states it.
 */
const listOrQueue = (ctx: KpiContext, query = ''): string => {
  const destination = DEPARTMENTS[ctx.session.user.departmentCode].isDestination;
  return `${destination ? '/app/queue' : '/app/tickets'}${query}`;
};

// ---- the registry -----------------------------------------------------------

export const KPI_DEFINITIONS: readonly KpiDefinition[] = [
  {
    id: 'open',
    label: 'Open',
    question: 'What is in flight and still needs work?',
    metric: 'R1',
    dataScope: 'department-wide',
    icon: Inbox,
    denominator: () => 'Submitted, Assigned, In Progress, Awaiting Information and Reopened. A Resolved ticket waiting for the requester is not counted here.',
    compute: ({ visible }) => {
      const n = visible.filter((t) => isOpen(t.status)).length;
      return { value: n, state: 'ok' };
    },
    drillTo: (ctx) => listOrQueue(ctx),
    nullHint: 'No tickets in scope',
  },
  {
    id: 'needsMe',
    label: 'Needs me',
    question: 'What is blocked on an answer or a decision from me?',
    dataScope: 'created-by-me',
    icon: Clock,
    denominator: () => 'Your own tickets in a state where you are the next actor — Awaiting Information (answer it) and Resolved (accept or reopen it).',
    compute: ({ visible }) => {
      // Deliberately NOT pre-filtered by `isOpen`. The page this replaces wrapped the same
      // predicate in an `isOpen` guard, and since `Resolved` is not open, the half of the rule
      // that surfaces "resolved, waiting on you to accept" could never fire. The number was
      // correct-looking and structurally incapable of counting the case it was written for.
      const n = visible.filter((t) => requesterActionRequired(t.status) && t.status !== 'Draft').length;
      return { value: n, state: worseWhenAbove(n, 3) };
    },
    drillTo: () => '/app/tickets',
    nullHint: 'Nothing waiting on you',
  },
  {
    id: 'assignedToMe',
    label: 'Assigned to me',
    question: 'What is on my desk right now?',
    metric: 'R9',
    dataScope: 'assigned-to-me',
    icon: UserCheck,
    denominator: () => 'Open tickets assigned to you. Excludes work you have already resolved.',
    compute: ({ visible }) => ({ value: visible.filter((t) => isOpen(t.status)).length, state: 'ok' }),
    drillTo: () => '/app/queue',
    nullHint: 'Nothing assigned to you',
  },
  {
    id: 'unassigned',
    label: 'Unassigned',
    question: 'What has arrived and nobody has picked up?',
    metric: 'R1',
    dataScope: 'dept-incoming',
    icon: UserX,
    // Not `status === 'Submitted'`: a Reopened ticket is also unassigned and also sits in the
    // incoming bucket, so the status shortcut would under-count it.
    denominator: () => 'Open tickets in your department queue with no assignee — Submitted and Reopened alike.',
    compute: ({ visible }) => {
      const n = visible.filter((t) => !t.assignedToId && isOpen(t.status)).length;
      return { value: n, state: worseWhenAbove(n, 5) };
    },
    drillTo: () => '/app/queue',
    nullHint: 'Everything is assigned',
  },
  {
    id: 'inProgress',
    label: statusLabel('InProgress'),
    question: 'How much work is actively under way?',
    metric: 'R1',
    dataScope: 'dept-incoming',
    icon: Gauge,
    denominator: () => 'Tickets in your queue that someone has started.',
    compute: ({ visible }) => ({ value: visible.filter((t) => t.status === 'InProgress').length, state: 'ok' }),
    drillTo: () => '/app/queue?status=InProgress',
    nullHint: 'Nothing started yet',
  },
  {
    id: 'awaitingInfo',
    label: 'Awaiting info',
    question: 'How much work is stalled waiting on a requester?',
    metric: 'R1',
    dataScope: 'department-wide',
    icon: Clock,
    denominator: () => 'Tickets in Awaiting Information. Their SLA clock is paused while they wait.',
    compute: ({ visible }) => {
      const n = visible.filter((t) => t.status === 'AwaitingInformation').length;
      return { value: n, state: worseWhenAbove(n, 5) };
    },
    drillTo: (ctx) => listOrQueue(ctx, '?status=AwaitingInformation'),
    nullHint: 'Nothing is blocked',
  },
  {
    id: 'overdue',
    label: 'Overdue',
    question: 'What has already breached its resolution target?',
    metric: 'R6',
    dataScope: 'department-wide',
    icon: AlertTriangle,
    // The LIVE flag, open work only. Deliberately not `wasBreached`, which is the historical
    // fact used for compliance: mixing the two is what let a ticket resolved five days late
    // count as compliant (D04 #37).
    denominator: () => 'Open tickets past their target now. Derived on read, never stored as a status.',
    compute: ({ visible }) => {
      const n = live(visible).filter((t) => t.sla.flag === 'Overdue').length;
      return { value: n, state: worseWhenAbove(n, 0) };
    },
    drillTo: (ctx) => listOrQueue(ctx),
    nullHint: 'Nothing overdue',
  },
  {
    id: 'dueSoon',
    label: 'Due soon',
    question: 'What will breach next if nobody acts?',
    metric: 'R6',
    dataScope: 'department-wide',
    icon: Timer,
    denominator: ({ policy }) =>
      `Open tickets with less than ${Math.round(policy.dueSoonThreshold * 100)}% of their target window left. Paused tickets keep the flag they had when they were paused.`,
    compute: ({ visible, policy }) => {
      const n = live(visible).filter((t) => t.sla.flag === 'DueSoon').length;
      return {
        value: n,
        state: worseWhenAbove(n, Math.max(2, Math.round(policy.dueSoonThreshold * 10))),
      };
    },
    drillTo: (ctx) => listOrQueue(ctx),
    nullHint: 'Nothing due soon',
  },
  {
    id: 'slaCompliance',
    label: 'SLA compliance',
    question: 'Are we meeting our resolution targets?',
    metric: 'R4',
    dataScope: 'department-wide',
    icon: ShieldCheck,
    denominator: () => 'Every ticket except drafts and cancellations, counting a ticket as missed if it is breaching now OR was resolved late.',
    compute: ({ visible }) => {
      const active = live(visible);
      // `missedTarget`, not `flag !== 'Overdue'`: the live flag is blind to everything already
      // resolved, so reading compliance off it meant resolving a late ticket RAISED the score.
      const met = active.filter((t) => !missedTarget(t)).length;
      const value = pct(met, active.length);
      return {
        value,
        suffix: value === null ? undefined : '%',
        state: value === null ? 'unknown' : value >= 90 ? 'ok' : value >= 75 ? 'attention' : 'critical',
      };
    },
    drillTo: () => '/app/reports',
    nullHint: 'No completed work to measure yet',
  },
  {
    id: 'reopenRate',
    label: 'Reopen rate',
    question: 'Is work coming back after we call it done?',
    metric: 'R12',
    dataScope: 'department-wide',
    icon: RotateCcw,
    // `reopenCount > 0` (BR-052's stored tally) rather than `status === 'Reopened'`: the two are
    // different questions, and only the tally survives the ticket being re-resolved.
    denominator: () => 'Share of non-draft tickets that have been reopened at least once, ever.',
    compute: ({ visible }) => {
      const active = live(visible);
      const reopened = active.filter((t) => (t.reopenCount ?? 0) > 0).length;
      const value = pct(reopened, active.length);
      return {
        value,
        suffix: value === null ? undefined : '%',
        state: value === null ? 'unknown' : value === 0 ? 'ok' : value <= 10 ? 'attention' : 'critical',
      };
    },
    drillTo: () => '/app/reports',
    nullHint: 'No tickets to measure yet',
  },
  {
    id: 'resolvedToday',
    label: 'Resolved today',
    question: 'What has the team finished today?',
    dataScope: 'department-wide',
    icon: CheckCircle2,
    /**
     * The honest caveat, stated on the card rather than buried: reopening a ticket runs
     * `freshClock`, which NULLS `resolvedAt`. So a ticket resolved at 09:00 and reopened at 15:00
     * leaves this count, and the number can fall during the day. Saying "currently resolved" makes
     * that behaviour correct rather than a bug report.
     */
    denominator: () => 'Tickets whose resolution stands as of now and was recorded today. Reopening one removes it again.',
    compute: ({ visible }) => ({ value: visible.filter((t) => isToday(t.sla.resolvedAt)).length, state: 'ok' }),
    drillTo: (ctx) => listOrQueue(ctx, '?status=Resolved'),
    nullHint: 'Nothing resolved yet today',
  },
  {
    id: 'avgResolution',
    label: 'Avg resolution',
    question: 'How long are we taking to resolve, in working hours?',
    metric: 'R5',
    dataScope: 'department-wide',
    icon: Timer,
    denominator: ({ org }) =>
      `Mean of Submitted-to-Resolved across resolved tickets, in BUSINESS hours (${org.workingHours.start}:00-${org.workingHours.end}:00, working days only) so it is comparable with the SLA targets.`,
    compute: ({ visible }) => {
      const hours = visible.map(resolutionHours).filter((h): h is number => h !== null);
      if (hours.length === 0) return { value: null, state: 'unknown' };
      const mean = hours.reduce((a, b) => a + b, 0) / hours.length;
      return { value: Math.round(mean * 10) / 10, suffix: 'h', state: 'ok' };
    },
    drillTo: () => '/app/reports',
    nullHint: 'Nothing resolved yet',
  },
];

const BY_ID = new Map<KpiId, KpiDefinition>(KPI_DEFINITIONS.map((k) => [k.id, k]));

/**
 * A KPI with its context applied — the shape a card renders.
 *
 * Resolution happens HERE rather than in the component so the card stays a pure presenter and
 * cannot quietly acquire business logic. It is also the only place `compute`, `drillTo` and
 * `denominator` are called, so they always see the same context: a card computing its number
 * from one set and its drill-down from another is precisely how a KPI stops agreeing with the
 * list it links to.
 */
export interface ResolvedKpi {
  readonly def: KpiDefinition;
  readonly result: KpiResult;
  readonly to: string;
  readonly denominator: string;
}

export function resolveKpi(id: KpiId, ctx: KpiContext): ResolvedKpi {
  const def = kpiDef(id);
  return { def, result: def.compute(ctx), to: def.drillTo(ctx), denominator: def.denominator(ctx) };
}

export function kpiDef(id: KpiId): KpiDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`No KPI definition for "${id}"`);
  return def;
}

/**
 * KPIs B05 asked for that are NOT in this registry, and why.
 *
 * This list is the deliverable, not an apology. Each of these would have required inventing a
 * status, a priority level, a workflow or an event that this system does not have — and a
 * dashboard tile is exactly where an invented concept becomes real to users. Rendering
 * "Under Review: 0" teaches a reader that the state exists.
 *
 * Consumed by the Administration dashboard's data-coverage panel, so the gap is visible to the
 * people who could ratify it rather than buried in a comment.
 */
export interface UnbuildableKpi {
  readonly asked: string;
  readonly reason: string;
  readonly wouldNeed: string;
}

export const UNBUILDABLE_KPIS: readonly UnbuildableKpi[] = [
  {
    asked: 'Tickets Under Review',
    reason: 'There is no Under Review status. The ratified lifecycle has ten states and this is not one of them.',
    wouldNeed: 'An eleventh status, which changes the transition matrix and needs stakeholder approval.',
  },
  {
    asked: 'Critical Tickets',
    reason: 'There is no Critical priority. The ratified enum is Low, Medium, High, Urgent.',
    wouldNeed: 'Either a fifth priority level or a ratified decision that Critical is a rename of Urgent.',
  },
  {
    asked: 'Approval Required / Approval Requests',
    reason: 'There is no approval sub-workflow. Reject is a destination decline with a mandatory reason, not the negative half of an approval.',
    wouldNeed: 'An approval workflow, explicitly out of scope in the domain model.',
  },
  {
    asked: 'Period-over-period comparison and trend arrows on status counts',
    reason: 'No status-history snapshot exists, so "open tickets last week" cannot be reconstructed. Trends over event timestamps (created, resolved) are honest; trends over status counts are not.',
    wouldNeed: 'A stored daily snapshot, or a full replay of the activity log server-side.',
  },
  {
    asked: 'Workflow Exceptions / Failed Actions / Configuration Warnings',
    reason: 'Refused transitions, failed operations and configuration warnings are recorded nowhere. Every number on such a tile would be fabricated.',
    wouldNeed: 'A persisted rejected-transition log and a configuration-validation engine. Both are new build items, not widgets.',
  },
  {
    asked: 'SLA Warning as an activity-feed event',
    reason: 'Nothing writes an SLA warning and no scheduler runs, so nobody was ever warned. A feed is a chronology of things that happened.',
    wouldNeed: 'The SLA sweeper that BR-094 and BR-096 specify and this build does not have.',
  },
];
