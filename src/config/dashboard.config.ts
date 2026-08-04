import type { DepartmentCode, StaticPermission, Capability } from '@domain/types/auth.types';
import type { KpiId } from '@domain/dashboard/kpiRegistry';
import type { WorkSelectorId } from '@domain/dashboard/workSelectors';
import type { DataScope } from '@domain/dashboard/dataScope';

/**
 * DASHBOARD CONFIGURATION (B05 §Dashboard Configuration Model).
 *
 * Every widget on every dashboard is declared here. The page this replaces decided visibility with
 * inline JSX — `{destination && <WorkList …/>}`, `{scope !== 'own' && <Charts …/>}` — over two
 * booleans computed from hardcoded department-code literals. B05 forbids exactly that ("Do not
 * hardcode department permissions"; "Do not hardcode dashboard access inside JSX"), and the
 * practical cost was real: the two booleans disagreed with each other (Academics and HR are
 * destinations but resolved to scope `own`), and one of the chart panel's branches was dead code
 * that had never executed.
 *
 * THE SOURCE. The widget sets below are not invented for B05 — they are
 * `PRODUCT_REQUIREMENTS.md §10.1–§10.7`, which specifies each department's dashboard against
 * ratified R-metrics and business questions. Where B05's prose and §10 disagree, §10 wins: it is
 * the ratified artefact and B05 is a build instruction. The divergences are recorded in
 * `WORKFLOW_ENGINE.md`'s B05 section, not silently reconciled.
 *
 * WHAT IS NOT CONFIGURABLE HERE. Visibility. A widget declares the permission and the data scope
 * it NEEDS; whether this session holds them is answered by the Permission Engine at resolve time.
 * A config that could grant itself visibility would be a second authorisation system.
 */

/** The rendering shapes a dashboard region can take. Adding one means adding a renderer. */
export type WidgetType = 'kpi-row' | 'work-queue' | 'sla-panel' | 'activity' | 'charts' | 'governance' | 'data-coverage';

interface WidgetBase {
  readonly id: string;
  readonly type: WidgetType;
  readonly title: string;
  /** The business question the region answers (FR-D02: widgets are decision support, not decoration). */
  readonly question: string;
  /**
   * Declared data scope (B05 §Data Scope Engine). The resolver DROPS a widget whose scope this
   * session cannot hold — `dept-incoming` for a department nothing routes to would be a permanent,
   * meaningless zero, and `organisation-wide` without the capability would be a leak.
   */
  readonly dataScope: DataScope;
  readonly requiredPermission?: StaticPermission;
  readonly requiredCapability?: Capability;
  /**
   * Layout weight. Lower renders first and survives longest as the viewport narrows — B05's
   * "responsive priority", made a number rather than a guess in a media query.
   */
  readonly priority: number;
  /** Full width on large screens, or a sidebar column. */
  readonly column: 'main' | 'aside';
}

export interface KpiRowWidget extends WidgetBase {
  readonly type: 'kpi-row';
  readonly kpis: readonly KpiId[];
}

export interface WorkQueueWidget extends WidgetBase {
  readonly type: 'work-queue';
  readonly selector: WorkSelectorId;
  /** Rows shown before the drill-down takes over. */
  readonly previewRows: number;
  /** Where "view all" goes. Required: a preview with no route out is a dead end. */
  readonly viewAll: string;
}

export interface SimpleWidget extends WidgetBase {
  readonly type: 'sla-panel' | 'activity' | 'charts' | 'governance' | 'data-coverage';
}

export type DashboardWidget = KpiRowWidget | WorkQueueWidget | SimpleWidget;

export interface DashboardConfig {
  readonly id: string;
  readonly departmentCode: DepartmentCode;
  readonly title: string;
  /** One line describing what this dashboard is for, shown under the heading. */
  readonly description: string;
  readonly widgets: readonly DashboardWidget[];
}

// ---- shared widget fragments ------------------------------------------------

const ACTIVITY: SimpleWidget = {
  id: 'activity',
  type: 'activity',
  title: 'Recent activity',
  question: 'What has changed on the tickets I can see?',
  dataScope: 'department-wide',
  priority: 60,
  column: 'aside',
};

const SLA_PANEL: SimpleWidget = {
  id: 'sla',
  type: 'sla-panel',
  title: 'SLA position',
  question: 'How is open work sitting against its targets?',
  dataScope: 'department-wide',
  priority: 40,
  column: 'aside',
};

const CHARTS: SimpleWidget = {
  id: 'charts',
  type: 'charts',
  title: 'Distribution',
  question: 'Where is the work concentrated, and who is sending it?',
  dataScope: 'department-wide',
  priority: 70,
  column: 'main',
};

/**
 * The requester half, shared by every department — because every department raises tickets,
 * including the three that also receive them. The dashboard this replaces gated the equivalent
 * list on NOT being a destination, so a Finance user whose own request to Academics was blocked
 * awaiting their answer saw it on no screen at all.
 */
