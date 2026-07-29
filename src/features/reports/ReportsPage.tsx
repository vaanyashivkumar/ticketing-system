import { useMemo, useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Download, FilterX, Info } from 'lucide-react';
import { useAuth } from '@hooks/useAuth';
import { usePermissions } from '@hooks/usePermissions';
import { useTicketStore } from '@stores/ticketStore';
import { scopedTickets, scopeFor } from '@domain/dashboard/scope';
import { summarise, slaBreakdown, byDepartment, byCategoryDetailed, byAssignee, dailyTrend } from '@domain/reports/reportMetrics';
import { applyFilters, describeFilters, activeFilterCount, EMPTY_FILTERS, type TicketFilters } from '@domain/filters/ticketFilters';
import { ExportService } from '@services/exportService';
import { DEPARTMENTS } from '@config/departments.config';
import type { DepartmentCode } from '@domain/types/auth.types';
import type { Priority, TicketStatus, SlaFlag } from '@domain/types/ticket.types';
import { ORDERED_STATUSES } from '@domain/workflow/statusEngine';
import { ORDERED_PRIORITIES } from '@domain/workflow/priorityEngine';
import { StatusBadge, SlaBadge } from '@features/tickets/components/TicketBadges';
import { PageHeader } from '@components/common/PageHeader';
import { UNBUILDABLE_REPORTS } from '@config/reports.config';
import { StatusDwellReport, EscalationReport, BacklogReport } from './components/LifecycleReports';

const ReportChartsPanel = lazy(() => import('./components/ReportChartsPanel'));

/**
 * Every status, in lifecycle order. The hand-written list this replaces omitted `Draft` AND
 * `Cancelled`, so a cancelled ticket could not be filtered for anywhere in Reports — it was
 * counted in the totals and unreachable in the drill-down.
 */
const STATUSES = ORDERED_STATUSES;
const PRIORITIES = ORDERED_PRIORITIES;
const SLAS: SlaFlag[] = ['OnTrack', 'DueSoon', 'Overdue'];

/**
 * Written into every export header. A CSV outlives the screen it came from, and "all tickets, no
 * filters" means something completely different depending on who asked — without this the file
 * cannot say which population it describes.
 */
const SCOPE_LABEL: Record<'own' | 'hub' | 'global', string> = {
  own: 'Own department (source or destination)',
  hub: 'Finance hub (source or destination = Finance)',
  global: 'Organisation-wide (system administrator)',
};
const hrs = (n: number | null) => (n === null ? '—' : `${n} h`);
/** Rows rendered in the drill-down before truncating. Stated in the UI — never a silent cap. */
const TICKET_ROW_CAP = 25;

/**
 * Reports & Analytics (P16). One page, scope-clamped, deriving every metric from the
 * ticket source of truth (§13). Filters are interactive (§10); category rows drill down to
 * the ticket list and on to Ticket Details (§11); exports carry their filters (§12).
 */
