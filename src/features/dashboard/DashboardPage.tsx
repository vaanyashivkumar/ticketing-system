import { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import { useTicketStore } from '@stores/ticketStore';
import { useNotificationStore } from '@stores/notificationStore';
import { ConfigService } from '@services/configService';
import { scopedTickets, scopeFor } from '@domain/dashboard/scope';
import { inScope } from '@domain/dashboard/dataScope';
import { resolveDashboard, widgetsIn } from '@domain/dashboard/dashboardResolver';
import { resolveKpi } from '@domain/dashboard/kpiRegistry';
import { workSelector, sortWork } from '@domain/dashboard/workSelectors';
import { byStatus, byCategory, byPriority, bySourceDept } from '@domain/dashboard/metrics';
import { applyFilters, EMPTY_FILTERS, type TicketFilters } from '@domain/filters/ticketFilters';
import { isOpen } from '@domain/workflow/statusEngine';
import type { DashboardWidget } from '@config/dashboard.config';
import { DashboardRegion, type RegionState } from './components/DashboardRegion';
import { KpiRow } from './components/KpiRow';
import { WorkQueueList } from './components/WorkQueueList';
import { QuickActions } from './components/QuickActions';
import { ActivityFeed } from './components/ActivityFeed';
import { SlaPanel } from './components/SlaPanel';
import { GovernancePanel, DataCoveragePanel } from './components/GovernancePanel';
import { DashboardFilters } from './components/DashboardFilters';
import { useActivityFeed } from './useActivityFeed';

/** Charts and Recharts stay code-split — they must not block the first paint (P14 §18). */
const DashboardChartsPanel = lazy(() => import('./components/DashboardChartsPanel'));

const ChartsSkeleton = () => (
  <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
    {[0, 1].map((i) => (
      <div key={i} className="card-p">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-surface-sunken" />
        <div className="h-56 animate-pulse rounded bg-surface-sunken" />
      </div>
    ))}
  </div>
);

/**
 * The dashboard (B05).
 *
 * ASSEMBLY ONLY. Every question of what renders is answered by `resolveDashboard`, which asks the
 * Permission Engine and the department configuration. The page this replaces made those decisions
 * inline — `{destination && …}`, `{scope !== 'own' && …}` — over two booleans derived from
 * hardcoded department codes, which B05 forbids and which had already gone wrong: the two booleans
 * disagreed with each other, and one branch of the chart panel was dead code that had never run.
 *
 * There is no `if (department === …)` anywhere below, and there must never be one. A department
 * that needs a different dashboard needs a different configuration.
 */
export function DashboardPage() {
  const { session, user } = useAuth();
  const tickets = useTicketStore((s) => s.tickets);
  const loading = useTicketStore((s) => s.loading);
  const loadError = useTicketStore((s) => s.loadError);
  const refresh = useTicketStore((s) => s.refresh);
  // THE unread count, from the store (B08 §Unread Count Engine) — not a third independent
  // filter over the same array.
  const unread = useNotificationStore((s) => s.unreadCount)();
  const [filters, setFilters] = useState<TicketFilters>(EMPTY_FILTERS);

  const scoped = useMemo(() => (session ? scopedTickets(session, tickets) : []), [session, tickets]);
  /**
   * Filtering happens ONCE, here, and every widget receives the result. B05: "Avoid duplicating
   * filtering implementations inside each widget" — and more importantly, a widget that filtered
   * for itself could disagree with the KPI above it about which tickets it was describing.
   */
  const visible = useMemo(() => applyFilters(scoped, filters), [scoped, filters]);
  const categories = useMemo(() => [...new Set(scoped.map((t) => t.categoryLabel))].sort(), [scoped]);

  const activity = useActivityFeed(scoped);

  if (!session || !user) return null;

  const resolved = resolveDashboard(session);
  const ctxBase = { session, policy: ConfigService.slaPolicy(), org: ConfigService.org() };

  /**
   * Region state, keyed on the STORE rather than on whether the array happens to be empty.
   *
   * This is the fix for the defect that mattered most: nothing in the application read `loading`
   * or `loadError`, so a failed fetch rendered a complete dashboard reading "Open 0 · Overdue 0 ·
   * Nothing needs you right now". A confident zero and a failed request are different claims, and
   * only one of them was ever being made.
   */
  const stateFor = (isEmpty: boolean): RegionState =>
    loading ? 'loading' : loadError ? 'error' : isEmpty ? 'empty' : 'ready';

  const renderWidget = (w: DashboardWidget) => {
    // Every widget sees only its declared scope, narrowed out of the already-clamped set.
    const set = inScope(session, w.dataScope, visible);

    switch (w.type) {
      case 'kpi-row': {
        const kpis = w.kpis.map((id) => {
          const def = resolveKpi(id, { ...ctxBase, visible: inScope(session, kpiScopeOf(id, w), visible) });
          return def;
        });
        return (
          <DashboardRegion
            key={w.id}
            title={w.title}
            question={w.question}
            dataScope={w.dataScope}
            state={loading ? 'loading' : loadError ? 'error' : 'ready'}
            errorMessage={loadError}
            onRetry={() => void refresh()}
          >
            <KpiRow kpis={kpis} />
          </DashboardRegion>
        );
      }

      case 'work-queue': {
        const sel = workSelector(w.selector);
        const rows = sortWork(sel.select(set, session), sel.sort);
        return (
          <DashboardRegion
            key={w.id}
            title={w.title}
            question={w.question}
            dataScope={w.dataScope}
            state={stateFor(rows.length === 0)}
            errorMessage={loadError}
            onRetry={() => void refresh()}
            emptyTitle={sel.emptyTitle}
            emptyDescription={sel.emptyDescription}
            action={
              <Link to={w.viewAll} className="text-body-sm text-primary-text hover:underline">
                View all ({rows.length})
              </Link>
            }
          >
            <>
              <WorkQueueList tickets={rows} previewRows={w.previewRows} showSource={w.dataScope === 'dept-incoming'} />
              <p className="pt-2 text-caption text-text-muted">{sel.sortLabel}.</p>
            </>
          </DashboardRegion>
        );
      }

      case 'sla-panel':
        return (
          <DashboardRegion
            key={w.id}
            title={w.title}
            question={w.question}
            dataScope={w.dataScope}
            state={stateFor(set.filter((t) => isOpen(t.status)).length === 0)}
            errorMessage={loadError}
            onRetry={() => void refresh()}
            emptyTitle="No open work"
            emptyDescription="SLA state is only meaningful for tickets still in flight."
          >
            <SlaPanel tickets={set} viewAll="/app/reports" />
          </DashboardRegion>
        );

      case 'activity': {
        /**
         * The feed is filtered to the region's DECLARED scope, not rendered wholesale.
         *
         * Without this the declared scope was a lie: the hook returns everything the session can
         * see, so a sysadmin's region labelled "My department" was showing organisation-wide
         * activity. A scope label that does not match what is under it is worse than no label —
         * it is a claim about confidentiality that happens to be false.
         */
        const ids = new Set(set.map((t) => t.id));
        const items = activity.items.filter((i) => ids.has(i.ticketId));
        return (
          <DashboardRegion
            key={w.id}
            title={w.title}
            question={w.question}
            dataScope={w.dataScope}
            // Its own state: the feed has an independent data source in API mode, so it can fail
            // or still be loading while every other region is fine. That is the partial-failure
            // case, and it is real here rather than theoretical.
            state={activity.status === 'ready' ? (items.length === 0 ? 'empty' : 'ready') : activity.status}
            errorMessage={activity.error}
            onRetry={activity.retry}
            emptyTitle="No activity yet"
            emptyDescription="Changes to tickets in this scope will appear here."
          >
            <ActivityFeed items={items} />
          </DashboardRegion>
        );
      }

      case 'charts':
        return (
          <DashboardRegion
            key={w.id}
            title={w.title}
            question={w.question}
            dataScope={w.dataScope}
            state={stateFor(set.length === 0)}
            errorMessage={loadError}
            onRetry={() => void refresh()}
            emptyTitle="Not enough data yet"
            emptyDescription="Charts appear once there are tickets in scope."
          >
            <Suspense fallback={<ChartsSkeleton />}>
              <DashboardChartsPanel
                scope={scopeFor(session)}
                data={{
                  status: byStatus(set),
                  category: byCategory(set),
                  priority: byPriority(set.filter((t) => isOpen(t.status))),
                  sourceDept: bySourceDept(set),
                }}
              />
            </Suspense>
          </DashboardRegion>
        );

      case 'governance':
        return (
          <DashboardRegion key={w.id} title={w.title} question={w.question} dataScope={w.dataScope} state="ready">
            <GovernancePanel />
          </DashboardRegion>
        );

      case 'data-coverage':
        return (
          <DashboardRegion key={w.id} title={w.title} question={w.question} dataScope={w.dataScope} state="ready">
            <DataCoveragePanel />
          </DashboardRegion>
        );
    }
  };

  return (
    <div className="space-y-5">
      <div>
        {/* The full name, not the first word. `name.split(' ')[0]` greeted Dr Elena Marsh as
            "Welcome, Dr" — a first-name heuristic that fails on every title, and on every naming
            convention that does not put the given name first. */}
        <h1 className="text-h2 text-text">Welcome, {user.name}</h1>
        <p className="text-body text-text-secondary">
          {resolved.config.description}
          {resolved.hasGovernance && ' Governance is included because you hold the system-administration capability.'}
        </p>
      </div>

      <QuickActions session={session} unread={unread} />

      <DashboardFilters value={filters} onChange={setFilters} categories={categories} />

      {/* Single column on mobile; the aside joins on large screens. Widget `priority` decides the
          order within each column, so responsive behaviour is configuration, not a media query
          that has to be kept in step with the JSX. */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">{widgetsIn(resolved, 'main').map(renderWidget)}</div>
        <div className="space-y-5">{widgetsIn(resolved, 'aside').map(renderWidget)}</div>
      </div>
    </div>
  );
}

/**
 * A KPI carries its OWN data scope, which is usually narrower than the row it sits in.
 *
 * "Assigned to me" inside a department-wide row must still count only my tickets; "Needs me" must
 * count only mine. Taking the row's scope for every card is how a personal number quietly becomes
 * a departmental one. The row's scope is the fallback for KPIs whose declared scope is broader
 * than the row — a card can be narrowed by its row, never widened by it.
 */
function kpiScopeOf(id: Parameters<typeof resolveKpi>[0], w: { dataScope: DashboardWidget['dataScope'] }) {
  const NARROW = new Set(['assignedToMe', 'needsMe']);
  return NARROW.has(id) ? (id === 'assignedToMe' ? 'assigned-to-me' : 'created-by-me') : w.dataScope;
}