const NEEDS_ME: WorkQueueWidget = {
  id: 'needs-me',
  type: 'work-queue',
  title: 'Needs me',
  question: 'What is blocked on an answer or a decision from me?',
  dataScope: 'created-by-me',
  selector: 'needs-me',
  previewRows: 5,
  viewAll: '/app/tickets',
  priority: 10,
  column: 'main',
};

const MY_REQUESTS: WorkQueueWidget = {
  id: 'my-requests',
  type: 'work-queue',
  title: 'My open requests',
  question: 'Where have my requests got to?',
  dataScope: 'created-by-me',
  selector: 'my-open-requests',
  previewRows: 6,
  viewAll: '/app/tickets',
  priority: 30,
  column: 'main',
};

const UNASSIGNED: WorkQueueWidget = {
  id: 'unassigned',
  type: 'work-queue',
  title: 'Waiting to be assigned',
  question: 'What has arrived that nobody owns yet?',
  dataScope: 'dept-incoming',
  selector: 'unassigned-incoming',
  previewRows: 5,
  viewAll: '/app/queue',
  priority: 12,
  column: 'main',
};

const ASSIGNED_TO_ME: WorkQueueWidget = {
  id: 'assigned-to-me',
  type: 'work-queue',
  title: 'Assigned to me',
  question: 'What is on my desk?',
  dataScope: 'assigned-to-me',
  selector: 'assigned-to-me',
  previewRows: 5,
  viewAll: '/app/queue',
  priority: 20,
  column: 'main',
};

const AT_RISK: WorkQueueWidget = {
  id: 'at-risk',
  type: 'work-queue',
  title: 'At risk',
  question: 'What breaches next if nobody acts?',
  dataScope: 'department-wide',
  selector: 'at-risk',
  previewRows: 5,
  viewAll: '/app/queue',
  priority: 15,
  column: 'main',
};

/** PRD §10.1/§10.2 — pure requester: R1 open, R6 overdue, R4 compliance, R12 reopen rate, plus a
 *  Completed count (resolved/closed of my own requests), 2026-07-29 stakeholder request. */
const REQUESTER_KPIS: KpiRowWidget = {
  id: 'kpis',
  type: 'kpi-row',
  title: 'My requests at a glance',
  question: 'What have I got in flight, what is late, and am I being served on time?',
  dataScope: 'created-by-me',
  kpis: ['open', 'needsMe', 'overdue', 'slaCompliance', 'reopenRate', 'completed'],
  priority: 0,
  column: 'main',
};

/** PRD §10.3/§10.4/§10.5 — destination: R1, R6, R9 workload, R4 compliance, plus intake pressure. */
const DESTINATION_KPIS: KpiRowWidget = {
  id: 'kpis',
  type: 'kpi-row',
  title: 'Department workload',
  question: 'What is in the queue, what is unowned, and what is breaching?',
  dataScope: 'dept-incoming',
  // `completed` = inbound requests the department has resolved/closed (2026-07-29 stakeholder request).
  kpis: ['open', 'unassigned', 'assignedToMe', 'overdue', 'dueSoon', 'slaCompliance', 'completed'],
  priority: 0,
  column: 'main',
};

const requesterDashboard = (
  departmentCode: DepartmentCode,
  title: string,
  description: string,
): DashboardConfig => ({
  id: `dash-${departmentCode.toLowerCase()}`,
  departmentCode,
  title,
  description,
  // No inbound queue widget: nothing routes to these departments, so a queue region would be a
  // permanent empty state promising work that can never arrive (PRD §10.1, BRS §5.2).
  widgets: [REQUESTER_KPIS, NEEDS_ME, MY_REQUESTS, SLA_PANEL, ACTIVITY],
});

/**
 * PRD §10.3/§10.5 — the dual actor. "The dashboard must present two visually separated panes so
 * the two right-sets never blur": the inbound widgets carry destination scopes, the outbound ones
 * carry `created-by-me`, and the page groups them under separate headings.
 */
const dualDashboard = (
  departmentCode: DepartmentCode,
  title: string,
  description: string,
): DashboardConfig => ({
  id: `dash-${departmentCode.toLowerCase()}`,
  departmentCode,
  title,
  description,
  widgets: [DESTINATION_KPIS, UNASSIGNED, AT_RISK, ASSIGNED_TO_ME, NEEDS_ME, MY_REQUESTS, SLA_PANEL, ACTIVITY, CHARTS],
});