export function ReportsPage() {
  const { session, user } = useAuth();
  // EXPORT_REPORTS was granted to every user and checked NOWHERE — a live feature missing its
  // guard, so revoking it would silently have done nothing (the PERM-001 family). Now it governs.
  const { can } = usePermissions();
  const canExport = can('EXPORT_REPORTS');
  const tickets = useTicketStore((s) => s.tickets);
  // The store's loading and error state, which this page ignored entirely — so a failed fetch
  // rendered a complete report of zeroes: "Total 0 · SLA compliance —" reads as a quiet week,
  // not as a request that never arrived. On a page whose whole purpose is measurement, a
  // confident zero is the most expensive thing it can print.
  const loading = useTicketStore((s) => s.loading);
  const loadError = useTicketStore((s) => s.loadError);
  const refresh = useTicketStore((s) => s.refresh);
  const [f, setF] = useState<TicketFilters>(EMPTY_FILTERS);

  const scoped = useMemo(() => (session ? scopedTickets(session, tickets) : []), [session, tickets]);
  const rows = useMemo(() => applyFilters(scoped, f), [scoped, f]);
  const s = useMemo(() => summarise(rows), [rows]);

  if (!session || !user) return null;
  const scope = scopeFor(session);

  // Workload is clamped to the user's OWN department's assignees; global for sysadmin
  // (phase-0 §10.1) — never cross-department surveillance.
  const workloadSource = scope === 'global' ? rows : rows.filter((t) => t.toDeptCode === user.departmentCode);
  const workload = byAssignee(workloadSource);
  const depts = byDepartment(rows, Object.keys(DEPARTMENTS) as DepartmentCode[]);
  const cats = byCategoryDetailed(rows);
  const categoryOptions = [...new Set(scoped.map((t) => t.categoryLabel))].sort();
  const assigneeOptions = [...new Set(workloadSource.map((t) => t.assignedToName).filter(Boolean))] as string[];

  const set = <K extends keyof TicketFilters>(k: K, v: TicketFilters[K]) => setF((p) => ({ ...p, [k]: v }));

  const exportTickets = () => {
    const csv = ExportService.buildCsv(
      'Ticket detail report',
      rows,
      [
        { header: 'Code', value: (t) => t.code },
        { header: 'Subject', value: (t) => t.subject },
        { header: 'From', value: (t) => t.fromDeptCode },
        { header: 'To', value: (t) => t.toDeptCode },
        { header: 'Category', value: (t) => t.categoryLabel },
        { header: 'Priority', value: (t) => t.priority },
        { header: 'Status', value: (t) => t.status },
        { header: 'SLA', value: (t) => t.sla.flag },
        { header: 'Requester', value: (t) => t.createdByName },
        { header: 'Assignee', value: (t) => t.assignedToName ?? '' },
        { header: 'Created', value: (t) => t.createdAt },
        { header: 'Due', value: (t) => t.sla.dueAt ?? '' },
        { header: 'Resolved', value: (t) => t.sla.resolvedAt ?? '' },
      ],
      describeFilters(f),
      session,
      SCOPE_LABEL[scope],
    );
    ExportService.download(`tickets-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const exportCategories = () => {
    const csv = ExportService.buildCsv(
      'Category analytics',
      cats,
      [
        { header: 'Category', value: (c) => c.label },
        { header: 'Volume', value: (c) => c.volume },
        { header: 'Backlog', value: (c) => c.backlog },
        { header: 'Overdue', value: (c) => c.overdue },
        { header: 'Avg resolution (business hours)', value: (c) => c.avgResolutionHours },
      ],
      describeFilters(f),
      session,
      SCOPE_LABEL[scope],
    );
    ExportService.download(`categories-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <section className="space-y-6">
      <PageHeader
        icon={BarChart3}
        title="Reports & Analytics"
        description={scope === 'global' ? 'Organisation-wide.' : scope === 'hub' ? 'Finance hub — requests in and out.' : `${DEPARTMENTS[user.departmentCode].name} — your department’s activity.`}
        action={
          canExport ? (
            <button type="button" onClick={exportTickets} className="btn-neutral">
              <Download size={16} aria-hidden /> Export tickets (CSV)
            </button>
          ) : undefined
        }
      />

      {loadError && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-md border border-error bg-error-bg px-3 py-3 text-body-sm text-error-text">
          <span>
            <strong>These figures could not be loaded.</strong> {loadError} Every number below is computed from a
            ticket set that was never received — do not read them as measurements.
          </span>
          {/* The error-toned variant: same resting appearance inside the banner, but a 40px target. */}
          <button type="button" onClick={() => void refresh()} className="btn-danger">
            Try again
          </button>
        </div>
      )}
      {loading && !loadError && (
        <p role="status" className="rounded-md border border-border bg-surface px-3 py-2 text-body-sm text-text-muted">
          Loading tickets…
        </p>
      )}

      {/* Filters (§10) */}
      <div className="card-p">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-label uppercase text-text-muted">Filters</h2>
          {activeFilterCount(f) > 0 && (
            <button type="button" onClick={() => setF(EMPTY_FILTERS)} className="inline-flex items-center gap-1 text-body-sm text-primary-text hover:underline">
              <FilterX size={14} aria-hidden /> Clear {activeFilterCount(f)}
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Sel label="Department" value={f.department} onChange={(v) => set('department', v as DepartmentCode | '')} options={Object.values(DEPARTMENTS).map((d) => ({ v: d.code, t: d.name }))} />
          <Sel label="Category" value={f.category} onChange={(v) => set('category', v)} options={categoryOptions.map((c) => ({ v: c, t: c }))} />
          <Sel label="Priority" value={f.priority} onChange={(v) => set('priority', v as Priority | '')} options={PRIORITIES.map((p) => ({ v: p, t: p }))} />
          <Sel label="Status" value={f.status} onChange={(v) => set('status', v as TicketStatus | '')} options={STATUSES.map((x) => ({ v: x, t: x }))} />
          <Sel label="Assignee" value={f.assignee} onChange={(v) => set('assignee', v)} options={assigneeOptions.map((a) => ({ v: a, t: a }))} />
          <Sel label="SLA state" value={f.sla} onChange={(v) => set('sla', v as SlaFlag | '')} options={SLAS.map((x) => ({ v: x, t: x === 'OnTrack' ? 'Within SLA' : x === 'DueSoon' ? 'Approaching' : 'Breached' }))} />
          <label className="block"><span className="mb-1 block text-label text-text">Created from</span><input type="date" className="input" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
          <label className="block"><span className="mb-1 block text-label text-text">Created to</span><input type="date" className="input" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
        </div>
      </div>

      {/* Summary (§3) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Tickets" value={s.total} />
        <Stat label="Open" value={s.open} />
        <Stat label="Overdue" value={s.overdue} tone="error" />
        <Stat label="Avg resolution" value={hrs(s.avgResolutionHours)} />
        <Stat label="Avg response" value={hrs(s.avgResponseHours)} />
        <Stat label="SLA compliance" value={s.slaCompliancePct === null ? '—' : `${s.slaCompliancePct}%`} tone="success" />
      </div>
      <p className="flex items-start gap-1.5 text-caption text-text-muted">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        Durations are <strong>business hours</strong> (Mon–Fri, working hours), so they compare directly with SLA targets. Averages cover tickets that reached the relevant stage.
      </p>

      <Suspense fallback={<div className="h-56 animate-pulse rounded-lg bg-surface-sunken" aria-hidden />}>
        <ReportChartsPanel sla={slaBreakdown(rows)} trend={dailyTrend(rows)} />
      </Suspense>

      {/* Department comparison (§4) */}
      <Panel title="Department report" question="Which departments carry the load, and where is SLA slipping?">
        <Table
          label="Department performance"
          head={['Department', 'Raised', 'Received', 'Resolved', 'Overdue', 'Avg resolution', 'SLA']}
          rows={depts.map((d) => [
            DEPARTMENTS[d.code].name, String(d.raised), String(d.received), String(d.resolved),
            String(d.overdue), hrs(d.avgResolutionHours), d.slaCompliancePct === null ? '—' : `${d.slaCompliancePct}%`,
          ])}
          empty="No departmental activity in scope."
        />
      </Panel>

      {/* Category analytics (§9) — drill-down */}
      <Panel
        title="Category analytics"
        question="Which request types are most frequent, slowest, or backing up?"
        action={canExport ? <button type="button" onClick={exportCategories} className="-my-1 inline-flex min-h-6 min-w-6 items-center gap-1 px-1 py-1 text-body-sm text-primary-text hover:underline"><Download size={14} aria-hidden /> CSV</button> : undefined}
      >
        {cats.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-text-muted">No categories in scope.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-table">
              {/* Every column but the first is a figure, so its header is right-aligned over it —
                  a left-aligned header above a right-aligned column reads as a misalignment. */}
              <thead><tr className="border-b border-border">
                {['Category', 'Volume', 'Backlog', 'Overdue', 'Avg resolution'].map((h, i) => <th key={h} className={i === 0 ? 'th' : 'th text-right'}>{h}</th>)}
                {/* The actions column (A11Y-004). It was an empty `<th>`, which leaves the cells
                    beneath it with no column association — a screen reader reading the "Drill down"
                    cell announces it under a nameless column. The header is real, just not painted. */}
                <th className="th"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {cats.map((c) => (
                  <tr key={c.label} className="row-hover border-b border-border last:border-0">
                    <td className="td">{c.label}</td>
                    <td className="td-num">{c.volume}</td>
                    <td className="td-num">{c.backlog}</td>
                    <td className="td-num">{c.overdue}</td>
                    <td className="td-num">{hrs(c.avgResolutionHours)}</td>
                    <td className="td">
                      <button type="button" onClick={() => set('category', c.label)} className="text-body-sm text-primary-text hover:underline">Drill down</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Workload (§6/§8) */}
      <Panel title="Workload" question="Is work spread evenly across the team?">
        <p className="mb-2 text-caption text-text-muted">
          Counts only, for workload balancing — not individual performance ranking. Scoped to {scope === 'global' ? 'all departments' : `${DEPARTMENTS[user.departmentCode].name} assignees`}.
        </p>
        <Table
          label="Workload by assignee"
          head={['Assignee', 'Open assigned', 'Completed']}
          rows={workload.map((w) => [w.name, String(w.assignedOpen), String(w.completed)])}
          empty="No assigned work in scope."
        />
      </Panel>

      {/* Drill-down target: ticket list (§11) */}
      <Panel title={`Tickets (${rows.length})`} question="The rows behind every number above.">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-body-sm text-text-muted">No tickets match the current filters.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.slice(0, TICKET_ROW_CAP).map((t) => (
              <li key={t.id}>
                <Link to={`/app/tickets/${t.id}`} className="flex items-center gap-2 py-2 hover:bg-row-hover">
                  <span className="w-20 shrink-0 font-mono text-body-sm text-primary-text">{t.code || 'Draft'}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-text">{t.subject}</span>
                  <span className="hidden text-caption text-text-muted sm:block">{t.categoryLabel}</span>
                  <StatusBadge status={t.status} />
                  {t.status !== 'Draft' && <SlaBadge flag={t.sla.flag} />}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {/* A silent cap reads as "this is everything" (D04 #4). The panel header counts every
            matching row, so truncating without saying so contradicts the number above it. */}
        {rows.length > TICKET_ROW_CAP && (
          <p className="border-t border-border pt-3 text-body-sm text-text-secondary">
            Showing the first {TICKET_ROW_CAP} of {rows.length}. Narrow the filters to see the rest
            {canExport ? ', or export the CSV — it contains every matching row.' : '.'}
          </p>
        )}
      </Panel>
      <h2 className="text-label uppercase text-text-muted">Status and dwell time</h2>
      <p className="-mt-4 text-caption text-text-secondary">Where does work pile up, and how long does it sit at each stage?</p>
      <StatusDwellReport tickets={rows} />

      <h2 className="text-label uppercase text-text-muted">Escalation</h2>
      <p className="-mt-4 text-caption text-text-secondary">How often is work re-graded after it arrives?</p>
      <EscalationReport tickets={rows} />

      <h2 className="text-label uppercase text-text-muted">Backlog and ageing</h2>
      <p className="-mt-4 text-caption text-text-secondary">What is going stale, and who needs to pick it up?</p>
      <BacklogReport tickets={rows} />

      {/* What was asked for and is not here. On a reporting page this belongs on screen: a chart
          is read as measurement, so a measured-looking number that was guessed gets acted on. */}
      <details className="card-p">
        <summary className="cursor-pointer text-label uppercase text-text-muted">
          Reports not shown, and why ({UNBUILDABLE_REPORTS.length})
        </summary>
        <dl className="mt-3 space-y-3">
          {UNBUILDABLE_REPORTS.map((u) => (
            <div key={u.asked}>
              <dt className="text-body-sm text-text">{u.asked}</dt>
              <dd className="text-caption text-text-muted">{u.why}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

const Stat = ({ label, value, tone }: { label: string; value: string | number; tone?: 'error' | 'success' }) => (
  <div className="card p-3">
    <span className="block text-label text-text-muted">{label}</span>
    {/* Explicitly tabular: these six tiles are read as a row of comparable figures. */}
    <span className={`block text-h2 tabular-nums ${tone === 'error' ? 'text-error' : tone === 'success' ? 'text-success' : 'text-text'}`}>{value}</span>
  </div>
);

const Panel = ({ title, question, action, children }: { title: string; question: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <div className="card-p">
    <div className="mb-3 flex items-start justify-between gap-2">
      <div>
        <h2 className="text-body-medium text-text">{title}</h2>
        <p className="text-caption text-text-muted">{question}</p>
      </div>
      {action}
    </div>
    {children}
  </div>
);

const Sel = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; t: string }[] }) => (
  <label className="block">
    <span className="mb-1 block text-label text-text">{label}</span>
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">All</option>
      {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
    </select>
  </label>
);

/**
 * A11Y-003 — a horizontally scrollable region with no focusable content inside is unreachable
 * by keyboard: a mouse user drags it sideways, a keyboard user cannot scroll it at all and simply
 * never sees the right-hand columns. (The Category analytics table escapes this only by accident —
 * its "Drill down" button gives it focusable content.) `tabIndex` makes the region itself a tab
 * stop; `role="region"` + a label stop that stop from being announced as an anonymous mystery.
 *
 * The tab stop is unconditional because whether the table overflows depends on the viewport: these
 * scroll at 375px and not at 1280px, and a tab stop that appears and vanishes as you resize is
 * worse than one that is always there.
 */
const Table = ({ head, rows, empty, label }: { head: string[]; rows: string[][]; empty: string; label: string }) =>
  rows.length === 0 ? (
    <p className="py-6 text-center text-body-sm text-text-muted">{empty}</p>
  ) : (
    <div className="overflow-x-auto" role="region" aria-label={label} tabIndex={0}>
      <table className="w-full text-table">
        {/* Column 0 names the row; every column after it is a figure. That was already the shape of
            this component (the old cell class keyed off the same index), so `td-num` — right-aligned
            and tabular — lands on exactly the cells that need to compare down the column. */}
        <thead><tr className="border-b border-border">
          {head.map((h, i) => <th key={h} className={i === 0 ? 'th' : 'th text-right'}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="row-hover border-b border-border last:border-0">
              {r.map((c, j) => <td key={j} className={j === 0 ? 'td' : 'td-num'}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