export const DASHBOARDS: Readonly<Record<DepartmentCode, DashboardConfig>> = {
  SAL: requesterDashboard('SAL', 'Sales', 'Your requests to Finance and where each one has got to.'),
  MKT: requesterDashboard('MKT', 'Marketing', 'Your requests to Finance and where each one has got to.'),
  // No mention of governance in the description: the resolver appends that sentence only when
  // the capability is actually held, and saying it here too printed it twice for a sysadmin and
  // promised it to an Administration user who does not hold it (OQ-02 leaves that open).
  ADM: requesterDashboard('ADM', 'Administration', 'Your outbound requests to HR and Academics.'),
  /**
   * Operations, the ratified 7th department (2026-08-04). A REQUESTER dashboard, because nothing
   * routes to Operations yet — it holds the two wildcard outbound routes (→ HR, → Academics) and
   * no inbound categories have been ratified. Give it a destination dashboard and it would show a
   * queue that is structurally, permanently empty. When inbound categories are ratified, this
   * becomes `dualDashboard` and `isDestination` flips with it.
   */
  OPS: requesterDashboard('OPS', 'Operations', 'Your outbound requests to HR and Academics.'),
  ACA: dualDashboard('ACA', 'Academics', 'Your inbound queue, and the requests you have raised.'),
  HR: dualDashboard('HR', 'Human Resources', 'Your inbound queue, and the requests you have raised.'),
  /**
   * PRD §10.4 — Finance is the hub: destination for four inbound routes and requester on the one
   * Finance → Academics route. Hub-scoped and explicitly NOT global (BR-067, FR-D07), "the single
   * most easily broken scoping rule". Nothing here declares `organisation-wide`, so the resolver
   * has nothing to grant even if it wanted to.
   */
  FIN: {
    id: 'dash-fin',
    departmentCode: 'FIN',
    title: 'Finance',
    description: 'The hub queue — requests in from four departments, and your requests out to Academics.',
    widgets: [DESTINATION_KPIS, UNASSIGNED, AT_RISK, ASSIGNED_TO_ME, NEEDS_ME, SLA_PANEL, ACTIVITY, CHARTS],
  },
};

/**
 * GOVERNANCE OVERLAY (PRD §10.6/§10.7).
 *
 * Appended by the resolver when the Permission Engine confirms the capability — "never by
 * department name" (BR-064/BR-069). It is an OVERLAY, not a seventh dashboard: a sysadmin keeps
 * the department dashboard they would otherwise have and gains these regions on top. That also
 * means it works if the capability is ever granted outside Administration, which OQ-02 leaves
 * open.
 *
 * There is deliberately no "Assigned to me" here. The sysadmin governs; it does not adjudicate
 * another department's ticket, and the permission engine refuses those verbs to it.
 */
export const GOVERNANCE_WIDGETS: readonly DashboardWidget[] = [
  {
    id: 'gov-kpis',
    type: 'kpi-row',
    title: 'Organisation',
    question: 'Where is the whole organisation breaching, and how much work is unowned?',
    dataScope: 'organisation-wide',
    requiredCapability: 'SUPER_ADMIN',
    // `completed` = resolved/closed across the whole organisation (2026-07-29 stakeholder request).
    kpis: ['open', 'unassigned', 'overdue', 'dueSoon', 'slaCompliance', 'avgResolution', 'completed'],
    priority: 100,
    column: 'main',
  },
  {
    id: 'gov-at-risk',
    type: 'work-queue',
    title: 'Breaching across the organisation',
    question: 'Which departments need intervention right now?',
    dataScope: 'organisation-wide',
    requiredCapability: 'SUPER_ADMIN',
    selector: 'at-risk',
    previewRows: 6,
    viewAll: '/app/reports',
    priority: 110,
    column: 'main',
  },
  {
    id: 'gov-charts',
    type: 'charts',
    title: 'Organisation distribution',
    question: 'How is work spread across departments, categories and priorities?',
    dataScope: 'organisation-wide',
    requiredCapability: 'SUPER_ADMIN',
    priority: 120,
    column: 'main',
  },
  {
    /**
     * Organisation-wide ticket activity. The department-scoped feed every dashboard carries is
     * correct but thin for a sysadmin, whose own department raises very little — governance needs
     * to see what is happening everywhere, and declaring THAT scope is the only honest way to
     * show it.
     */
    id: 'gov-activity',
    type: 'activity',
    title: 'Organisation activity',
    question: 'What is changing across every department right now?',
    dataScope: 'organisation-wide',
    requiredCapability: 'SUPER_ADMIN',
    priority: 125,
    column: 'aside',
  },
  {
    id: 'gov-audit',
    type: 'governance',
    title: 'Governance',
    question: 'What has been configured, refused or overridden?',
    dataScope: 'organisation-wide',
    requiredPermission: 'VIEW_AUDIT_LOGS',
    priority: 130,
    column: 'aside',
  },
  {
    /**
     * The honesty panel. It renders what this dashboard was ASKED for and cannot show, with the
     * reason — so the gap sits in front of the people who could ratify it, instead of in a code
     * comment nobody with the authority to decide will ever read.
     */
    id: 'gov-coverage',
    type: 'data-coverage',
    title: 'Not shown, and why',
    question: 'Which requested metrics have no data behind them?',
    dataScope: 'organisation-wide',
    requiredCapability: 'SUPER_ADMIN',
    priority: 140,
    column: 'aside',
  },
];
